// The adapter contract. Adding an application means writing one module that extends
// `Adapter`; timing, sampling, byte verification and reporting are shared, so every
// application is measured by identical code.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve, sep } from 'node:path';
import { resolveTool, needsShell } from './toolchain.mjs';
import {
  assertDocker,
  buildImage,
  imageExists,
  recreateVolume,
  seedVolume,
  runContainer,
  removeContainer,
  saveLogs,
  ContainerSampler,
  normalizeLineEndings,
  ensureSubmodules,
  readFromContainer,
} from './docker.mjs';

const execFileP = promisify(execFile);

export class UnsupportedOnPlatform extends Error {}
export class AdapterSkipped extends Error {}

/**
 * One application under test.
 *
 * An adapter declares what its application needs and never how to run it: `prepare()`,
 * `start()` and `stop()` are the only code that knows whether a run is from source or in
 * a container.
 *
 * Config must be written in terms of `dataDir`, `servicePort` and `bindHost`, which are
 * what the application sees under either runtime. `this.base` is the host-side URL the
 * harness calls.
 */
export class Adapter {
  /** @type {string} stable id used on the CLI and in reports */
  static id = 'unnamed';
  static displayName = 'Unnamed';
  static language = 'unknown';
  static repo = '';
  /** Which host platforms this app can run on *from source*. */
  static platforms = ['win32', 'linux', 'darwin'];
  /** How the app is served: 'webdav' | 'http-range' | 'addon'. Documentation only. */
  static serving = 'http-range';

  /**
   * Container descriptor. Its presence makes an application runnable under `--docker`.
   *
   * @type {null | {
   *   containerPort: number,   port the application listens on inside the container
   *   dataDir: string,         path the image expects its state at
   *   dockerfile?: string,     relative to appDir, default 'Dockerfile'
   *   context?: string,        build context relative to appDir, default '.'
   *   entrypoint?: string,     override the image entrypoint
   *   args?: string[],         override the image command
   *   buildArgs?: object,
   *   owner?: string,          `uid:gid` to chown seeded state to, for images that drop privileges
   *   extra?: string[],        extra `docker run` flags
   * }}
   */
  static docker = null;

  /**
   * @param {object} ctx
   * @param {string} ctx.appDir     the cloned source tree
   * @param {string} ctx.buildDir   build output; persists across runs
   * @param {string} ctx.stateDir   scratch dir for this app's config/db (wiped per run)
   * @param {string} ctx.logDir     where to tee stdout/stderr
   * @param {Array}  ctx.providers  NNTP providers from config
   * @param {object} ctx.options    per-app overrides from the run config
   * @param {'source'|'docker'} ctx.runtime
   */
  constructor(ctx) {
    Object.assign(this, ctx);
    this.children = [];
    this.port = null;
    this.container = null;
    this.image = null;
  }

  get id() {
    return this.constructor.id;
  }

  get isDocker() {
    return this.runtime === 'docker';
  }

  /** Where this application's state lives, expressed the way the application sees it. */
  get dataDir() {
    return this.isDocker ? this.constructor.docker.dataDir : this.stateDir;
  }

  /** The port the application binds. Under Docker the harness publishes it as `port`. */
  get servicePort() {
    return this.isDocker ? this.constructor.docker.containerPort : this.port;
  }

  /**
   * A container's published port only reaches a process listening on all interfaces.
   * Loopback everywhere else keeps the application off the LAN.
   */
  get bindHost() {
    return this.isDocker ? '0.0.0.0' : '127.0.0.1';
  }

  /** The URL to hand the application, as opposed to `base`, which is the harness's. */
  get bindUrl() {
    return `http://${this.bindHost}:${this.servicePort}`;
  }

  /** How the application reaches itself. A bind address is not a connectable one. */
  get selfUrl() {
    return `http://127.0.0.1:${this.servicePort}`;
  }

  get logFile() {
    return join(this.logDir, `${this.id}.log`);
  }

  // ---- what an adapter implements -------------------------------------

  /** Build from source. Only ever called on the source runtime. */
  async build() {}

  /** Files to write into `dataDir` before start, keyed by path relative to it. */
  async configFiles() {
    return {};
  }

  /** Directories to create inside `dataDir` before start. */
  configDirs() {
    return [];
  }

  /** Overridden by an application whose data location it pins itself. */
  get nativeStateDir() {
    return this.stateDir;
  }

  /** An application keeping a dataset between runs turns this off and clears the rest. */
  static freshStatePerRun = true;

  /** Environment for the application, identical under both runtimes. */
  async env() {
    return {};
  }

