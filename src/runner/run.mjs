// Orchestration: for each application, for each corpus entry, run the same
// measurements and record everything, including why something was skipped.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProcessSampler, measureIdle, cpuShape } from '../metrics/procmon.mjs';
import { collectSystemInfo } from '../metrics/sysinfo.mjs';
import { redactProvider, redactSecrets } from '../config.mjs';
import { prepareCached } from '../adapters/base.mjs';
import {
  measureProbe,
  measureOpen,
  measureSequential,
  measureSeeks,
  measurePlayback,
  measureIntegrity,
  measureHole,
} from './measurements.mjs';

const MB = 1e6;

/**
 * Ceiling on an adapter's post-item drain.
 *
 * The drain runs on the failure path too, which is exactly when the application may be
 * wedged and answering nothing, so it cannot be left unbounded.
 */
const REMOVE_TIMEOUT_MS = 3 * 60 * 1000;

export const DEFAULTS = {
  trials: 1,
  sequentialBytes: 256 * MB,
  sequentialMaxMs: 30000,
  seekReadBytes: 8 * MB,
  seekFractions: [0.01, 0.25, 0.5, 0.75, 0.95],
  playbackSeconds: 30,
  playbackBitrateMbps: 25,
  integritySamples: 3,
  itemTimeoutMs: 10 * 60 * 1000,
  importTimeoutMs: 5 * 60 * 1000,
  idleSampleMs: 5000,
  sampleIntervalMs: 1000,
  // Let provider-side connection state settle, so one application's lingering sockets
  // are not charged to the next.
  appCooldownMs: 15000,
  skipPlayback: false,
  skipIntegrity: false,
};

