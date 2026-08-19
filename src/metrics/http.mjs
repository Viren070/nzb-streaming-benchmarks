// HTTP measurement primitives. Every application under test is exercised through
// these, so all of them are measured by identical code.

import { createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 200)}` : ''}`);
    this.status = status;
  }
}

const now = () => performance.now();

/**
 * Issue a ranged GET and consume the body, timing the interesting moments.
 *
 * Returns:
 *   headerMs   request sent -> response headers available
 *   ttfbMs     request sent -> first body byte in hand
 *   totalMs    request sent -> body fully consumed
 *   bytes, throughputMBps (over the body-transfer window, excluding TTFB)
 *   sha256     of the received bytes, when `hash` is set
 */
export async function rangeRead(
  url,
  { start = 0, end = null, limitBytes = Infinity, headers = {}, hash = false, signal, timeoutMs = 120000 } = {},
) {
  const h = { ...headers };
  if (start !== null) h.Range = end === null ? `bytes=${start}-` : `bytes=${start}-${end}`;

  const ac = new AbortController();
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);

  const t0 = now();
  let res;
  try {
    res = await fetch(url, { headers: h, signal: ac.signal, redirect: 'follow' });
  } catch (e) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    throw e;
  }
  const headerMs = now() - t0;

  if (res.status >= 400) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status, url, body);
  }

  const hasher = hash ? createHash('sha256') : null;
  let bytes = 0;
  let ttfbMs = null;
  let firstByteAt = null;

  try {
    for await (const chunk of res.body) {
      if (ttfbMs === null) {
        ttfbMs = now() - t0;
        firstByteAt = now();
      }
      bytes += chunk.length;
      hasher?.update(chunk);
      if (bytes >= limitBytes) {
        ac.abort();
        break;
      }
    }
  } catch (e) {
    // An abort we issued ourselves after hitting limitBytes is expected.
    if (!(bytes >= limitBytes && ac.signal.aborted)) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      throw e;
    }
  }
  clearTimeout(timer);
  signal?.removeEventListener('abort', onAbort);

  const totalMs = now() - t0;
  const transferMs = firstByteAt ? now() - firstByteAt : 0;
  return {
    status: res.status,
    acceptsRanges: res.headers.get('accept-ranges'),
    contentRange: res.headers.get('content-range'),
    contentLength: Number(res.headers.get('content-length')) || undefined,
    contentType: res.headers.get('content-type') ?? undefined,
    headerMs: +headerMs.toFixed(2),
    ttfbMs: ttfbMs === null ? null : +ttfbMs.toFixed(2),
    totalMs: +totalMs.toFixed(2),
    bytes,
    throughputMBps: transferMs > 0 ? +(bytes / 1e6 / (transferMs / 1000)).toFixed(3) : null,
    sha256: hasher ? hasher.digest('hex') : undefined,
  };
}

/** HEAD-equivalent: learn the size and whether ranges are honoured, cheaply. */
export async function probeResource(url, { headers = {}, timeoutMs = 60000 } = {}) {
  // Some of these servers do not implement HEAD; a 1-byte range works everywhere.
  const r = await rangeRead(url, { start: 0, end: 0, headers, timeoutMs });
  let totalBytes;
  if (r.contentRange) {
    const m = r.contentRange.match(/\/(\d+)\s*$/);
    if (m) totalBytes = Number(m[1]);
  }
  if (totalBytes === undefined && r.status === 200) totalBytes = r.contentLength;
  return {
    totalBytes,
    rangeSupported: r.status === 206,
    contentType: r.contentType,
    firstByteMs: r.ttfbMs,
  };
}

/**
 * A definitive negative answer. `waitFor` rethrows this immediately instead of
 * treating it as a transient poll error.
 *
 * This distinction matters a lot: applications report a failed import quickly and
 * with a real reason ("rardecode: bad volume number"), and swallowing that turns a
 * 9-second explicit failure into a 5-minute timeout with no explanation, which is
 * both slower and a lie about what happened.
 */
export class Fatal extends Error {
  constructor(message) {
    super(message);
    this.fatal = true;
  }
}

/** Poll until `check` resolves truthy, throws `Fatal`, or the deadline passes. */
export async function waitFor(check, { timeoutMs = 60000, intervalMs = 250, what = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const v = await check();
      if (v) return v;
    } catch (e) {
      if (e?.fatal) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}${lastErr ? `: ${lastErr.message}` : ''}`);
}

/** Wait for an HTTP endpoint to answer at all (any status below 500). */
export function waitForHttp(url, opts = {}) {
  return waitFor(
    async () => {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
      return res.status < 500;
    },
    { what: `${url} to respond`, ...opts },
  );
}

export const median = (xs) => {
  const s = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const percentile = (xs, p) => {
  const s = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
