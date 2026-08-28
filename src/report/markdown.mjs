// Renders results.json into a self-describing Markdown report. The same JSON is the
// intended input for a future graphed web page, so nothing is computed here that is
// not also derivable from the JSON.

import { describeSystem } from '../metrics/sysinfo.mjs';
import { BY_ID } from '../adapters/index.mjs';

const gb = (b) => (Number.isFinite(b) ? (b / 2 ** 30).toFixed(2) : '—');
const mib = (b) => (Number.isFinite(b) ? `${(b / 2 ** 20).toFixed(0)} MiB` : '—');
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

const isPerfTier = (item) => item.tier !== 'failure' && item.tier !== 'negative';

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
  const perf = ok.filter(isPerfTier).filter((i) => !only || only.has(i.id));
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
    // Published beside `rssItemN`, since a peak is not readable without the number of
    // entries it was taken over.
    rssPeak: memRows.length ? Math.max(...memRows) : null,
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
    cpuP95Cores: med(perf.map((i) => i.cpuShape?.p95Cores)),
    cpuMaxCores: med(perf.map((i) => i.cpuShape?.maxCores)),
    cpuBusy: med(perf.map((i) => i.cpuShape?.busyFraction)),
    playbackP05: med(perf.map((i) => i.playback?.p05MBps)),
    timeToBuffer: med(perf.map((i) => i.playback?.timeToBufferMs)),
  };
}

/**
 * The population every headline median is taken over. A strict intersection is defined
 * by the weakest application in the field, so one broken engine collapses the set for
 * everybody and the set moves between runs; a quorum holds it wide and stable, and an
 * application that missed an entry reports it as `n`.
 */
