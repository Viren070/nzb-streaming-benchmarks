#!/usr/bin/env node
// Resolve the curated selection against the pool, copy the chosen NZBs into
// corpus/selected/, and emit corpus/corpus.json (the manifest the harness reads)
// plus docs/CORPUS.md (the human-readable rationale).
//
//   node src/corpus/select.mjs

import { readFile, writeFile, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { SELECTION } from './selection.mjs';

const POOL = resolve('corpus/pool');
const OUT = resolve('corpus/selected');
const analysis = JSON.parse(await readFile(resolve('corpus/analysis.json'), 'utf8'));
const probe = JSON.parse(await readFile(resolve('corpus/probe.json'), 'utf8'));

const byFile = Object.fromEntries(analysis.map((a) => [a.file, a]));
const probeBy = Object.fromEntries(probe.map((p) => [p.file, p]));
const pool = (await readdir(POOL)).filter((f) => f.toLowerCase().endsWith('.nzb'));

function resolveMatch(match) {
  const hits = pool.filter((f) => f.includes(match));
  if (!hits.length) throw new Error(`no pool file matches ${JSON.stringify(match)}`);
  if (hits.length === 1) return hits[0];
  const exact = hits.find((f) => f === match || f === `${match}.nzb`);
  if (exact) return exact;
  const originals = hits.filter((f) => !f.startsWith('dup_'));
  if (originals.length === 1) return originals[0];
  throw new Error(`ambiguous match ${JSON.stringify(match)} -> ${JSON.stringify(hits)}`);
}

async function sha256(path) {
  const h = createHash('sha256');
  h.update(await readFile(path));
  return h.digest('hex');
}

/**
 * Remove the `<meta type="password">` element from an NZB, building the "encrypted, no
 * password available" entry. No real post supplies that case: encrypted posts carry
 * their password, and password-less posts are unencrypted. Deleting the meta leaves the
 * article data untouched, so the password is the only variable.
 */
function stripPasswordMeta(xml) {
  const before = xml;
  const out = xml.replace(/[ \t]*<meta\b[^>]*type\s*=\s*"password"[^>]*>[\s\S]*?<\/meta>\s*\n?/gi, '');
  if (out === before) throw new Error('strip-password: no <meta type="password"> element found');
  if (/type\s*=\s*"password"/i.test(out)) throw new Error('strip-password: a password meta survived');
  return out;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const manifest = [];
const seen = new Set();

for (const sel of SELECTION) {
  const file = resolveMatch(sel.match);
  // A derived entry reuses its source's pool file, differing only by the transform.
  if (seen.has(file) && !sel.transform) throw new Error(`${file} selected twice (id ${sel.id})`);
  seen.add(file);

  const a = byFile[file];
  const p = probeBy[file] ?? {};
  if (!a) throw new Error(`${file} missing from analysis.json, rerun analyze`);

  const src = join(POOL, file);
  const destName = `${sel.id}.nzb`;
  const dest = join(OUT, destName);
  if (sel.transform === 'strip-password') {
    await writeFile(dest, stripPasswordMeta(await readFile(src, 'utf8')));
  } else {
    await copyFile(src, dest);
  }

  manifest.push({
    id: sel.id,
    tier: sel.tier,
    axes: sel.axes,
    why: sel.why,
    // What correct behaviour is for this entry. Refusing an unservable post is right,
    // and serving one means emitting bytes that cannot be the media, so the two cannot
    // both be scored as "not ok". Defaults from the tier, which `failure` overrides
    // per entry.
    expect: sel.expect ?? (sel.tier === 'negative' || sel.tier === 'failure' ? 'reject' : 'serve'),
    // Present only on entries with a verified missing article; drives measureHole.
    knownHole: sel.knownHole,
    // Excluded from default runs; include with --ids=<id> or --include-optional.
    optional: Boolean(sel.optional),
    nzb: `corpus/selected/${destName}`,
    sourceFile: file,
    // Hash what the harness reads, which for a derived entry is not the pool original.
    sha256: await sha256(dest),
    // How this entry was produced, if it is not the pool file verbatim.
    derivedFrom: sel.transform ? { sourceFile: file, transform: sel.transform } : undefined,
    // --- structure (static) ---
    sizeOnDisk: a.sizeOnDisk,
    fileCount: a.fileCount,
    segmentCount: a.segmentCount,
    postedBytes: a.totalBytes,
    postedGiB: a.totalGiB,
    // Expected size of the file an app should serve (largest non-par2 posted file).
    targetBytes: a.largestFileBytes,
    medianSegmentBytes: a.medianSegmentBytes,
    packaging: a.packaging,
    archiveSchemes: a.archiveSchemes,
    obfuscation: a.obfuscation,
    // Leaving the password here would hand it back through the adapter and undo the
    // transform.
    hasPasswordMeta: sel.transform === 'strip-password' ? false : a.hasPasswordMeta,
    password: sel.transform === 'strip-password' ? undefined : a.meta?.password,
    posted: a.posted,
    groups: a.groups,
    // --- verified against real articles ---
    probe: {
      format: p.format,
      magic: p.magic,
      stored: p.stored,
      methods: p.methods,
      encrypted: p.encrypted,
      encryptedHeaders: p.encryptedHeaders,
      headerKind: p.headerKind,
      headerEncrypted: p.headerEncrypted,
      nested: p.nested,
      nestedNames: p.nestedNames,
      innerNames: p.innerNames,
      targetFile: p.targetFile,
      availability: p.availability,
      status: p.status,
    },
  });
}

const corpus = {
  generatedBy: 'src/corpus/select.mjs',
  entries: manifest.length,
  tiers: [...new Set(manifest.map((m) => m.tier))],
  axes: [...new Set(manifest.flatMap((m) => m.axes))].sort(),
  note: 'Probe fields were measured against live NNTP; availability is a sampled STAT count and can drift as posts age. Re-run src/corpus/probe.mjs before trusting it.',
  items: manifest,
};
await writeFile(resolve('corpus/corpus.json'), JSON.stringify(corpus, null, 2));

// ---------------------------------------------------------------- CORPUS.md

const fmtGiB = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));
const tierOrder = ['smoke', 'core', 'negative', 'stress', 'failure'];
const tierBlurb = {
  smoke: 'Small and healthy. A full pass is cheap, so use these while iterating.',
  core: 'The main capability and performance matrix.',
  negative: 'Expected to fail on most applications. What is measured is *how* they fail.',
  stress: 'Pathological NZB structure or very large posts.',
  failure: 'Damaged or dead posts. Robustness only, never performance.',
};

