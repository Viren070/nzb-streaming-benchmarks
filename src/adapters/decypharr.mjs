// Decypharr: Go media gateway with direct usenet streaming.
//
//   import   SABnzbd-compatible API at /sabnzbd/api
//   stream   WebDAV at /webdav/__all__/<entry>/<file>
//
// The archive is assembled at import and the inner media file exposed directly, so what
// is measured is the unpacked video, not the outer volume stream.

import { join } from 'node:path';
import { mkdir, access } from 'node:fs/promises';
import { Adapter, run, gitDescribe, gitCommit, postMultipart, pickPlayable } from './base.mjs';
import { cgoEnv } from './toolchain.mjs';
import { waitFor, waitForHttp, Fatal } from '../metrics/http.mjs';

/** SABnzbd category. Only used to scope the import; WebDAV groups it separately. */
const CATEGORY = 'bench';
/** WebDAV group holding every entry regardless of category. */
const GROUP = '__all__';

export default class DecypharrAdapter extends Adapter {
  static id = 'decypharr';
  static displayName = 'Decypharr';
  static language = 'Go';
  static repo = 'https://github.com/sirrobot01/decypharr';
  static platforms = ['win32', 'linux', 'darwin'];
  static serving = 'webdav';

  static docker = {
    containerPort: 8282,
    dataDir: '/app',
    // Passed to the image's own entrypoint, which drops privileges and prepares /app.
    args: (a) => ['/usr/bin/decypharr', '--config', a.dataDir],
  };

  #fuseInclude = null;

