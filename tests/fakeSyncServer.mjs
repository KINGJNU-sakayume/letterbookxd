// Life Hub의 /letterbookxd/v1/sync를 메모리에서 흉내 낸다 (life-hub src/sync/api.js 대로: version, 412, sha256, 413, 415, 428).
// Synthetic data only; no real requests.
import { createHash } from 'node:crypto';

const META = (row) => ({ version: row.version, sha256: row.sha256, size_bytes: row.size_bytes, written_at: row.written_at, device: row.device ?? null });
const json = (status, value, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

export function createFakeSyncServer({ now, maxBytes = 1048576 } = {}) {
  const versions = [];
  const server = {
    versions,
    puts: [],
    gets: 0,
    /** 'inbox-only'이면 동기화 경로가 insufficient_scope 403, 'other'면 일반 403 */
    scopeMode: 'ok',
    /** PUT 처리 전에 부르는 훅 (다른 기기의 끼어든 쓰기를 흉내 낸다) */
    beforePut: null,
    /** 한 번만: 'lose-response' 쓰기는 반영되지만 응답이 유실됨, 'stale-after-commit' 반영되고 412로 답함, 'status:500' */
    nextPut: null,
    /** 한 번만 네트워크 오류로 만들 요청 종류 */
    failNext: null,
    current: () => versions.at(-1) ?? null,
    docs: () => versions.map((v) => JSON.parse(v.body)),
    deleteAll: () => { versions.length = 0; },
    commit(body, device = null) {
      const bytes = Buffer.from(body, 'utf8');
      const row = {
        version: (versions.at(-1)?.version ?? 0) + 1, body, size_bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'), device, written_at: new Date(now()).toISOString(),
      };
      versions.push(row);
      return row;
    },
    async fetch(url, init = {}) {
      const u = new URL(String(url));
      if (u.pathname === '/oauth/token') return json(200, { access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', token_type: 'Bearer', expires_in: 3600 });
      const method = init.method ?? 'GET';
      const rest = u.pathname.replace('/letterbookxd/v1/sync', '');
      if (server.failNext && (server.failNext === method || server.failNext === `${method}${rest}`)) {
        server.failNext = null;
        throw new TypeError('network down');
      }
      if (server.scopeMode === 'inbox-only') return json(403, { error: 'insufficient_scope' }, { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="letterbookxd:sync"' });
      if (server.scopeMode === 'other') return json(403, { error: 'Token is not valid for this Life Hub' });
      if (rest === '' && method === 'GET') {
        server.gets++;
        const row = server.current();
        return row ? json(200, { ...META(row), doc: JSON.parse(row.body) }) : json(404, { error: 'No document yet' });
      }
      if (rest === '/meta' && method === 'GET') {
        const row = server.current();
        return row ? json(200, META(row)) : json(404, { error: 'No document yet' });
      }
      if (rest === '' && method === 'PUT') return server.put(init);
      return json(404, { error: 'Not found' });
    },
    async put(init) {
      const h = new Headers(init.headers);
      const body = String(init.body ?? '');
      server.puts.push({ ifMatch: h.get('If-Match'), ifNoneMatch: h.get('If-None-Match'), device: h.get('X-Device-Label'), body });
      if (server.beforePut) { const hook = server.beforePut; hook(server); }
      const ifMatch = h.get('If-Match');
      const ifNoneMatch = h.get('If-None-Match');
      if (ifMatch === null && ifNoneMatch === null) return json(428, { error: 'If-Match is required' });
      if (!/^application\/json/i.test(h.get('Content-Type') ?? '')) return json(415, { error: 'application/json required' });
      if (Buffer.byteLength(body, 'utf8') > maxBytes) return json(413, { error: 'Document too large' });
      let doc;
      try { doc = JSON.parse(body); } catch { return json(400, { error: 'Invalid JSON' }); }
      if (!doc || doc.app !== 'letterbookxd' || doc.version !== 2 || !Array.isArray(doc.logs) || (doc.tombstones !== undefined && !Array.isArray(doc.tombstones)))
        return json(400, { error: 'Invalid document' });
      const label = h.get('X-Device-Label');
      if (label !== null && !/^[\x20-\x7e]{1,40}$/.test(label.trim())) return json(400, { error: 'Invalid X-Device-Label' });
      const base = ifNoneMatch !== null ? 0 : Number(/\d+/.exec(ifMatch)?.[0]);
      const cur = server.current();
      if ((cur?.version ?? 0) !== base) return json(412, { error: 'Precondition failed', current: cur ? META(cur) : null });
      const mode = server.nextPut;
      server.nextPut = null;
      if (mode === 'status:500') return json(500, { error: 'Internal error' });
      const row = server.commit(body, label?.trim() ?? null);
      if (mode === 'lose-response') throw new TypeError('response lost');
      if (mode === 'stale-after-commit') return json(412, { error: 'Precondition failed', current: META(row) });
      return json(200, { version: row.version, sha256: row.sha256, written_at: row.written_at });
    },
  };
  return server;
}
