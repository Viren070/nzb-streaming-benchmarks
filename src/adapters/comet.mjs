// Comet (feat/usenet): Python supervisor plus an out-of-process Rust usenet engine.
//
// The engine uses UnixStream, Landlock, seccomp-BPF and prctl with no cfg(windows)
// gating, so there is no Windows build. This harness has no source path for it on Linux
// either, so `--docker=comet` is the only way to run it.
//
// Comet is a Stremio addon and has no import API: it discovers releases and mints a
// signed playback capability for one. The adapter serves a one-stream Stremio addon and
// configures comet's `stremio_addon` discovery source against it, which is comet's real
// ingest path driven with a chosen NZB. Each entry gets its own addon URL and
// discovery-source id, so no entry can be answered from another's cached release.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Adapter, allocPort, gitCommit, gitDescribe } from './base.mjs';
import { HOST_FROM_CONTAINER } from './docker.mjs';
import { waitForHttp, Fatal } from '../metrics/http.mjs';

/** A real IMDb id, so comet's metadata lookup resolves. */
const MEDIA_ID = 'tt1254207';
/** A label for ranking only: comet picks the file it serves from the NZB's manifest. */
const RELEASE_TITLE = 'Big.Buck.Bunny.2008.1080p.BluRay.x264-BENCH';
const CAPABILITY_SECRET = 'usenet-bench-capability-secret-0123456789abcdef';
const ADMIN_PASSWORD = 'usenet-bench-admin-password';
const NATIVE_ACCESS_TOKEN = 'usenet-bench-native-access';
const PLAYBACK_PROVIDER_ID = '11111111-1111-4111-8111-111111111111';

/** Filename from a Content-Disposition header, preferring RFC 5987 form. */
function dispositionFilename(header) {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i);
  // Quotes stripped on the unquoted branch too, so `filename=""` reads as absent.
  const value = (plain?.[1] ?? plain?.[2] ?? '').trim().replace(/^"|"$/g, '').trim();
  return value || null;
}

export default class CometAdapter extends Adapter {
  static id = 'comet';
  static displayName = 'Comet (feat/usenet)';
  static language = 'Python + Rust';
  static repo = 'https://github.com/g0ldyy/comet (branch feat/usenet)';
  static platforms = ['linux'];
  static serving = 'http-range';

  static docker = { containerPort: 8000, dataDir: '/app/data' };

  /**
   * Rendered beside comet's row. Its engine materialises past the item boundary and it
   * deadlocks its own SQLite under a full corpus, so entries after the first large
   * materialisation are not capability verdicts. See docs/APPS.md.
   */
  static caveat =
    'Comet does not complete a full-corpus pass: its engine keeps materialising after the ' +
    'harness has measured an entry, and under sustained load it deadlocks its own SQLite ' +
    '(shipped default) and does not recover. Entries after the first large materialisation ' +
    'failed for reasons belonging to earlier ones. Only the six status-clip failures that ' +
    'reproduced across independent runs are capability results.';

  #addon = null;
  #addonPort = null;
  #cookie = null;
  #csrf = null;
  /** itemId -> absolute path of the NZB that addon path should serve. */
  #fixtures = new Map();

  async build() {
    if (process.platform === 'linux') {
      throw new Error(
        'comet builds natively on Linux, but this harness has no source path for it yet: ' +
          'it needs uv, a Rust toolchain for native/usenet-engine, an npm frontend build, and ' +
          'par2/libarchive from deployment/. Pass --docker=comet to run it in a container ' +
          'meanwhile. A native Linux adapter is the correct fix and is still to be written.',
      );
    }
    throw new Error(
      `comet cannot be built from source on ${process.platform}: the usenet engine uses ` +
        'UnixStream, Landlock and seccomp-BPF throughout with no cfg(windows) gating. ' +
        'Pass --docker=comet to run it in a container, or build on Linux.',
    );
  }

