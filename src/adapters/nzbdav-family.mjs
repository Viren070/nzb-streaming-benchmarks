// Shared base for nzbdav and its forks nzbdavex and infinidysk, which expose the same
// shape.
//
//   runtime     .NET, backend only
//   config      POST /api/update-config, keyed by x-api-key
//   onboarding  GET /api/is-onboarding, POST /api/create-account
//   import      SABnzbd-compatible API
//   stream      WebDAV
//
// Requires the .NET SDK on PATH; a missing one fails the adapter rather than quietly
// dropping a row from the comparison.

import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Adapter, run, gitDescribe, postMultipart } from './base.mjs';
import { bashEnv } from './toolchain.mjs';
import { waitFor, waitForHttp, Fatal } from '../metrics/http.mjs';

const API_KEY = 'benchmark-internal-key';
const DAV_USER = 'bench';
const DAV_PASS = 'bench';
const CATEGORY = 'bench';

export class NzbdavFamilyAdapter extends Adapter {
  static language = 'C# (.NET 10)';
  static platforms = ['win32', 'linux', 'darwin'];
  static serving = 'webdav';
  /** Subclasses override when the fork renamed the project directory. */
  static backendProject = 'backend';

  get dll() {
    return join(this.buildDir, 'NzbWebDAV.dll');
  }

  buildArtifacts() {
    return [this.dll];
  }

  /** The image also runs a UI on 3000; config, SABnzbd and WebDAV are all on the backend. */
  static docker = { containerPort: 8080, dataDir: '/config' };

  async build() {
    try {
      await run('dotnet', ['--version'], { label: 'dotnet probe', timeout: 60000 });
    } catch {
      throw new Error(
        `${this.constructor.displayName} needs the .NET SDK (net10.0). ` +
          `Install it (scoop install dotnet-sdk / https://dot.net) or set DOTNET_BIN to its full path. ` +
          `Alternatively pass --docker=${this.id} to run it in a container instead.`,
      );
    }
    await mkdir(this.buildDir, { recursive: true });
    // Publish rather than `dotnet run`: one process to sample, and no build work inside
    // the measured startup.
    await run(
      'dotnet',
      ['publish', this.constructor.backendProject, '-c', 'Release', '-o', this.buildDir, '--nologo'],
      {
        cwd: this.appDir,
        label: `${this.id} dotnet publish`,
        timeout: 2400000,
        // MSBuild otherwise leaves worker daemons resident on a machine being measured.
        // A native-dependency target in this tree shells out to bash.
        env: { MSBUILDDISABLENODEREUSE: '1', ...(await bashEnv()) },
      },
    );
  }

  async env() {
    return {
      CONFIG_PATH: this.dataDir,
      FRONTEND_BACKEND_API_KEY: API_KEY,
      BACKEND_URL: this.selfUrl,
      ASPNETCORE_URLS: this.bindUrl,
      // The web UI's port, not the backend's. Sharing one makes whichever starts first
      // take it and the other die on address-in-use.
      PORT: '3000',
    };
  }

  async nativeLaunch() {
    // The application does not self-migrate; the container entrypoint does this for us.
    await run('dotnet', [this.dll, '--db-migration'], {
      cwd: this.buildDir,
      env: await this.env(),
      label: `${this.id} db migration`,
      timeout: 300000,
    });
    return { command: 'dotnet', args: [this.dll], cwd: this.buildDir };
  }

  async ready() {
    await waitForHttp(`${this.base}/health`, { timeoutMs: 180000 });
  }

  async configure() {
    await this.#onboard();
    await this.#configure();
  }

