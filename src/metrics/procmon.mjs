// Samples CPU time and resident memory for a process tree, on Windows and Linux.
//
// CPU is accumulated per-PID (monotonic counters) rather than differenced on the
// tree total, so a worker exiting mid-run does not silently subtract its CPU.

import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let samplerSeq = 0;

const WIN_SAMPLER = `
$ErrorActionPreference = 'Stop'
while ($true) {
  $rows = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,UserModeTime,KernelModeTime |
    ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize),$($_.UserModeTime),$($_.KernelModeTime)" }
  Write-Output ("T " + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  $rows | ForEach-Object { Write-Output $_ }
  Write-Output "E"
  Start-Sleep -Milliseconds __INTERVAL__
}
`;

/** Read every process on Linux from /proc. Returns Map<pid, {ppid, rss, cpu}>. */
async function readLinuxProcs() {
  const out = new Map();
  const clk = 100; // USER_HZ; effectively always 100 on Linux
  const pageSize = 4096;
  let names;
  try {
    names = await readdir('/proc');
  } catch {
    return out;
  }
  await Promise.all(
    names.map(async (n) => {
      if (!/^\d+$/.test(n)) return;
      try {
        const stat = await readFile(`/proc/${n}/stat`, 'utf8');
        // comm can contain spaces and parentheses; split after the last ')'.
        const close = stat.lastIndexOf(')');
        const rest = stat.slice(close + 2).split(' ');
        const ppid = Number(rest[1]);
        const utime = Number(rest[11]);
        const stime = Number(rest[12]);
        const rssPages = Number(rest[21]);
        out.set(Number(n), {
          ppid,
          rss: rssPages * pageSize,
          cpu: (utime + stime) / clk,
        });
      } catch {
        /* process exited between readdir and read */
      }
    }),
  );
  return out;
}

/** Collect a PID and all its descendants from a pid->{ppid} map. */
function descendants(procs, roots) {
  const children = new Map();
  for (const [pid, p] of procs) {
    if (!children.has(p.ppid)) children.set(p.ppid, []);
    children.get(p.ppid).push(pid);
  }
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid) || !procs.has(pid)) continue;
    seen.add(pid);
    for (const c of children.get(pid) ?? []) stack.push(c);
  }
  return seen;
}

export class ProcessSampler {
  #timer = null;
  #ps = null;
  #scriptPath = null;
  #cpuByPid = new Map();
  #timeline = [];
  #running = false;

  constructor({ intervalMs = 1000 } = {}) {
    this.intervalMs = intervalMs;
    this.roots = [];
  }

  /** `roots` are PIDs; their descendants are included automatically. */
  async start(roots) {
    this.roots = roots.filter(Boolean);
    this.#cpuByPid.clear();
    this.#timeline = [];
    this.#running = true;
    if (!this.roots.length) return;

    if (process.platform === 'win32') await this.#startWindows();
    else this.#startPosix();
  }

  #record(procs) {
    const set = descendants(procs, this.roots);
    let rss = 0;
    for (const pid of set) {
      const p = procs.get(pid);
      rss += p.rss;
      // Monotonic per-PID counter; keep the highest seen so exits don't lose CPU.
      const prev = this.#cpuByPid.get(pid) ?? 0;
      if (p.cpu > prev) this.#cpuByPid.set(pid, p.cpu);
    }
    this.#timeline.push({ t: Date.now(), rss, procs: set.size });
  }

  #startPosix() {
    const tick = async () => {
      if (!this.#running) return;
      try {
        this.#record(await readLinuxProcs());
      } catch {
        /* sampling must never break a run */
      }
    };
    this.#timer = setInterval(tick, this.intervalMs);
    this.#timer.unref?.();
    void tick();
  }

  async #startWindows() {
    const script = WIN_SAMPLER.replace('__INTERVAL__', String(this.intervalMs));
    // `powershell -Command -` (script on stdin) silently produces no output for a
    // long-running loop, so the script goes to a file and runs via -File.
    const path = join(tmpdir(), `usenet-bench-sampler-${process.pid}-${samplerSeq++}.ps1`);
    await writeFile(path, script, 'utf8');
    this.#scriptPath = path;
    this.#ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let buf = '';
    let batch = null;
    this.#ps.stdout.setEncoding('utf8');
    this.#ps.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        if (line.startsWith('T ')) {
          batch = new Map();
        } else if (line === 'E') {
          if (batch && this.#running) this.#record(batch);
          batch = null;
        } else if (batch) {
          const f = line.split(',');
          if (f.length < 5) continue;
          const pid = Number(f[0]);
          if (!Number.isFinite(pid)) continue;
          batch.set(pid, {
            ppid: Number(f[1]),
            rss: Number(f[2]) || 0,
            // Win32_Process reports CPU in 100-nanosecond units.
            cpu: (Number(f[3]) + Number(f[4])) / 1e7,
          });
        }
      }
    });
    this.#ps.on('error', () => {
      this.#ps = null;
    });
  }

  /** Stop sampling and return the summary. */
  stop() {
    this.#running = false;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.#ps) {
      try {
        this.#ps.kill();
      } catch {
        /* already gone */
      }
      this.#ps = null;
    }
    if (this.#scriptPath) {
      void rm(this.#scriptPath, { force: true }).catch(() => {});
      this.#scriptPath = null;
    }
    return this.summary();
  }

  summary() {
    const rss = this.#timeline.map((s) => s.rss).filter((n) => n > 0);
    const cpuSeconds = [...this.#cpuByPid.values()].reduce((a, b) => a + b, 0);
    if (!rss.length) return { samples: this.#timeline.length, cpuSeconds, unavailable: true };
    const sorted = [...rss].sort((a, b) => a - b);
    return {
      samples: this.#timeline.length,
      cpuSeconds: +cpuSeconds.toFixed(3),
      rssPeakBytes: sorted[sorted.length - 1],
      rssMedianBytes: sorted[sorted.length >> 1],
      rssMeanBytes: Math.round(rss.reduce((a, b) => a + b, 0) / rss.length),
      maxProcesses: Math.max(...this.#timeline.map((s) => s.procs)),
    };
  }

  /** CPU consumed since a marker, for attributing cost to one measurement. */
  mark() {
    return [...this.#cpuByPid.values()].reduce((a, b) => a + b, 0);
  }

  timeline() {
    return this.#timeline;
  }
}

/**
 * Idle footprint: sample a settled process tree for `ms` and report RSS. `makeSampler`
 * lets an adapter substitute one that can see PIDs in another namespace.
 */
export async function measureIdle(pids, ms = 5000, intervalMs = 500, makeSampler = null) {
  const s = makeSampler ? makeSampler(intervalMs) : new ProcessSampler({ intervalMs });
  await s.start(pids);
  await new Promise((r) => setTimeout(r, ms));
  return s.stop();
}
