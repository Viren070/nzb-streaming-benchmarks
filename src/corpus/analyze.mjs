#!/usr/bin/env node
// Walk corpus/pool, statically characterise every NZB, write corpus/analysis.json.
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseNzb } from '../nzb/parse.mjs';
import { analyse } from './classify.mjs';

const root = resolve(process.argv[2] ?? 'corpus/pool');
const out = resolve(process.argv[3] ?? 'corpus/analysis.json');

const entries = (await readdir(root)).filter((f) => f.toLowerCase().endsWith('.nzb'));
const results = [];
let i = 0;

for (const name of entries) {
  const path = join(root, name);
  i++;
  try {
    const { size } = await stat(path);
    const nzb = await parseNzb(path);
    const a = analyse(nzb, { path, sizeOnDisk: size });
    results.push(a);
    process.stderr.write(
      `[${String(i).padStart(3)}/${entries.length}] ${a.packaging.padEnd(18)} ` +
        `${String(a.fileCount).padStart(5)}f ${String(a.totalGiB).padStart(7)}G ` +
        `${a.obfuscation.join(',').padEnd(28)} ${name}\n`,
    );
  } catch (err) {
    results.push({ path, file: name, error: String(err?.message ?? err) });
    process.stderr.write(`[${i}/${entries.length}] ERROR ${name}: ${err?.message}\n`);
  }
}

results.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? ''));
await writeFile(out, JSON.stringify(results, null, 2));
process.stderr.write(`\nwrote ${out} (${results.length} entries)\n`);