const nowMs = () => performance.now();

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`${what} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function step(name, fn, into, log, scrub = (t) => t) {
  try {
    const t0 = nowMs();
    into[name] = await fn();
    into[`${name}WallMs`] = +(nowMs() - t0).toFixed(1);
  } catch (e) {
    const message = scrub(String(e?.message ?? e));
    into[name] = { error: message };
    log?.(`      ${name}: FAILED ${message}`);
  }
}

/**
 * Run one application against the selected corpus items.
 * Never throws for per-item problems: failures are recorded and the run continues.
 */
export async function runApp({ AdapterClass, ctx, items, config, log }) {
  const started = new Date().toISOString();
  const record = {
    app: AdapterClass.id,
    displayName: AdapterClass.displayName,
    language: AdapterClass.language,
    repo: AdapterClass.repo,
    serving: AdapterClass.serving,
    runtime: ctx.runtime ?? 'source',
    startedAt: started,
    items: [],
  };

  if (!AdapterClass.platforms.includes(process.platform) && (ctx.runtime ?? 'source') === 'source') {
    record.status = 'unsupported-on-platform';
    record.reason = `${AdapterClass.displayName} cannot run from source on ${process.platform} (supported: ${AdapterClass.platforms.join(', ')})`;
    log(`  SKIP ${AdapterClass.id}: ${record.reason}`);
    return record;
  }

  const adapter = new AdapterClass(ctx);
  // An adapter that echoes its own configuration in an error carries the provider
  // password with it, into results.json and from there into a published report.
  const scrub = (text) => redactSecrets(text, ctx.providers ?? []);
  // An adapter whose processes the host sampler cannot see supplies its own.
  const makeSampler = (intervalMs) => adapter.makeSampler?.(intervalMs) ?? new ProcessSampler({ intervalMs });
  let sampler = new ProcessSampler({ intervalMs: config.sampleIntervalMs });

  try {
    log(`  preparing ${AdapterClass.id} ...`);
    adapter.log = log;
    const prepT0 = nowMs();
    const built = await prepareCached(adapter, { force: config.rebuild, log });
    record.prepareMs = +(nowMs() - prepT0).toFixed(1);
    record.buildReused = built.reused;
    record.buildStamp = built.stamp;
    log(`  starting ${AdapterClass.id} ...`);
    const t0 = nowMs();
    await adapter.start();
    record.startupMs = +(nowMs() - t0).toFixed(1);
    record.version = await adapter.version().catch(() => ({ version: 'unknown' }));
    record.port = adapter.port;
  } catch (e) {
    record.status = 'failed-to-start';
    record.reason = scrub(String(e?.message ?? e));
    log(`  FAIL ${AdapterClass.id}: ${record.reason}`);
    await adapter.stop().catch(() => {});
    return record;
  }

  try {
    const pids = adapter.processIds();
    record.pids = pids;
    // Built here: a container-backed sampler needs the container start() created.
    sampler = makeSampler(config.sampleIntervalMs);
    // Idle footprint: measured after startup settles, before any work.
    record.idle = await measureIdle(pids, config.idleSampleMs, 500, makeSampler);
    await sampler.start(pids);
    // A sampler that sees nothing reports zero CPU, which reads as perfect efficiency.
    const cpuMeasurable = !record.idle?.unavailable || pids.length > 0;
    record.resourcesMeasured = cpuMeasurable;
    // A cgroup counter in a VM and a host process counter are not the same measurement.
    record.resourceSource = record.idle?.source ?? 'host';

    for (const item of items) {
      const r = { id: item.id, tier: item.tier, axes: item.axes, expect: item.expect ?? "serve" };
      log(`    [${AdapterClass.id}] ${item.id} (${item.postedGiB} GiB, ${item.packaging})`);
      const cpuBefore = sampler.mark();
      // Marks where this item starts in the RSS timeline, so a spike can be attributed
      // to a corpus entry rather than only to the run.
      const rssMarker = sampler.timeline().length;
      const itemT0 = nowMs();
      // Item-scoped, so the drain below can reach it however this item ends.
      let handle = null;

      try {
        await withTimeout(
          (async () => {
            await adapter.reset().catch(() => {});

            const impT0 = nowMs();
            handle = await withTimeout(
              adapter.addNzb({
                id: item.id,
                path: resolve(item.nzb),
                name: item.sourceFile,
                password: item.password,
                item,
              }),
              // Margin over the adapter's own deadline, so its specific message wins.
              config.importTimeoutMs + 30000,
              'import',
            );
            const target = await adapter.resolve(handle);
            r.importMs = +(nowMs() - impT0).toFixed(1);
            r.target = { fileName: target.fileName, sizeBytes: target.sizeBytes, note: target.note };

            // Must be the first byte request against this file, or a warm buffer is
            // credited with a cold latency it never paid.
            await step('coldOpen', () => measureOpen(target), r, log, scrub);
            await step('probe', () => measureProbe(target), r, log, scrub);
            const size = target.sizeBytes ?? r.probe?.totalBytes;
            if (!size) throw new Error('could not determine file size');
            r.sizeBytes = size;

            // A resolve that lands on a control response rather than media produces
            // sub-millisecond TTFB and absurd CPU-per-GiB, which look plausible.
            const ct = r.probe?.contentType ?? '';
            if (/^(application\/json|text\/html)/i.test(ct)) {
              throw new Error(
                `resolved URL returns ${ct}, not media bytes; the adapter is pointing at a control endpoint`,
              );
            }
            if (r.probe && r.probe.rangeSupported === false) {
              throw new Error('resolved URL does not honour Range requests; seek/throughput would be meaningless');
            }

            // A failed playback can be answered with a short status clip, which is valid
            // media over a Range-capable route and passes every check above. An absolute
            // floor rather than a ratio, since the served file is legitimately a small
            // fraction of an archived post or a season pack. Adapters serving one volume
            // by design opt out with `expectPartial`.
            const MIN_PLAUSIBLE_TARGET = 64 * MB;
            if (!target.expectPartial && (item.postedBytes ?? 0) > 128 * MB && size < MIN_PLAUSIBLE_TARGET) {
              throw new Error(
                `served only ${(size / MB).toFixed(1)} MB from a ${(item.postedBytes / MB).toFixed(0)} MB ` +
                  `post. That is a placeholder, a sample, or the wrong file, not the media.`,
              );
            }
            // Acceptance is the whole result for a reject-expected entry, and timings on
            // content the application should not be serving compare with nothing.
            if ((item.expect ?? 'serve') === 'reject') {
              r.note = 'accepted an entry expected to be refused; performance phases skipped';
              log(`      wrongly served, skipping performance phases`);
              r.status = 'ok';
              return;
            }

            await step('warmOpen', () => measureOpen(target), r, log, scrub);
            await step(
              'sequential',
              () => measureSequential(target, { maxBytes: config.sequentialBytes, maxMs: config.sequentialMaxMs }),
              r,
              log,
              scrub,
            );
            await step(
              'seeks',
              () => measureSeeks(target, size, { fractions: config.seekFractions, readBytes: config.seekReadBytes }),
              r,
              log,
              scrub,
            );
            if (!config.skipPlayback) {
              await step(
                'playback',
                () =>
                  measurePlayback(target, size, {
                    seconds: config.playbackSeconds,
                    bitrateMbps: config.playbackBitrateMbps,
                  }),
                r,
                log,
                scrub,
              );
            }
            // The offset is in assembled-inner-file space. An application serving
            // something else has no byte there, and its 416 would otherwise be recorded
            // as the very behaviour this measurement exists to detect.
            if (item.knownHole) {
              const need = item.knownHole.offsetBytes + (item.knownHole.missingBytes ?? MB);
              if (size < need) {
                r.hole = {
                  skipped:
                    `serves ${(size / 1e6).toFixed(1)} MB, but the hole sits at ${(need / 1e6).toFixed(1)} MB of the ` +
                    `assembled file, so this application is not serving it and the offset is not addressable`,
                };
                log(`      hole: skipped (different address space)`);
              } else {
                await step('hole', () => measureHole(target, item.knownHole), r, log, scrub);
                if (r.hole?.verdict) log(`      hole: ${r.hole.verdict}`);
              }
            }
            if (!config.skipIntegrity) {
              await step('integrity', () => measureIntegrity(target, size, { samples: config.integritySamples }), r, log, scrub);
            }

            r.status = 'ok';
          })(),
          config.itemTimeoutMs,
          `item ${item.id}`,
        );
      } catch (e) {
        r.status = 'failed';
        r.error = scrub(String(e?.message ?? e));
        log(`      -> FAILED: ${r.error}`);
      }

      r.wallMs = +(nowMs() - itemT0).toFixed(1);
      r.cpuSeconds = cpuMeasurable ? +(sampler.mark() - cpuBefore).toFixed(3) : null;
      const slice = sampler.timeline().slice(rssMarker);
      const rssSlice = slice.map((t) => t.rss).filter((n) => n > 0);
      if (rssSlice.length) {
        r.rssPeakBytes = Math.max(...rssSlice);
        r.rssMeanBytes = Math.round(rssSlice.reduce((a, b) => a + b, 0) / rssSlice.length);
      }
      if (cpuMeasurable) r.cpuShape = cpuShape(slice);
      // CPU cost normalised by bytes actually delivered.
      const delivered =
        (r.sequential?.bytes ?? 0) + (r.playback?.bytes ?? 0) + (r.coldOpen?.bytes ?? 0) + (r.warmOpen?.bytes ?? 0);
      r.deliveredBytes = delivered;
      // Below this, import CPU dominates and an aborted transfer yields a ratio in the
      // thousands, which would sit in the median as if it were an efficiency result.
      const MIN_FOR_RATIO = 64 * MB;
      r.cpuSecondsPerGB =
        cpuMeasurable && delivered >= MIN_FOR_RATIO
          ? +(r.cpuSeconds / (delivered / 2 ** 30)).toFixed(2)
          : null;

      // Every path, including failure and timeout. An adapter whose work outlives the
      // item leaves the next entry to start against a spent pool, and the failure that
      // causes is then recorded against a corpus entry that did nothing wrong - which is
      // the misattribution the drain exists to prevent, so the failing item is the one
      // case it must not be skipped for. Placed after the accounting above so the drain's
      // own wall time and CPU are charged to neither this item nor the next.
      await withTimeout(adapter.remove(handle), REMOVE_TIMEOUT_MS, `remove ${item.id}`).catch((e) =>
        log(`      remove: ${scrub(String(e?.message ?? e))}`),
      );
      record.items.push(r);
    }

    record.resources = sampler.stop();
    // Footprint once work stops, which separates an engine that returns its buffers
    // from one that keeps them.
    record.idleAfter = await measureIdle(pids, config.idleAfterMs ?? 45000, 1000, makeSampler);
    record.status = 'ok';
  } catch (e) {
    record.status = 'error';
    record.reason = scrub(String(e?.message ?? e));
    try {
      record.resources = sampler.stop();
    } catch {
      /* ignore */
    }
  } finally {
    await adapter.stop().catch(() => {});
  }

  record.finishedAt = new Date().toISOString();
  return record;
}

/** Full run across all requested applications. */
export async function runBenchmark({ adapters, corpus, providers, config, paths, log = console.log }) {
  const system = await collectSystemInfo();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(paths.results, runId);
  await mkdir(outDir, { recursive: true });

  const results = {
    runId,
    startedAt: new Date().toISOString(),
    harness: { node: process.version, cwd: process.cwd() },
    system,
    providers: providers.map(redactProvider),
    config,
    corpus: {
      source: 'corpus/corpus.json',
      selected: corpus.map((c) => ({ id: c.id, tier: c.tier, expect: c.expect, axes: c.axes, sha256: c.sha256, postedGiB: c.postedGiB })),
    },
    apps: [],
  };

  for (const [i, { AdapterClass, ctx }] of adapters.entries()) {
    log(`\n=== ${AdapterClass.displayName} (${AdapterClass.id}) ===`);
    const rec = await runApp({ AdapterClass, ctx, items: corpus, config, log });
    results.apps.push(rec);
    // Persist after each app so a long run is never lost to a late crash.
    await writeFile(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
    // So one application's lingering sockets are not charged to the next one's first read.
    if (i < adapters.length - 1 && config.appCooldownMs > 0) {
      log(`  cooling down ${config.appCooldownMs / 1000}s before the next application ...`);
      await new Promise((r) => setTimeout(r, config.appCooldownMs));
    }
  }

  results.finishedAt = new Date().toISOString();
  await writeFile(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  return { results, outDir };
}

export async function loadCorpus(path = 'corpus/corpus.json') {
  const raw = JSON.parse(await readFile(resolve(path), 'utf8'));
  return raw.items;
}
