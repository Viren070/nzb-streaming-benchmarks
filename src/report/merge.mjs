#!/usr/bin/env node
// Replace entries in a completed run with measurements from a later, narrower run.
//
//   node src/report/merge.mjs <base-run-dir> <patch-run-dir> [--out=<dir>]
//
// Only the entries the patch run measured are touched, and entries no longer in the
// corpus are dropped, so a corpus change costs one narrow run rather than a full pass.
// `mergedFrom` records what came from where; the renderer prints it.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderMarkdown } from './markdown.mjs';

const [baseDir, patchDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
if (!baseDir || !patchDir) {
  console.error('usage: node src/report/merge.mjs <base-run-dir> <patch-run-dir> [--out=<dir>]');
  process.exit(2);
}

const load = async (d) => JSON.parse(await readFile(join(resolve(d), 'results.json'), 'utf8'));
const base = await load(baseDir);
const patch = await load(patchDir);
const corpus = JSON.parse(await readFile(resolve('corpus/corpus.json'), 'utf8'));

const currentIds = new Set(corpus.items.map((i) => i.id));
const patchIds = new Set(patch.apps.flatMap((a) => (a.items ?? []).map((i) => i.id)));

const summary = { replaced: [], added: [], dropped: [], apps: [] };
// Keep corpus order so the report reads the same as an unmerged one.
const order = corpus.items.map((i) => i.id);
const inCorpusOrder = (items) => [...items].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));

for (const app of base.apps) {
  const from = patch.apps.find((p) => p.app === app.app);
  const items = app.items ?? [];

  // Scoped to this app: a patch that measured one application must not strip entries
  // from the others, which would leave them with no rows at all.
  const replacedIds = new Set((from?.items ?? []).map((i) => i.id));
  const kept = items.filter((i) => currentIds.has(i.id) && !replacedIds.has(i.id));
  for (const i of items) {
    if (!currentIds.has(i.id)) summary.dropped.push(`${app.app}/${i.id}`);
    else if (replacedIds.has(i.id)) summary.replaced.push(`${app.app}/${i.id}`);
  }

  // Stamped so the report can keep their memory out of process-level statistics.
  const incoming = (from?.items ?? [])
    .filter((i) => currentIds.has(i.id))
    .map((i) => ({ ...i, fromRun: patch.runId }));
  for (const i of incoming) summary.added.push(`${app.app}/${i.id}`);

  app.items = inCorpusOrder([...kept, ...incoming]);
  if (from) summary.apps.push(app.app);
}

// A run that died partway leaves applications with no rows at all, so a patch carrying
// one the base never recorded is appended whole rather than silently dropped.
for (const from of patch.apps) {
  if (base.apps.some((a) => a.app === from.app)) continue;
  const items = (from.items ?? []).filter((i) => currentIds.has(i.id)).map((i) => ({ ...i, fromRun: patch.runId }));
  if (!items.length) continue;
  base.apps.push({ ...from, items: inCorpusOrder(items) });
  summary.apps.push(from.app);
  for (const i of items) summary.added.push(`${from.app}/${i.id}`);
}

base.corpus = {
  ...base.corpus,
  selected: corpus.items
    .filter((i) => base.apps.some((a) => (a.items ?? []).some((it) => it.id === i.id)))
    .map((i) => ({ id: i.id, tier: i.tier, expect: i.expect, axes: i.axes, sha256: i.sha256, postedGiB: i.postedGiB })),
};

base.mergedFrom = [
  ...(base.mergedFrom ?? []),
  {
    runId: patch.runId,
    startedAt: patch.startedAt,
    finishedAt: patch.finishedAt,
    entries: [...patchIds].filter((id) => currentIds.has(id)),
    apps: summary.apps,
  },
];

const outDir = resolve(outArg ? outArg.slice('--out='.length) : baseDir);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'results.json'), JSON.stringify(base, null, 2));
await writeFile(join(outDir, 'report.md'), renderMarkdown(base));

const uniq = (xs) => [...new Set(xs.map((s) => s.split('/')[1]))];
console.log(`merged ${patch.runId} into ${base.runId}`);
console.log(`  replaced : ${uniq(summary.replaced).join(', ') || 'none'} (${summary.replaced.length} rows)`);
console.log(`  added    : ${uniq(summary.added).join(', ') || 'none'} (${summary.added.length} rows)`);
console.log(`  dropped  : ${uniq(summary.dropped).join(', ') || 'none'} (${summary.dropped.length} rows, no longer in the corpus)`);
console.log(join(outDir, 'report.md'));
