// StremThru (newz): Go, multi-store Stremio addon whose `stremthru` store is its own
// usenet engine. Two APIs are involved, with different auth.
//
//   servers  POST /dash/api/vault/usenet/servers    session cookie, admin
//   import   POST /v0/store/newz                    store headers
//   poll     GET  /v0/store/newz/{id}               -> {status, files[{link,size}]}
//   resolve  POST /v0/store/newz/link/generate      {link} -> {data:{link}}
//
// Requires the `newz` and `vault` features, and a vault secret.

import { readFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Adapter, allocPort, run, gitDescribe } from './base.mjs';
import { cgoEnv } from './toolchain.mjs';
import { waitFor, waitForHttp, Fatal } from '../metrics/http.mjs';

const USER = 'bench';
const PASS = 'bench';

export default class StremthruAdapter extends Adapter {
  static id = 'stremthru';
  static displayName = 'StremThru (newz)';
  static language = 'Go';
  static repo = 'https://github.com/MunifTanjim/stremthru';
  static platforms = ['win32', 'linux', 'darwin'];
  static serving = 'http-range';

  get #binary() {
    return join(this.buildDir, process.platform === 'win32' ? 'stremthru.exe' : 'stremthru');
  }
  #cookie = null;
  #nzbServer = null;
  #nzbPort = null;
  #nzbFiles = new Map();

  get #auth() {
    return `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`;
  }

  get #storeHeaders() {
    return {
      'X-StremThru-Authorization': this.#auth,
      'X-StremThru-Store-Name': 'stremthru',
      // The scheme word is required: everything after the first space is taken as the
      // token. For the built-in store the credential is the STREMTHRU_AUTH pair.
      'X-StremThru-Store-Authorization': this.#auth,
    };
  }

  buildArtifacts() {
    return [this.#binary];
  }

  static docker = { containerPort: 8080, dataDir: '/app/data' };

  /** The Dockerfile COPYs `apps/dash/.output/public/`, which is a build product. */
  async beforeImageBuild() {
    const dashOut = join(this.appDir, 'apps', 'dash', '.output', 'public');
    if (await access(join(dashOut, 'index.html')).then(() => true).catch(() => false)) return;
    await run('pnpm', ['install', '--frozen-lockfile'], {
      cwd: this.appDir,
      label: 'stremthru dash deps',
      timeout: 1800000,
    });
    await run('pnpm', ['--filter', 'dash', 'run', 'build'], {
      cwd: this.appDir,
      label: 'stremthru dash build',
      timeout: 1800000,
    });
  }

  async build() {
    await mkdir(this.buildDir, { recursive: true });
    // Required: a migration creates an fts5 virtual table, and go-sqlite3 omits FTS5
    // without the tag. An untagged build starts, then dies on "no such module: fts5".
    await run('go', ['build', '--tags', 'sqlite_fts5,sqlite_stat4', '-o', this.#binary, '.'], {
      cwd: this.appDir,
      label: 'stremthru go build',
      env: await cgoEnv(),
    });
  }

  async env() {
    return {
      STREMTHRU_PORT: String(this.servicePort),
      // Playback links are built from this rather than the request Host.
      STREMTHRU_BASE_URL: this.base,
      STREMTHRU_AUTH: `${USER}:${PASS}`,
      // The dashboard API owns usenet server config and requires an admin user.
      STREMTHRU_AUTH_ADMIN: USER,
      // An empty enable list means all on, and `+name` is rejected for a feature that
      // is not disabled, so unrelated background work is switched off with `-`.
      // Otherwise an IMDb import and store crawling compete for CPU and disk.
      STREMTHRU_FEATURE:
        '-imdb_title,-dmm_hashlist,-torz,-sync,-stremio_list,-stremio_store,-stremio_torz,-stremio_wrap,-stremio_sidekick,-probe_media_info',
      // The usenet-server endpoints exist only with the vault feature on, which needs
      // a non-empty secret; without it they 404.
      STREMTHRU_VAULT_SECRET: 'usenet-benchmarks-vault-secret',
      STREMTHRU_DATA_DIR: this.dataDir,
      // The URI parser rejects absolute Windows paths and normalises `..` away.
      STREMTHRU_DATABASE_URI: 'sqlite://./stremthru.db',
      STREMTHRU_NEWZ_MAX_CONNECTION_PER_STREAM: String(this.options?.connectionsPerStream ?? 8),
      // Default is 50MB; the corpus goes well past that.
      STREMTHRU_NEWZ_NZB_FILE_MAX_SIZE: '512MB',
    };
  }

  async nativeLaunch() {
    return { command: this.#binary, args: [] };
  }

  async ready() {
    await waitForHttp(`${this.base}/v0/health`, { timeoutMs: 180000 }).catch(() =>
      waitForHttp(this.base, { timeoutMs: 60000 }),
    );
  }

  async configure() {
    await this.#addServers();
  }

  /**
   * The dash API is session-based, so the store API's auth header does not work here.
   * A single STREMTHRU_AUTH user with no STREMTHRU_AUTH_ADMIN is implicitly admin.
   */
  async #signIn() {
    const res = await fetch(`${this.base}/dash/api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: USER, password: PASS }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`stremthru dash sign-in -> ${res.status}: ${body.slice(0, 200)}`);
    }
    const cookies = res.headers.getSetCookie?.() ?? [];
    this.#cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    if (!this.#cookie) throw new Error('stremthru dash sign-in returned no session cookie');
  }

  async #addServers() {
    await this.#signIn();
    for (const [i, p] of this.providers.entries()) {
      const res = await fetch(`${this.base}/dash/api/vault/usenet/servers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: this.#cookie },
        body: JSON.stringify({
          name: p.name ?? p.host,
          host: p.host,
          port: p.port,
          username: p.user,
          password: p.pass,
          tls: p.tls,
          tls_skip_verify: true,
          priority: i,
          is_backup: p.backup,
          max_connections: p.maxConnections,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`stremthru add usenet server ${p.host} -> ${res.status}: ${body.slice(0, 300)}`);
      }
    }
  }

  /**
   * Publish one NZB over a throwaway local HTTP server and return its URL. The
   * server is started lazily and torn down with the adapter.
   */
  async #serveNzb(item) {
    if (!this.#nzbServer) {
      this.#nzbPort = await allocPort();
      this.#nzbServer = createServer(async (req, res) => {
        const id = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/|\.nzb$/g, ''));
        const path = this.#nzbFiles.get(id);
        if (!path) {
          res.writeHead(404).end('unknown nzb');
          return;
        }
        try {
          const body = await readFile(path);
          res.writeHead(200, { 'content-type': 'application/x-nzb', 'content-length': String(body.length) });
          res.end(body);
        } catch (e) {
          res.writeHead(500).end(String(e.message ?? e));
        }
      });
      await new Promise((r) => this.#nzbServer.listen(this.#nzbPort, '127.0.0.1', r));
    }
    this.#nzbFiles.set(item.id, item.path);
    return `http://127.0.0.1:${this.#nzbPort}/${encodeURIComponent(item.id)}.nzb`;
  }

  async stop() {
    if (this.#nzbServer) {
      await new Promise((r) => this.#nzbServer.close(r));
      this.#nzbServer = null;
    }
    await super.stop();
  }

  async version() {
    return { version: await gitDescribe(this.appDir), commit: undefined };
  }

  async addNzb(item) {
    // The built-in store ignores an uploaded file and requires a link, so the NZB is
    // served over a local HTTP server and the URL handed over instead.
    const link = await this.#serveNzb(item);

    const res = await fetch(`${this.base}/v0/store/newz`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.#storeHeaders },
      body: JSON.stringify({ link }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST /v0/store/newz -> ${res.status}: ${text.slice(0, 300)}`);
    const id = JSON.parse(text)?.data?.id;
    if (!id) throw new Error(`no newz id in response: ${text.slice(0, 200)}`);

    const ready = await waitFor(
      async () => {
        const r = await fetch(`${this.base}/v0/store/newz/${encodeURIComponent(id)}`, {
          headers: this.#storeHeaders,
        });
        const d = (await r.json())?.data;
        if (!d) return null;
        if (['failed', 'invalid'].includes(d.status)) throw new Fatal(`newz status ${d.status}`);
        return ['cached', 'downloaded'].includes(d.status) && d.files?.length ? d : null;
      },
      { timeoutMs: this.options?.importTimeoutMs ?? 300000, intervalMs: 100, what: `stremthru import of ${item.id}` },
    );

    const VIDEO = /\.(mkv|mp4|m2ts|ts|avi|m4v|mov|wmv|mpg|mpeg|vob|iso|img)$/i;
    const file =
      ready.files.filter((f) => VIDEO.test(f.name ?? f.path ?? '')).sort((a, b) => b.size - a.size)[0] ??
      [...ready.files].sort((a, b) => b.size - a.size)[0];
    if (!file) throw new Error('newz entry has no files');
    return { id: item.id, newzId: id, file };
  }

  async resolve(handle) {
    const res = await fetch(`${this.base}/v0/store/newz/link/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.#storeHeaders },
      body: JSON.stringify({ link: handle.file.link }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`link/generate -> ${res.status}: ${text.slice(0, 300)}`);
    const link = JSON.parse(text)?.data?.link;
    if (!link) throw new Error(`no link generated: ${text.slice(0, 200)}`);
    return { url: link, fileName: handle.file.name, sizeBytes: handle.file.size };
  }

  async remove(handle) {
    if (!handle?.newzId) return;
    await fetch(`${this.base}/v0/store/newz/${encodeURIComponent(handle.newzId)}`, {
      method: 'DELETE',
      headers: this.#storeHeaders,
    }).catch(() => {});
  }
}
