// Static (offline) characterisation of an NZB: what kind of post is this, how is it
// packaged, and how obfuscated is it. Anything that needs article bodies (encryption,
// stored-vs-compressed, nesting) is left to the live probe.

const VIDEO_EXT = /\.(mkv|mp4|avi|ts|m2ts|mpg|mpeg|wmv|mov|m4v|vob|flv|webm)$/i;
const SUB_EXT = /\.(srt|sub|idx|ass|ssa|sup|vtt)$/i;
const JUNK_EXT = /\.(nfo|sfv|jpg|jpeg|png|gif|txt|url|md5|sample|nzb|log|diz|srr)$/i;

/** Pull the posted filename out of an NZB subject line. */
export function filenameFromSubject(subject) {
  if (!subject) return '';
  // Most posters quote the filename; prefer the quoted run that looks like a file.
  const quoted = [...subject.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (quoted.length) {
    const withExt = quoted.filter((q) => /\.[A-Za-z0-9]{1,8}$/.test(q));
    return (withExt.length ? withExt[withExt.length - 1] : quoted[quoted.length - 1]).trim();
  }
  // Unquoted: the token immediately before "yEnc" is the filename.
  const y = subject.match(/(\S+)\s+yEnc\b/i);
  if (y) return y[1].trim();
  const noCounter = subject.replace(/\(\d+\/\d+\)\s*$/, '').replace(/\[\d+\/\d+\]/g, '').trim();
  return noCounter.split(/\s+/).pop() ?? '';
}

export function classifyFile(name) {
  const lower = (name || '').trim().toLowerCase();
  if (/\.par2$/i.test(lower)) {
    return { kind: 'par2', role: /\.vol\d+[+-]\d+\.par2$/i.test(lower) ? 'par2-recovery' : 'par2-index' };
  }
  if (/\.7z$/i.test(lower)) return { kind: '7z', role: 'head' };
  if (/\.7z\.\d{3,}$/i.test(lower)) {
    const ord = Number(lower.match(/\.7z\.(\d{3,})$/)[1]);
    return { kind: '7z', role: ord === 1 ? 'head' : 'volume', ordinal: ord, scheme: '7z.NNN' };
  }
  if (/\.part\d+\.rar$/i.test(lower)) {
    const ord = Number(lower.match(/\.part(\d+)\.rar$/)[1]);
    return { kind: 'rar', role: ord === 1 ? 'head' : 'volume', ordinal: ord, scheme: 'partNN' };
  }
  if (/\.rar$/i.test(lower)) return { kind: 'rar', role: 'head', ordinal: 0, scheme: 'rar+rNN' };
  if (/\.r\d{2,3}$/i.test(lower)) {
    const ord = Number(lower.match(/\.r(\d{2,3})$/)[1]);
    return { kind: 'rar', role: 'volume', ordinal: ord + 1, scheme: 'rar+rNN' };
  }
  // Letter rollover past .r99 (r99 -> s00 -> t00 ...), seen on PHM-style posts.
  if (/\.[s-z]\d{2}$/i.test(lower)) {
    const letter = lower.charCodeAt(lower.length - 3);
    const ord = (letter - 115 + 1) * 100 + Number(lower.slice(-2));
    return { kind: 'rar', role: 'volume', ordinal: ord, scheme: 'letter-rollover' };
  }
  if (/\.zip$/i.test(lower)) return { kind: 'zip', role: 'head' };
  if (/\.z\d{2}$/i.test(lower)) return { kind: 'zip', role: 'volume' };
  if (/\.\d{3,}$/i.test(lower)) {
    const ord = Number(lower.match(/\.(\d{3,})$/)[1]);
    return { kind: 'split', role: ord === 1 ? 'head' : 'volume', ordinal: ord, scheme: 'numeric' };
  }
  if (VIDEO_EXT.test(lower)) return { kind: 'video', role: 'media' };
  if (/\.iso$/i.test(lower)) return { kind: 'iso', role: 'media' };
  if (SUB_EXT.test(lower)) return { kind: 'subtitle', role: 'aux' };
  if (JUNK_EXT.test(lower)) return { kind: 'aux', role: 'aux' };
  if (!/\.[A-Za-z0-9]{1,8}$/.test(lower)) return { kind: 'extensionless', role: 'unknown' };
  return { kind: 'other', role: 'unknown' };
}

const HEXISH = /^[a-f0-9]{16,}$/i;
const RANDOMISH = /^[A-Za-z0-9_+-]{12,}$/;

function stemOf(n) {
  return n.replace(/\.[A-Za-z0-9]{1,8}$/, '');
}

function obfuscationFlags(names, subjects) {
  const flags = new Set();
  const total = names.length || 1;

  const noExt = names.filter((n) => !/\.[A-Za-z0-9]{1,8}$/.test(n)).length;
  const hex = names.filter((n) => HEXISH.test(stemOf(n))).length;
  const random = names.filter((n) => {
    const stem = stemOf(n);
    return RANDOMISH.test(stem) && !/[. ]/.test(stem) && !/^[A-Za-z]+$/.test(stem);
  }).length;
  const unquoted = subjects.filter((s) => s.indexOf('"') === -1).length;

  if (noExt / total > 0.5) flags.add('extensionless-names');
  if (hex / total > 0.4) flags.add('hex-names');
  if (random / total > 0.4) flags.add('random-stems');
  if (unquoted / total > 0.5) flags.add('unquoted-subjects');

  // A subject carrying no readable release title at all.
  const readable = subjects.filter((s) => /[A-Za-z]{3,}[. _][A-Za-z0-9]/.test(s)).length;
  if (readable / total < 0.3) flags.add('opaque-subjects');

  // Every file posted under a distinct stem defeats name-based volume grouping.
  const stems = new Set(names.map((n) => stemOf(n).replace(/\d+$/, '')));
  if (names.length > 4 && stems.size / total > 0.8) flags.add('per-file-unique-stems');

  return [...flags];
}

export function analyse(nzb, { path, sizeOnDisk }) {
  const files = nzb.files.map((f) => {
    const name = filenameFromSubject(f.subject);
    return { ...f, name, ...classifyFile(name) };
  });

  const byKind = {};
  for (const f of files) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;

  const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
  const segmentCount = files.reduce((a, f) => a + f.segmentCount, 0);

  // Dominant segment size. Uniform slicing is the norm; wild variance signals a
  // filled/patched post or a segment-per-file post.
  const segSizes = files.flatMap((f) => f.segments.map((s) => s.bytes)).filter(Boolean).sort((a, b) => a - b);
  const medianSeg = segSizes.length ? segSizes[segSizes.length >> 1] : 0;
  const oneSegFiles = files.filter((f) => f.segmentCount === 1).length;

  // Biggest single posted file. This is what an app should actually serve, and it
  // is the right yardstick for "did it serve the media or a placeholder": the whole
  // post is not, because one episode of a season pack is legitimately 1-3% of it.
  const payload = files.filter((f) => f.kind !== 'par2');
  const largestFileBytes = payload.length ? Math.max(...payload.map((f) => f.bytes)) : 0;

  const ARCHIVE = ['rar', '7z', 'zip', 'split'];
  const archiveFiles = files.filter((f) => ARCHIVE.includes(f.kind));
  const videoFiles = files.filter((f) => f.kind === 'video');
  const par2Files = files.filter((f) => f.kind === 'par2');
  const schemes = [...new Set(archiveFiles.map((f) => f.scheme).filter(Boolean))];

  let packaging = 'unknown';
  if (byKind.rar) packaging = 'rar';
  else if (byKind['7z']) packaging = '7z';
  else if (byKind.zip) packaging = 'zip';
  else if (byKind.split) packaging = 'split';
  else if (videoFiles.length) packaging = 'direct';
  else if (byKind.iso) packaging = 'iso';
  else if (byKind.extensionless) packaging = 'obfuscated-unknown';

  const obfuscation = obfuscationFlags(files.map((f) => f.name), files.map((f) => f.subject));

  const dates = files.map((f) => f.date).filter(Boolean);
  const posted = dates.length ? new Date(Math.min(...dates) * 1000).toISOString().slice(0, 10) : null;

  const groups = [...new Set(files.flatMap((f) => f.groups))];
  const posters = [...new Set(files.map((f) => f.poster))];

  // The head volume of the primary archive set is what the live probe should fetch.
  const head = archiveFiles.find((f) => f.role === 'head') ?? archiveFiles[0] ?? videoFiles[0] ?? files[0];

  return {
    path,
    file: path.split(/[\\/]/).pop(),
    sizeOnDisk,
    meta: nzb.meta,
    hasPasswordMeta: Boolean(nzb.meta.password),
    fileCount: files.length,
    segmentCount,
    totalBytes,
    totalGiB: +(totalBytes / 2 ** 30).toFixed(2),
    medianSegmentBytes: medianSeg,
    largestFileBytes,
    oneSegmentFiles: oneSegFiles,
    packaging,
    archiveSchemes: schemes,
    counts: byKind,
    archiveVolumes: archiveFiles.length,
    videoCount: videoFiles.length,
    par2Count: par2Files.length,
    par2Bytes: par2Files.reduce((a, f) => a + f.bytes, 0),
    obfuscation,
    posted,
    groups,
    posterCount: posters.length,
    samplePoster: posters[0] ?? '',
    sampleSubjects: files.slice(0, 2).map((f) => f.subject),
    sampleNames: files.slice(0, 8).map((f) => f.name),
    probeTarget: head
      ? { name: head.name, kind: head.kind, messageId: head.segments[0]?.id ?? null, groups: head.groups, bytes: head.bytes }
      : null,
  };
}
