// The `raw` baseline: no application at all.
//
// Serves the target file straight off NNTP through our own minimal client, over a
// local HTTP server, so it is measured by exactly the same code as every real app.
// Its purpose is to answer "how much of the gap is the app, and how much was just
// the link that day". Absolute MB/s means nothing without this row.
//
// Note on scope: for archived posts this serves the *outer volume stream*, not the
// inner file, because unpacking archives is precisely the work the applications are
// being compared on. Treat it as the transport ceiling, not a feature-complete peer.

import http from 'node:http';
import { Adapter, allocPort } from './base.mjs';
import { NntpClient, ArticleNotFound } from '../nntp/client.mjs';
import { decodeArticle } from '../nntp/yenc.mjs';
import { parseNzb } from '../nzb/parse.mjs';
import { filenameFromSubject, classifyFile } from '../corpus/classify.mjs';

/** Fixed-size pool of NNTP connections handing out one command at a time. */
class ConnPool {
  #idle = [];
  #waiters = [];
  #opened = 0;

  constructor(provider, size) {
    this.provider = provider;
    this.size = size;
  }

  async acquire() {
    const c = this.#idle.pop();
    if (c) return c;
    if (this.#opened < this.size) {
      this.#opened++;
      try {
        return await new NntpClient(this.provider).connect();
      } catch (e) {
        this.#opened--;
        throw e;
      }
    }
    return new Promise((res) => this.#waiters.push(res));
  }

  release(c, broken = false) {
    if (broken) {
      this.#opened--;
      try {
        c?.close();
      } catch {
        /* already gone */
      }
      // Wake a waiter so it can dial a replacement rather than block forever. The
      // dial can fail; put the waiter back rather than rejecting into the void.
      const w = this.#waiters.shift();
      if (w) {
        this.acquire().then(w, () => this.#waiters.unshift(w));
      }
      return;
    }
    const w = this.#waiters.shift();
    if (w) w(c);
    else this.#idle.push(c);
  }

  async close() {
    for (const c of this.#idle) {
      try {
        await c.close();
      } catch {
        /* ignore */
      }
    }
    this.#idle = [];
  }

  get opened() {
    return this.#opened;
  }
}

class RawFile {
  constructor(pool, segments, concurrency) {
    this.pool = pool;
    this.segments = segments;
    this.concurrency = concurrency;
    this.partSize = null;
    this.size = null;
    this.bytesFetched = 0;
  }

  async fetchSegment(index) {
    const seg = this.segments[index];
    if (!seg) return null;
    const conn = await this.pool.acquire();
    let broken = false;
    try {
      const raw = await conn.body(seg.id);
      this.bytesFetched += raw.length;
      return decodeArticle(raw);
    } catch (e) {
      if (!(e instanceof ArticleNotFound)) broken = true;
      if (e instanceof ArticleNotFound) return { missing: true, data: Buffer.alloc(0) };
      throw e;
    } finally {
      this.pool.release(conn, broken);
    }
  }

  async open() {
    const first = await this.fetchSegment(0);
    if (!first || first.missing) throw new Error('first article missing');
    // Posters emit fixed-size parts; =ypart gives the exact grid when present.
    this.partSize = first.end && first.begin ? first.end - first.begin + 1 : first.data.length;

    if (this.segments.length === 1) {
      this.size = first.size ?? first.data.length;
    } else if (this.singleFile && first.size) {
      // One <file> element: its =ybegin size= is the authoritative total.
      this.size = first.size;
    } else {
      // Concatenated group: the grid is uniform, so only the tail length is unknown.
      const last = await this.fetchSegment(this.segments.length - 1);
      const tail = last && !last.missing ? last.data.length : this.partSize;
      this.size = this.partSize * (this.segments.length - 1) + tail;
    }
    return { size: this.size, partSize: this.partSize };
  }

  /** Stream [start, end] inclusive into `res`, fetching ahead in parallel. */
  async stream(start, end, res) {
    const startIdx = Math.min(this.segments.length - 1, Math.floor(start / this.partSize));
    let offset = startIdx * this.partSize;
    let idx = startIdx;
    let written = 0;
    const want = end - start + 1;

    const inflight = new Map();
    const pump = () => {
      while (inflight.size < this.concurrency && idx + inflight.size < this.segments.length) {
        const i = idx + inflight.size;
        // Read-ahead means some of these are never consumed once the range is satisfied
        // first, or the client hangs up. An unconsumed rejection would surface as an
        // unhandled rejection and take the whole benchmark process down, so capture
        // the error into the value and rethrow only if we actually reach it.
        inflight.set(
          i,
          this.fetchSegment(i).catch((error) => ({ error })),
        );
      }
    };

    pump();
    while (written < want && idx < this.segments.length) {
      const p = inflight.get(idx);
      inflight.delete(idx);
      const dec = await p;
      if (dec?.error) throw dec.error;
      idx++;
      pump();

      const data = dec?.data ?? Buffer.alloc(0);
      // A missing article leaves a hole; emit zeros so byte offsets stay honest.
      const chunk = dec?.missing ? Buffer.alloc(this.partSize) : data;

      const chunkStart = offset;
      offset += chunk.length;
      const from = Math.max(0, start - chunkStart);
      if (from >= chunk.length) continue;
      const take = Math.min(chunk.length - from, want - written);
      const slice = chunk.subarray(from, from + take);
      written += slice.length;
      if (!res.write(slice)) await new Promise((r) => res.once('drain', r));
    }
    res.end();
  }
}

export default class RawAdapter extends Adapter {
  static id = 'raw';
  static displayName = 'raw NNTP baseline';
  static language = 'JavaScript (this harness)';
  static repo = '(built in)';
  static platforms = ['win32', 'linux', 'darwin'];
  static serving = 'http-range';

  #server = null;
  #items = new Map();
  #pool = null;

  async version() {
    return { version: 'harness-builtin', commit: undefined };
  }

  /** The raw baseline runs inside the harness, so sample our own process. */
  processIds() {
    return [process.pid];
  }

  async start() {
    const provider = this.providers[0];
    const conns = Number(this.options?.connections ?? Math.min(provider.maxConnections, 20));
    this.concurrency = conns;
    this.#pool = new ConnPool(provider, conns);

    this.port = await allocPort();
    this.#server = http.createServer(async (req, res) => {
      const id = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
      const file = this.#items.get(id);
      if (!file) {
        res.writeHead(404).end('unknown item');
        return;
      }
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
      const start = m ? Number(m[1]) : 0;
      const end = m && m[2] ? Math.min(Number(m[2]), file.size - 1) : file.size - 1;
      const partial = Boolean(m);

      res.writeHead(partial ? 206 : 200, {
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${file.size}` } : {}),
      });
      try {
        await file.stream(start, end, res);
      } catch (e) {
        res.destroy(e);
      }
    });
    await new Promise((r) => this.#server.listen(this.port, '127.0.0.1', r));
  }

  async stop() {
    await new Promise((r) => this.#server?.close(r));
    await this.#pool?.close();
    this.#server = null;
  }

  async addNzb(item) {
    const nzb = await parseNzb(item.path, { keepAllSegments: true });
    const files = nzb.files.map((f) => {
      const name = filenameFromSubject(f.subject);
      return { ...f, name, ...classifyFile(name) };
    });

    // Posters routinely split one video across many <file> elements under the same
    // name, so group by name before choosing a target, or the baseline would
    // serve a single 100 MB chunk while the applications serve the whole movie.
    const groups = new Map();
    for (const f of files) {
      if (f.kind === 'par2') continue;
      const key = `${f.kind}:${f.name}`;
      if (!groups.has(key)) groups.set(key, { kind: f.kind, name: f.name, files: [], bytes: 0 });
      const g = groups.get(key);
      g.files.push(f);
      g.bytes += f.bytes;
    }
    const all = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
    // Obfuscated posts hide directly-posted video behind extensionless names, so
    // trust the corpus probe's magic-byte verdict over the filename classification.
    const probedMagic = item.item?.probe?.magic;
    const probedDirectVideo = ['matroska', 'mp4', 'mpegts'].includes(probedMagic);
    const video = all.filter((g) => g.kind === 'video')[0];
    const target = video ?? all[0];
    if (!target) throw new Error('no usable file in NZB');
    const isDirectVideo = Boolean(video) || probedDirectVideo;

    // Concatenate in NZB order, each file's own segments in part order.
    const segments = target.files.flatMap((f) => f.segments.slice().sort((a, b) => a.number - b.number));
    const file = new RawFile(this.#pool, segments, this.concurrency);
    file.singleFile = target.files.length === 1;
    await file.open();
    this.#items.set(item.id, file);
    return {
      id: item.id,
      fileName: target.name,
      sizeBytes: file.size,
      note: isDirectVideo
        ? `direct video (${target.files.length} posted part${target.files.length === 1 ? '' : 's'})`
        : 'outer archive volume stream (transport ceiling, not the inner file)',
      directVideo: isDirectVideo,
    };
  }

  async resolve(handle) {
    return {
      url: `http://127.0.0.1:${this.port}/${encodeURIComponent(handle.id)}`,
      fileName: handle.fileName,
      sizeBytes: handle.sizeBytes,
      note: handle.note,
      // For an archived post this serves one outer volume, not the assembled inner
      // file, so the runner's placeholder-size check does not apply.
      expectPartial: !handle.directVideo,
    };
  }

  async remove(handle) {
    if (!handle?.id) return;
    this.#items.delete(handle.id);
  }
}