  /** How to launch from source: `{ command, args, cwd? }`. */
  async nativeLaunch() {
    throw new Error(`${this.id}: nativeLaunch() not implemented`);
  }

  /** Produce anything the image build needs that a clean checkout does not contain. */
  async beforeImageBuild() {}

  /** Block until the application will accept work. */
  async ready() {}

  /** Post-start setup for applications configured over their own API. */
  async configure() {}

  /**
   * Files that must exist for a previous source build to be reusable; returning nothing
   * rebuilds every run. Derive these rather than assigning them in build(), which is
   * skipped when the build is reused.
   */
  buildArtifacts() {
    return [];
  }

  /**
   * Identity of this build's inputs. Keyed on the commit, because results are
   * attributed to a commit and a reused binary from another one would be misreported.
   */
  async buildStamp() {
    const commit = await gitCommit(this.appDir).catch(() => null);
    return commit ? `${this.constructor.id}@${commit}` : null;
  }

  // ---- what the runtime does ------------------------------------------

  /** Build the source tree, or the image. Called once per run before `start`. */
  async prepare({ force = false, log } = {}) {
    if (!this.isDocker) return this.build();
    await assertDocker();
    const renormalised = await normalizeLineEndings(this.appDir, { log: log ?? this.log }).catch(() => false);
    const fetched = await ensureSubmodules(this.appDir, { log: log ?? this.log }).catch(() => false);
    const spec = this.constructor.docker;
    const commit = await gitCommit(this.appDir).catch(() => 'unknown');
    this.image = `usenet-bench/${this.id}:${commit}`;
    if (force || renormalised || fetched || !(await imageExists(this.image))) await this.beforeImageBuild();
    return buildImage({
      contextDir: join(this.appDir, spec.context ?? '.'),
      dockerfile: join(this.appDir, spec.dockerfile ?? 'Dockerfile'),
      tag: this.image,
      buildArgs: spec.buildArgs,
      // Renormalising does not move the commit, so the tag would still match a stale image.
      force: force || renormalised || fetched,
      log: log ?? this.log,
    });
  }

  /** Give the application empty state, its config, and a running process. */
  async start() {
    this.port = await allocPort();
    this.base = `http://127.0.0.1:${this.port}`;
    if (this.isDocker) await this.#startContainer();
    else await this.#startProcess();
    await this.ready();
    await this.configure();
  }

  async #startProcess() {
    // freshDir can hand back a sibling path, so state must settle before `dataDir` is read.
    if (this.constructor.freshStatePerRun) {
      this.stateDir = await freshDir(this.nativeStateDir);
    } else {
      this.stateDir = this.nativeStateDir;
      await mkdir(this.stateDir, { recursive: true });
    }
    for (const dir of this.configDirs()) await mkdir(join(this.stateDir, dir), { recursive: true });
    for (const [path, contents] of Object.entries(await this.configFiles())) {
      const full = join(this.stateDir, path);
      await mkdir(resolve(full, '..'), { recursive: true });
      await writeFile(full, contents);
    }
    const { command, args = [], cwd } = await this.nativeLaunch();
    const child = await spawnServer(command, args, {
      cwd: cwd ?? this.stateDir,
      env: await this.env(),
      logFile: this.logFile,
      label: this.id,
    });
    this.children.push(child);
  }

  async #startContainer() {
    const spec = this.constructor.docker;
    this.container = `usenet-bench-${this.id}`;
    this.volume = `usenet-bench-${this.id}-state`;
    await recreateVolume(this.volume);
    await seedVolume({
      volume: this.volume,
      image: this.image,
      mount: spec.dataDir,
      dirs: this.configDirs(),
      files: await this.configFiles(),
      owner: spec.owner,
    });
    await runContainer({
      name: this.container,
      image: this.image,
      publish: [`127.0.0.1:${this.port}:${spec.containerPort}`],
      volumes: [`${this.volume}:${spec.dataDir}`],
      env: await this.env(),
      entrypoint: spec.entrypoint,
      // A function lets a descriptor reference `dataDir` instead of repeating its path.
      args: typeof spec.args === 'function' ? spec.args(this) : spec.args,
      extra: spec.extra,
    });
  }

  async stop() {
    if (this.container) {
      await saveLogs(this.container, this.logFile);
      await removeContainer(this.container);
      this.container = null;
    }
    await Promise.all(this.children.map((c) => killTree(c)));
    this.children = [];
  }

  /** { version, commit }, recorded in the report so results are attributable. */
  async version() {
    return { version: 'unknown', commit: await gitCommit(this.appDir).catch(() => undefined) };
  }

  /** PIDs whose tree the sampler should watch. Empty under Docker: another namespace. */
  processIds() {
    return this.isDocker ? [] : this.children.map((c) => c.pid).filter(Boolean);
  }

  /** Read a file the application generated, without the caller knowing the runtime. */
  async readDataFile(relPath) {
    if (this.isDocker) return readFromContainer(this.container, `${this.dataDir}/${relPath}`);
    return readFile(join(this.stateDir, relPath), 'utf8');
  }

  /** Under Docker, resources come from the daemon's cgroup counters instead of /proc. */
  makeSampler(intervalMs) {
    if (!this.isDocker) return null;
    return new ContainerSampler({ name: () => this.container, intervalMs });
  }

  // ---- the measurement contract ---------------------------------------

  /**
   * Import an NZB and return an opaque handle.
   * @param {{id:string, path:string, password?:string, name:string}} item
   */
  async addNzb() {
    throw new Error(`${this.id}: addNzb() not implemented`);
  }

  /**
   * Turn a handle into something streamable.
   * @returns {Promise<{url:string, headers?:object, fileName?:string, sizeBytes?:number}>}
   */
  async resolve() {
    throw new Error(`${this.id}: resolve() not implemented`);
  }

  /** Drop in-memory/on-disk caches so a "cold" measurement is genuinely cold. */
  async reset() {}

  /** Remove an imported item so repeat runs start clean. */
  async remove() {}
}

