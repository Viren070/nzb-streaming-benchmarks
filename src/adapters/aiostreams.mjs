// AIOStreams: TypeScript, in-process usenet engine, driven through its dashboard API.
//
//   config   USENET_PROVIDERS (JSON array), USENET_PREFETCH_SEGMENTS
//   import   POST   /api/v1/dashboard/usenet/library/upload   multipart, field `file`
//   status   GET    /api/v1/dashboard/usenet/library
//   files    GET    /api/v1/dashboard/usenet/library/:hash/files
//   stream   GET    /api/v1/dashboard/usenet/library/:hash/play[/:index]
//   cleanup  DELETE /api/v1/dashboard/usenet/library/:hash
//
// Dashboard routes require an admin session, so the adapter signs in and carries the
// cookie.

import { readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Adapter, run, gitDescribe } from './base.mjs';
import { waitFor, waitForHttp, Fatal } from '../metrics/http.mjs';

const ADMIN_USER = 'bench';
const ADMIN_PASS = 'benchbenchbench';

export default class AioStreamsAdapter extends Adapter {
  static id = 'aiostreams';
  static displayName = 'AIOStreams';
  static language = 'TypeScript';
  static repo = 'https://github.com/Viren070/AIOStreams';
  static platforms = ['win32', 'linux', 'darwin'];
  static serving = 'http-range';

  #cookie = null;

  buildArtifacts() {
    return [join(this.appDir, 'packages', 'server', 'dist', 'app.js')];
  }

  async build() {
    // A pnpm workspace: internal deps use `workspace:*`, which npm cannot resolve.
    await run('pnpm', ['install', '--frozen-lockfile'], {
      cwd: this.appDir,
      label: 'aiostreams deps',
      timeout: 1800000,
    });
    await run('pnpm', ['run', 'build'], { cwd: this.appDir, label: 'aiostreams build', timeout: 2400000 });
  }

  static DATA_SUBDIR = 'bench-data';

  // WORKDIR is /app, so the relative database URI resolves to /app/bench-data.
  static docker = { containerPort: 3000, dataDir: '/app/bench-data' };

  /**
   * Derived from DATABASE_URI, where only a plain relative URI is safe: `..` segments are
   * normalised away, and an absolute URI is percent-encoded, so a path containing a space
   * resolves to a literal `%20` directory.
   */
  get nativeStateDir() {
    return join(this.appDir, AioStreamsAdapter.DATA_SUBDIR);
  }

  /**
   * A fresh database rebuilds an anime mapping dataset before the server answers, which
   * is one-off in real use. The segment cache and library are cleared instead.
   */
  static freshStatePerRun = false;

  async env() {
    const providers = this.providers.map((p, i) => ({
      id: p.id,
      name: p.name ?? p.host,
      host: p.host,
      port: p.port,
      tls: p.tls,
      tlsSkipVerify: true,
      username: p.user,
      password: p.pass,
      maxConnections: p.maxConnections,
      priority: i,
      isBackup: p.backup,
      enabled: true,
      // 1 disables pipelining.
      pipelineDepth: this.options?.pipelineDepth ?? 1,
    }));
    return {
      PORT: String(this.servicePort),
      DATABASE_URI: `sqlite://./${AioStreamsAdapter.DATA_SUBDIR}/db.sqlite`,
      // Both required or the server exits before binding. SECRET_KEY must be 64 hex
      // chars, fixed here for reproducibility on a throwaway local instance.
      BASE_URL: this.base,
      SECRET_KEY: 'b'.repeat(64),
      // Operator credentials are a `user:pass` map; the admin permission is separate.
      AIOSTREAMS_AUTH: `${ADMIN_USER}:${ADMIN_PASS}`,
      AIOSTREAMS_AUTH_PERMISSIONS: `${ADMIN_USER}=admin`,
      USENET_PROVIDERS: JSON.stringify(providers),
      USENET_PREFETCH_SEGMENTS: String(this.options?.prefetchSegments ?? 32),
      // Raised so a large corpus NZB cannot be mistaken for a capability failure.
      USENET_MAX_NZB_SIZE: '512MB',
    };
  }

  async nativeLaunch() {
    // Cleared before the server starts, so the delete cannot hit an open handle.
    await this.#clearCache();
    // Started directly rather than through a package script, so the sampler watches one
    // process instead of a shell wrapper and its child.
    return {
      command: 'node',
      args: [join('packages', 'server', 'dist', 'server')],
      cwd: this.appDir,
    };
  }

  async ready() {
    // A first boot with no database rebuilds datasets before answering; allow for it.
    await waitForHttp(`${this.base}/api/v1/status`, { timeoutMs: 900000 }).catch(() =>
      waitForHttp(this.base, { timeoutMs: 120000 }),
    );
  }

  async configure() {
    await this.#signIn();
    await this.#clearLibrary();
  }

