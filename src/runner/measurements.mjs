// Every application is exercised through this module and nothing else, so differences
// in the numbers come from the applications rather than from how they were driven.

import { createHash } from 'node:crypto';
import { rangeRead, probeResource, median, percentile } from '../metrics/http.mjs';

const MB = 1e6;

/** Read a stream from `start`, reporting cumulative bytes over time. */
async function timedStream(url, { start = 0, headers = {}, maxBytes = Infinity, maxMs = Infinity, hash = false }) {
  const ac = new AbortController();
  const t0 = performance.now();
  const res = await fetch(url, { headers: { ...headers, Range: `bytes=${start}-` }, signal: ac.signal });
  if (res.status >= 400) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const headerMs = performance.now() - t0;

  const samples = [];
  const hasher = hash ? createHash('sha256') : null;
  let bytes = 0;
  let ttfbMs = null;
  let lastSample = t0;
  const deadline = t0 + maxMs;

  try {
    for await (const chunk of res.body) {
      const now = performance.now();
      if (ttfbMs === null) ttfbMs = now - t0;
      bytes += chunk.length;
      hasher?.update(chunk);
      if (now - lastSample >= 250) {
        samples.push({ ms: now - t0, bytes });
        lastSample = now;
      }
      if (bytes >= maxBytes || now >= deadline) {
        ac.abort();
        break;
      }
    }
  } catch (e) {
    const done = bytes >= maxBytes || performance.now() >= deadline;
    if (!done) throw e;
  }

  const totalMs = performance.now() - t0;
  samples.push({ ms: totalMs, bytes });
  return {
    status: res.status,
    headerMs: +headerMs.toFixed(2),
    ttfbMs: ttfbMs === null ? null : +ttfbMs.toFixed(2),
    totalMs: +totalMs.toFixed(2),
    bytes,
    samples,
    sha256: hasher?.digest('hex'),
    // Transfer window only, so a slow open does not masquerade as slow transfer.
    throughputMBps: ttfbMs !== null && totalMs > ttfbMs ? +(bytes / MB / ((totalMs - ttfbMs) / 1000)).toFixed(3) : null,
  };
}

/** Windowed throughput series (MB/s) derived from cumulative samples. */
function windowedRates(samples, windowMs = 1000) {
  const out = [];
  for (let i = 0; i < samples.length; i++) {
    const end = samples[i];
    let j = i;
    while (j > 0 && end.ms - samples[j].ms < windowMs) j--;
    const startS = samples[j];
    const dt = end.ms - startS.ms;
    if (dt >= windowMs * 0.5) out.push((end.bytes - startS.bytes) / MB / (dt / 1000));
  }
  return out;
}

export async function measureProbe(target) {
  return probeResource(target.url, { headers: target.headers });
}

/** Cold or warm open: how long until the first byte of the file arrives. */
export async function measureOpen(target, { bytes = 1 * MB } = {}) {
  const r = await rangeRead(target.url, {
    start: 0,
    limitBytes: bytes,
    headers: target.headers,
    timeoutMs: 180000,
  });
  return { headerMs: r.headerMs, ttfbMs: r.ttfbMs, bytes: r.bytes, status: r.status };
}

/** Sustained sequential throughput from the start of the file. */
export async function measureSequential(target, { maxBytes = 256 * MB, maxMs = 30000 } = {}) {
  const r = await timedStream(target.url, { start: 0, headers: target.headers, maxBytes, maxMs });
  const rates = windowedRates(r.samples);
  // Too short a transfer says nothing about sustained rate.
  const transferMs = r.ttfbMs === null ? 0 : r.totalMs - r.ttfbMs;
  const reliable = transferMs >= 2000 && r.bytes >= 32 * MB;
  return {
    ttfbMs: r.ttfbMs,
    bytes: r.bytes,
    durationMs: r.totalMs,
    meanMBps: r.throughputMBps,
    p50MBps: rates.length ? +median(rates).toFixed(3) : null,
    p05MBps: rates.length ? +percentile(rates, 5).toFixed(3) : null,
    maxMBps: rates.length ? +Math.max(...rates).toFixed(3) : null,
    reliable,
    ...(reliable ? {} : { unreliableReason: `only ${(r.bytes / MB).toFixed(0)} MB in ${(transferMs / 1000).toFixed(1)}s` }),
  };
}

