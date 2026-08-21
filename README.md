# nzb-streaming-benchmarks

Reproducible performance and capability benchmarking of NZB streaming solutions,
against a **real NNTP provider** and a **hand-curated, adversarial NZB corpus**.

## [Latest results](docs/RESULTS.md)

**[docs/RESULTS.md](docs/RESULTS.md)** is a full pass of 10 applications over 31 corpus
entries, run 2026-08-21 against Newshosting at a normalised 20 connections each. It
reports latency, seek behaviour, throughput, memory, CPU per GiB delivered and a
capability matrix, and it states its own limits: which rows came from a container, which
were merged from a second sitting, and which one should not be read as a like-for-like
result at all.

Read it with three things in mind:

- **`raw` is the ceiling, not a competitor.** It is this harness pulling the same
  articles with no application in the middle. Absolute MB/s means nothing without it.
- **Correct is not the same as served.** Six entries are built to be unservable; refusing
  those is the right answer, and serving one is a worse result than failing.
- **Every headline median is over the same entries.** Rows are not medians of whatever
  each application happened to survive; where one missed an entry, its `n` says so.

## Corpus

[docs/CORPUS.md](docs/CORPUS.md) documents every entry and why it earns its place:
stored and compressed RAR, 7z, obfuscated and extensionless names, encrypted headers,
split volumes, a season pack, a 513 GiB pack, a dead post, and one otherwise-intact
10 GiB release with **exactly one** article missing from every provider.

**The NZBs themselves are not published here**, and neither are the generated manifests
(`corpus/`, gitignored). They are third-party copyrighted material and the manifests
carry archive passwords. What is committed is the selection logic in
`src/corpus/selection.mjs` and the documented rationale in docs/CORPUS.md, which is
enough to rebuild an equivalent corpus from your own pool: point `corpus/pool/` at your
NZBs and run the three corpus stages below. Results will not be numerically comparable
to the published run, since they will be different posts on a different day.

See [docs/APPS.md](docs/APPS.md) for how each application is driven, what it needs to
build, and the quirks each one hides.

## Quick start

```bash
cp .env.example .env          # add real NNTP credentials
npm run clone                 # clone all 9 applications under test into apps/

# build the corpus (one-off; the probe stage hits live NNTP)
node src/corpus/analyze.mjs   # static structure   -> corpus/analysis.json
node src/corpus/probe.mjs     # live archive probe -> corpus/probe.json
node src/corpus/select.mjs    # curate + manifest  -> corpus/corpus.json, docs/CORPUS.md

node src/cli.mjs list                              # apps + corpus
node src/cli.mjs run --apps=raw --tier=smoke       # quick sanity pass
node src/cli.mjs run --update-apps --conns=20      # everything, on the latest commits
node src/cli.mjs report results/<run-id>           # re-render report.md
```

Requires **Node 20 or newer** and nothing else: the harness has zero runtime
dependencies. The applications need their own toolchains (Go with cgo, .NET, pnpm);
see [docs/APPS.md](docs/APPS.md).

Every application can also run **in a container** instead of from source, so you can
benchmark without installing Go, .NET, pnpm and a C toolchain first:

```sh
node src/cli.mjs run --docker                     # all of them in containers
node src/cli.mjs run --docker=decypharr,comet     # just these two
```

