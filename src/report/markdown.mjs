// Renders results.json into a self-describing Markdown report. The same JSON is the
// intended input for a future graphed web page, so nothing is computed here that is
// not also derivable from the JSON.

import { describeSystem } from '../metrics/sysinfo.mjs';
import { BY_ID } from '../adapters/index.mjs';

const gb = (b) => (Number.isFinite(b) ? (b / 2 ** 30).toFixed(2) : '—');
const mb = (b) => (Number.isFinite(b) ? (b / 2 ** 20).toFixed(0) : '—');
const ms = (n) => (Number.isFinite(n) ? (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(0)} ms`) : '—');
const mbps = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

/**
 * How long one seek read actually takes: the acknowledgement plus the transfer behind
 * it. An engine can answer a Range in single-digit milliseconds and then feed the body
 * slower than everything else, which TTFB alone reports as the best result in the table.
 */
function seekCompletionMs(item) {
  const points = (item.seeks?.points ?? []).filter((pt) => Number.isFinite(pt.ttfbMs) && pt.throughputMBps > 0);
  if (!points.length) return null;
  return med(points.map((pt) => pt.ttfbMs + (pt.bytes / 1e6 / pt.throughputMBps) * 1000));
}

const med = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Tidy an error for publication: an ephemeral loopback port says nothing to a reader and
 * ties the report to the machine that produced it. Bodies are flattened to one line.
 */
function readableError(text) {
  if (typeof text !== 'string') return 'unknown';
  return text
    .replace(/https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0):\d+/g, '<app>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

/** Score one entry against its `expect`: served, gap, correctly rejected, or wrongly served. */
function scoreOf(item) {
  const served = item.status === 'ok';
  // Results without `expect` fall back to the tier. Only `negative` is uniformly
  // unservable; `failure` holds entries that must still be served.
  const expect = item.expect ?? (item.tier === 'negative' ? 'reject' : 'serve');
  if (expect === 'reject') return served ? 'wrongly-served' : 'correctly-rejected';
  return served ? 'served' : 'capability-gap';
}

/**
 * Per-app aggregate. `only` restricts the population to a fixed set of entry ids, so
 * medians can be taken over the same entries for every application.
 */
function summarise(app, only = null) {
  const items = app.items ?? [];
  const ok = items.filter((i) => i.status === 'ok');
  // Every measured row, not just successful ones: a failure still occupies a position
  // in the session. What must not happen is averaging two processes, so a mix of local
  // and merged rows keeps only the local ones; an application whose rows all came from
  // one merged run still describes a single process and is measured from those.
  const local = items.filter((i) => !i.fromRun);
  const memRows = (local.length ? local : items).map((i) => i.rssPeakBytes).filter(Number.isFinite);
  const perf = ok
    .filter((i) => i.tier !== 'failure' && i.tier !== 'negative')
    .filter((i) => !only || only.has(i.id));
  const scores = items.map(scoreOf);
  const count = (s) => scores.filter((x) => x === s).length;
  return {
    attempted: items.length,
    ok: ok.length,
    failed: items.length - ok.length,
    served: count('served'),
    capabilityGaps: count('capability-gap'),
    correctlyRejected: count('correctly-rejected'),
    wronglyServed: count('wrongly-served'),
    correct: count('served') + count('correctly-rejected'),
    // Published, because a median is not comparable without knowing what it averaged.
    n: perf.length,
    perfIds: perf.map((i) => i.id),
    // Memory per unit of work: a run-wide peak rewards failing early, since it is a
    // high-water mark over however many entries an application survived.
    rssItemMedian: med(memRows),
    rssItemN: memRows.length,
    rssDrift: (() => {
      if (memRows.length < 6) return null;
      const k = Math.floor(memRows.length / 3);
      const first = med(memRows.slice(0, k));
      const last = med(memRows.slice(-k));
      return Number.isFinite(first) && Number.isFinite(last) ? last - first : null;
    })(),
    importMs: med(perf.map((i) => i.importMs)),
    coldTtfb: med(perf.map((i) => i.coldOpen?.ttfbMs)),
    // Mount-style apps inspect at import, addon-style apps defer it to the first byte,
    // so only the sum is comparable.
    clickToByte: med(perf.map((i) => (Number.isFinite(i.importMs) && Number.isFinite(i.coldOpen?.ttfbMs) ? i.importMs + i.coldOpen.ttfbMs : null))),
    warmTtfb: med(perf.map((i) => i.warmOpen?.ttfbMs)),
    // Only entries whose transfer ran long enough to mean anything.
    seqMBps: med(perf.filter((i) => i.sequential?.reliable).map((i) => i.sequential.meanMBps)),
    seqP05: med(perf.filter((i) => i.sequential?.reliable).map((i) => i.sequential.p05MBps)),
    seekTtfb: med(perf.map((i) => i.seeks?.medianTtfbMs)),
    seekWorst: med(perf.map((i) => i.seeks?.worstTtfbMs)),
    seekFull: med(perf.map((i) => seekCompletionMs(i))),
    cpuPerGB: med(perf.map((i) => i.cpuSecondsPerGB)),
    playbackP05: med(perf.map((i) => i.playback?.p05MBps)),
    timeToBuffer: med(perf.map((i) => i.playback?.timeToBufferMs)),
  };
}

export function renderMarkdown(results) {
  const L = [];
  const p = (s = '') => L.push(s);

  p(`# NZB streaming benchmark`);
  p();
  p(`**Run** \`${results.runId}\` · started ${results.startedAt}${results.finishedAt ? ` · finished ${results.finishedAt}` : ''}`);
  p();

  // A merged report is not a single sitting, and rows from different sittings saw the
  // provider in different states.
  for (const m of results.mergedFrom ?? []) {
    const apps = (m.apps ?? []).join(', ');
    // Naming all 31 entries is noise when a whole application was re-measured; the
    // count carries the same information.
    const what =
      m.entries.length > 6
        ? `all ${m.entries.length} entries`
        : `\`${m.entries.join('`, `')}\``;
    p(`> **Merged run.** ${apps ? `**${apps}**: ` : ''}${what} came from a separate pass`);
    p(`> (\`${m.runId}\`, ${m.startedAt}) and were merged in. Those rows saw the provider at a`);
    p(`> different time from the rest, so compare them with that in mind.`);
    p();
  }

  // ---- provenance -------------------------------------------------------
  p(`## Environment`);
  p();
  p(`${describeSystem(results.system).replace(/\s+/g, ' ').trim()}`);
  p();
  p(`| | |`);
  p(`|---|---|`);
  p(`| OS | ${results.system.osName ?? `${results.system.platform} ${results.system.osRelease}`} |`);
  p(`| CPU | ${results.system.cpuModel?.replace(/\s+/g, ' ').trim() ?? '—'}${results.system.cpuCores ? `, ${results.system.cpuCores}C/${results.system.cpuThreads}T` : ''} |`);
  p(`| RAM | ${gb(results.system.installedMemoryBytes ?? results.system.totalMemoryBytes)} GiB${results.system.memorySpeedMHz ? ` @ ${results.system.memorySpeedMHz} MHz` : ''} |`);
  if (results.system.disk) p(`| Disk | ${results.system.disk.name} (${results.system.disk.mediaType ?? '—'}) |`);
  if (results.system.cpuGovernor) p(`| CPU governor | \`${results.system.cpuGovernor}\` |`);
  p(`| Harness | Node ${results.harness.node} |`);
  p();

  p(`### NNTP providers`);
  p();
  p(`| Provider | Port | TLS | Max conns | Role |`);
  p(`|---|---:|:---:|---:|---|`);
  for (const pr of results.providers) {
    p(`| \`${pr.host}\` | ${pr.port} | ${pr.tls ? 'yes' : 'no'} | ${pr.maxConnections} | ${pr.backup ? 'backup' : 'primary'} |`);
  }
  p();
  p(`> Throughput is bounded by the provider and the link, not only by the application.`);
  p(`> The \`raw\` row is this harness fetching the same articles with no application in`);
  p(`> the middle, so read every other number relative to it.`);
  p();

  // ---- run settings -----------------------------------------------------
  p(`### Run settings`);
  p();
  const c = results.config;
  p(`| Setting | Value |`);
  p(`|---|---|`);
  p(`| Sequential read | ${mb(c.sequentialBytes)} MiB cap / ${c.sequentialMaxMs / 1000}s cap |`);
  p(`| Seek points | ${c.seekFractions.map((f) => `${(f * 100).toFixed(0)}%`).join(', ')} + backward |`);
  p(`| Seek read | ${mb(c.seekReadBytes)} MiB |`);
  p(`| Playback sim | ${c.playbackSeconds}s @ ${c.playbackBitrateMbps} Mbps |`);
  p(`| Integrity samples | ${c.integritySamples} |`);
  p(`| Item timeout | ${c.itemTimeoutMs / 1000}s |`);
  p();

  // ---- headline ---------------------------------------------------------
  const ran = results.apps.filter((a) => a.status === 'ok');
  const notRun = results.apps.filter((a) => a.status !== 'ok');

  p(`## Summary`);
  p();
  if (!ran.length) {
    p(`No application completed a run.`);
  } else {
    p(`Medians across the performance tiers (\`smoke\`, \`core\`, \`stress\`). Failure and`);
    p(`negative tiers are excluded here and reported separately below.`);
    p();
    // Rows from a different run, excluded from the memory columns.
    const summaries = ran.map((a) => [a, summarise(a)]);
    // Entries every application served: the only population on which a median means the
    // same thing for all of them.
    const commonIds = summaries.reduce(
      (acc, [, s]) => (acc === null ? new Set(s.perfIds) : new Set([...acc].filter((id) => s.perfIds.includes(id)))),
      null,
    ) ?? new Set();
    const gibOf = Object.fromEntries((results.corpus?.selected ?? []).map((c) => [c.id, c.postedGiB]));
    const medGiB = (ids) => med(ids.map((id) => gibOf[id]).filter(Number.isFinite));

    p(`> **\`n\` and *med post* are part of the result, not footnotes.** Each row's medians`);
    p(`> are taken over the entries *that application served*, so they are medians over`);
    p(`> different populations. Import and click&rarr;byte scale with post size, so an`);
    p(`> application that fails the large entries is credited with the fast medians of the`);
    p(`> small ones it survived. Compare the like-for-like table below before ranking.`);
    p();
    p(`| App | Runtime | n | Med post | Seq MB/s | p05 MB/s | Click&rarr;byte | Import | Cold TTFB | Warm TTFB | Seek TTFB | Full seek | Worst seek | CPU s/GiB | Idle RSS | RSS/item | RSS drift | After idle | Correct |`);
    p(`|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
    for (const [a, s] of summaries) {
      p(
        `| **${a.displayName}** | ${a.runtime} | ${s.n} | ${num(medGiB(s.perfIds), 1)} GiB | ` +
          `${mbps(s.seqMBps)} | ${mbps(s.seqP05)} | ${ms(s.clickToByte)} | ${ms(s.importMs)} | ` +
          `${ms(s.coldTtfb)} | ${ms(s.warmTtfb)} | ${ms(s.seekTtfb)} | ${ms(s.seekFull)} | ${ms(s.seekWorst)} | ${num(s.cpuPerGB, 1)} | ` +
          `${mb(a.idle?.rssPeakBytes)} MiB | ${mb(s.rssItemMedian)} MiB | ` +
          `${Number.isFinite(s.rssDrift) ? `${s.rssDrift > 0 ? '+' : ''}${mb(s.rssDrift)} MiB` : '—'} | ` +
          `${a.idleAfter ? `${mb(a.idleAfter.rssMedianBytes)} MiB` : '—'} | ` +
          `${s.correct}/${s.attempted} |`,
      );
    }
    p();

    const caveated = ran.map((a) => [a, a.caveat ?? BY_ID[a.app]?.caveat]).filter(([, c]) => c);
    for (const [a, caveat] of caveated) {
      p(`> **${a.displayName}: this row is not a like-for-like result.** ${caveat}`);
      p();
    }

    // Which machine a row came from is part of the row.
    const containerised = ran.filter((a) => a.runtime === 'docker');
    if (containerised.length) {
      const names = containerised.map((a) => a.displayName).join(', ');
      const plural = containerised.length > 1;
      p(`> **\`runtime: docker\` rows were measured in a container, not on this host.**`);
      p(`> ${names} ${plural ? 'are' : 'is'} not buildable natively here, so ${plural ? 'they were' : 'it was'} run`);
      p(`> under Docker with \`--docker\`. The CPU and memory columns are real numbers, read`);
      p(`> from the daemon's cgroup counters rather than guessed, but they describe a process`);
      p(`> inside a Linux VM: the CPU is the VM's share of this machine, and every byte`);
      p(`> crosses an extra NAT hop on the way in.`);
      p(`>`);
      p(`> Compare container rows with each other freely. Against a native row, read them as`);
      p(`> indicative: a container row that is slower is not proof the application is.`);
      p();
    }

    if (commonIds.size >= 3) {
      const common = [...commonIds];
      p(`### Like-for-like`);
      p();
      p(`The same ${common.length} entries for every application, the ones all of them`);
      p(`served, so these medians are directly comparable. Median post size here is`);
      p(`${num(medGiB(common), 1)} GiB.`);
      p();
      p(`| App | Click&rarr;byte | Import | Cold TTFB | Seq MB/s | p05 MB/s | CPU s/GiB | vs its own-set click&rarr;byte |`);
      p(`|---|---:|---:|---:|---:|---:|---:|---:|`);
      for (const [a, own] of summaries) {
        const s = summarise(a, commonIds);
        const shift =
          Number.isFinite(s.clickToByte) && Number.isFinite(own.clickToByte) && own.clickToByte > 0
            ? `${(s.clickToByte / own.clickToByte).toFixed(2)}×`
            : '—';
        p(
          `| ${a.displayName} | ${ms(s.clickToByte)} | ${ms(s.importMs)} | ${ms(s.coldTtfb)} | ` +
            `${mbps(s.seqMBps)} | ${mbps(s.seqP05)} | ${num(s.cpuPerGB, 1)} | ${shift} |`,
        );
      }
      p();
      p(`The last column is the size of the distortion. A value near \`1.00×\` means the`);
      p(`application's own-set median was already effectively this population, which is`);
      p(`what you see from an application whose successes *are* the easy entries. Values`);
      p(`well below \`1.00×\` belong to applications whose own median was dragged up by`);
      p(`large entries the others never attempted.`);
      p();
      p(`Entries: ${common.map((id) => `\`${id}\``).join(', ')}.`);
      p();
      p(`This set is bounded by the *weakest* application, so it is small and skews toward`);
      p(`easier content. Neither table is the whole answer: the one above rewards breadth`);
      p(`and penalises nothing, this one compares fairly on a narrow slice. Read them with`);
      p(`the capability matrix.`);
      p();
    }
    p(`### Correctness breakdown`);
    p();
    p(`*Correct* is not *served*. Six corpus entries are built to be unservable: three`);
    p(`\`negative\` (compressed archives, no password) and three \`failure\` (dead post,`);
    p(`severe damage, missing volumes). Refusing those is the right answer, and serving`);
    p(`one means emitting bytes that cannot be the media, which is a worse result than`);
    p(`refusing, not a better one.`);
    p();
    p(`| App | Served (of ${summaries[0]?.[1].served + summaries[0]?.[1].capabilityGaps || '—'} servable) | Capability gaps | Correctly rejected | **Wrongly served** |`);
    p(`|---|---:|---:|---:|---:|`);
    for (const [a, s] of summaries) {
      const wrong = s.wronglyServed ? `**${s.wronglyServed}**` : '0';
      p(
        `| ${a.displayName} | ${s.served}/${s.served + s.capabilityGaps} | ${s.capabilityGaps} | ` +
          `${s.correctlyRejected}/${s.correctlyRejected + s.wronglyServed} | ${wrong} |`,
      );
    }
    p();
    p(`\`raw\` is not an application and its row here is not a verdict: it serves outer`);
    p(`volume bytes without opening an archive, so it "wrongly serves" entries no player`);
    p(`could open. That is the point of the baseline, not a defect in it.`);
    p();
    p(`A *capability gap* is the number that ranks engines: entries that should stream`);
    p(`and did not.`);
    p();
    if (ran.some((a) => (a.items ?? []).some((i) => !i.expect))) {
      p(`> This run predates per-entry expectations, so only the \`negative\` tier is`);
      p(`> scored as reject-expected here. The three \`failure\`-tier entries that are also`);
      p(`> unservable (\`dead-post\`, \`damaged-severe\`, \`incomplete-archive-set\`) are still`);
      p(`> counted as gaps, which understates every application. Re-run to score fully.`);
      p();
    }
    p(`*Click&rarr;byte* is import + cold open: what a viewer waits through after pressing`);
    p(`play. Compare **that**, not import alone: mount-style apps (altmount, the nzbdav`);
    p(`family) do their inspection at import, while addon-style apps (StreamNZB,`);
    p(`AIOStreams) return a session in milliseconds and do the same work on first byte.`);
    p();
    p(`*CPU s/GiB* is CPU-seconds consumed per GiB delivered, the fair efficiency`);
    p(`comparison, since raw CPU% is meaningless at different throughputs.`);
    p();
    p(`*RSS/item* is the median of the per-entry peaks, not a peak across the whole run.`);
    p(`A run-wide peak is a high-water mark over however many entries an application`);
    p(`survived, so it rewards failing early; the per-item median is comparable.`);
    p();
    p(`*RSS drift* is the median per-entry peak over the last third of the run minus the`);
    p(`first third. Every application here holds more memory the longer it runs, and this`);
    p(`states how much rather than letting it inflate the headline. It is measured with no`);
    p(`idle gap between entries, which is the harshest case: applications that release on`);
    p(`idle never get the chance to. *After idle* is the median footprint once the work`);
    p(`stops but before the process is killed, which is where that memory goes back.`);
    p();
    p(`Both are taken over every measured entry, including failed ones, since a failure`);
    p(`still occupies a position in the session. Entries merged from another run are`);
    p(`excluded from these two columns because their footprint is another process's.`);
    p();
    p(`*p05 MB/s* is the 5th-percentile one-second windowed rate. An engine can ack a`);
    p(`range in single-digit milliseconds and still stall behind it, so read TTFB and`);
    p(`p05 together.`);
    p();
    p(`*Full seek* is what that costs in practice: the median time to complete a whole`);
    p(`seek read, acknowledgement plus transfer, rather than the moment the first byte`);
    p(`appears. An engine that answers a Range immediately and then feeds the body slowly`);
    p(`wins *Seek TTFB* and loses this column, and this column is the one a player waits`);
    p(`through. Where the two disagree, believe this one.`);
  }
  p();

  if (notRun.length) {
    p(`### Not measured`);
    p();
    p(`| App | Status | Reason |`);
    p(`|---|---|---|`);
    for (const a of notRun) p(`| ${a.displayName} | \`${a.status}\` | ${a.reason ?? '—'} |`);
    p();
  }

  // ---- capability matrix ------------------------------------------------
  if (ran.length) {
    const ids = [...new Set(ran.flatMap((a) => a.items.map((i) => i.id)))];
    p(`## Capability matrix`);
    p();
    p(`Whether each application could serve each corpus entry at all. \`negative\` entries`);
    p(`are expected to fail; what matters there is that the failure is quick and explicit.`);
    p();
    p(`> **The \`raw\` column is not a capability claim.** It streams the outer volume`);
    p(`> bytes without opening the archive, so it "passes" encrypted and obfuscated`);
    p(`> entries that no application could actually play. Read it as "the articles are`);
    p(`> retrievable", which is exactly what makes it useful: a failure everywhere *except*`);
    p(`> raw is an application limitation, not a dead post.`);
    p();
    p(`| Entry | Tier | ${ran.map((a) => a.displayName).join(' | ')} |`);
    p(`|---|---|${ran.map(() => '---').join('|')}|`);
    for (const id of ids) {
      const tier = ran.map((a) => a.items.find((i) => i.id === id)?.tier).find(Boolean) ?? '';
      const cells = ran.map((a) => {
        const it = a.items.find((i) => i.id === id);
        if (!it) return '·';
        return it.status === 'ok' ? 'pass' : 'FAIL';
      });
      p(`| \`${id}\` | ${tier} | ${cells.join(' | ')} |`);
    }
    p();
  }

  // ---- integrity ----------------------------------------------------------
  //
  // Applications are compared against each other. `raw` serves the outer volume stream
  // for an archived post, so it is a valid reference only on direct-video entries.
  const okApps = results.apps.filter((a) => a.status === 'ok');
  const integrityRows = [];
  const entryIds = [...new Set(okApps.flatMap((a) => a.items.map((i) => i.id)))];

  for (const id of entryIds) {
    const meta = results.corpus.selected.find((c) => c.id === id);
    const directVideo = (meta?.axes ?? []).includes('direct-video');

    // Collect hash-by-offset per app, keeping only apps that produced any.
    const perApp = [];
    for (const a of okApps) {
      const it = a.items.find((i) => i.id === id);
      if (!Array.isArray(it?.integrity)) continue;
      const map = new Map();
      for (const s of it.integrity) if (s.sha256) map.set(s.start, s.sha256);
      // `raw` is comparable only on direct video.
      if (a.app === 'raw' && !directVideo) continue;
      if (map.size) perApp.push({ app: a.displayName, map });
    }
    if (perApp.length < 2) continue;

    // Consensus per offset = the hash the most applications agree on.
    const offsets = [...new Set(perApp.flatMap((p) => [...p.map.keys()]))];
    const consensus = new Map();
    for (const off of offsets) {
      const tally = {};
      for (const p of perApp) {
        const h = p.map.get(off);
        if (h) tally[h] = (tally[h] ?? 0) + 1;
      }
      const best = Object.entries(tally).sort((x, y) => y[1] - x[1])[0];
      if (best && best[1] >= 2) consensus.set(off, best[0]);
    }
    if (!consensus.size) continue;

    for (const p of perApp) {
      let agree = 0;
      let differ = 0;
      for (const [off, h] of consensus) {
        const mine = p.map.get(off);
        if (!mine) continue;
        if (mine === h) agree++;
        else differ++;
      }
      integrityRows.push({ id, app: p.app, agree, differ, total: agree + differ, directVideo });
    }
  }

  if (integrityRows.length) {
    p(`## Byte-identity cross-check`);
    p();
    p(`The same byte ranges hashed by every application and compared **against each**`);
    p(`**other**, since a fast application serving the wrong bytes is not fast. The`);
    p(`consensus hash is the one at least two applications agree on; a row that differs`);
    p(`is the one to investigate.`);
    p();
    p(`\`raw\` participates only on \`direct-video\` entries: for archived posts it serves`);
    p(`the outer volume stream rather than the assembled inner file, so it is not a`);
    p(`valid reference there.`);
    p();
    const disagreements = integrityRows.filter((r) => r.differ > 0);
    if (!disagreements.length) {
      const n = new Set(integrityRows.map((r) => r.id)).size;
      p(`**Every application agreed on every comparable range** (${n} entries, ${integrityRows.length} app-entry pairs).`);
    } else {
      p(`| Entry | App | Agree | **Differ** |`);
      p(`|---|---|---:|---:|`);
      for (const r of disagreements.sort((x, y) => y.differ - x.differ)) {
        p(`| \`${r.id}\` | ${r.app} | ${r.agree} | **${r.differ}** |`);
      }
      p();
      p(`${integrityRows.length - disagreements.length} of ${integrityRows.length} app-entry pairs matched consensus exactly.`);
    }
    p();
  }

  // ---- behaviour at a known missing article ------------------------------
  const holeRows = [];
  for (const a of ran) {
    for (const it of a.items ?? []) {
      if (it.hole) holeRows.push({ app: a.displayName, id: it.id, hole: it.hole });
    }
  }
  if (holeRows.length) {
    const h = holeRows.find((r) => r.hole.holeOffset)?.hole;
    p(`## Behaviour at a missing article`);
    p();
    p(`One entry in the corpus (\`damaged-partial\`) is an otherwise intact 10.2 GiB`);
    p(`release with **exactly one** article missing from both providers, 716,800 bytes`);
    p(`out of 15,572 articles. Its position in the assembled file is known exactly`);
    if (h) p(`(bytes ${h.holeOffset.toLocaleString()}–${(h.holeOffset + h.holeBytes).toLocaleString()}, 12.27% in),`);
    p(`so a read can be aimed straight at it.`);
    p();
    p(`This is the only measurement that distinguishes behaviours a status code cannot:`);
    p(`an engine that pads the gap with zeros and one that reconstructs it both return`);
    p(`\`206\` with the right byte count. Each application streams a continuous band`);
    p(`spanning the hole plus a same-sized control band from intact video, and the two`);
    p(`are compared.`);
    p();
    p(`Two reads are reported. A **streaming read** starts 1 MB before the hole and runs`);
    p(`past it, which is what a player does; a **direct Range** asks only for bytes inside`);
    p(`the hole, which is what a seek does. Several engines answer these differently.`);
    p();
    p(`Alignment is verified, not assumed: the 256 KB either side of the hole are hashed`);
    p(`against the true bytes decoded from the articles that do exist, so an engine that`);
    p(`lays the file out differently cannot be mistaken for one that repaired the gap.`);
    p();
    // Without anchors there is no proof the reads landed on the hole.
    if (!holeRows.some((r) => r.hole.alignment)) {
      p(`> **These verdicts are not trustworthy.** This run recorded no alignment anchors,`);
      p(`> so there is no evidence the reads landed on the hole at all, and a read that`);
      p(`> misses it returns clean bytes, which is indistinguishable from an engine that`);
      p(`> handled the gap. Re-run the entry after \`node src/corpus/select.mjs\`.`);
      p();
    }
    p(`| App | Streaming read | Direct Range into hole | Zero run (control) | Aligned | Slowdown |`);
    p(`|---|---|---|---|:-:|---:|`);
    for (const r of holeRows.sort((a, b) => a.app.localeCompare(b.app))) {
      if (r.hole.skipped) {
        p(`| ${r.app} | _not addressable_ | — | — | — | — |`);
        continue;
      }
      const band = (r.hole.windows ?? []).find((w) => w.window === 'hole');
      const ctl = (r.hole.windows ?? []).find((w) => w.window === 'control');
      const pin = (r.hole.windows ?? []).find((w) => w.window === 'pinpoint');
      const runs =
        band?.longestRun !== undefined
          ? `${band.longestRun.toLocaleString()} (${(ctl?.longestRun ?? 0).toLocaleString()})`
          : '—';
      const pinTxt = !pin
        ? '—'
        : pin.error
          ? `\`${pin.error.slice(0, 48)}\``
          : pin.zeroFraction === 1
            ? 'all zeros'
            : `served (${((pin.zeroFraction ?? 0) * 100).toFixed(0)}% zeros)`;
      const al = r.hole.alignment;
      const aligned = !al ? '—' : al.verified ? 'yes' : `**no**`;
      const slow = r.hole.slowdownVsControl ? `${r.hole.slowdownVsControl}×` : '—';
      p(`| ${r.app} | **${r.hole.verdict}** | ${pinTxt} | ${runs} | ${aligned} | ${slow} |`);
    }
    p();
    p(`\`zero-filled\` means the engine substituted zeros and carried on: the file stays`);
    p(`the right length and later offsets stay correct, but the player is fed silence or`);
    p(`corruption for the length of the gap. \`truncated-at-hole\` means the transfer was`);
    p(`accepted and then abandoned mid-body on reaching the gap, which a player sees as a`);
    p(`stall rather than an error, since the status line already said \`206\`.`);
    p();
    p(`\`served-clean\` would not automatically be a pass either: with alignment verified`);
    p(`it would mean the engine produced bytes for a range that is provably unavailable`);
    p(`upstream, and the only honest reading of that is reconstruction or substitution.`);
    p();
  }

  // ---- per-app detail ---------------------------------------------------
  p(`## Per-entry detail`);
  p();
  for (const a of ran) {
    p(`### ${a.displayName}`);
    p();
    p(
      `\`${a.app}\` · ${a.language} · version \`${a.version?.version ?? 'unknown'}\`` +
        `${a.version?.commit ? ` (\`${a.version.commit}\`)` : ''} · serving: ${a.serving} · runtime: ${a.runtime}` +
        `${a.resourceSource === 'docker' ? ' · CPU/RSS from container cgroups' : ''}` +
        `${a.resourcesMeasured === false ? ' · CPU/RSS not measurable' : ''}` +
        `${Number.isFinite(a.startupMs) ? ` · startup ${ms(a.startupMs)}` : ''}`,
    );
    p();
    const caveat = a.caveat ?? BY_ID[a.app]?.caveat;
    if (caveat) {
      p(`> **Not a like-for-like result.** ${caveat}`);
      p();
    }
    p(`| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |`);
    p(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---|`);
    for (const it of a.items) {
      p(
        `| \`${it.id}\` | ${ms(it.importMs)} | ${ms(it.coldOpen?.ttfbMs)} | ${mbps(it.sequential?.meanMBps)} | ` +
          `${ms(it.seeks?.medianTtfbMs)} | ${mbps(it.playback?.p05MBps)} | ${ms(it.playback?.timeToBufferMs)} | ` +
          `${num(it.cpuSecondsPerGB, 1)} | ${mb(it.rssPeakBytes)} MiB | ${it.status === 'ok' ? 'ok' : `**${it.status}**`} |`,
      );
    }
    p();
    if (a.items.some((i) => i.sequential?.reliable === false)) {
      p(`† transfer too short to measure sustained rate (the file fit in flight).`);
      p();
    }
    const failures = a.items.filter((i) => i.status !== 'ok');
    if (failures.length) {
      p(`<details><summary>Failures (${failures.length})</summary>`);
      p();
      for (const f of failures) p(`- \`${f.id}\` (${f.tier}): ${readableError(f.error)}`);
      p();
      p(`</details>`);
      p();
    }
  }

  // ---- corpus -----------------------------------------------------------
  p(`## Corpus used`);
  p();
  p(`See \`docs/CORPUS.md\` for why each entry is in the set.`);
  p();
  p(`| Entry | Tier | Posted | Axes |`);
  p(`|---|---|---:|---|`);
  for (const e of results.corpus.selected) {
    p(`| \`${e.id}\` | ${e.tier} | ${e.postedGiB} GiB | ${e.axes.map((x) => `\`${x}\``).join(', ')} |`);
  }
  p();
  p(`---`);
  p();
  p(`Generated from \`results.json\` by \`src/report/markdown.mjs\`. Regenerate with`);
  p(`\`node src/cli.mjs report <run-dir>\`.`);

  return L.join('\n');
}