function quorumPopulation(ran) {
  const universe = [...new Set(ran.flatMap((a) => (a.items ?? []).filter(isPerfTier).map((i) => i.id)))];
  const servedBy = (id) => ran.filter((a) => (a.items ?? []).some((i) => i.id === id && i.status === 'ok')).length;
  // 90% rounds up to the whole field at eight applications, which is the intersection
  // this exists to avoid, so one application must always be free to miss an entry.
  const threshold = ran.length <= 3 ? ran.length : Math.min(Math.ceil(ran.length * 0.9), ran.length - 1);
  const ids = new Set(universe.filter((id) => servedBy(id) >= threshold));
  const strict = universe.filter((id) => servedBy(id) === ran.length).length;
  return { ids, threshold, strict, universe: universe.length };
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
  p(`> **The link is the largest source of error here, and it is not controlled.** These`);
  p(`> runs are made over consumer Wi-Fi to a commercial provider, and both vary on their`);
  p(`> own. Repeating a pass with nothing changed but the clock has moved the whole-run`);
  p(`> median by 14% and individual entries by 55%, and one measured evening had a single`);
  p(`> post served at 9 MB/s by \`raw\` while others on the same connection ran at 45 MB/s.`);
  p(`> Provider variance is per post, not per session: which entries are slow changes from`);
  p(`> run to run, so a low number for one entry is not a property of the application.`);
  p(`> Treat differences under roughly 20% between applications, or under 50% on a single`);
  p(`> entry, as unresolved by one pass. Only repeated runs can separate the two.`);
  p();

  const ran = results.apps.filter((a) => a.status === 'ok');
  const notRun = results.apps.filter((a) => a.status !== 'ok');

  // Provenance, not measurement, so it costs no columns in the result tables.
  if (ran.length) {
    p(`### Applications measured`);
    p();
    p(`| App | Runtime | Language | Version | Serving | Startup |`);
    p(`|---|---|---|---|---|---:|`);
    for (const a of ran) {
      const version = `\`${a.version?.version ?? 'unknown'}\`${a.version?.commit ? ` (\`${a.version.commit}\`)` : ''}`;
      p(`| **${a.displayName}** | ${a.runtime} | ${a.language} | ${version} | ${a.serving} | ${ms(a.startupMs)} |`);
    }
    p();
  }

  // ---- run settings -----------------------------------------------------
  p(`### Run settings`);
  p();
  const c = results.config;
  p(`| Setting | Value |`);
  p(`|---|---|`);
  p(`| Sequential read | ${mib(c.sequentialBytes)} cap / ${c.sequentialMaxMs / 1000}s cap |`);
  p(`| Seek points | ${c.seekFractions.map((f) => `${(f * 100).toFixed(0)}%`).join(', ')} + backward |`);
  p(`| Seek read | ${mib(c.seekReadBytes)} |`);
  p(`| Playback sim | ${c.playbackSeconds}s @ ${c.playbackBitrateMbps} Mbps |`);
  p(`| Integrity samples | ${c.integritySamples} |`);
  p(`| Item timeout | ${c.itemTimeoutMs / 1000}s |`);
  p();

  // ---- headline ---------------------------------------------------------
  p(`## Summary`);
  p();
  if (!ran.length) {
    p(`No application completed a run.`);
    p();
  } else {
    const pop = quorumPopulation(ran);
    // A shared population needs something to share it between, and a median over fewer
    // than three entries says nothing. Failing either, rows fall back to their own sets.
    const useQuorum = ran.length >= 2 && pop.ids.size >= 3;
    const rows = ran.map((a) => {
      const own = summarise(a);
      return { a, own, cmp: useQuorum ? summarise(a, pop.ids) : own };
    });

    const gibOf = Object.fromEntries((results.corpus?.selected ?? []).map((e) => [e.id, e.postedGiB]));
    const medGiB = (ids) => med(ids.map((id) => gibOf[id]).filter(Number.isFinite));

    if (useQuorum) {
      const slack = pop.threshold < ran.length;
      p(`Every median below is taken over **the same ${pop.ids.size} entries for every**`);
      p(`**application**: the perf-tier entries (\`smoke\`, \`core\`, \`stress\`) that ${slack ? `at least` : `all`}`);
      p(`${slack ? `${pop.threshold} of the ` : ''}${ran.length} applications served. Median post size across that set is`);
      p(`${num(medGiB([...pop.ids]), 1)} GiB.`);
      p();
      if (slack) {
        p(`> **Why a quorum and not the entries all of them served.** That strict intersection`);
        p(`> is ${pop.strict} entries here, and it is defined by the weakest application in the field:`);
        p(`> one broken engine collapses the population for everybody, and the set moves between`);
        p(`> runs as the field changes. A quorum keeps it wide and stable. Where an application`);
        p(`> missed one of the ${pop.ids.size}, its \`n\` column says so.`);
        p();
      }
      p(`Entries: ${[...pop.ids].map((id) => `\`${id}\``).join(', ')}.`);
      p();
    } else if (ran.length < 2) {
      p(`One application ran, so there is nothing to hold a population against. These`);
      p(`medians are over the ${rows[0].own.n} perf-tier entries it served.`);
      p();
    } else {
      p(`Too few entries were served in common to build a shared population, so each row's`);
      p(`medians are over **that application's own served set** and are not directly`);
      p(`comparable. The \`n\` column is part of the result.`);
      p();
    }

    p(`### Verdict`);
    p();
    p(`*Correct* is not *served*. Six corpus entries are built to be unservable: three`);
    p(`\`negative\` (compressed archives, no password) and three \`failure\` (dead post,`);
    p(`severe damage, missing volumes). Refusing those is the right answer, and serving`);
    p(`one means emitting bytes that cannot be the media, which is a worse result than`);
    p(`refusing, not a better one.`);
    p();
    p(`| App | Served | Capability gaps | Correctly refused | **Wrongly served** |`);
    p(`|---|---:|---:|---:|---:|`);
    for (const { a, own: s } of rows) {
      const wrong = s.wronglyServed ? `**${s.wronglyServed}**` : '0';
      p(
        `| **${a.displayName}** | ${s.served}/${s.served + s.capabilityGaps} | ${s.capabilityGaps} | ` +
          `${s.correctlyRejected}/${s.correctlyRejected + s.wronglyServed} | ${wrong} |`,
      );
    }
    p();
    p(`A *capability gap* is the number that ranks engines: entries that should stream`);
    p(`and did not. \`raw\` is not an application and its row is not a verdict: it serves`);
    p(`outer volume bytes without opening an archive, so it "wrongly serves" entries no`);
    p(`player could open. That is the point of the baseline, not a defect in it.`);
    p();

    if (ran.some((a) => (a.items ?? []).some((i) => !i.expect))) {
      p(`> This run predates per-entry expectations, so only the \`negative\` tier is`);
      p(`> scored as reject-expected here. The three \`failure\`-tier entries that are also`);
      p(`> unservable (\`dead-post\`, \`damaged-severe\`, \`incomplete-archive-set\`) are still`);
      p(`> counted as gaps, which understates every application. Re-run to score fully.`);
      p();
    }

    // A row whose failures are not its own must be qualified before its counts are read.
    const caveated = ran.map((a) => [a, a.caveat ?? BY_ID[a.app]?.caveat]).filter(([, cv]) => cv);
    for (const [a, caveat] of caveated) {
      p(`> **${a.displayName}: this row is not a like-for-like result.** ${caveat}`);
      p();
    }

    p(`### Time to picture`);
    p();
    p(`| App | n | Click&rarr;byte | Import | Cold TTFB | Warm TTFB |`);
    p(`|---|---:|---:|---:|---:|---:|`);
    for (const { a, cmp: s } of rows) {
      const n = useQuorum ? `${s.n}/${pop.ids.size}` : `${s.n}`;
      p(`| **${a.displayName}** | ${n} | **${ms(s.clickToByte)}** | ${ms(s.importMs)} | ${ms(s.coldTtfb)} | ${ms(s.warmTtfb)} |`);
    }
    p();
    p(`*Click&rarr;byte* is import + cold open: what a viewer waits through after pressing`);
    p(`play, and the only one of these three that is comparable. Every application here but`);
    p(`one inspects the post at import and then answers the first byte quickly, so import is`);
    p(`over 80% of the wait. StreamNZB is the exception: it returns a session in`);
    p(`milliseconds and does the same work on first byte, which is why its import reads as`);
    p(`free and its cold TTFB does not. Serving mode does not predict this, since AIOStreams`);
    p(`answers byte ranges like StreamNZB and still front-loads like the mount-style`);
    p(`applications. *Warm TTFB* is the same open repeated, so it measures what the engine`);
    p(`cached rather than what it can do cold.`);
    p();

    p(`### Streaming and seeks`);
    p();
    p(`| App | Seq MB/s | p05 MB/s | Full seek | Seek TTFB | Worst seek |`);
    p(`|---|---:|---:|---:|---:|---:|`);
    for (const { a, cmp: s } of rows) {
      p(
        `| **${a.displayName}** | ${mbps(s.seqMBps)} | **${mbps(s.seqP05)}** | **${ms(s.seekFull)}** | ` +
          `${ms(s.seekTtfb)} | ${ms(s.seekWorst)} |`,
      );
    }
    p();
    p(`*p05 MB/s* is the 5th-percentile one-second windowed rate, which is what a player`);
    p(`actually feels: a mean rate hides a stall that a p05 does not.`);
    p();
    p(`*Full seek* is the median time to complete a whole seek read, acknowledgement plus`);
    p(`transfer, rather than the moment the first byte appears. An engine that answers a`);
    p(`Range immediately and then feeds the body slowly wins *Seek TTFB* and loses this`);
    p(`column, and this column is the one a player waits through. Where the two disagree,`);
    p(`believe this one.`);
    p();

    p(`### CPU`);
    p();
    p(`| App | CPU s/GiB | Cores (p95) | Cores (max) | Steady |`);
    p(`|---|---:|---:|---:|---:|`);
    for (const { a, cmp } of rows) {
      p(
        `| **${a.displayName}** | **${num(cmp.cpuPerGB, 1)}** | ${num(cmp.cpuP95Cores, 1)} | ${num(cmp.cpuMaxCores, 1)} | ` +
          `${Number.isFinite(cmp.cpuBusy) ? `${(cmp.cpuBusy * 100).toFixed(0)}%` : '—'} |`,
      );
    }
    p();
    p(`*CPU s/GiB* is CPU-seconds consumed per GiB delivered, the fair efficiency`);
    p(`comparison, since a raw percentage is meaningless at different throughputs.`);
    p();
    p(`The other three are the shape of the draw rather than its size, which a total`);
    p(`cannot express: ten CPU-seconds is a steady half core for twenty seconds or one`);
    p(`core pinned for ten, and those cost a shared box differently. *Cores (p95)* is the`);
    p(`level it sustains, *Cores (max)* the worst single second, and *Steady* the share of`);
    p(`seconds spent at or above half the p95. A high *Steady* is an engine that hums; a`);
    p(`low one with a tall *max* burns the same CPU in bursts against an idle baseline,`);
    p(`which is what makes a box feel busy while the averages look calm.`);
    p();
    p(`All three are per entry and then taken as medians, so *Cores (max)* is the typical`);
    p(`worst second of an entry, not the worst second of the run. They are bounded below`);
    p(`by the ${(results.config?.sampleIntervalMs ?? 1000) / 1000}s sample interval: a shorter spike is averaged away, so these`);
    p(`understate burstiness and never overstate it. Entries that finished in fewer than`);
    p(`four samples carry no shape and are excluded from these three columns only.`);
    p();
    if (!ran.some((a) => (a.items ?? []).some((i) => i.cpuShape))) {
      p(`> This run predates CPU shape sampling, so the last three columns are empty.`);
      p(`> Re-run to populate them.`);
      p();
    }

    p(`### Memory`);
    p();
    p(`| App | Idle RSS | RSS/item | Peak RSS | over | Drift | After idle |`);
    p(`|---|---:|---:|---:|---:|---:|---:|`);
    for (const { a, own } of rows) {
      p(
        `| **${a.displayName}** | ${mib(a.idle?.rssPeakBytes)} | **${mib(own.rssItemMedian)}** | ` +
          `${mib(own.rssPeak)} | ${own.rssItemN} entries | ` +
          `${Number.isFinite(own.rssDrift) ? `${own.rssDrift > 0 ? '+' : ''}${mib(own.rssDrift)}` : '—'} | ` +
          `${mib(a.idleAfter?.rssMedianBytes)} |`,
      );
    }
    p();
    p(`*RSS/item* is the median of the per-entry peaks and is the comparable number.`);
    p(`*Peak RSS* is the highest single-entry peak in the run: **not representative of**`);
    p(`**real-world usage**, since it is a high-water mark reached once, but it is the`);
    p(`number that decides whether the application fits in the RAM you have. Read it with`);
    p(`the *over* column beside it, which says how many entries the peak was taken over:`);
    p(`a run-wide peak rewards failing early, and an application that survived 21 entries`);
    p(`had fewer chances to spike than one that survived 31.`);
    p();
    p(`*Drift* is the median per-entry peak over the last third of the run minus the`);
    p(`first third. Every application here holds more memory the longer it runs, and this`);
    p(`states how much rather than letting it inflate the headline. It is measured with no`);
    p(`idle gap between entries, which is the harshest case: applications that release on`);
    p(`idle never get the chance to. *After idle* is the median footprint once the work`);
    p(`stops but before the process is killed, which is where that memory goes back.`);
    p();
    p(`These are taken over every measured entry, including failed ones, since a failure`);
    p(`still occupies a position in the session, and over the whole session rather than`);
    p(`the shared population. Entries merged from another run are excluded, because their`);
    p(`footprint is another process's.`);
    p();

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
  }

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
    // Scored against `expect`, not the status code: six entries are meant to fail, so a
    // refusal there is the right answer and bytes coming back is the wrong one.
    const glyph = {
      served: 'pass',
      'capability-gap': '**FAIL**',
      'correctly-rejected': 'refused',
      'wrongly-served': '**served**',
    };
    p(`## Capability matrix`);
    p();
    p(`Every entry scored against what it is supposed to do, not against its status code.`);
    p();
    p(`| | |`);
    p(`|---|---|`);
    p(`| \`pass\` | should stream, and did |`);
    p(`| **\`FAIL\`** | should stream, and did not |`);
    p(`| \`refused\` | unservable, and was refused |`);
    p(`| **\`served\`** | unservable, and bytes came back anyway |`);
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
        return it ? glyph[scoreOf(it)] : '·';
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
    const meta = results.corpus.selected.find((e) => e.id === id);
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
    const offsets = [...new Set(perApp.flatMap((x) => [...x.map.keys()]))];
    const consensus = new Map();
    for (const off of offsets) {
      const tally = {};
      for (const x of perApp) {
        const h = x.map.get(off);
        if (h) tally[h] = (tally[h] ?? 0) + 1;
      }
      const best = Object.entries(tally).sort((u, v) => v[1] - u[1])[0];
      if (best && best[1] >= 2) consensus.set(off, best[0]);
    }
    if (!consensus.size) continue;

    for (const x of perApp) {
      let agree = 0;
      let differ = 0;
      for (const [off, h] of consensus) {
        const mine = x.map.get(off);
        if (!mine) continue;
        if (mine === h) agree++;
        else differ++;
      }
      integrityRows.push({ id, app: x.app, agree, differ, total: agree + differ, directVideo });
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
  if (ran.length) {
    const pop = quorumPopulation(ran);
    const useQuorum = ran.length >= 2 && pop.ids.size >= 3;
    const gibOf = Object.fromEntries((results.corpus?.selected ?? []).map((e) => [e.id, e.postedGiB]));
    const medGiB = (ids) => med(ids.map((id) => gibOf[id]).filter(Number.isFinite));

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

      // Medians the summary withholds because they are not comparable across rows, with
      // the size of the distortion beside them.
      const own = summarise(a);
      if (own.n) {
        const shift =
          useQuorum && Number.isFinite(own.clickToByte) && own.clickToByte > 0
            ? (() => {
                const q = summarise(a, pop.ids);
                return Number.isFinite(q.clickToByte)
                  ? ` (shared population: ${ms(q.clickToByte)}, ${(q.clickToByte / own.clickToByte).toFixed(2)}×)`
                  : '';
              })()
            : '';
        p(
          `**Own set**: ${own.n} entries, median post ${num(medGiB(own.perfIds), 1)} GiB · ` +
            `click&rarr;byte ${ms(own.clickToByte)}${shift} · seq ${mbps(own.seqMBps)} MB/s · ` +
            `CPU ${num(own.cpuPerGB, 1)} s/GiB`,
        );
        p();
        if (shift) {
          p(`Medians over the entries *this application served*, so they are not comparable`);
          p(`across rows. Import and click&rarr;byte scale with post size, so an application`);
          p(`that fails the large entries is credited with the fast medians of the small ones`);
          p(`it survived; the multiplier is the size of that distortion.`);
          p();
        }
      }

      p(`| Entry | Import | Cold TTFB | Seq MB/s | Seek TTFB | Playback p05 | To buffer | CPU s/GiB | Peak RSS | Status |`);
      p(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---|`);
      for (const it of a.items) {
        // A rate from too short a transfer is printed but marked: not a sustained rate.
        const seq = Number.isFinite(it.sequential?.meanMBps)
          ? `${mbps(it.sequential.meanMBps)}${it.sequential.reliable === false ? '†' : ''}`
          : '—';
        p(
          `| \`${it.id}\` | ${ms(it.importMs)} | ${ms(it.coldOpen?.ttfbMs)} | ${seq} | ` +
            `${ms(it.seeks?.medianTtfbMs)} | ${mbps(it.playback?.p05MBps)} | ${ms(it.playback?.timeToBufferMs)} | ` +
            `${num(it.cpuSecondsPerGB, 1)} | ${mib(it.rssPeakBytes)} | ${it.status === 'ok' ? 'ok' : `**${it.status}**`} |`,
        );
      }
      p();
      if (a.items.some((i) => i.sequential?.reliable === false && Number.isFinite(i.sequential?.meanMBps))) {
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
