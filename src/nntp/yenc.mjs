// yEnc decoder. Scalar and deliberately simple, since the harness decodes only what it
// verifies, and the applications under test do their own decoding.

const LF = 0x0a;
const CR = 0x0d;
const EQ = 0x3d;

function parseKeywordLine(line) {
  const out = {};
  // `=ybegin part=1 line=128 size=524288000 name=with spaces.rar`: `name` runs to
  // end of line, everything else is a bare token.
  const nameIdx = line.indexOf('name=');
  const head = nameIdx === -1 ? line : line.slice(0, nameIdx);
  for (const m of head.matchAll(/(\w+)=(\S+)/g)) out[m[1]] = m[2];
  if (nameIdx !== -1) out.name = line.slice(nameIdx + 5).trim();
  return out;
}

/**
 * Decode a raw article body.
 * Returns { data, begin, end, size, name, part, crc32, trailerOk }.
 * `begin`/`end` are the 1-based inclusive byte range this part covers in the
 * original file (from `=ypart`); absent on single-part articles.
 */
export function decodeArticle(raw) {
  const out = Buffer.allocUnsafe(raw.length);
  let o = 0;
  let i = 0;
  let header = null;
  let part = null;
  let trailer = null;

  while (i < raw.length) {
    let eol = raw.indexOf(LF, i);
    if (eol === -1) eol = raw.length;
    let lineEnd = eol;
    if (lineEnd > i && raw[lineEnd - 1] === CR) lineEnd--;

    // Keyword lines start with "=y".
    if (raw[i] === EQ && raw[i + 1] === 0x79) {
      const line = raw.toString('latin1', i, lineEnd);
      if (line.startsWith('=ybegin')) header = parseKeywordLine(line);
      else if (line.startsWith('=ypart')) part = parseKeywordLine(line);
      else if (line.startsWith('=yend')) trailer = parseKeywordLine(line);
      i = eol + 1;
      continue;
    }

    for (let p = i; p < lineEnd; p++) {
      let c = raw[p];
      if (c === EQ) {
        p++;
        if (p >= lineEnd) break;
        c = (raw[p] - 64) & 0xff;
      }
      out[o++] = (c - 42) & 0xff;
    }
    i = eol + 1;
  }

  const begin = part?.begin ? Number(part.begin) : undefined;
  const end = part?.end ? Number(part.end) : undefined;
  return {
    data: out.subarray(0, o),
    begin,
    end,
    size: header?.size ? Number(header.size) : undefined,
    name: header?.name,
    part: header?.part ? Number(header.part) : undefined,
    crc32: trailer?.pcrc32 ?? trailer?.crc32,
    // A truncated article still decodes; the trailer is how we know it was whole.
    trailerOk: Boolean(trailer) && (trailer.size === undefined || Number(trailer.size) === o),
  };
}