/** Seek behaviour, where a stored segment map and an interpolated one diverge most. */
export async function measureSeeks(target, size, { fractions = [0.01, 0.25, 0.5, 0.75, 0.95], readBytes = 8 * MB } = {}) {
  const results = [];
  for (const f of fractions) {
    const start = Math.max(0, Math.floor(size * f));
    try {
      const r = await rangeRead(target.url, {
        start,
        limitBytes: readBytes,
        headers: target.headers,
        timeoutMs: 180000,
      });
      results.push({
        fraction: f,
        offset: start,
        ttfbMs: r.ttfbMs,
        headerMs: r.headerMs,
        bytes: r.bytes,
        throughputMBps: r.throughputMBps,
        status: r.status,
      });
    } catch (e) {
      results.push({ fraction: f, offset: start, error: String(e.message ?? e) });
    }
  }

  // Backward after forward: catches engines that rebuild state to go back.
  let backward = null;
  try {
    const start = Math.floor(size * 0.1);
    const r = await rangeRead(target.url, { start, limitBytes: readBytes, headers: target.headers, timeoutMs: 180000 });
    backward = { offset: start, ttfbMs: r.ttfbMs, throughputMBps: r.throughputMBps };
  } catch (e) {
    backward = { error: String(e.message ?? e) };
  }

  const ttfbs = results.map((r) => r.ttfbMs).filter((n) => Number.isFinite(n));
  return {
    points: results,
    backward,
    medianTtfbMs: ttfbs.length ? +median(ttfbs).toFixed(2) : null,
    worstTtfbMs: ttfbs.length ? +Math.max(...ttfbs).toFixed(2) : null,
    failures: results.filter((r) => r.error).length,
  };
}

/** Whether the delivered rate would have kept a player fed at `bitrateMbps`. */
export async function measurePlayback(target, size, { seconds = 30, bitrateMbps = 25, startFraction = 0.3, bufferSeconds = 10 } = {}) {
  const start = Math.floor(size * startFraction);
  const requiredMBps = bitrateMbps / 8;
  const r = await timedStream(target.url, {
    start,
    headers: target.headers,
    maxMs: seconds * 1000,
    maxBytes: Infinity,
  });

  const rates = windowedRates(r.samples);
  const bufferBytes = requiredMBps * bufferSeconds * MB;
  const bufferSample = r.samples.find((s) => s.bytes >= bufferBytes);

  // Time spent below the rate the player needs.
  let underMs = 0;
  for (let i = 1; i < r.samples.length; i++) {
    const dt = r.samples[i].ms - r.samples[i - 1].ms;
    const rate = (r.samples[i].bytes - r.samples[i - 1].bytes) / MB / (dt / 1000);
    if (rate < requiredMBps) underMs += dt;
  }

  return {
    bitrateMbps,
    requiredMBps: +requiredMBps.toFixed(3),
    startOffset: start,
    ttfbMs: r.ttfbMs,
    bytes: r.bytes,
    durationMs: r.totalMs,
    meanMBps: r.throughputMBps,
    p05MBps: rates.length ? +percentile(rates, 5).toFixed(3) : null,
    timeToBufferMs: bufferSample ? +bufferSample.ms.toFixed(0) : null,
    secondsBelowBitrate: +(underMs / 1000).toFixed(2),
    sustainable: r.throughputMBps !== null ? r.throughputMBps >= requiredMBps : null,
  };
}

/** Hashes of identical ranges, compared across applications by the report. */
export async function measureIntegrity(target, size, { samples = 3, chunkBytes = 2 * MB } = {}) {
  const out = [];
  for (let i = 0; i < samples; i++) {
    const frac = samples === 1 ? 0.5 : i / (samples - 1);
    const start = Math.min(Math.max(0, Math.floor((size - chunkBytes) * frac)), Math.max(0, size - chunkBytes));
    try {
      const r = await rangeRead(target.url, {
        start,
        end: start + chunkBytes - 1,
        headers: target.headers,
        hash: true,
        timeoutMs: 180000,
      });
      out.push({ start, bytes: r.bytes, sha256: r.sha256 });
    } catch (e) {
      out.push({ start, error: String(e.message ?? e) });
    }
  }
  return out;
}

/** Provider bytes over delivered bytes, when the adapter can report provider traffic. */
export function computeAmplification(providerBytes, deliveredBytes) {
  if (!providerBytes || !deliveredBytes) return null;
  return +(providerBytes / deliveredBytes).toFixed(3);
}

/**
 * Stream one byte range and report forensics on it. The identical-byte run is tracked
 * across chunk boundaries so its absolute offset locates a fill, not just detects one.
 */