  /** Remove every imported NZB, so a reused database still starts with an empty library. */
  async #clearLibrary() {
    const res = await fetch(`${this.base}/api/v1/dashboard/usenet/library?limit=500&status=all`, {
      headers: this.#headers,
    }).catch(() => null);
    if (!res?.ok) return;
    const entries = (await res.json().catch(() => ({})))?.data?.entries ?? [];
    for (const e of entries) {
      const hash = e.nzbHash ?? e.hash;
      if (!hash) continue;
      await fetch(`${this.base}/api/v1/dashboard/usenet/library/${hash}`, {
        method: 'DELETE',
        headers: this.#headers,
      }).catch(() => {});
    }
    if (entries.length) this.clearedOnStart = entries.length;
  }

  /**
   * Remove `<dataFolder>/cache`, holding parsed NZBs and cached segments. Every other
   * application gets a fresh state directory each run, so without this one an open
   * would be served from local disk rather than the provider.
   */
  async #clearCache() {
    await rm(join(this.stateDir, 'cache'), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  async #signIn() {
    const res = await fetch(`${this.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    if (setCookie.length) this.#cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
    if (!res.ok && !this.#cookie) {
      const body = await res.text().catch(() => '');
      throw new Error(`aiostreams admin sign-in failed (${res.status}): ${body.slice(0, 200)}`);
    }
  }

  get #headers() {
    return this.#cookie ? { cookie: this.#cookie } : {};
  }

  async version() {
    return { version: await gitDescribe(this.appDir), commit: undefined };
  }

  async addNzb(item) {
    const buf = await readFile(item.path);
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'application/x-nzb' }), `${item.id}.nzb`);

    const res = await fetch(`${this.base}/api/v1/dashboard/usenet/library/upload`, {
      method: 'POST',
      headers: this.#headers,
      body: form,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`library/upload -> ${res.status}: ${text.slice(0, 300)}`);
    const entry = JSON.parse(text)?.data;
    const hash = entry?.nzbHash ?? entry?.hash;
    if (!hash) throw new Error(`no nzbHash in upload response: ${text.slice(0, 200)}`);

    // Poll status, not the file list: a failed import simply has no files, so waiting
    // for files turns an explicit failure into a timeout with no reason attached.
    // Statuses: queued, inspecting, available, degraded, streaming, failed.
    const entry2 = await waitFor(
      async () => {
        const r = await fetch(`${this.base}/api/v1/dashboard/usenet/library?limit=200&status=all`, {
          headers: this.#headers,
        });
        if (!r.ok) return null;
        const entries = (await r.json())?.data?.entries ?? [];
        const mine = entries.find((e) => (e.nzbHash ?? e.hash) === hash);
        if (!mine) return null;
        if (mine.status === 'failed') {
          // The code is stable enough to compare across runs; the message is not.
          const why = mine.failReason ?? mine.error ?? mine.statusMessage ?? 'status=failed';
          throw new Fatal(`import failed: ${why}${mine.errorCode ? ` [${mine.errorCode}]` : ''}`);
        }
        // `degraded` still serves, with holes, which is a result rather than a failure.
        return ['available', 'degraded', 'streaming'].includes(mine.status) ? mine : null;
      },
      { timeoutMs: this.options?.importTimeoutMs ?? 300000, intervalMs: 250, what: `aiostreams import of ${item.id}` },
    );
    this.lastStatus = entry2.status;

    const files = await waitFor(
      async () => {
        const r = await fetch(`${this.base}/api/v1/dashboard/usenet/library/${hash}/files`, {
          headers: this.#headers,
        });
        if (!r.ok) return null;
        const d = (await r.json())?.data;
        const list = Array.isArray(d) ? d : (d?.files ?? []);
        return list.length ? list : null;
      },
      // Already available, so a long wait here would re-hide what status just ruled out.
      { timeoutMs: 60000, intervalMs: 250, what: `aiostreams file list for ${item.id}` },
    );

    const VIDEO = /\.(mkv|mp4|m2ts|ts|avi|m4v|mov|wmv|mpg|mpeg|vob|iso|img)$/i;
    const file =
      files.filter((f) => VIDEO.test(f.name ?? f.path ?? '')).sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0] ??
      [...files].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
    return { id: item.id, hash, file, index: files.indexOf(file) };
  }

  async resolve(handle) {
    // `/play` mints a signed token and returns JSON pointing at the Range-capable byte
    // route, rather than serving bytes itself.
    const sel = handle.index >= 0 ? `/${handle.index}` : '';
    const res = await fetch(`${this.base}/api/v1/dashboard/usenet/library/${handle.hash}/play${sel}`, {
      headers: this.#headers,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`play -> ${res.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text)?.data;
    if (!data?.url) throw new Error(`play returned no stream url: ${text.slice(0, 200)}`);

    return {
      url: data.url.startsWith('http') ? data.url : `${this.base}${data.url}`,
      headers: this.#headers,
      fileName: data.filename ?? handle.file?.name ?? handle.file?.path,
      sizeBytes: handle.file?.size,
    };
  }

  async remove(handle) {
    if (!handle?.hash) return;
    await fetch(`${this.base}/api/v1/dashboard/usenet/library/${handle.hash}`, {
      method: 'DELETE',
      headers: this.#headers,
    }).catch(() => {});
  }
}
