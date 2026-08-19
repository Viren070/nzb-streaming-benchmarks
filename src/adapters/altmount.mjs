// AltMount: Go, WebDAV-backed NZB filesystem.
//
//   config    config.yaml
//   import    POST /sabnzbd/api?mode=addfile   SABnzbd-compatible, multipart
//   progress  GET  /sabnzbd/api?mode=history
//   stream    GET  /webdav/<path>
//
// The CLI embeds the built frontend, so web assets must be built before `go build`.

import { mkdir, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { Adapter, run, gitDescribe, postMultipart } from './base.mjs';
import { cgoEnv } from './toolchain.mjs';
import { waitFor, waitForHttp, Fatal } from '../metrics/http.mjs';

const WEBDAV_USER = 'bench';
const WEBDAV_PASS = 'bench';
/** Must be exactly 32 chars; any other length is rejected. */
const API_KEY = 'benchmarkkey00000000000000000000';
const CATEGORY = 'bench';

export default class AltmountAdapter extends Adapter {
  static id = 'altmount';
  static displayName = 'AltMount';
  static language = 'Go';
  static repo = 'https://github.com/javi11/altmount';
  static platforms = ['win32', 'linux', 'darwin'];
  static serving = 'webdav';

  get #binary() {
    return join(this.buildDir, process.platform === 'win32' ? 'altmount.exe' : 'altmount');
  }

  buildArtifacts() {
    return [this.#binary];
  }

  static docker = {
    containerPort: 8080,
    // The image's s6 service hardcodes `--config=/config/config.yaml`.
    dataDir: '/config',
    dockerfile: 'docker/Dockerfile',
    // s6 runs the server as uid 1000 and the image does not chown /config.
    owner: '1000:1000',
  };

  async build() {
    await mkdir(this.buildDir, { recursive: true });

    // The CLI embeds the built frontend; skip rebuilding it if dist already exists.
    try {
      await access(join(this.appDir, 'frontend', 'dist'));
    } catch {
      await run('npm', ['ci'], { cwd: join(this.appDir, 'frontend'), label: 'altmount frontend deps' });
      await run('npm', ['run', 'build'], { cwd: join(this.appDir, 'frontend'), label: 'altmount frontend build' });
    }

    await run('go', ['build', '-o', this.#binary, './cmd/altmount'], {
      cwd: this.appDir,
      label: 'altmount go build',
      env: await cgoEnv(),
    });
  }

  #config() {
    const port = this.servicePort;
    return {
      webdav: { port, user: WEBDAV_USER, password: WEBDAV_PASS },
      // An explicit origin is required: the API sets AllowCredentials, and pairing that
      // with the default wildcard panics at startup.
      api: { prefix: '/api', allowed_origins: [`http://127.0.0.1:${port}`], key_override: API_KEY },
      auth: { login_required: false },
      // The SABnzbd API is off by default and 404s the import endpoint without this.
      // The category must also exist here or addfile answers
      // {"status":false,"error":"invalid category ..."} with HTTP 200.
      sabnzbd: {
        enabled: true,
        complete_dir: '/',
        categories: [
          { name: 'Default', order: 0, priority: 0, dir: 'complete' },
          { name: CATEGORY, order: 1, priority: 0, dir: CATEGORY },
        ],
      },
      database: { path: `${this.dataDir}/altmount.db`.replace(/\\/g, '/') },
      metadata: { root_path: `${this.dataDir}/metadata`.replace(/\\/g, '/') },
      streaming: {
        max_prefetch: this.options?.prefetch ?? 30,
        failure_masking: { enabled: false },
      },
      rclone: { mount_enabled: false, rc_enabled: false },
      providers: this.providers.map((p, i) => ({
        id: String(i + 1),
        host: p.host,
        port: p.port,
        username: p.user,
        password: p.pass,
        max_connections: p.maxConnections,
        inflight_requests: this.options?.pipelineDepth ?? 3,
        tls: p.tls,
        insecure_tls: true,
        enabled: true,
        is_backup_provider: p.backup,
      })),
    };
  }

  /** Minimal YAML writer: the config is a plain nested object of scalars/arrays. */
  #toYaml(obj, indent = 0) {
    const pad = ' '.repeat(indent);
    let out = '';
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        out += `${pad}${k}:\n`;
        for (const el of v) {
          if (el && typeof el === 'object') {
            out += `${pad}  - ${this.#toYaml(el, indent + 4).trimStart()}`;
          } else {
            out += `${pad}  - ${typeof el === 'string' ? JSON.stringify(el) : String(el)}\n`;
          }
        }
      } else if (v && typeof v === 'object') {
        out += `${pad}${k}:\n${this.#toYaml(v, indent + 2)}`;
      } else {
        const val = typeof v === 'string' ? JSON.stringify(v) : String(v);
        out += `${pad}${k}: ${val}\n`;
      }
    }
    return out;
  }

  configDirs() {
    return ['metadata'];
  }

  async configFiles() {
    return { 'config.yaml': this.#toYaml(this.#config()) };
  }

  async nativeLaunch() {
    return { command: this.#binary, args: ['serve', '--config', `${this.dataDir}/config.yaml`] };
  }

  async ready() {
    await waitForHttp(`${this.base}/api/health`, { timeoutMs: 120000 }).catch(() =>
      waitForHttp(this.base, { timeoutMs: 60000 }),
    );
  }

  async version() {
    return { version: await gitDescribe(this.appDir), commit: undefined };
  }

  async addNzb(item) {
    // The SABnzbd API signals failure as HTTP 200 with {"status":false}, which would
    // otherwise be waited out as a timeout.
    const added = await postMultipart(
      `${this.base}/sabnzbd/api?mode=addfile&output=json&apikey=${API_KEY}&cat=${CATEGORY}`,
      {
        fields: { mode: 'addfile', output: 'json', cat: CATEGORY },
        file: { field: 'name', path: item.path, name: `${item.id}.nzb` },
      },
    );
    if (added && typeof added === 'object' && added.status === false) {
      throw new Error(`addfile rejected: ${added.error ?? JSON.stringify(added).slice(0, 200)}`);
    }

    // Track by nzo_id: history names are not unique across repeated runs.
    const nzoId = added?.nzo_ids?.[0];
    const entry = await waitFor(
      async () => {
        const res = await fetch(`${this.base}/sabnzbd/api?mode=history&output=json&apikey=${API_KEY}&limit=200`);
        const slots = (await res.json())?.history?.slots ?? [];
        const hit = nzoId
          ? slots.find((s) => s.nzo_id === nzoId)
          : slots.find((s) => (s.name ?? s.nzb_name ?? '').includes(item.id));
        if (!hit) return null;
        if (hit.status && /fail/i.test(hit.status)) {
          // Terminal: altmount moves the NZB to .nzbs/failed and will not retry.
          throw new Fatal(`import failed: ${hit.fail_message || hit.status}`);
        }
        return hit.storage || hit.path ? hit : null;
      },
      { timeoutMs: this.options?.importTimeoutMs ?? 300000, intervalMs: 100, what: `altmount import of ${item.id}` },
    );

    return { id: item.id, nzoId, storage: entry.storage ?? entry.path, bytes: entry.bytes };
  }

  async resolve(handle) {
    // `storage` is mount-relative; the WebDAV tree mirrors it under /webdav.
    const rel = String(handle.storage).replace(/\\/g, '/').replace(/^\/+/, '');
    const listed = await this.#findVideo(`/${rel}`);
    return {
      url: `${this.base}/webdav${listed.path}`,
      headers: { Authorization: `Basic ${Buffer.from(`${WEBDAV_USER}:${WEBDAV_PASS}`).toString('base64')}` },
      fileName: listed.name,
      sizeBytes: listed.size,
    };
  }

  /** Depth-1 PROPFIND walk, since deep PROPFIND is unreliable here. */
  async #findVideo(startPath, depth = 0) {
    if (depth > 4) throw new Error(`no video found under ${startPath}`);
    const res = await fetch(`${this.base}/webdav${startPath}`, {
      method: 'PROPFIND',
      headers: {
        Depth: '1',
        Authorization: `Basic ${Buffer.from(`${WEBDAV_USER}:${WEBDAV_PASS}`).toString('base64')}`,
      },
    });
    if (!res.ok && res.status !== 207) throw new Error(`PROPFIND ${startPath} -> ${res.status}`);
    const xml = await res.text();

    const entries = [...xml.matchAll(/<[^>]*response[^>]*>([\s\S]*?)<\/[^>]*response>/gi)].map((m) => {
      const block = m[1];
      const href = decodeURIComponent(block.match(/<[^>]*href[^>]*>([^<]*)</i)?.[1] ?? '');
      const size = Number(block.match(/getcontentlength[^>]*>(\d+)</i)?.[1] ?? 0);
      const isDir = /<[^>]*collection\s*\/>/i.test(block);
      return { href, size, isDir };
    });

    const VIDEO = /\.(mkv|mp4|m2ts|ts|avi|m4v|mov|wmv|mpg|mpeg|vob|iso|img)$/i;
    const strip = (h) => h.replace(/^.*?\/webdav/, '') || '/';
    const files = entries.filter((e) => !e.isDir && VIDEO.test(e.href)).sort((a, b) => b.size - a.size);
    if (files.length) {
      return { path: strip(files[0].href), name: files[0].href.split('/').pop(), size: files[0].size };
    }
    for (const dir of entries.filter((e) => e.isDir)) {
      const p = strip(dir.href);
      if (p === startPath || p === `${startPath}/`) continue;
      try {
        return await this.#findVideo(p.replace(/\/$/, ''), depth + 1);
      } catch {
        /* try the next directory */
      }
    }
    throw new Error(`no video found under ${startPath}`);
  }
}
