// System provenance. A benchmark number without the machine it ran on is noise.
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statfs } from 'node:fs/promises';

const run = promisify(execFile);

async function tryRun(cmd, args, timeout = 15000) {
  try {
    const { stdout } = await run(cmd, args, { timeout, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function windowsExtras() {
  const ps = async (script) =>
    tryRun('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);

  const cpu = await ps(
    "(Get-CimInstance Win32_Processor | Select-Object -First 1 | " +
      'ForEach-Object { "$($_.Name)|$($_.NumberOfCores)|$($_.NumberOfLogicalProcessors)|$($_.MaxClockSpeed)" })',
  );
  const mem = await ps(
    "(Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum",
  );
  const memType = await ps(
    "(Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).Speed",
  );
  const osName = await ps('(Get-CimInstance Win32_OperatingSystem).Caption');
  const disk = await ps(
    "(Get-PhysicalDisk | Select-Object -First 1 | ForEach-Object { \"$($_.FriendlyName)|$($_.MediaType)|$($_.Size)\" })",
  );

  const [name, cores, threads, mhz] = (cpu ?? '|||').split('|');
  const [diskName, diskMedia, diskSize] = (disk ?? '||').split('|');
  return {
    cpuModel: name || undefined,
    cpuCores: Number(cores) || undefined,
    cpuThreads: Number(threads) || undefined,
    cpuMaxMHz: Number(mhz) || undefined,
    installedMemoryBytes: Number(mem) || undefined,
    memorySpeedMHz: Number(memType) || undefined,
    osName: osName || undefined,
    disk: diskName ? { name: diskName, mediaType: diskMedia, sizeBytes: Number(diskSize) || undefined } : undefined,
  };
}

async function linuxExtras() {
  const cpuinfo = await tryRun('sh', ['-c', 'cat /proc/cpuinfo']);
  const model = cpuinfo?.match(/^model name\s*:\s*(.+)$/m)?.[1];
  const osRelease = await tryRun('sh', ['-c', 'cat /etc/os-release']);
  const osName = osRelease?.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
  const governor = await tryRun('sh', [
    '-c',
    'cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null',
  ]);
  return {
    cpuModel: model,
    osName,
    // Matters more than people expect: `powersave` can halve throughput numbers.
    cpuGovernor: governor || undefined,
  };
}

/** Measure the link by timing a download from the NNTP provider is done elsewhere;
 *  this just records what the OS reports about the primary interface. */
function networkSummary() {
  const ifaces = os.networkInterfaces();
  const out = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.internal || a.family !== 'IPv4') continue;
      out.push({ name, address: a.address.replace(/\.\d+$/, '.x'), mac: undefined });
    }
  }
  return out;
}

export async function collectSystemInfo() {
  const base = {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    hostname: undefined, // deliberately omitted from reports
    cpuModel: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    loadAverage: os.loadavg(),
    nodeVersion: process.version,
    uptimeSeconds: Math.round(os.uptime()),
    interfaces: networkSummary(),
  };

  const extra =
    process.platform === 'win32'
      ? await windowsExtras()
      : process.platform === 'linux'
        ? await linuxExtras()
        : {};

  let cwdDisk;
  try {
    const fs = await statfs(process.cwd());
    cwdDisk = { totalBytes: fs.blocks * fs.bsize, freeBytes: fs.bfree * fs.bsize };
  } catch {
    /* not fatal */
  }

  return { ...base, ...extra, cwdDisk, collectedAt: new Date().toISOString() };
}

/** One-line description used in report headers. */
export function describeSystem(info) {
  const gb = (b) => (b ? `${(b / 2 ** 30).toFixed(0)} GB` : '?');
  return [
    info.osName ?? `${info.platform} ${info.osRelease}`,
    info.cpuModel ? `${info.cpuModel} (${info.cpuThreads ?? info.cpuCount} threads)` : undefined,
    `${gb(info.installedMemoryBytes ?? info.totalMemoryBytes)} RAM`,
  ]
    .filter(Boolean)
    .join(' · ');
}