  /** One path per corpus entry, bound on all interfaces so the container can reach it. */
  async #startAddon() {
    this.#addonPort = await allocPort();
    const port = this.#addonPort;
    this.#addon = createServer(async (req, res) => {
      try {
        const m = new URL(req.url, 'http://addon').pathname.match(/^\/i\/([^/]+)(\/.*)$/);
        const fixture = m && this.#fixtures.get(m[1]);
        if (!fixture) return void res.writeHead(404).end('unknown fixture');
        const [, id, rest] = m;
        if (rest === '/manifest.json') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return void res.end(
            JSON.stringify({
              id: `usenet-bench.${id}`,
              version: '1.0.0',
              name: `usenet-bench ${id}`,
              description: 'One corpus entry, offered as a usenet stream.',
              resources: ['stream'],
              types: ['movie', 'series'],
              catalogs: [],
            }),
          );
        }
        if (rest.startsWith('/stream/')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          return void res.end(
            JSON.stringify({
              streams: [
                {
                  name: 'usenet-bench',
                  title: RELEASE_TITLE,
                  nzbUrl: `http://${HOST_FROM_CONTAINER}:${port}/i/${id}/entry.nzb`,
                },
              ],
            }),
          );
        }
        if (rest === '/entry.nzb') {
          const buf = await readFile(fixture);
          res.writeHead(200, { 'content-type': 'application/x-nzb', 'content-length': buf.length });
          return void res.end(buf);
        }
        res.writeHead(404).end('no');
      } catch (e) {
        res.writeHead(500).end(String(e?.message ?? e));
      }
    });
    await new Promise((ok, bad) => {
      this.#addon.on('error', bad);
      this.#addon.listen(port, '0.0.0.0', ok);
    });
  }

  async start() {
    // Above 100 the whole configuration is refused, surfacing only as "no candidates".
    const over = this.providers.find((p) => p.maxConnections > 100);
    if (over) {
      throw new Error(
        `comet accepts at most 100 connections per NNTP server; ${over.host} is configured with ` +
          `${over.maxConnections}. Lower it, or pass --conns=<n> to normalise every app to the same budget.`,
      );
    }
    // A discovery source that fails once is skipped for a cooldown, losing the first entry.
    await this.#startAddon();
    await super.start();
  }

  async env() {
    return {
      LOG_PROFILE: 'normal',
      // One process, so the engine's cost is not spread over gunicorn workers.
      USE_GUNICORN: 'False',
      FASTAPI_WORKERS: '1',
      USENET_ENABLED: 'True',
      USENET_ENGINE_ENABLED: 'True',
      USENET_ENGINE_REQUIRED: 'True',
      USENET_NATIVE_ALLOW_USER_SERVERS: 'True',
      USENET_NATIVE_ACCESS_TOKEN: NATIVE_ACCESS_TOKEN,
      COMET_CAPABILITY_SECRET: CAPABILITY_SECRET,
      ADMIN_DASHBOARD_PASSWORD: ADMIN_PASSWORD,
      // Plain-HTTP private origins are refused unless listed here.
      USENET_PRIVATE_UPSTREAM_ORIGINS: JSON.stringify([`http://${HOST_FROM_CONTAINER}:${this.#addonPort}`]),
    };
  }

  async ready() {
    // A fresh volume re-ingests a ~70 MB anime-mapping dataset before serving, which is
    // the price of not letting a retained NZB artifact speed up a repeat run's import.
    await waitForHttp(`${this.base}/manifest.json`, { timeoutMs: 600000 });
  }

  async configure() {
    const res = await fetch(`${this.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: this.base },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });
    if (!res.ok) throw new Error(`comet admin login -> ${res.status}`);
    this.#csrf = (await res.json())?.data?.csrf_token ?? null;
    this.#cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    if (!this.#cookie) throw new Error('comet admin login returned no session cookie');
  }

  #admin(path) {
    return fetch(`${this.base}/api/v1/admin/usenet${path}`, {
      headers: { cookie: this.#cookie, origin: this.base },
    });
  }

  /** Operations comet's engine still has in flight. */
  async #active() {
    const res = await this.#admin('/snapshot');
    if (!res.ok) return [];
    return (await res.json())?.data?.active ?? [];
  }

  /**
   * Wait for the engine to go idle before the next entry is measured.
   *
   * Comet materialises in the background and keeps working after the harness has taken
   * its numbers. Left alone, the next entry starts against a pool already spent on the
   * previous one and fails with `nntp_singleflight_capacity`, which would be recorded as
   * a capability gap belonging to the wrong entry.
   */
  async remove() {
    if (!this.#cookie) return;
    const cancelled = new Set();
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const active = await this.#active().catch(() => []);
      if (!active.length) return;
      // Each operation is cancelled once. Comet's admin API and its engine share one
      // SQLite database, and re-issuing a cancel every pass adds writes to the file the
      // materialisation is already contending for.
      for (const op of active.filter((o) => !cancelled.has(o.id))) {
        cancelled.add(op.id);
        await fetch(`${this.base}/api/v1/admin/usenet/operations/${op.id}/cancel`, {
          method: 'POST',
          headers: { cookie: this.#cookie, origin: this.base, 'x-csrf-token': this.#csrf ?? '' },
        }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    this.log?.('      comet engine still busy after 120s; next entry starts against a warm pool');
  }

  async stop() {
    if (this.#addon) {
      await new Promise((r) => this.#addon.close(r));
      this.#addon = null;
    }
    await super.stop();
  }

  async version() {
    return { version: await gitDescribe(this.appDir), commit: await gitCommit(this.appDir).catch(() => undefined) };
  }

  /** Comet's user configuration, carried base64 in the URL. */
  #b64config(itemId) {
    const config = {
      schemaVersion: 2,
      enabledTransports: ['usenet'],
      nativeAccessToken: NATIVE_ACCESS_TOKEN,
      playbackProviders: [
        {
          configurationId: PLAYBACK_PROVIDER_ID,
          displayName: 'Comet native',
          kind: 'comet_native_usenet',
          enabled: true,
          options: {
            source: 'personal_servers',
            servers: this.providers.map((p, i) => ({
              name: `p${i}`,
              host: p.host,
              port: p.port,
              tls_mode: p.tls ? 'implicit' : 'disabled',
              username: p.user,
              password: p.pass,
              connections: p.maxConnections,
              priority: i,
              backup: p.backup,
              // `pipeline` omitted: comet's default is 16, and setting it would be tuning.
            })),
          },
        },
      ],
      discoverySources: [
        {
          configurationId: randomUUID(),
          kind: 'stremio_addon',
          enabled: true,
          options: {
            manifestUrl: `http://${HOST_FROM_CONTAINER}:${this.#addonPort}/i/${itemId}/manifest.json`,
          },
        },
      ],
    };
    return Buffer.from(JSON.stringify(config)).toString('base64url').replace(/=+$/, '');
  }

  /** Import is a stream request: it fetches, brokers and parses the NZB, then signs a URL. */
  async addNzb(item) {
    this.#fixtures.set(item.id, item.path);
    const url = `${this.base}/${this.#b64config(item.id)}/stream/movie/${MEDIA_ID}.json`;
    const res = await fetch(url);
    // Never the URL: the configuration it carries base64-encodes the provider password.
    if (!res.ok) throw new Error(`stream request for ${item.id} -> ${res.status}`);
    const body = await res.json();
    const streams = body?.streams ?? [];
    const playable = streams.find((s) => typeof s.url === 'string' && s.url.includes('/playback/v2/'));
    if (!playable) {
      // A failed discovery comes back as a "setup" stream carrying the reason.
      const why = streams.map((s) => s.description ?? s.name).filter(Boolean).join('; ');
      throw new Error(`comet offered no playable stream: ${why || 'no candidates'}`);
    }
    return { id: item.id, url: playable.url, name: playable.behaviorHints?.filename ?? item.id };
  }

  /**
   * Wait for the byte route to become servable, and report what it will serve.
   *
   * This is comet's import poll. Every other application here is polled to readiness
   * through a status API - AltMount and the nzbdav family through SABnzbd `mode=history`,
   * AIOStreams through its library entry - and comet has none: the playback route's own
   * response is the only readiness signal it exposes. `Retry-After` is not being honoured
   * because a player would honour it (a player would just play the status clip and stop);
   * it is comet stating its own poll interval, and it is present exactly when comet
   * considers the state retryable. Anything else is treated as final.
   *
   * The waiting is charged to `importMs`, which spans addNzb() and this call, so it lands
   * in click&rarr;byte rather than disappearing. An entry that never becomes servable
   * spends the import budget and fails on it, like any other application's stuck import.
   *
   * HEAD, not GET: the handler short-circuits a HEAD before it opens any reader, so this
   * settles readiness and file size without pulling a single article. A GET here would
   * fetch and prefetch around byte 0, and the harness's cold open - which must be the
   * first byte request against this file - would then be measuring a warm buffer.
   */
  async resolve(handle) {
    const deadline = Date.now() + (this.options?.importTimeoutMs ?? 300000);
    let last = 'no response';
    while (Date.now() < deadline) {
      const res = await fetch(handle.url, { method: 'HEAD', headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
      const range = res.headers.get('content-range');
      await res.arrayBuffer();
      if (res.status === 206 && range) {
        const total = Number(range.split('/')[1]);
        return {
          url: res.url,
          // The member comet chose; the handle carries only the fixture's release label.
          fileName: dispositionFilename(res.headers.get('content-disposition')) ?? handle.name,
          sizeBytes: Number.isFinite(total) && total > 0 ? total : undefined,
        };
      }
      // `accept-ranges: none` on a fixed-size video/mp4 is comet's status clip.
      const clip = res.headers.get('accept-ranges') === 'none';
      // `Number(null)` is 0, so a missing header must be caught before converting.
      const raw = res.headers.get('retry-after');
      const retryAfter = raw === null ? null : Number(raw);
      const willRetry = retryAfter !== null && Number.isFinite(retryAfter);
      last = `${res.status}${clip ? ' status-clip' : ''} ct=${res.headers.get('content-type')}`;
      if (clip && !willRetry) {
        throw new Fatal(
          `comet answered with a status clip (${res.headers.get('content-length')} bytes of ` +
            `${res.headers.get('content-type')}), meaning it could not serve this entry`,
        );
      }
      // Floored, so a zero or malformed Retry-After cannot busy-loop.
      const waitMs = willRetry ? Math.min(Math.max(retryAfter, 1), 30) * 1000 : 5000;
      await new Promise((r) => setTimeout(r, waitMs));
    }
    throw new Error(`comet never produced a byte range for ${handle.id}: last response ${last}`);
  }
}