// ---------------------------------------------------------------- helpers

export async function allocPort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

export async function gitCommit(dir) {
  const { stdout } = await execFileP('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir });
  return stdout.trim();
}

export async function gitDescribe(dir) {
  try {
    const { stdout } = await execFileP('git', ['describe', '--tags', '--always'], { cwd: dir });
    return stdout.trim();
  } catch {
    return gitCommit(dir).catch(() => 'unknown');
  }
}

/** Version-probe arguments for tools whose flag is not `--version`. */
const VERSION_ARGS = { go: ['version'] };

/**
 * Map a bare tool name to a spawnable path. Toolchains installed by a version manager
 * are often absent from a non-interactive child's PATH.
 */
export async function resolveBin(cmd) {
  if (cmd.includes('/') || cmd.includes(sep)) return cmd;
  try {
    return await resolveTool(cmd, { versionArgs: VERSION_ARGS[cmd] ?? ['--version'] });
  } catch {
    return cmd;
  }
}

/** Run a command to completion, throwing with captured output on failure. */
export async function run(cmd, args, { cwd, env, timeout = 900000, label } = {}) {
  const bin = await resolveBin(cmd);
  try {
    const { stdout, stderr } = await execFileP(bin, args, {
      cwd,
      env: { ...process.env, ...env },
      timeout,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      shell: needsShell(bin),
    });
    return { stdout, stderr };
  } catch (e) {
    const detail = [e.stdout, e.stderr].filter(Boolean).join('\n').slice(-4000);
    throw new Error(`${label ?? `${cmd} ${args.join(' ')}`} failed: ${e.message}\n${detail}`);
  }
}

/**
 * Spawn a long-running server, teeing output to a log file. Resolves with the
 * child; caller is responsible for waiting on readiness.
 */
export async function spawnServer(cmd, args, { cwd, env, logFile, label } = {}) {
  if (logFile) await mkdir(resolve(logFile, '..'), { recursive: true });
  const bin = await resolveBin(cmd);
  const child = spawn(bin, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: needsShell(bin),
    // Own process group so killTree can take down the whole tree on POSIX.
    detached: process.platform !== 'win32',
  });
  if (!child.pid) throw new Error(`${label ?? cmd}: failed to spawn`);

  if (logFile) {
    const out = createWriteStream(logFile, { flags: 'a' });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
  } else {
    child.stdout.resume();
    child.stderr.resume();
  }

  child.on('error', (e) => {
    child.spawnError = e;
  });
  let exited = false;
  child.on('exit', (code, signal) => {
    exited = true;
    child.exitInfo = { code, signal };
  });
  child.hasExited = () => exited;
  return child;
}

/** True if a PID is still alive. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * Kill a process tree and wait until it is gone. A survivor holds a lock on the state
 * directory, which surfaces as an EBUSY in the next application's start.
 */
