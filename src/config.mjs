// Configuration: NNTP providers and harness settings, from .env / environment.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function loadEnv(path = '.env') {
  const env = { ...process.env };
  try {
    const text = await readFile(resolve(path), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim().replace(/\s+#.*$/, '');
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      // Real environment wins, so CI can override the file.
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return env;
}

/**
 * Providers are declared as numbered env blocks:
 *   NNTP_HOST/PORT/TLS/USER/PASS/CONNS[/BACKUP]   (primary)
 *   NNTP2_*, NNTP3_* ...                          (additional)
 *   TORBOX_*                                       (named block)
 */
export function providersFrom(env) {
  const prefixes = new Set();
  for (const k of Object.keys(env)) {
    const m = k.match(/^([A-Z0-9]+?)_HOST$/);
    if (m) prefixes.add(m[1]);
  }
  const out = [];
  for (const p of prefixes) {
    const host = env[`${p}_HOST`];
    if (!host) continue;
    out.push({
      id: p.toLowerCase(),
      name: p === 'NNTP' ? host : `${host} (${p})`,
      host,
      port: Number(env[`${p}_PORT`] ?? 563),
      tls: env[`${p}_TLS`] === undefined ? true : Boolean(Number(env[`${p}_TLS`])),
      user: env[`${p}_USER`],
      pass: env[`${p}_PASS`],
      maxConnections: Number(env[`${p}_CONNS`] ?? 10),
      backup: Boolean(Number(env[`${p}_BACKUP`] ?? 0)),
    });
  }
  // Deterministic order: NNTP first, then the rest alphabetically.
  out.sort((a, b) => (a.id === 'nntp' ? -1 : b.id === 'nntp' ? 1 : a.id.localeCompare(b.id)));
  return out;
}

/** Strip credentials before anything reaches a report. */
export function redactProvider(p) {
  return {
    id: p.id,
    host: p.host,
    port: p.port,
    tls: p.tls,
    maxConnections: p.maxConnections,
    backup: p.backup,
    user: p.user ? `${p.user.slice(0, 2)}***` : undefined,
  };
}

/**
 * Strip provider secrets out of a string bound for a result file or a report.
 *
 * An adapter that echoes its own configuration back in an error message carries the
 * password with it. Base64 and percent-encoded forms are covered because several
 * applications take their configuration that way.
 */
export function redactSecrets(text, providers) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const p of providers) {
    for (const secret of [p.pass, p.user]) {
      if (!secret) continue;
      for (const form of [secret, Buffer.from(secret).toString('base64'), encodeURIComponent(secret)]) {
        if (form) out = out.split(form).join('***');
      }
    }
  }
  // A whole configuration blob is unsafe even when no secret survives the forms above,
  // since it is base64 of JSON that contains one.
  return out.replace(/eyJ[A-Za-z0-9_-]{40,}={0,2}/g, '<config>');
}

export async function loadConfig({ envPath = '.env', only } = {}) {
  const env = await loadEnv(envPath);
  let providers = providersFrom(env);
  if (only) {
    const want = new Set(only.split(',').map((s) => s.trim().toLowerCase()));
    providers = providers.filter((p) => want.has(p.id));
  }
  if (!providers.length) throw new Error(`no NNTP providers configured (looked in ${envPath})`);
  return { env, providers };
}