async function scanRange(url, { start, length, headers = {}, label, timeoutMs = 180000 }) {
  const out = { window: label, start, requestedBytes: length };
  const t0 = performance.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`no data for ${timeoutMs}ms`)), timeoutMs);
  let received = 0;

  try {
    const res = await fetch(url, {
      headers: { ...headers, Range: `bytes=${start}-${start + length - 1}` },
      signal: ac.signal,
    });
    out.status = res.status;
    if (res.status >= 400) {
      const body = await res.text().catch(() => '');
      out.error = `HTTP ${res.status}: ${body.slice(0, 160).replace(/\s+/g, ' ').trim()}`;
      return out;
    }

    const hasher = createHash('sha256');
    // Verbatim head of the range, to identify what an engine substituted for a gap.
    const head = Buffer.alloc(48);
    let headLen = 0;
    let zeros = 0;
    let prevByte = -1;
    let runLen = 0;
    let runStart = 0;
    let bestLen = 0;
    let bestByte = null;
    let bestOffset = null;

    for await (const chunk of res.body) {
      if (out.ttfbMs === undefined) out.ttfbMs = +(performance.now() - t0).toFixed(1);
      hasher.update(chunk);
      if (headLen < head.length) {
        // res.body yields Uint8Array, which has no .copy().
        const n = Math.min(chunk.length, head.length - headLen);
        head.set(chunk.subarray(0, n), headLen);
        headLen += n;
      }
      for (let i = 0; i < chunk.length; i++) {
        const b = chunk[i];
        if (b === 0) zeros++;
        if (b === prevByte) {
          runLen++;
        } else {
          prevByte = b;
          runLen = 1;
          runStart = start + received + i;
        }
        if (runLen > bestLen) {
          bestLen = runLen;
          bestByte = b;
          bestOffset = runStart;
        }
      }
      received += chunk.length;
    }

    out.bytes = received;
    out.sha256 = hasher.digest('hex');
    out.head = headLen ? head.subarray(0, headLen).toString('hex') : undefined;
    out.zeroFraction = received ? +(zeros / received).toFixed(5) : 0;
    out.longestRun = bestLen;
    out.longestRunByte = bestByte;
    out.longestRunOffset = bestOffset;
    if (received < length) {
      out.truncated = true;
      out.truncatedAtOffset = start + received;
    }
  } catch (e) {
    out.bytes = received;
    out.error = `stream aborted after ${received} bytes: ${String(e?.message ?? e)}`;
    out.errorAtOffset = start + received;
  } finally {
    clearTimeout(timer);
    out.ms = +(performance.now() - t0).toFixed(1);
  }
  return out;
}

/**
 * Read across a known missing article and classify what the engine does about it. An
 * engine that emits zeros and one that repairs the container both answer 206 with the
 * right byte count, so the verdict comes from the bytes and a matched control window
 * rather than from the status code.
 */
