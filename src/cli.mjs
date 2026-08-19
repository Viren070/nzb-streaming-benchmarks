#!/usr/bin/env node
// usenet-benchmarks CLI.
//
//   node src/cli.mjs run [--apps=raw,altmount] [--tier=smoke] [--ids=a,b] [--out=results]
//   node src/cli.mjs report <run-dir>
//   node src/cli.mjs list
//
// Designed to be run unattended: no prompts, non-zero exit on failure.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from './config.mjs';
import { resolveAdapters, ADAPTERS, BY_ID } from './adapters/index.mjs';
import { gitUpdate } from './adapters/base.mjs';
import { runBenchmark, loadCorpus, DEFAULTS } from './runner/run.mjs';
import { renderMarkdown } from './report/markdown.mjs';

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
    else out._.push(a);
  }
  return out;
}

// A long unattended run must not die because one socket blipped. Transient network
// errors that escape a handler are recorded and swallowed; anything else is a real
// bug and still crashes, because silently continuing past those would produce
// numbers nobody should trust.
const TRANSIENT = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTCONN', 'ERR_STREAM_PREMATURE_CLOSE']);
export const runtimeWarnings = [];

function handleStray(kind) {
  return (err) => {
    const code = err?.code ?? err?.cause?.code;
    const entry = { kind, code, message: String(err?.message ?? err), at: new Date().toISOString() };
    if (TRANSIENT.has(code)) {
      runtimeWarnings.push(entry);
      console.error(`  [warn] swallowed ${kind} ${code}: ${entry.message}`);
      return;
    }
    console.error(`
fatal ${kind}:`, err);
    process.exit(1);
  };
}
process.on('unhandledRejection', handleStray('unhandledRejection'));
process.on('uncaughtException', handleStray('uncaughtException'));

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] ?? 'run';

if (args.help || cmd === 'help') {
  console.log(`usenet-benchmarks

  run      run the benchmark
    --apps=<ids|all>     comma-separated app ids (default: all)
    --tier=<tiers>       corpus tiers to include (default: smoke,core,negative,stress,failure)
    --ids=<ids>          specific corpus entry ids, overrides --tier and includes
                         optional entries by name
    --include-optional   also run entries marked optional (slow pathological cases)
    --order=<given|random>  app execution order (default: random, to spread drift)
    --seq-mb=<n>         sequential read cap in MiB (default ${DEFAULTS.sequentialBytes / 2 ** 20})
    --seq-secs=<n>       sequential read time cap (default ${DEFAULTS.sequentialMaxMs / 1000})
    --playback-secs=<n>  playback simulation length (default ${DEFAULTS.playbackSeconds})
    --seek-mb=<n>        bytes read at each seek point (default ${DEFAULTS.seekReadBytes / 2 ** 20});
                         the signal is TTFB, so a smaller read costs little
    --bitrate=<mbps>     playback bitrate target (default ${DEFAULTS.playbackBitrateMbps})
    --no-playback        skip the playback simulation
    --no-integrity       skip byte-identity hashing
    --update-apps        git fetch + reset --hard each app clone to its branch tip
                         before running, so results match the latest commit
    --rebuild            rebuild every app even if its commit is unchanged
                         (builds are otherwise reused, which is most of a run's time)
    --docker[=<ids>]     run apps in a container instead of from source. Bare
                         --docker means every app that has an image; --docker=a,b
                         picks specific ones. Source is still the default, so an app
                         that cannot be built here fails unless you ask for Docker.
                         Rows are marked runtime=docker; CPU and RSS are still
                         measured, from the container's own cgroup counters, but they
                         describe a process inside a Linux VM
    --env=<path>         .env with NNTP credentials (default .env)
    --providers=<ids>    restrict to these provider ids (default: all in .env)
    --conns=<n>          cap every provider's connections at n, identically for
                         every app. Without this they are compared at whatever
                         connection budget each happens to be configured with
    --cooldown=<secs>    pause between applications (default 15)
    --import-timeout=<secs>  per-item import budget (default 300)
    --item-timeout=<secs>    per-item total budget (default 600)
    --out=<dir>          results root (default results)

  report <run-dir>       re-render report.md from that run's results.json
  list                   list registered applications and corpus entries
`);
  process.exit(0);
}