Source remains the default and Docker is the secondary option. Two applications cannot
be built on every host: comet has no Windows build, and decypharr needs the WinFsp kernel
driver to compile on Windows. Without `--docker` those fail with the reason rather than
quietly becoming a container row. Container rows are marked `runtime: docker` and the
report explains what is and is not comparable; see
[running in a container](docs/APPS.md#running-in-a-container).

## What it measures

| Group | Metrics |
|---|---|
| Latency | import time, cold open, warm open, TTFB |
| Seek | TTFB at 1/25/50/75/95% plus a backward seek, median and worst |
| Throughput | sustained MB/s, p05 windowed MB/s, throughput after a seek |
| Playback | simulated player at a target bitrate: time-to-buffer, seconds below bitrate |
| CPU | CPU-seconds per GiB delivered, plus the shape of the draw: sustained cores, worst second, and how much of the time it sits near its peak |
| Memory | idle RSS, per-entry RSS, run peak, drift, footprint after idle |
| Correctness | capability matrix, byte-identity consensus across applications |
| Damage | behaviour at a known missing article: zero-fill, truncation, or repair |

Every report embeds the provider, system specs, application versions, corpus manifest
and run settings, so a number is never separated from the conditions that produced it.

### Correct is not the same as served

Six corpus entries are built to be unservable: compressed archives, an encrypted post
with no password, a dead post, a severely damaged one, and an incomplete archive set.
Refusing those is the right answer, and serving one means emitting bytes that cannot be
the media. Each entry therefore carries an `expect` of `serve` or `reject`, and the
report scores four outcomes rather than pass/fail: served, capability gap, correctly
rejected, and wrongly served.

### Medians are taken over different populations

An application that fails the large entries is otherwise credited with the fast medians
of the small ones it survived, because import time scales with post size. The summary
therefore fixes the population: every headline median is taken over the entries at least
90% of the applications served, and an application that missed one of them shows it as
`n`. The strict intersection is not used, because it is defined by the weakest engine in
the field, so one broken application collapses the population for everybody and the set
moves between runs. Each application's own-set medians, and the size of the gap between
the two, are published per application rather than in the headline.

### The `raw` baseline

`raw` is not an application. It is this harness pulling the same articles straight off
NNTP and serving them over a local HTTP server, measured by identical code. It is the
transport ceiling: without it, absolute MB/s says nothing about how much headroom the
link had that day.

For archived posts `raw` deliberately serves the **outer volume stream** rather than the
inner file, because unpacking archives is exactly the work the applications are being
compared on.

## Layout

```
corpus/        pool/ (all NZBs), selected/ (curated), analysis.json, probe.json, corpus.json
src/
  cli.mjs      entry point
  config.mjs   provider config from .env
  nntp/        minimal NNTP client + yEnc decoder
  nzb/         streaming NZB parser + RAR/7z header sniffing
  corpus/      static analysis, live probing, curation
  adapters/    one module per application, the extension point
  metrics/     system specs, process sampler, HTTP timing
  runner/      orchestration + measurement definitions
  report/      markdown renderer (same JSON feeds a future web view)
apps/          cloned applications under test (gitignored)
results/       per-run results.json + report.md
```

## Adding an application

Write one module in `src/adapters/` extending `Adapter` and register it in
`src/adapters/index.mjs`. Nothing else changes: timing, sampling, verification and
reporting are shared, which is what makes the comparison fair.

```js
export default class MyAppAdapter extends Adapter {
  static id = 'myapp';
  static displayName = 'MyApp';
  static language = 'Go';
  static platforms = ['win32', 'linux'];

  buildArtifacts() { return []; }    // files that let a build be reused
  async prepare() {}                 // build from source
  async start() {}                   // launch + wait for readiness
  async addNzb(item) {}              // import, return a handle
  async resolve(handle) {}           // -> { url, headers, fileName, sizeBytes }
  async reset() {}                   // drop caches between cold measurements
}
```

## Unattended use

`node src/cli.mjs run` takes no input, prompts for nothing, writes
`results/<timestamp>/{results.json,report.md}`, and exits non-zero if nothing produced
numbers, which suits cron or CI. Application order is randomised by default so provider
drift is not charged to whichever application happens to run last.

## Honesty rules

- Skipped or failed measurements appear in the report **with their reason**, never as a
  blank.
- Transfers too short to measure a sustained rate are flagged, not quoted.
- Results from a different runtime (Docker) are tagged `runtime: docker`, and the report
  states what that changes, rather than being mixed silently into the native comparison.
  Their CPU and memory are still measured, from the container's own cgroup counters.
- `failure` and `negative` tier entries never contribute to headline performance.
- Verdicts that depend on hitting an exact byte offset are checked against hashes of
  the real bytes either side, so a wrong offset cannot be reported as a clean pass.
