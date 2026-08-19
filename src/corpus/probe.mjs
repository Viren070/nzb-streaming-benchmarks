#!/usr/bin/env node
// Live probe: fetch the head of each NZB's primary archive (and, for 7z, its tail)
// off real NNTP, so the corpus can be curated on what the post *is* rather than on
// what its filenames claim. Also samples article availability.
//
//   node src/corpus/probe.mjs [analysis.json] [probe.json]

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../config.mjs';
import { NntpClient, ArticleNotFound } from '../nntp/client.mjs';
import { decodeArticle } from '../nntp/yenc.mjs';
import { parseNzb } from '../nzb/parse.mjs';
import { filenameFromSubject, classifyFile } from './classify.mjs';
import { sniffHead, classify7zHeader, describeContents, magicOf } from '../nzb/archive.mjs';

const analysisPath = resolve(process.argv[2] ?? 'corpus/analysis.json');
const outPath = resolve(process.argv[3] ?? 'corpus/probe.json');
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY ?? 6);
const AVAIL_SAMPLES = 16;

const { providers } = await loadConfig();
const provider = providers[0];

const analysis = JSON.parse(await readFile(analysisPath, 'utf8'));

/** Spread `n` picks evenly across an array. */
function spread(arr, n) {
  if (arr.length <= n) return arr.slice();
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

async function probeOne(conn, entry) {
  const res = { file: entry.file, packaging: entry.packaging };
  const nzb = await parseNzb(entry.path);

  const files = nzb.files.map((f) => {
    const name = filenameFromSubject(f.subject);
    return { ...f, name, ...classifyFile(name) };
  });

  const ARCHIVE = ['rar', '7z', 'zip', 'split', 'extensionless'];
  const archives = files.filter((f) => ARCHIVE.includes(f.kind) && f.segmentCount > 0);
  const videos = files.filter((f) => f.kind === 'video' && f.segmentCount > 0);

  // Candidate head volumes: named heads first, then NZB order (obfuscated posts have
  // no usable names, and the first posted file is nearly always volume 1).
  const named = archives.filter((f) => f.role === 'head');
  const candidates = [...named, ...archives.slice(0, 3), ...videos.slice(0, 1)]
    .filter((f, i, a) => a.indexOf(f) === i)
    .slice(0, 4);

  let head = null;
  let headSniff = null;
  for (const c of candidates) {
    const seg = c.segments[0];
    if (!seg) continue;
    try {
      const raw = await conn.body(seg.id);
      const dec = decodeArticle(raw);
      const s = sniffHead(dec.data);
      res.headBytes = dec.data.length;
      res.yencName = dec.name;
      res.yencSize = dec.size;
      if (s.magic !== 'unknown') {
        head = c;
        headSniff = s;
        break;
      }
      // Remember the first readable-but-unrecognised head as a fallback.
      if (!headSniff) {
        head = c;
        headSniff = s;
        res.headFirstBytes = dec.data.subarray(0, 16).toString('hex');
      }
    } catch (e) {
      res.headErrors = [...(res.headErrors ?? []), `${c.name || '(unnamed)'}: ${e.code ?? e.message}`];
    }
  }

  if (!headSniff) {
    res.status = 'head-unreadable';
    return res;
  }

  res.headFile = head.name || '(obfuscated)';
  res.magic = headSniff.magic;
  res.format = headSniff.format ?? headSniff.magic;

  if (headSniff.format === 'rar4' || headSniff.format === 'rar5') {
    res.encryptedHeaders = headSniff.encryptedHeaders;
    res.encrypted = headSniff.encrypted;
    res.solid = headSniff.solid;
    res.multiVolume = headSniff.volume;
    const entries = headSniff.entries ?? [];
    res.stored = entries.length ? entries.every((e) => e.stored) : undefined;
    res.methods = [...new Set(entries.map((e) => e.method))];
    Object.assign(res, describeContents(entries.map((e) => e.name).filter(Boolean)));
  } else if (headSniff.format === '7z') {
    res.nextHeaderOffset = headSniff.nextHeaderOffset;
    res.nextHeaderSize = headSniff.nextHeaderSize;
    res.archiveTotalSize = headSniff.totalSize;

    // The 7z metadata header occupies the final nextHeaderSize bytes of the whole
    // (concatenated) archive, so it lives in the last volume's last article.
    // Order by volume ordinal, not NZB order: posters interleave par2 and do not
    // reliably post volumes in sequence.
    const sevenz = files
      .filter((f) => f.kind === '7z' && f.segmentCount > 0)
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
    const lastVol = sevenz.length ? sevenz[sevenz.length - 1] : null;
    const lastSeg = lastVol?.lastSegment;
    res.lastVolume = lastVol?.name;
    if (lastSeg && headSniff.nextHeaderSize > 0) {
      try {
        const raw = await conn.body(lastSeg.id);
        const dec = decodeArticle(raw);
        if (headSniff.nextHeaderSize <= dec.data.length) {
          const header = dec.data.subarray(dec.data.length - headSniff.nextHeaderSize);
          const c = classify7zHeader(header);
          Object.assign(res, c);
          if (c.names) Object.assign(res, describeContents(c.names));
        } else {
          res.headerKind = 'header-larger-than-one-article';
        }
      } catch (e) {
        res.headerKind = `tail-unreadable (${e.code ?? e.message})`;
      }
    }
  }

  // Availability: sample across the biggest file's segments (that is the payload the
  // player would actually stream).
  const target = [...files].sort((a, b) => b.bytes - a.bytes)[0];
  if (target?.segments?.length) {
    const pool = [...target.segments, target.lastSegment].filter(Boolean);
    const picks = spread(pool, AVAIL_SAMPLES);
    res.targetFile = target.name || '(obfuscated)';
    res.targetSegments = target.segmentCount;
    let present = 0;
    let missing = 0;
    for (const s of picks) {
      try {
        (await conn.stat(s.id)) ? present++ : missing++;
      } catch {
        /* transport hiccup: not evidence either way */
      }
    }
    res.availability = { sampled: picks.length, present, missing };
  }

  res.status = res.availability?.missing ? 'degraded' : 'ok';
  return res;
}

const queue = analysis.filter((a) => !a.error);
const results = [];
let cursor = 0;
let done = 0;

async function worker(id) {
  let conn = null;
  const ensure = async () => {
    if (conn) return conn;
    conn = await new NntpClient({ ...provider, name: `probe-${id}` }).connect();
    return conn;
  };
  while (cursor < queue.length) {
    const entry = queue[cursor++];
    let out;
    try {
      out = await probeOne(await ensure(), entry);
    } catch (e) {
      // A dead socket must not poison the rest of this worker's queue.
      try {
        await conn?.close();
      } catch {}
      conn = null;
      out = { file: entry.file, packaging: entry.packaging, status: 'probe-error', error: String(e.message ?? e) };
    }
    results.push(out);
    done++;
    process.stderr.write(
      `[${String(done).padStart(3)}/${queue.length}] ${String(out.format ?? out.status).padEnd(12)} ` +
        `${out.encryptedHeaders ? 'HDRENC ' : out.encrypted ? 'ENC    ' : out.stored === false ? 'COMPR  ' : '       '}` +
        `${out.nested ? 'NESTED ' : '       '}` +
        `${out.availability ? `${out.availability.present}/${out.availability.sampled} ` : '     '}` +
        `${out.file.slice(0, 60)}\n`,
    );
  }
  await conn?.close();
}

await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

results.sort((a, b) => a.file.localeCompare(b.file));
await writeFile(outPath, JSON.stringify(results, null, 2));
process.stderr.write(`\nwrote ${outPath} (${results.length} entries)\n`);