let md = `# NZB corpus

${manifest.length} NZBs selected from a pool of ${pool.length}, chosen for **characteristic
coverage** rather than title. Every classification below was verified against live NNTP by
\`src/corpus/probe.mjs\` (archive headers actually fetched and parsed), not inferred from
filenames, which are frequently obfuscated and carry stale inline comments.

The NZBs themselves are gitignored. Regenerate with:

\`\`\`
node src/corpus/analyze.mjs     # static structure     -> corpus/analysis.json
node src/corpus/probe.mjs       # live archive probing -> corpus/probe.json
node src/corpus/select.mjs      # curate + manifest    -> corpus/corpus.json + this file
\`\`\`

Disc collections (BDMV/ISO packs) were deliberately excluded: they are not streaming
scenarios.

## Coverage

| Axis | Entries |
|---|---|
`;

const axisCount = {};
for (const m of manifest) for (const ax of m.axes) axisCount[ax] = (axisCount[ax] ?? 0) + 1;
for (const [ax, n] of Object.entries(axisCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  md += `| \`${ax}\` | ${n} |\n`;
}

for (const tier of tierOrder) {
  const items = manifest.filter((m) => m.tier === tier);
  if (!items.length) continue;
  md += `\n## ${tier}\n\n${tierBlurb[tier]}\n\n`;
  for (const m of items) {
    const pr = m.probe;
    const facts = [
      pr.format,
      pr.stored === true ? 'stored' : pr.stored === false ? `**${(pr.methods ?? []).join('/')}**` : null,
      pr.encryptedHeaders ? 'encrypted headers' : null,
      pr.headerEncrypted ? 'AES-encrypted header' : null,
      pr.encrypted && !pr.encryptedHeaders ? 'encrypted payload' : null,
      pr.headerKind && pr.headerKind !== 'plain' ? `header: ${pr.headerKind}` : null,
      pr.nested ? `nested: ${(pr.nestedNames ?? []).join(', ')}` : null,
      m.hasPasswordMeta ? 'password in NZB' : null,
    ].filter(Boolean);

    const avail = pr.availability
      ? `${pr.availability.present}/${pr.availability.sampled} sampled articles present`
      : 'availability not sampled';

    md += `### \`${m.id}\`\n\n`;
    md += `${m.why}\n\n`;
    md += `- **Axes**: ${m.axes.map((a) => `\`${a}\``).join(', ')}\n`;
    md += `- **Verified**: ${facts.join(' · ') || 'n/a'}\n`;
    md += `- **Size**: ${fmtGiB(m.postedGiB)} GiB posted · ${m.fileCount} files · ${m.segmentCount.toLocaleString('en-US')} segments · NZB ${(m.sizeOnDisk / 1024 / 1024).toFixed(1)} MB\n`;
    md += `- **Health**: ${avail}\n`;
    if (m.obfuscation.length) md += `- **Obfuscation**: ${m.obfuscation.map((o) => `\`${o}\``).join(', ')}\n`;
    md += `- **Source**: \`${m.sourceFile}\`\n`;
    md += `- **sha256**: \`${m.sha256.slice(0, 16)}…\`\n\n`;
  }
}

await mkdir(resolve('docs'), { recursive: true });
await writeFile(resolve('docs/CORPUS.md'), md);

console.log(`selected ${manifest.length} NZBs -> corpus/selected/`);
console.log(`wrote corpus/corpus.json and docs/CORPUS.md`);
for (const t of tierOrder) {
  const n = manifest.filter((m) => m.tier === t).length;
  if (n) console.log(`  ${t.padEnd(9)} ${n}`);
}