export async function measureHole(target, hole, { marginBytes = 1 * MB } = {}) {
  const at = hole.offsetBytes;
  const span = hole.missingBytes ?? 1 * MB;
  const slack = hole.uncertaintyBytes ?? hole.windowBytes ?? 0;

  // One continuous read spanning the hole plus any slack in the recorded offset.
  const bandStart = Math.max(0, at - slack - marginBytes);
  const bandEnd = at + span + slack + marginBytes;
  const bandLen = bandEnd - bandStart;

  // Same length, far enough back to be intact: zero counts mean nothing without it.
  const controlStart = Math.max(0, bandStart - 4 * bandLen);
  const control = await scanRange(target.url, {
    start: controlStart,
    length: bandLen,
    headers: target.headers,
    label: 'control',
  });
  const band = await scanRange(target.url, {
    start: bandStart,
    length: bandLen,
    headers: target.headers,
    label: 'hole',
  });

  // Without this, an engine that repaired the gap and an offset pointing at the wrong
  // bytes are indistinguishable.
  let alignment = null;
  if (hole.preHoleSha256 && hole.anchorBytes) {
    const pre = await scanRange(target.url, {
      start: at - hole.anchorBytes,
      length: hole.anchorBytes,
      headers: target.headers,
      label: 'anchor-pre',
    });
    const post = hole.postHoleSha256
      ? await scanRange(target.url, {
          start: at + span,
          length: hole.anchorBytes,
          headers: target.headers,
          label: 'anchor-post',
        })
      : null;
    alignment = {
      preMatches: pre.sha256 === hole.preHoleSha256,
      postMatches: post ? post.sha256 === hole.postHoleSha256 : null,
      preSha256: pre.sha256,
      postSha256: post?.sha256,
      error: pre.error ?? post?.error,
    };
    alignment.verified = alignment.preMatches === true && alignment.postMatches !== false;
  }

  // Only meaningful once the offset is pinned, hence the slack guard.
  let pinpoint = null;
  if (slack <= 64 * 1024 && span > 128 * 1024) {
    pinpoint = await scanRange(target.url, {
      start: at + Math.floor(span / 2) - 32 * 1024,
      length: 64 * 1024,
      headers: target.headers,
      label: 'pinpoint',
    });
  }

  // Runs this long do not occur in video; the control sets the real ceiling.
  const FILL_RUN = 64 * 1024;
  const runCeiling = Math.max(control.longestRun ?? 0, 4096);

  /** Did the transfer stop inside the missing article, rather than anywhere else? */
  const stoppedInHole = (off) => off !== undefined && off >= at && off <= at + span;

  let verdict;
  let detail;
  if (band.error) {
    // A 4xx/5xx is an outright refusal; a stream that dies partway delivered bytes up
    // to the hole and then gave up, which a player sees as a stall rather than an error.
    if (band.status >= 400) {
      verdict = 'error-at-hole';
      detail = band.error;
    } else if (stoppedInHole(band.errorAtOffset)) {
      verdict = 'truncated-at-hole';
      detail = `stream died ${band.errorAtOffset - at} bytes into the hole after a 2xx: ${band.error}`;
    } else {
      verdict = 'error-at-hole';
      detail = band.error;
    }
  } else if (band.truncated) {
    verdict = stoppedInHole(band.truncatedAtOffset) ? 'truncated-at-hole' : 'short-read';
    detail = `stream ended at offset ${band.truncatedAtOffset}, ${band.truncatedAtOffset - at} bytes from the hole start`;
  } else if (band.longestRun >= FILL_RUN && band.longestRun > runCeiling * 8) {
    verdict = band.longestRunByte === 0 ? 'zero-filled' : `byte-filled (0x${band.longestRunByte.toString(16)})`;
    detail = `${band.longestRun} identical bytes at offset ${band.longestRunOffset} (control ceiling ${control.longestRun})`;
  } else if (pinpoint?.error) {
    verdict = 'error-at-hole';
    detail = `only the pinpoint read failed: ${pinpoint.error}`;
  } else if (control.error) {
    verdict = 'inconclusive (control read failed)';
    detail = control.error;
  } else if (alignment && !alignment.verified) {
    if (alignment.preMatches === true && alignment.postMatches === false) {
      // The gap was dropped and the remainder pulled forward, so the length still looks
      // right while every later offset addresses the wrong data.
      verdict = 'elided (remainder shifted)';
      detail =
        `bytes before the hole match, bytes after it do not: served ${String(alignment.postSha256).slice(0, 16)}…, ` +
        `expected ${String(hole.postHoleSha256).slice(0, 16)}… the missing ${span} bytes were dropped rather than ` +
        `represented, shifting the remainder of the file forward`;
    } else {
      // Not the bytes this offset should address, so nothing can be concluded.
      verdict = 'misaligned (offset not addressing the same data)';
      detail = alignment.error
        ? `anchor read failed: ${alignment.error}`
        : `the ${hole.anchorBytes} bytes before the hole hashed to ${String(alignment.preSha256).slice(0, 16)}…, ` +
          `expected ${String(hole.preHoleSha256).slice(0, 16)}… this engine lays the file out differently`;
    }
  } else {
    verdict = 'served-clean';
    detail = alignment?.verified
      ? 'alignment confirmed against the true bytes either side, so these are invented bytes for a range that is ' +
        'unavailable upstream so either reconstructed or substituted'
      : 'no error, no fill pattern but alignment was not verified, so this may mean the offset does not ' +
        'correspond to the hole';
  }

  // A hole crossing costs time even when served.
  const slowdown =
    control.ms > 0 && band.ms > 0 && !control.error && !band.error ? +(band.ms / control.ms).toFixed(2) : null;

  return {
    holeOffset: at,
    holeBytes: span,
    bandStart,
    bandBytes: bandLen,
    verdict,
    detail,
    slowdownVsControl: slowdown,
    alignment,
    windows: [control, band, ...(pinpoint ? [pinpoint] : [])],
  };
}
