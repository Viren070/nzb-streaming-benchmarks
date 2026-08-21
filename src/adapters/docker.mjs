// Container runtime. Every application can run from source or in an image built from its
// own Dockerfile; `--docker` selects which. Rows are tagged `runtime: docker` because a
// container sits in a Linux VM: bytes cross an extra NAT hop, and CPU and memory are the
// VM's share of the host. Nothing here is application-specific; `Adapter` drives it all
// from a per-application descriptor.

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const execFileP = promisify(execFile);

/** Hostname a container uses to reach a server listening on the host. */
export const HOST_FROM_CONTAINER = 'host.docker.internal';

const BIG = { maxBuffer: 64 * 1024 * 1024, windowsHide: true };

async function docker(args, { timeout = 1800000 } = {}) {
  try {
    return await execFileP('docker', args, { ...BIG, timeout });
  } catch (e) {
    const detail = [e.stdout, e.stderr].filter(Boolean).join('\n').slice(-4000);
    throw new Error(`docker ${args.slice(0, 3).join(' ')} failed: ${e.message}\n${detail}`);
  }
}

/** `execFile`'s async form ignores an `input` option, so stdin needs a real spawn. */
function dockerStdin(args, contents) {
  return new Promise((ok, bad) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', bad);
    child.on('close', (code) =>
      code === 0
        ? ok({ stdout: out, stderr: err })
        : bad(new Error(`docker ${args.slice(0, 3).join(' ')} exited ${code}: ${err.slice(-2000)}`)),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(contents);
  });
}

/** An unreachable daemon must not surface as a failed image build for the application. */
export async function assertDocker() {
  let info;
  try {
    info = await execFileP('docker', ['info', '--format', '{{.OSType}}'], { ...BIG, timeout: 60000 });
  } catch (e) {
    throw new Error(
      `--docker was requested but the Docker daemon is not reachable: ${e.message.split('\n')[0]}. ` +
        'Start Docker Desktop (or dockerd) and retry, or drop --docker to build from source.',
    );
  }
  const osType = info.stdout.trim();
  if (osType !== 'linux') {
    throw new Error(`Docker is in ${osType} container mode; these images are Linux-only.`);
  }
}

export async function imageExists(tag) {
  try {
    await execFileP('docker', ['image', 'inspect', tag], { ...BIG, timeout: 60000 });
    return true;
  } catch {
    return false;
  }
}

/** Tags carry the commit, so a moved checkout cannot silently reuse an image. */
export async function buildImage({ contextDir, tag, dockerfile, buildArgs = {}, force = false, log }) {
  if (!force && (await imageExists(tag))) {
    log?.(`  reusing docker image ${tag}`);
    return { reused: true, tag };
  }
  const args = ['build', '-t', tag];
  if (dockerfile) args.push('-f', dockerfile);
  for (const [k, v] of Object.entries(buildArgs)) args.push('--build-arg', `${k}=${v}`);
  args.push(contextDir);
  log?.(`  docker build ${tag} ...`);
  await docker(args, { timeout: 3600000 });
  return { reused: false, tag };
}

/** App state must not survive a run, exactly as on the source path. */
export async function recreateVolume(name) {
  await execFileP('docker', ['volume', 'rm', '-f', name], { ...BIG, timeout: 120000 }).catch(() => {});
  await docker(['volume', 'create', name], { timeout: 120000 });
  return name;
}

/**
 * Write config into a volume before the application starts.
 *
 * A volume rather than a bind mount: a Windows bind mount reaches the container over a
 * file-sharing bridge, and the application's disk I/O would be measuring that bridge.
 * The application's own image is the helper, so a run needs no registry access it did
 * not already need.
 */