if (cmd === 'list') {
  console.log('Applications:');
  for (const A of ADAPTERS) {
    console.log(
      `  ${A.id.padEnd(12)} ${A.displayName.padEnd(22)} ${A.language.padEnd(18)} ` +
        `serving=${A.serving.padEnd(12)} platforms=${A.platforms.join(',')}`,
    );
  }
  const dockerable = ADAPTERS.filter((A) => A.docker).map((A) => A.id);
  if (dockerable.length) {
    console.log(`\nAlso runnable in a container with --docker=<ids>: ${dockerable.join(', ')}`);
  }
  try {
    const corpus = await loadCorpus();
    console.log(`\nCorpus (${corpus.length} entries):`);
    for (const c of corpus) console.log(`  ${c.tier.padEnd(9)} ${c.id.padEnd(26)} ${String(c.postedGiB).padStart(7)} GiB  ${c.axes.join(',')}`);
  } catch {
    console.log('\nCorpus not built yet. Run: node src/corpus/analyze.mjs && node src/corpus/probe.mjs && node src/corpus/select.mjs');
  }
  process.exit(0);
}

if (cmd === 'report') {
  const dir = resolve(args._[1] ?? '');
  if (!args._[1]) {
    console.error('usage: node src/cli.mjs report <run-dir>');
    process.exit(2);
  }
  const results = JSON.parse(await readFile(join(dir, 'results.json'), 'utf8'));
  const md = renderMarkdown(results);
  await writeFile(join(dir, 'report.md'), md);
  console.log(join(dir, 'report.md'));
  process.exit(0);
}

if (cmd !== 'run') {
  console.error(`unknown command ${JSON.stringify(cmd)} (try --help)`);
  process.exit(2);
}

// ---------------------------------------------------------------- run

const { providers } = await loadConfig({ envPath: args.env ?? '.env', only: args.providers });
// A uniform connection budget is the single most important fairness control: an app
// allowed 100 connections is not comparable with one allowed 8.
if (args.conns) {
  for (const p of providers) p.maxConnections = Math.max(1, Number(args.conns));
}
let corpus = await loadCorpus();

if (args.ids) {
  // Naming an entry explicitly always includes it, optional or not.
  const want = new Set(String(args.ids).split(',').map((s) => s.trim()));
  corpus = corpus.filter((c) => want.has(c.id));
} else {
  if (args.tier) {
    const want = new Set(String(args.tier).split(',').map((s) => s.trim()));
    corpus = corpus.filter((c) => want.has(c.tier));
  }
  // Entries flagged `optional` are pathological cases that cost far more time than
  // they add information on a repeat run. They stay in the corpus and are one flag
  // away, rather than being deleted and forgotten.
  if (!args['include-optional']) {
    const skipped = corpus.filter((c) => c.optional).map((c) => c.id);
    corpus = corpus.filter((c) => !c.optional);
    if (skipped.length) console.log(`skipping optional entries: ${skipped.join(', ')} (use --include-optional)`);
  }
}
if (!corpus.length) {
  console.error('no corpus entries selected');
  process.exit(2);
}

let apps = resolveAdapters(args.apps);
if ((args.order ?? 'random') === 'random') {
  // Spread provider/link drift across applications instead of always penalising
  // whichever one happens to run last.
  for (let i = apps.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [apps[i], apps[j]] = [apps[j], apps[i]];
  }
}

const config = {
  ...DEFAULTS,
  sequentialBytes: args['seq-mb'] ? Number(args['seq-mb']) * 2 ** 20 : DEFAULTS.sequentialBytes,
  sequentialMaxMs: args['seq-secs'] ? Number(args['seq-secs']) * 1000 : DEFAULTS.sequentialMaxMs,
  playbackSeconds: args['playback-secs'] ? Number(args['playback-secs']) : DEFAULTS.playbackSeconds,
  seekReadBytes: args['seek-mb'] ? Number(args['seek-mb']) * 2 ** 20 : DEFAULTS.seekReadBytes,
  playbackBitrateMbps: args.bitrate ? Number(args.bitrate) : DEFAULTS.playbackBitrateMbps,
  skipPlayback: Boolean(args['no-playback']),
  skipIntegrity: Boolean(args['no-integrity']),
  appCooldownMs: args.cooldown !== undefined ? Number(args.cooldown) * 1000 : DEFAULTS.appCooldownMs,
  importTimeoutMs: args['import-timeout'] ? Number(args['import-timeout']) * 1000 : DEFAULTS.importTimeoutMs,
  itemTimeoutMs: args['item-timeout'] ? Number(args['item-timeout']) * 1000 : DEFAULTS.itemTimeoutMs,
  connectionsPerProvider: args.conns ? Number(args.conns) : null,
  rebuild: Boolean(args.rebuild),
};

