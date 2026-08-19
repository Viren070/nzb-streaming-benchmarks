// StreamNZB: Go, Stremio addon that streams on the fly rather than mounting.
//
// The normal flow is indexer-driven, which does not fit a fixed corpus, so the direct
// path is used instead:
//   POST /api/play/nzb   NZB bytes or a source URL -> { sessionId, playUrl, ... }
// The play URL serves the chosen inner file with Range support.
//
// Only stored archives are supported, by design, so the negative tier fails here.

import { readFile, mkdir, rm, cp, access } from 'node:fs/promises';
import { join } from 'node:path';
import { Adapter, run, gitDescribe } from './base.mjs';
import { cgoEnv } from './toolchain.mjs';
import { waitFor, waitForHttp } from '../metrics/http.mjs';

export default class StreamnzbAdapter extends Adapter {
  static id = 'streamnzb';
  static displayName = 'StreamNZB';
  static language = 'Go';
  static repo = 'https://github.com/Gaisberg/streamnzb';
  static platforms = ['win32', 'linux', 'darwin'];
  static serving = 'http-range';

  get #binary() {
    return join(this.buildDir, process.platform === 'win32' ? 'streamnzb.exe' : 'streamnzb');
  }
  #token = null;

  buildArtifacts() {
    return [this.#binary];
  }

  static docker = { containerPort: 7000, dataDir: '/app/data' };

  async build() {
    await mkdir(this.buildDir, { recursive: true });

    // The server embeds `all:static`, a directory the frontend build produces and the
    // repo does not contain, so the Go build fails without it.
    const staticDir = join(this.appDir, 'pkg', 'server', 'web', 'static');
    try {
      await access(join(staticDir, 'index.html'));
    } catch {
      const frontend = join(this.appDir, 'frontend');
      await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: frontend, label: 'streamnzb frontend deps' });
      await run('npm', ['run', 'build'], { cwd: frontend, label: 'streamnzb frontend build' });
      await rm(staticDir, { recursive: true, force: true });
      await mkdir(staticDir, { recursive: true });
      await cp(join(frontend, 'dist'), staticDir, { recursive: true });
    }

    await run('go', ['build', '-o', this.#binary, './cmd/streamnzb'], {
      cwd: this.appDir,
      label: 'streamnzb go build',
      env: await cgoEnv(),
    });
  }

  /**
   * The Dockerfile COPYs `dist/linux_<arch>/streamnzb` rather than compiling. Built in a
   * container because cgo means cross-compiling to Linux needs a Linux C toolchain.
   */
  async beforeImageBuild() {
    await this.#buildFrontend();
    this.log?.('  building streamnzb linux binary in a container ...');
    await run(
      'docker',
      [
        'run', '--rm',
        '-v', `${this.appDir}:/src`,
        '-w', '/src',
        '-e', 'CGO_ENABLED=1',
        'golang:1.26-alpine',
        'sh', '-c',
        'apk add --no-cache gcc musl-dev >/dev/null && ' +
          'go build -o dist/linux_amd64/streamnzb ./cmd/streamnzb',
      ],
      { label: 'streamnzb linux binary', timeout: 1800000 },
    );
  }

  /** The server embeds `all:static`, which the frontend build produces. */
  async #buildFrontend() {
    const staticDir = join(this.appDir, 'pkg', 'server', 'web', 'static');
    try {
      await access(join(staticDir, 'index.html'));
      return;
    } catch {
      /* not built yet */
    }
    const frontend = join(this.appDir, 'frontend');
    await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: frontend, label: 'streamnzb frontend deps' });
    await run('npm', ['run', 'build'], { cwd: frontend, label: 'streamnzb frontend build' });
    await rm(staticDir, { recursive: true, force: true });
    await mkdir(staticDir, { recursive: true });
    await cp(join(frontend, 'dist'), staticDir, { recursive: true });
  }

  async env() {
    // Providers bootstrap from the environment, which also pins them: values set this
    // way cannot be overridden through the UI.
    const providerEnv = {};
    this.providers.slice(0, 10).forEach((p, i) => {
      const n = i + 1;
      providerEnv[`PROVIDER_${n}_HOST`] = p.host;
      providerEnv[`PROVIDER_${n}_PORT`] = String(p.port);
      providerEnv[`PROVIDER_${n}_USERNAME`] = p.user ?? '';
      providerEnv[`PROVIDER_${n}_PASSWORD`] = p.pass ?? '';
      providerEnv[`PROVIDER_${n}_CONNECTIONS`] = String(p.maxConnections);
      providerEnv[`PROVIDER_${n}_SSL`] = p.tls ? 'true' : 'false';
      providerEnv[`PROVIDER_${n}_NAME`] = p.name ?? p.host;
      providerEnv[`PROVIDER_${n}_PRIORITY`] = String(n);
      providerEnv[`PROVIDER_${n}_ENABLED`] = 'true';
    });
    return {
      CONFIG_PATH: this.dataDir,
      ADDON_PORT: String(this.servicePort),
      ADDON_BASE_URL: this.base,
      ADMIN_USERNAME: 'admin',
      // The bundled NNTP proxy binds a privileged port and shares the connection budget.
      NNTP_PROXY_ENABLED: 'false',
      LOG_LEVEL: 'INFO',
      ...providerEnv,
    };
  }

  async nativeLaunch() {
    return { command: this.#binary, args: ['-config', this.dataDir] };
  }

  async ready() {
    await waitForHttp(this.base, { timeoutMs: 180000 });
  }

  async configure() {
    await this.#readAdminToken();
  }

  /**
   * `admin_token` is generated into config.json on first boot and accepted as a bearer
   * token, which is more stable than driving the login flow.
   */
  async #readAdminToken() {
    this.#token = await waitFor(
      async () => {
        const raw = await this.readDataFile('config.json');
        return JSON.parse(raw)?.admin_token || null;
      },
      { timeoutMs: 60000, intervalMs: 500, what: 'streamnzb admin_token in config.json' },
    );
  }

  get #headers() {
    return this.#token ? { authorization: `Bearer ${this.#token}` } : {};
  }

  async version() {
    return { version: await gitDescribe(this.appDir), commit: undefined };
  }

  async addNzb(item) {
    const buf = await readFile(item.path);
    const form = new FormData();
    // The handler reads the upload from the `file` field and takes the release name
    // from its filename.
    form.append('file', new Blob([buf], { type: 'application/x-nzb' }), `${item.id}.nzb`);

    const res = await fetch(`${this.base}/api/play/nzb`, {
      method: 'POST',
      headers: this.#headers,
      body: form,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`play/nzb -> ${res.status}: ${text.slice(0, 300)}`);
    const body = JSON.parse(text);
    const path = body.playPath ?? body.playUrl ?? body.play_url;
    if (!path) throw new Error(`play/nzb returned no play path: ${text.slice(0, 200)}`);
    return { id: item.id, sessionId: body.sessionId ?? body.session_id, path };
  }

  async resolve(handle) {
    const url = handle.path.startsWith('http') ? handle.path : `${this.base}${handle.path}`;
    return { url, headers: this.#headers, fileName: handle.id };
  }
}