  get #binary() {
    return join(this.buildDir, process.platform === 'win32' ? 'decypharr.exe' : 'decypharr');
  }

  buildArtifacts() {
    return [this.#binary];
  }

  async build() {
    await mkdir(this.buildDir, { recursive: true });

    // pkg/mount/dfs/backend/register/register_cgo.go carries no build tag, so
    // winfsp/cgofuse is compiled on every platform even though this benchmark only
    // uses the WebDAV path. On Windows that needs the WinFsp SDK headers.
    if (process.platform === 'win32') {
      for (const root of ['C:/Program Files (x86)/WinFsp/inc/fuse', 'C:/Program Files/WinFsp/inc/fuse']) {
        if (await access(join(root, 'fuse_common.h')).then(() => true).catch(() => false)) {
          this.#fuseInclude = root;
          break;
        }
      }
      if (!this.#fuseInclude) {
        throw new Error(
          'decypharr needs WinFsp to build on Windows: it links winfsp/cgofuse unconditionally ' +
            '(register_cgo.go has no build tag), and the build fails on a missing fuse_common.h. ' +
            'Install WinFsp (scoop bucket extras: `scoop install winfsp`, or https://winfsp.dev); ' +
            'note that is a kernel-mode filesystem driver and needs an elevated install. ' +
            'Alternatively pass --docker=decypharr to run it in a container, or build on Linux, ' +
            'where libfuse headers are the equivalent dependency.',
        );
      }
    }

    await run('go', ['build', '-o', this.#binary, '.'], {
      cwd: this.appDir,
      label: 'decypharr go build',
      env: {
        ...(await cgoEnv()),
        ...(this.#fuseInclude ? { CGO_CFLAGS: `-I"${this.#fuseInclude}"` } : {}),
      },
    });
  }

  /** Shipped defaults everywhere except the provider list and the disabled FUSE mount. */
  async configFiles() {
    return {
      'config.json': JSON.stringify(
        {
          port: String(this.servicePort),
          log_level: 'info',
          use_auth: false,
          disable_webdav: false,
          categories: [CATEGORY],
          usenet: {
            providers: this.providers.map((p, i) => ({
              host: p.host,
              port: p.port,
              username: p.user,
              password: p.pass,
              max_connections: p.maxConnections,
              ssl: p.tls,
              priority: i + 1,
              backup: p.backup,
            })),
          },
        },
        null,
        2,
      ),
    };
  }

  configDirs() {
    return ['logs', 'cache', 'downloads'];
  }

  async env() {
    return { APP_PATH: this.dataDir, PORT: String(this.servicePort) };
  }

  async nativeLaunch() {
    return { command: this.#binary, args: ['--config', this.dataDir] };
  }

  async ready() {
    await waitForHttp(`${this.base}/sabnzbd/api?mode=version&output=json`, { timeoutMs: 180000 });
  }

  async version() {
    return { version: await gitDescribe(this.appDir), commit: await gitCommit(this.appDir).catch(() => undefined) };
  }

  #api(mode, params = {}) {
    const q = new URLSearchParams({ mode, output: 'json', category: CATEGORY, cat: CATEGORY, ...params });
    return `${this.base}/sabnzbd/api?${q}`;
  }

  /** Depth-1 PROPFIND, flattened to {href, size} rows. */
  async #list(path) {
    const res = await fetch(`${this.base}${path}`, { method: 'PROPFIND', headers: { Depth: '1' } });
    if (res.status !== 207 && !res.ok) throw new Error(`PROPFIND ${path} -> ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<[^>]*response[^>]*>([\s\S]*?)<\/[^>]*response>/gi)]
      .map((m) => ({
        href: decodeURIComponent(m[1].match(/<[^>]*href[^>]*>([^<]*)</i)?.[1] ?? ''),
        size: Number(m[1].match(/getcontentlength[^>]*>(\d+)</i)?.[1] ?? 0),
      }))
      // The collection itself is echoed as the first row.
      .filter((r) => r.href.replace(/\/$/, '') !== path.replace(/\/$/, ''));
  }

  async #failure(name) {
    const res = await fetch(this.#api('history', { limit: '200' }));
    const body = await res.json().catch(() => null);
    const slot = (body?.history?.slots ?? []).find((s) => (s.name ?? s.nzb_name ?? '') === name);
    if (slot && /fail|error/i.test(slot.status ?? '')) return slot.fail_message || slot.status;
    return null;
  }

  async addNzb(item) {
    // The default symlink action waits forever on a FUSE mount this WebDAV-only
    // deployment has none of. `action=none` changes bookkeeping only.
    const res = await postMultipart(this.#api('addfile', { action: 'none' }), {
      file: { field: 'name', path: item.path, name: `${item.id}.nzb` },
    });
    if (res && res.status === false) throw new Error(`addfile refused: ${res.error ?? 'unknown'}`);

    // Decypharr names the entry after the uploaded file, minus its extension.
    const name = item.id;
    const dir = `/webdav/${GROUP}/${encodeURIComponent(name)}`;
    await waitFor(
      async () => {
        // `action=none` drops a completed entry from the queue history reads, so only
        // failures ever appear there.
        const failed = await this.#failure(name);
        if (failed) throw new Fatal(`import failed: ${failed}`);
        const rows = await this.#list(dir).catch(() => []);
        return rows.length ? rows : null;
      },
      { timeoutMs: this.options?.importTimeoutMs ?? 300000, intervalMs: 1000, what: `decypharr import of ${item.id}` },
    );
    return { id: item.id, name, dir };
  }

  async resolve(handle) {
    const rows = await this.#list(handle.dir);
    const { entry, kind } = pickPlayable(rows, { nameOf: (r) => r.href, sizeOf: (r) => r.size });
    if (!entry) throw new Error(`no file listed under ${handle.dir}`);
    return {
      url: `${this.base}${entry.href}`,
      fileName: entry.href.split('/').pop(),
      sizeBytes: entry.size,
      note: kind === 'video' ? undefined : `served a ${kind}`,
    };
  }

  async remove(handle) {
    // Null when the import itself failed, and the drain runs on that path too.
    if (!handle?.dir) return;
    await fetch(`${this.base}${handle.dir}`, { method: 'DELETE' }).catch(() => {});
  }
}