const resultsRoot = resolve(args.out ?? 'results');
await mkdir(resultsRoot, { recursive: true });

// Per-app, never a blanket mode: a source row and a container row are not the same
// measurement, so which is which is recorded per app.
const dockerIds = new Set();
if (args.docker !== undefined) {
  const spec = args.docker === true ? 'all' : String(args.docker);
  const wanted = spec === 'all' ? ADAPTERS.filter((A) => A.docker).map((A) => A.id) : spec.split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of wanted) {
    if (!BY_ID[id]) {
      console.error(`--docker: unknown app ${JSON.stringify(id)}; known: ${Object.keys(BY_ID).join(', ')}`);
      process.exit(2);
    }
    if (!BY_ID[id].docker) {
      console.error(
        `--docker: ${id} has no container runtime. Apps that do: ` +
          `${ADAPTERS.filter((A) => A.docker).map((A) => A.id).join(', ')}`,
      );
      process.exit(2);
    }
    dockerIds.add(id);
  }
}

const adapters = apps.map((AdapterClass) => ({
  AdapterClass,
  ctx: {
    appDir: resolve('apps', AdapterClass.id),
    // Build output must survive start(), which wipes stateDir for a clean run.
    buildDir: resolve('build', AdapterClass.id),
    stateDir: resolve('state', AdapterClass.id),
    logDir: resolve(resultsRoot, 'logs'),
    providers,
    // Adapters poll for import completion themselves, so they need the same budget
    // the runner enforces or they give up first with a less specific message.
    options: { importTimeoutMs: config.importTimeoutMs, rebuild: config.rebuild },
    runtime: dockerIds.has(AdapterClass.id) ? 'docker' : 'source',
  },
}));

if (args['update-apps']) {
  console.log('updating app clones ...');
  for (const { AdapterClass, ctx } of adapters) {
    // `raw` is the in-harness NNTP baseline, not a checkout.
    if (!AdapterClass.repo) continue;
    try {
      const u = await gitUpdate(ctx.appDir);
      console.log(`  ${AdapterClass.id.padEnd(12)} ${u.branch} ${u.before} -> ${u.after}${u.changed ? '  (rebuild)' : '  (unchanged)'}`);
    } catch (e) {
      // A clone that cannot be updated is still runnable; say so and keep going rather
      // than losing the whole pass to one unreachable remote.
      console.log(`  ${AdapterClass.id.padEnd(12)} update FAILED: ${String(e.message).slice(0, 120)}`);
    }
  }
}

console.log(
  `corpus: ${corpus.length} entries · apps: ${apps.map((a) => (dockerIds.has(a.id) ? `${a.id} (docker)` : a.id)).join(', ')}`,
);

const { results, outDir } = await runBenchmark({
  adapters,
  corpus,
  providers,
  config,
  paths: { results: resultsRoot },
});

if (runtimeWarnings.length) {
  results.runtimeWarnings = runtimeWarnings;
  await writeFile(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`
${runtimeWarnings.length} transient network error(s) were swallowed; see runtimeWarnings in results.json`);
}

const md = renderMarkdown(results);
await writeFile(join(outDir, 'report.md'), md);

console.log(`\nreport: ${join(outDir, 'report.md')}`);
console.log(`json:   ${join(outDir, 'results.json')}`);

// Unattended callers need a signal: fail if nothing produced numbers.
const anyOk = results.apps.some((a) => a.status === 'ok' && a.items.some((i) => i.status === 'ok'));
process.exit(anyOk ? 0 : 1);
