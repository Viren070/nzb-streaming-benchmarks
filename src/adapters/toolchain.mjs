// Locates build toolchains: PATH first, then where the installers actually put things.
// A missing PATH entry must not surface as "app failed to start", which would put a
// wrong row in the comparison.

import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';

const execFileP = promisify(execFile);
const isWin = process.platform === 'win32';
const HOME = homedir();
const cache = new Map();

async function exists(p) {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Expand a path pattern containing one `*` segment into real paths. */
async function expandGlob(pattern) {
  const i = pattern.indexOf('*');
  if (i === -1) return [pattern];
  const head = pattern.slice(0, i);
  // Separators are platform-native here (path.join), so accept either.
  const rest = pattern.slice(i + 1);
  const tail = rest.replace(/^[/\\]/, '');
  const dir = head.replace(/[/\\][^/\\]*$/, '');
  try {
    const names = await readdir(dir);
    return names.map((n) => (tail ? join(dir, n, tail) : join(dir, n)));
  } catch {
    return [];
  }
}

/** Windows refuses to execFile a .cmd/.bat without a shell (CVE-2024-27980). */
export function needsShell(bin) {
  return isWin && /\.(cmd|bat)$/i.test(bin);
}

const CANDIDATES = {
  dotnet: isWin
    ? [
        join(HOME, 'scoop', 'shims', 'dotnet.exe'),
        join(HOME, 'scoop', 'apps', 'dotnet-sdk', 'current', 'dotnet.exe'),
        'C:/Program Files/dotnet/dotnet.exe',
        join(HOME, '.dotnet', 'dotnet.exe'),
        'C:/ProgramData/chocolatey/bin/dotnet.exe',
      ]
    : ['/usr/bin/dotnet', '/usr/local/bin/dotnet', '/usr/share/dotnet/dotnet', join(HOME, '.dotnet', 'dotnet')],
  go: isWin
    ? [join(HOME, 'scoop', 'shims', 'go.exe'), 'C:/Program Files/Go/bin/go.exe', 'C:/Go/bin/go.exe']
    : ['/usr/local/go/bin/go', '/usr/bin/go', '/usr/local/bin/go'],
  node: isWin
    ? [join(HOME, 'scoop', 'shims', 'node.exe'), 'C:/Program Files/nodejs/node.exe']
    : ['/usr/bin/node', '/usr/local/bin/node'],
  npm: isWin
    ? [
        join(HOME, 'scoop', 'shims', 'npm.cmd'),
        'C:/Program Files/nodejs/npm.cmd',
        // Version managers keep the real npm.cmd beside the node they manage; the
        // per-shell dirs they add to PATH are not inherited by our children.
        join(HOME, 'scoop', 'apps', 'fnm', 'current', 'aliases', '*', 'npm.cmd'),
        join(HOME, 'AppData', 'Roaming', 'fnm', 'aliases', '*', 'npm.cmd'),
        join(HOME, 'AppData', 'Roaming', 'fnm', 'node-versions', '*', 'installation', 'npm.cmd'),
        join(HOME, '.fnm', 'aliases', '*', 'npm.cmd'),
        join(HOME, 'AppData', 'Roaming', 'nvm', '*', 'npm.cmd'),
      ]
    : [
        '/usr/bin/npm',
        '/usr/local/bin/npm',
        join(HOME, '.fnm', 'aliases', '*', 'bin', 'npm'),
        join(HOME, '.nvm', 'versions', 'node', '*', 'bin', 'npm'),
      ],
  pnpm: isWin
    ? [
        join(HOME, 'scoop', 'shims', 'pnpm.cmd'),
        join(HOME, 'scoop', 'apps', 'fnm', 'current', 'aliases', '*', 'pnpm.cmd'),
        join(HOME, 'AppData', 'Roaming', 'fnm', 'aliases', '*', 'pnpm.cmd'),
        join(HOME, 'AppData', 'Roaming', 'npm', 'pnpm.cmd'),
      ]
    : ['/usr/bin/pnpm', '/usr/local/bin/pnpm', join(HOME, '.fnm', 'aliases', '*', 'bin', 'pnpm')],
  cargo: isWin
    ? [join(HOME, '.cargo', 'bin', 'cargo.exe'), join(HOME, 'scoop', 'shims', 'cargo.exe')]
    : [join(HOME, '.cargo', 'bin', 'cargo'), '/usr/bin/cargo'],
  // cgo needs a GCC-compatible compiler. MSVC does not work; on Windows that means
  // mingw-w64. Several of these apps depend on rapidyenc, which is cgo-only.
  gcc: isWin
    ? [
        join(HOME, 'scoop', 'apps', 'mingw', 'current', 'bin', 'gcc.exe'),
        join(HOME, 'scoop', 'shims', 'gcc.exe'),
        'C:/msys64/mingw64/bin/gcc.exe',
        'C:/mingw64/bin/gcc.exe',
        'C:/TDM-GCC-64/bin/gcc.exe',
      ]
    : ['/usr/bin/gcc', '/usr/local/bin/gcc', '/usr/bin/cc'],
  python: isWin
    ? [join(HOME, 'scoop', 'shims', 'python.exe'), join(HOME, 'scoop', 'apps', 'python', 'current', 'python.exe')]
    : ['/usr/bin/python3', '/usr/local/bin/python3'],
};

/** Directories that hold the running Node, plus any resolvable `node` binary. */
async function besideNode(tool) {
  const dirs = new Set([process.execPath.replace(/[/\\][^/\\]+$/, '')]);
  try {
    const node = await resolveTool('node', { versionArgs: ['--version'] });
    if (node.includes('/') || node.includes('\\')) dirs.add(node.replace(/[/\\][^/\\]+$/, ''));
  } catch {
    /* node itself unresolvable; the caller will report it */
  }
  const names = isWin ? [`${tool}.cmd`, `${tool}.exe`, tool] : [tool];
  return [...dirs].flatMap((d) => names.map((n) => join(d, n)));
}

/**
 * Resolve a tool to something spawnable.
 * Order: `<TOOL>_BIN` env override, then PATH, then known install locations.
 * Throws with everywhere it looked, so the failure is actionable.
 */
export async function resolveTool(name, { versionArgs = ['--version'] } = {}) {
  if (cache.has(name)) return cache.get(name);

  const tried = [];
  const override = process.env[`${name.toUpperCase()}_BIN`];
  const onPath = isWin && !name.endsWith('.exe') ? `${name}.exe` : name;

  const candidates = [
    ...(override ? [override] : []),
    onPath, // let the OS resolve it from PATH
    ...(await Promise.all((CANDIDATES[name] ?? []).map(expandGlob))).flat(),
    // npm/npx ship beside the node binary, which version managers (fnm, nvm) put in
    // a per-shell directory that is not on PATH for a non-interactive child.
    ...(['npm', 'npx', 'pnpm', 'corepack'].includes(name) ? await besideNode(name) : []),
  ];

  for (const cand of candidates) {
    tried.push(cand);
    // A bare name has to be probed by running it; a path can be stat-checked first.
    if (cand !== onPath && !(await exists(cand))) continue;
    try {
      await execFileP(cand, versionArgs, { timeout: 60000, windowsHide: true, shell: needsShell(cand) });
      cache.set(name, cand);
      return cand;
    } catch {
      /* not usable; keep looking */
    }
  }

  throw new Error(
    `${name} not found. Set ${name.toUpperCase()}_BIN to its full path, or put it on PATH. Looked in:\n  ` +
      tried.join('\n  '),
  );
}

/**
 * Environment for a `go build` that needs cgo. Go defaults CGO_ENABLED=0 when no
 * compiler is on PATH, and the resulting failure names the missing symbol rather than
 * cgo, so a compiler is resolved and put on the child's PATH.
 */
export async function cgoEnv() {
  const gcc = await resolveTool('gcc', { versionArgs: ['--version'] }).catch(() => null);
  if (!gcc) {
    throw new Error(
      'cgo build requires a GCC-compatible C compiler and none was found. ' +
        'MSVC does not work for cgo. On Windows install mingw-w64 (`scoop install mingw`); ' +
        'on Linux install gcc. Set GCC_BIN to override.',
    );
  }
  const dir = gcc.replace(/[/\\][^/\\]+$/, '');
  const sep = isWin ? ';' : ':';
  return {
    CGO_ENABLED: '1',
    CC: gcc,
    PATH: `${dir}${sep}${process.env.PATH ?? ''}`,
  };
}

/** Best-effort version string for the run report. */
export async function toolVersion(name, versionArgs = ['--version']) {
  try {
    const bin = await resolveTool(name, { versionArgs });
    const { stdout } = await execFileP(bin, versionArgs, { timeout: 60000, windowsHide: true, shell: needsShell(bin) });
    return stdout.trim().split('\n')[0];
  } catch {
    return null;
  }
}
