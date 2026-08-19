// Adapter registry. Adding an application: write a module in this directory that
// default-exports a class extending `Adapter`, then list it here.

import RawAdapter from './raw.mjs';
import AltmountAdapter from './altmount.mjs';
import StremthruAdapter from './stremthru.mjs';
import NzbdavAdapter from './nzbdav.mjs';
import NzbdavexAdapter from './nzbdavex.mjs';
import InfinidyskAdapter from './infinidysk.mjs';
import StreamnzbAdapter from './streamnzb.mjs';
import DecypharrAdapter from './decypharr.mjs';
import CometAdapter from './comet.mjs';
import AioStreamsAdapter from './aiostreams.mjs';

export const ADAPTERS = [
  RawAdapter,
  AioStreamsAdapter,
  AltmountAdapter,
  NzbdavAdapter,
  NzbdavexAdapter,
  InfinidyskAdapter,
  StremthruAdapter,
  StreamnzbAdapter,
  DecypharrAdapter,
  CometAdapter,
];

export const BY_ID = Object.fromEntries(ADAPTERS.map((a) => [a.id, a]));

export function resolveAdapters(spec) {
  if (!spec || spec === 'all') return ADAPTERS;
  const ids = spec.split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const id of ids) {
    const A = BY_ID[id];
    if (!A) throw new Error(`unknown app ${JSON.stringify(id)}; known: ${Object.keys(BY_ID).join(', ')}`);
    out.push(A);
  }
  return out;
}