  /** These controllers read the request form directly; a JSON body 500s. */
  async #form(path, fields) {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) body.set(k, String(v));
    const res = await fetch(`${this.base}/api/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-api-key': API_KEY },
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST /api/${path} -> ${res.status}: ${text.slice(0, 300)}`);
    const parsed = text ? JSON.parse(text) : {};
    if (parsed.status === false) throw new Error(`POST /api/${path} rejected: ${parsed.error}`);
    return parsed;
  }

  async #onboard() {
    const res = await fetch(`${this.base}/api/is-onboarding`, { headers: { 'x-api-key': API_KEY } });
    const body = await res.json().catch(() => ({}));
    if (body?.isOnboarding === false) return;
    // AccountType: Admin = 1, WebDav = 2 (Database/Models/Account.cs).
    await this.#form('create-account', { username: DAV_USER, password: DAV_PASS, type: 'Admin' });
  }

  async #configure() {
    // Shape must match UsenetProviderConfig exactly: System.Text.Json is used with
    // default options, so property names are case-sensitive PascalCase and the
    // ProviderType enum serialises as a number (Disabled 0, Pooled 1, BackupAndStats
    // 2, BackupOnly 3).
    const usenetProviders = {
      Providers: this.providers.map((p) => ({
        Type: p.backup ? 3 : 1,
        Host: p.host,
        Port: p.port,
        UseSsl: p.tls,
        User: p.user ?? '',
        Pass: p.pass ?? '',
        MaxConnections: p.maxConnections,
      })),
    };
    await this.#form('update-config', {
      'usenet.providers': JSON.stringify(usenetProviders),
      'usenet.max-download-connections': String(this.providers.reduce((a, p) => a + p.maxConnections, 0)),
      // webdav.pass is hashed server-side, so send the plaintext.
      'webdav.user': DAV_USER,
      'webdav.pass': DAV_PASS,
      'api.key': API_KEY,
      'api.categories': CATEGORY,
    });
  }

  async version() {
    return { version: await gitDescribe(this.appDir), commit: undefined };
  }

  get #davAuth() {
    return `Basic ${Buffer.from(`${DAV_USER}:${DAV_PASS}`).toString('base64')}`;
  }

  async addNzb(item) {
    await postMultipart(`${this.base}/api?mode=addfile&output=json&apikey=${API_KEY}&cat=${CATEGORY}`, {
      fields: { mode: 'addfile', output: 'json', cat: CATEGORY },
      file: { field: 'nzbfile', path: item.path, name: `${item.id}.nzb` },
    });

    const hit = await waitFor(
      async () => {
        const res = await fetch(`${this.base}/api?mode=history&output=json&apikey=${API_KEY}&limit=200`);
        const body = await res.json();
        const slots = body?.history?.slots ?? [];
        const found = slots.find((s) => (s.name ?? s.nzb_name ?? '').includes(item.id));
        if (!found) return null;
        if (/fail/i.test(found.status ?? '')) throw new Fatal(`import failed: ${found.fail_message ?? found.status}`);
        return found.storage ? found : null;
      },
      { timeoutMs: this.options?.importTimeoutMs ?? 300000, intervalMs: 100, what: `${this.id} import of ${item.id}` },
    );
    return { id: item.id, storage: hit.storage };
  }

  async resolve(handle) {
    // SAB history reports a *filesystem* path under the symlink import root
    // (e.g. /mnt/nzbdav/completed-symlinks/bench/plain-small). The WebDAV tree has
    // four top-level folders (.ids, completed-symlinks, content, nzbs), and
    // completed-symlinks mirrors content, so the real media lives under
    // /content/<category>/<release>.
    const raw = String(handle.storage).replace(/\\/g, '/');
    const rel = raw.includes('completed-symlinks/')
      ? raw.slice(raw.indexOf('completed-symlinks/') + 'completed-symlinks/'.length)
      : raw.replace(/^\/+/, '');
    const found = await this.#findVideo(`/content/${rel}`.replace(/\/+/g, '/'));
    return {
      url: `${this.base}${found.path}`,
      headers: { Authorization: this.#davAuth },
      fileName: found.name,
      sizeBytes: found.size,
    };
  }

  async #findVideo(path, depth = 0) {
    if (depth > 4) throw new Error(`no video under ${path}`);
    const res = await fetch(`${this.base}${path}`, {
      method: 'PROPFIND',
      headers: { Depth: '1', Authorization: this.#davAuth },
    });
    if (res.status !== 207 && !res.ok) throw new Error(`PROPFIND ${path} -> ${res.status}`);
    const xml = await res.text();
    // hrefs come back absolute here (unlike altmount's relative ones), so reduce
    // them to a path or the base gets concatenated twice.
    const toPath = (h) => {
      const d = decodeURIComponent(h);
      try {
        return new URL(d).pathname;
      } catch {
        return d;
      }
    };
    const rows = [...xml.matchAll(/<[^>]*response[^>]*>([\s\S]*?)<\/[^>]*response>/gi)].map((m) => ({
      href: toPath(m[1].match(/<[^>]*href[^>]*>([^<]*)</i)?.[1] ?? ''),
      size: Number(m[1].match(/getcontentlength[^>]*>(\d+)</i)?.[1] ?? 0),
      isDir: /<[^>]*collection\s*\/>/i.test(m[1]),
    }));
    const VIDEO = /\.(mkv|mp4|m2ts|ts|avi|m4v|mov|wmv|mpg|mpeg|vob|iso|img)$/i;
    const files = rows.filter((r) => !r.isDir && VIDEO.test(r.href)).sort((a, b) => b.size - a.size);
    if (files.length) return { path: files[0].href, name: files[0].href.split('/').pop(), size: files[0].size };
    for (const d of rows.filter((r) => r.isDir && r.href.replace(/\/$/, '') !== path.replace(/\/$/, ''))) {
      try {
        return await this.#findVideo(d.href.replace(/\/$/, ''), depth + 1);
      } catch {
        /* next */
      }
    }
    throw new Error(`no video under ${path}`);
  }
}
