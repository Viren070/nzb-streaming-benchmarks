// Minimal streaming NZB parser. Corpus NZBs reach ~130 MB, so this walks the file in
// chunks rather than materialising a DOM.
import { createReadStream } from 'node:fs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function unescapeXml(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(\w+));/g, (m, dec, hex, name) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[name] ?? m;
  });
}

const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;

/** Parse an attribute string (the bit between the tag name and `>`) into an object. */
function attrs(s) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(s))) out[m[1].toLowerCase()] = unescapeXml(m[2]);
  return out;
}

/** Max sampled segments retained per file when not keeping all of them. */
const SAMPLE_CAP = 48;

const NODE_RE =
  /<meta\b([^>]*)>([\s\S]*?)<\/meta>|<file\b([^>]*)>|<\/file>|<group>([^<]*)<\/group>|<segment\b([^>]*)>([^<]*)<\/segment>/gi;

/**
 * Parse an NZB into { meta, files[] }. Only a bounded sample of segments is retained
 * unless `keepAllSegments` is set: every message-id of a 130 MB NZB costs hundreds of
 * MB, and static analysis never reads them.
 */
export async function parseNzb(path, { keepAllSegments = false } = {}) {
  const files = [];
  const meta = {};
  let cur = null;
  let tail = '';

  const stream = createReadStream(path, { encoding: 'latin1', highWaterMark: 1 << 20 });

  /** Consume every complete node in `buf`; returns the offset just past the last one. */
  const consume = (buf) => {
    NODE_RE.lastIndex = 0;
    let m;
    let consumedTo = 0;
    while ((m = NODE_RE.exec(buf))) {
      consumedTo = NODE_RE.lastIndex;
      if (m[1] !== undefined) {
        const t = attrs(m[1]).type;
        if (t) meta[t.toLowerCase()] = unescapeXml(m[2].trim());
      } else if (m[3] !== undefined) {
        const a = attrs(m[3]);
        cur = {
          subject: a.subject ?? '',
          poster: a.poster ?? '',
          date: Number(a.date ?? 0),
          groups: [],
          segments: [],
          lastSegment: null,
          stride: 1,
          segmentCount: 0,
          bytes: 0,
        };
        files.push(cur);
      } else if (m[0].toLowerCase() === '</file>') {
        cur = null;
      } else if (m[4] !== undefined) {
        if (cur) cur.groups.push(m[4].trim());
      } else if (m[5] !== undefined) {
        if (!cur) continue;
        const a = attrs(m[5]);
        const seg = { bytes: Number(a.bytes ?? 0), number: Number(a.number ?? 0), id: unescapeXml(m[6].trim()) };
        cur.segmentCount++;
        cur.bytes += seg.bytes;
        cur.lastSegment = seg;
        if (keepAllSegments) {
          cur.segments.push(seg);
          continue;
        }
        // Halving the sample and doubling the stride keeps survivors evenly spaced
        // however long the file turns out to be.
        if ((cur.segmentCount - 1) % cur.stride === 0) cur.segments.push(seg);
        if (cur.segments.length > SAMPLE_CAP) {
          cur.segments = cur.segments.filter((_, i) => i % 2 === 0);
          cur.stride *= 2;
        }
      }
    }
    return consumedTo;
  };

  for await (const chunk of stream) {
    const buf = tail + chunk;
    // Cutting at the last '<' instead would drop an element whenever a chunk boundary
    // falls between a segment's content and its closing tag.
    tail = buf.slice(consume(buf));
  }
  if (tail) consume(tail);

  return { meta, files };
}