export async function killTree(child) {
  if (!child?.pid || child.hasExited?.()) return;
  const pid = child.pid;
  const hardKill = async () => {
    try {
      if (process.platform === 'win32') {
        await execFileP('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true });
      } else {
        process.kill(-pid, 'SIGKILL');
      }
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  };

  await hardKill();
  for (let i = 0; i < 40; i++) {
    if (child.hasExited?.() || !alive(pid)) return;
    if (i === 20) await hardKill(); // one more shove halfway through
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Give an application an empty state directory.
 *
 * Windows can hold a directory handle well after its owner exits, so retry, then fall
 * back to a fresh sibling. What matters is empty state, not the exact path.
 */
export async function freshDir(path) {
  let lastErr;
  for (let i = 0; i < 20; i++) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      await mkdir(path, { recursive: true });
      return path;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  for (let n = 2; n < 50; n++) {
    const alt = `${path}-${n}`;
    try {
      await rm(alt, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
      await mkdir(alt, { recursive: true });
      return alt;
    } catch {
      /* try the next suffix */
    }
  }
  throw new Error(`could not obtain a clean state directory near ${path}: ${lastErr?.message}`);
}

/** Fast-forward a shallow clone to the tip of the branch it is on. */
export async function gitUpdate(dir) {
  const at = async (args) => (await execFileP('git', ['-C', dir, ...args], { windowsHide: true })).stdout.trim();
  const before = await at(['rev-parse', '--short', 'HEAD']);
  const branch = await at(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD');
  await execFileP('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', branch], { windowsHide: true });
  await execFileP('git', ['-C', dir, 'reset', '--hard', 'FETCH_HEAD'], { windowsHide: true });
  const after = await at(['rev-parse', '--short', 'HEAD']);
  return { branch, before, after, changed: before !== after };
}

const STAMP = '.bench-build';

/**
 * Build an application only when its checked-out commit has changed. Rebuilding every
 * application on every run is most of a pass's wall time.
 */
export async function prepareCached(adapter, { force = false, log } = {}) {
  // An image is its own cache, keyed by a tag carrying the commit.
  if (adapter.isDocker) {
    const built = await adapter.prepare({ force, log });
    return { reused: Boolean(built?.reused), stamp: adapter.image };
  }

  const stampPath = join(adapter.buildDir, STAMP);
  const want = await adapter.buildStamp();
  const artifacts = adapter.buildArtifacts();

  if (!force && want && artifacts.length) {
    const have = await readFile(stampPath, 'utf8').catch(() => null);
    if (have?.trim() === want) {
      const present = await Promise.all(artifacts.map((p) => stat(p).then(() => true).catch(() => false)));
      if (present.every(Boolean)) {
        log?.(`  reusing existing build (${want})`);
        return { reused: true, stamp: want };
      }
    }
  }

  await adapter.prepare();
  if (want) {
    await mkdir(adapter.buildDir, { recursive: true }).catch(() => {});
    // Stamp only a complete build, so a partial one is retried rather than cached.
    const present = await Promise.all(artifacts.map((p) => stat(p).then(() => true).catch(() => false)));
    if (artifacts.length && present.every(Boolean)) await writeFile(stampPath, want).catch(() => {});
  }
  return { reused: false, stamp: want };
}

/** Post a file as multipart/form-data without pulling in a dependency. */
export async function postMultipart(url, { fields = {}, file, headers = {} }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  if (file) {
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(file.path);
    form.append(file.field ?? 'file', new Blob([buf], { type: 'application/x-nzb' }), file.name);
  }
  const res = await fetch(url, { method: 'POST', body: form, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export { join, resolve };

/** Extensions a player can open directly. */
const PLAYABLE_RE = /\.(mkv|mp4|m2ts|ts|avi|m4v|mov|wmv|mpg|mpeg|vob)$/i;
/** Disc images: playable only if the application expands them, so a fallback. */
const IMAGE_RE = /\.(iso|img)$/i;

/**
 * Choose the file an application is expected to serve, from a listing of {name,size}.
 * Prefers real video, then a disc image, which an application may expose unexpanded.
 */
export function pickPlayable(entries, { nameOf = (e) => e.name ?? e.path ?? '', sizeOf = (e) => e.size ?? 0 } = {}) {
  const bySize = [...entries].sort((a, b) => sizeOf(b) - sizeOf(a));
  const video = bySize.find((e) => PLAYABLE_RE.test(nameOf(e)));
  if (video) return { entry: video, kind: 'video' };
  const image = bySize.find((e) => IMAGE_RE.test(nameOf(e)));
  if (image) return { entry: image, kind: 'disc-image' };
  return { entry: bySize[0], kind: bySize[0] ? 'fallback-largest' : 'none' };
}