export async function seedVolume({ volume, image, mount = '/app', files = {}, dirs = [], owner }) {
  const paths = Object.keys(files);
  if (!dirs.length && !paths.length) return;
  const script = [
    'set -e',
    ...dirs.map((d) => `mkdir -p ${JSON.stringify(`${mount}/${d}`)}`),
    ...paths.map((p) => `mkdir -p "$(dirname ${JSON.stringify(`${mount}/${p}`)})"`),
  ].join('\n');
  await docker(['run', '--rm', '-v', `${volume}:${mount}`, '--entrypoint', 'sh', image, '-c', script]);

  for (const [path, contents] of Object.entries(files)) {
    const target = `${mount}/${path}`;
    // Stdin, so credentials never reach the host process list or `docker inspect`.
    await dockerStdin(
      ['run', '--rm', '-i', '-v', `${volume}:${mount}`, '--entrypoint', 'sh', image, '-c', `cat > ${JSON.stringify(target)}`],
      contents,
    );
    // An empty config starts the application and fails it later on a parse error.
    const want = Buffer.byteLength(contents);
    const { stdout } = await docker([
      'run', '--rm', '-v', `${volume}:${mount}`, '--entrypoint', 'sh', image, '-c', `wc -c < ${JSON.stringify(target)}`,
    ]);
    const got = Number(stdout.trim());
    if (got !== want) throw new Error(`seeding ${target} wrote ${got} bytes, expected ${want}`);
  }

  // Seeding runs as root; an image that drops privileges cannot then write its own state.
  if (owner) {
    await docker([
      'run', '--rm', '-v', `${volume}:${mount}`, '--entrypoint', 'sh', image, '-c',
      `chown -R ${owner} ${JSON.stringify(mount)}`,
    ]);
  }
}

export async function removeContainer(name) {
  await execFileP('docker', ['rm', '-f', name], { ...BIG, timeout: 180000 }).catch(() => {});
}

/** Removes any container left by an interrupted run, which would still hold the port. */
export async function runContainer({
  name,
  image,
  publish = [],
  volumes = [],
  env = {},
  entrypoint,
  args = [],
  extra = [],
}) {
  await removeContainer(name);
  const argv = ['run', '-d', '--name', name];
  for (const p of publish) argv.push('-p', p);
  for (const v of volumes) argv.push('-v', v);
  for (const [k, val] of Object.entries(env)) argv.push('-e', `${k}=${val}`);
  if (entrypoint) argv.push('--entrypoint', entrypoint);
  argv.push(...extra, image, ...args);
  const { stdout } = await docker(argv, { timeout: 300000 });
  return { name, id: stdout.trim() };
}

