// Minimal NNTP client: enough for BODY / STAT / GROUP over TLS or plain TCP.
// Used by the corpus prober and by the `raw` baseline adapter, which measures what
// the provider can deliver with no application in the way.
import net from 'node:net';
import tls from 'node:tls';

const CRLF = '\r\n';
const DOT_CRLF = Buffer.from('\r\n.\r\n');

export class NntpError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.code = code;
  }
}

/** Article missing on this provider (430): the failover signal, not a fault. */
export class ArticleNotFound extends NntpError {}

export class NntpClient {
  #sock = null;
  #buf = Buffer.alloc(0);
  #waiter = null;
  #closed = false;
  #err = null;

  constructor({ host, port = 563, tls: useTls = true, user, pass, timeoutMs = 30000, name = 'nntp' }) {
    Object.assign(this, { host, port: Number(port), useTls: Boolean(Number(useTls)), user, pass, timeoutMs, name });
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const opts = { host: this.host, port: this.port };
      const onErr = (e) => reject(e);
      this.#sock = this.useTls
        ? tls.connect({ ...opts, servername: this.host, rejectUnauthorized: false }, resolve)
        : net.connect(opts, resolve);
      this.#sock.once('error', onErr);
      this.#sock.setTimeout(this.timeoutMs);
      this.#sock.once('timeout', () => this.#sock.destroy(new Error('socket timeout')));
    });

    this.#sock.removeAllListeners('error');
    this.#sock.on('error', (e) => this.#fail(e));
    this.#sock.on('close', () => this.#fail(new Error('connection closed')));
    this.#sock.on('data', (d) => this.#onData(d));

    const greeting = await this.#readLine();
    if (!/^20[01]/.test(greeting)) throw new NntpError(greeting.slice(0, 3), `bad greeting: ${greeting}`);

    if (this.user) {
      const a = await this.#send(`AUTHINFO USER ${this.user}`);
      if (a.startsWith('381')) {
        const b = await this.#send(`AUTHINFO PASS ${this.pass}`);
        if (!b.startsWith('281')) throw new NntpError(b.slice(0, 3), `auth failed: ${b}`);
      } else if (!a.startsWith('281')) {
        throw new NntpError(a.slice(0, 3), `auth failed: ${a}`);
      }
    }
    return this;
  }

  #fail(e) {
    if (this.#closed) return;
    this.#closed = true;
    this.#err = e;
    const w = this.#waiter;
    this.#waiter = null;
    if (w) w.reject(e);
  }

  #onData(d) {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, d]) : d;
    this.#pump();
  }

  #pump() {
    const w = this.#waiter;
    if (!w) return;
    if (w.mode === 'line') {
      const i = this.#buf.indexOf('\n');
      if (i === -1) return;
      const line = this.#buf.subarray(0, i).toString('latin1').replace(/\r$/, '');
      this.#buf = this.#buf.subarray(i + 1);
      this.#waiter = null;
      w.resolve(line);
      return;
    }
    // Multiline: terminated by CRLF "." CRLF. `searchFrom` avoids rescanning.
    const start = Math.max(0, w.searchFrom - 4);
    const i = this.#buf.indexOf(DOT_CRLF, start);
    if (i === -1) {
      w.searchFrom = this.#buf.length;
      return;
    }
    const payload = this.#buf.subarray(0, i);
    this.#buf = this.#buf.subarray(i + DOT_CRLF.length);
    this.#waiter = null;
    w.resolve(payload);
  }

  #wait(mode) {
    if (this.#err) return Promise.reject(this.#err);
    if (this.#waiter) return Promise.reject(new Error('concurrent request on one connection'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiter = null;
        this.#fail(new Error(`timeout waiting for ${mode}`));
      }, this.timeoutMs);
      const done = (fn) => (v) => {
        clearTimeout(timer);
        fn(v);
      };
      this.#waiter = { mode, searchFrom: 0, resolve: done(resolve), reject: done(reject) };
      this.#pump();
    });
  }

  #readLine() {
    return this.#wait('line');
  }

  async #send(cmd) {
    if (this.#err) throw this.#err;
    this.#sock.write(cmd + CRLF);
    return this.#readLine();
  }

  async group(name) {
    const r = await this.#send(`GROUP ${name}`);
    if (!r.startsWith('211')) throw new NntpError(r.slice(0, 3), r);
    return r;
  }

  /** Returns the raw (still yEnc-encoded) article body. */
  async body(messageId) {
    const id = messageId.startsWith('<') ? messageId : `<${messageId}>`;
    const status = await this.#send(`BODY ${id}`);
    if (status.startsWith('430') || status.startsWith('423')) {
      throw new ArticleNotFound(status.slice(0, 3), `article not found ${id}`);
    }
    if (!status.startsWith('222')) throw new NntpError(status.slice(0, 3), status);
    return this.#wait('multiline');
  }

  async stat(messageId) {
    const id = messageId.startsWith('<') ? messageId : `<${messageId}>`;
    const r = await this.#send(`STAT ${id}`);
    if (r.startsWith('223')) return true;
    if (r.startsWith('430') || r.startsWith('423')) return false;
    throw new NntpError(r.slice(0, 3), r);
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#sock.write(`QUIT${CRLF}`);
    } catch {
      /* already gone */
    }
    this.#sock.destroy();
  }
}

/** Open `n` authenticated connections, tolerating partial failure. */
export async function openPool(provider, n) {
  const conns = await Promise.allSettled(
    Array.from({ length: n }, () => new NntpClient(provider).connect()),
  );
  const ok = conns.filter((c) => c.status === 'fulfilled').map((c) => c.value);
  if (!ok.length) {
    const why = conns[0]?.reason?.message ?? 'unknown';
    throw new Error(`could not open any connection to ${provider.host}: ${why}`);
  }
  return ok;
}