export async function containerRunning(name) {
  try {
    const { stdout } = await execFileP('docker', ['inspect', '-f', '{{.State.Running}}', name], {
      ...BIG,
      timeout: 60000,
    });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/** Persist container output next to every other application's log. */
export async function saveLogs(name, logFile) {
  if (!logFile) return;
  try {
    const { stdout, stderr } = await execFileP('docker', ['logs', name], { ...BIG, timeout: 300000 });
    await mkdir(resolve(logFile, '..'), { recursive: true });
    await writeFile(logFile, [stdout, stderr].filter(Boolean).join('\n'));
  } catch {
    /* a container that never started has no logs */
  }
}

/** Read one file out of a running container. */
export async function readFromContainer(name, path) {
  const { stdout } = await docker(['exec', name, 'cat', path], { timeout: 60000 });
  return stdout;
}

/**
 * Force a managed clone to LF working files, reporting whether anything changed.
 *
 * Git on Windows defaults to `core.autocrlf=true`. A repository without a
 * `.gitattributes` then gets CRLF shell scripts, and an image built from it has an
 * entrypoint the kernel cannot exec, reported as "no such file or directory".
 */
export async function normalizeLineEndings(appDir, { log } = {}) {
  const at = (args) => execFileP('git', ['-C', appDir, ...args], { ...BIG, timeout: 120000 });
  const current = await at(['config', '--get', 'core.autocrlf']).then((r) => r.stdout.trim()).catch(() => '');
  if (current === 'false') return false;
  await at(['config', 'core.autocrlf', 'false']);
  await at(['rm', '--cached', '-r', '-q', '.']);
  await at(['reset', '--hard', '-q']);
  log?.(`  normalised ${appDir.split(/[\\/]/).pop()} checkout to LF`);
  return true;
}

const DOCKER_SOCKET = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';

async function daemonGet(path) {
  const { request } = await import('node:http');
  return new Promise((ok, bad) => {
    const req = request({ socketPath: DOCKER_SOCKET, path, method: 'GET', headers: { Host: 'docker' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => ok({ status: res.statusCode, body }));
    });
    req.on('error', bad);
    req.setTimeout(15000, () => req.destroy(new Error('docker daemon stats timed out')));
    req.end();
  });
}

/**
 * CPU and memory for a container, from the daemon's cgroup counters. Interface matches
 * `ProcessSampler` so the runner can use either.
 *
 * Read from the daemon, not by running anything inside the container: a `docker exec`
 * once a second charges its own CPU to the cgroup being measured. Memory is
 * `anon + file_mapped`; the cgroup's total charge includes page cache, which for a
 * streaming application measures the kernel's caching rather than the application.
 */
export class ContainerSampler {
  #timer = null;
  #timeline = [];
  #cpuSeconds = 0;
  #running = false;

  /** `name` may be a function: the container is created after the run begins. */
  constructor({ name, intervalMs = 1000 }) {
    this.name = name;
    this.intervalMs = intervalMs;
  }

  async start() {
    this.#timeline = [];
    this.#cpuSeconds = 0;
    this.#running = true;
    const tick = async () => {
      if (!this.#running) return;
      try {
        const name = typeof this.name === 'function' ? this.name() : this.name;
        if (!name) return;
        const res = await daemonGet(`/containers/${encodeURIComponent(name)}/stats?stream=false`);
        if (res.status !== 200) return;
        const s = JSON.parse(res.body);
        const ns = s?.cpu_stats?.cpu_usage?.total_usage;
        // Monotonic, so a restart cannot subtract CPU already spent.
        if (Number.isFinite(ns) && ns / 1e9 > this.#cpuSeconds) this.#cpuSeconds = ns / 1e9;
        const st = s?.memory_stats?.stats ?? {};
        this.#timeline.push({
          t: Date.now(),
          rss: (st.anon ?? 0) + (st.file_mapped ?? 0),
          procs: s?.pids_stats?.current ?? 0,
          cpu: this.#cpuSeconds,
        });
      } catch {
        /* sampling must never break a run */
      }
    };
    this.#timer = setInterval(tick, this.intervalMs);
    this.#timer.unref?.();
    await tick();
  }

  stop() {
    this.#running = false;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    return this.summary();
  }

  summary() {
    const rss = this.#timeline.map((s) => s.rss).filter((n) => n > 0);
    const cpuSeconds = +this.#cpuSeconds.toFixed(3);
    if (!rss.length) return { samples: this.#timeline.length, cpuSeconds, unavailable: true, source: 'docker' };
    const sorted = [...rss].sort((a, b) => a - b);
    return {
      samples: this.#timeline.length,
      cpuSeconds,
      rssPeakBytes: sorted[sorted.length - 1],
      rssMedianBytes: sorted[sorted.length >> 1],
      rssMeanBytes: Math.round(rss.reduce((a, b) => a + b, 0) / rss.length),
      maxProcesses: Math.max(...this.#timeline.map((s) => s.procs)),
      // Lets a reader tell a container footprint from a host one in the JSON.
      source: 'docker',
    };
  }

  mark() {
    return this.#cpuSeconds;
  }

  timeline() {
    return this.#timeline;
  }
}

/** Populate submodules a Dockerfile builds from; the harness clones shallow without them. */
export async function ensureSubmodules(appDir, { log } = {}) {
  const at = (args) => execFileP('git', ['-C', appDir, ...args], { ...BIG, timeout: 900000 });
  const { stdout } = await at(['submodule', 'status']).catch(() => ({ stdout: '' }));
  if (!stdout.trim() || !/^[-+]/m.test(stdout)) return false;
  await at(['submodule', 'update', '--init', '--recursive', '--depth', '1']);
  log?.(`  fetched submodules for ${appDir.split(/[\/]/).pop()}`);
  return true;
}
