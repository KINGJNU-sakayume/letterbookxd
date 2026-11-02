import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginConnect, CALLBACK_KEY, CALLBACK_URL, CLIENT_ID, completeStoredCallback, isConnected, LIFEHUB_ORIGIN,
  parseProposal, receipts, rejectLocally, rememberReceipt, RESOURCE, sync,
} from '../.test-dist/remote.js';
import { dayToIso, findWorks, normalizeTitle, publishersOf, volumesOf } from '../.test-dist/resolve.js';

// Synthetic data only.
const KEY = 'claude:mcp-' + 'c'.repeat(40);
function candidate(payload, key = KEY) {
  const i = key.indexOf(':');
  return { key, candidate: { schema_version: 1, candidate_type: 'reading_record', source: key.slice(0, i), idempotency_key: key.slice(i + 1), created_at: '2026-11-02T01:00:00Z', payload } };
}
function memory() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
function makeDeps(handler) {
  const calls = [];
  let n = 0;
  return {
    calls, storage: memory(), session: memory(), now: () => 1_000_000,
    random: (len) => new Uint8Array(len).fill(++n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', d)),
    fetch: async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); },
  };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokens = () => json({ access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', token_type: 'Bearer', expires_in: 3600 });

test('제안 형식: 완독은 별점·인생책, 읽는 중은 쪽수', () => {
  assert.deepEqual(parseProposal(candidate({ title: '가상의 책', author: '가상 작가', state: 'completed', rating: 4, liked: true, date: '2026-11-01' })), {
    key: KEY, createdAt: '2026-11-02T01:00:00Z', title: '가상의 책', author: '가상 작가', publisher: null, volume: null,
    state: 'completed', currentPage: null, rating: 4, liked: true, date: '2026-11-01', note: null,
  });
  assert.equal(parseProposal(candidate({ title: '가상의 책', state: 'reading', current_page: 30, volume: 2 })).currentPage, 30);
  for (const bad of [
    { title: '가상의 책' },
    { title: '가상의 책', state: 'completed', current_page: 3 },
    { title: '가상의 책', state: 'reading', rating: 3 },
    { title: '가상의 책', state: 'completed', rating: 6 },
    { title: '가상의 책', state: 'completed', isbn: '1' },
  ]) assert.equal(parseProposal(candidate(bad)), null, JSON.stringify(bad));
});

const works = [
  { id: 'w1', title: '가상의 책', author: '가상 작가', editions: [{ id: 'e1', volume_number: '1', publisher: '가상출판' }] },
  { id: 'w2', title: '가상의 대하소설', author: '다른 작가', editions: [
    { id: 'e2', volume_number: '1', publisher: '가' }, { id: 'e3', volume_number: '2', publisher: '가' }, { id: 'e4', volume_number: '10', publisher: '가' },
    { id: 'e5', volume_number: '1', publisher: '나 출판' },
  ] },
  { id: 'w3', title: '가상의 책', author: '동명 작가', editions: [] },
];
const q = (patch) => ({ title: '가상의 책', author: null, publisher: null, volume: null, ...patch });

test('카탈로그에서 책 찾기: 하나일 때만 고르고 나머지는 선택지', () => {
  assert.equal(normalizeTitle('가상의 책!'), normalizeTitle('가상의책'));
  assert.equal(findWorks(q({}), works).exact, null);
  assert.deepEqual(findWorks(q({}), works).choices.map((w) => w.id), ['w1', 'w3']);
  assert.equal(findWorks(q({ author: '가상 작가' }), works).exact.id, 'w1');
  assert.equal(findWorks(q({ title: '가상의책' , author: '가상' }), works).exact.id, 'w1');
  assert.deepEqual(findWorks(q({ title: '대하소설' }), works).choices.map((w) => w.id), ['w2']);
  assert.equal(findWorks(q({ title: '대하소설' }), works).exact, null);
  assert.deepEqual(findWorks(q({ title: '없는 책' }), works).choices, []);
});

test('판본과 권: 이름·번호가 하나로 맞을 때만 미리 고른다', () => {
  assert.deepEqual(publishersOf(works[0], q({})), { publishers: ['가상출판'], preselected: '가상출판' });
  assert.equal(publishersOf(works[1], q({})).preselected, null);
  assert.equal(publishersOf(works[1], q({ publisher: '나출판' })).preselected, '나 출판');
  const vols = volumesOf(works[1], '가', 2);
  assert.deepEqual(vols.volumes.map((v) => v.id), ['e2', 'e3', 'e4']);
  assert.equal(vols.preselected.id, 'e3');
  assert.equal(volumesOf(works[1], '가', null).preselected, null);
  assert.equal(volumesOf(works[1], '나 출판', null).preselected.id, 'e5');
  assert.equal(dayToIso('2026-11-01'), '2026-11-01T03:00:00.000Z');
});

test('연결과 동기화: PKCE, 콜백 검증, 영수증·거절은 한 번만', async () => {
  const deps = makeDeps((url) => (url.endsWith('/oauth/token') ? tokens()
    : url.includes('/candidates') ? json({ candidates: [candidate({ title: '가상의 책', state: 'completed' }), candidate({ title: '가상의 책', state: 'reading' }, 'claude:mcp-' + 'd'.repeat(40)), candidate({ title: '가상의 책', state: 'reading' }, 'claude:mcp-' + 'e'.repeat(40))] })
    : json({ ok: true })));
  const url = new URL(await beginConnect(deps));
  assert.deepEqual(
    [url.searchParams.get('client_id'), url.searchParams.get('redirect_uri'), url.searchParams.get('scope'), url.searchParams.get('resource')],
    [CLIENT_ID, CALLBACK_URL, 'letterbookxd:inbox', RESOURCE]);
  deps.session.setItem(CALLBACK_KEY, `?code=c&state=${url.searchParams.get('state')}&iss=${encodeURIComponent(LIFEHUB_ORIGIN)}`);
  assert.equal(await completeStoredCallback(deps), true);
  assert.ok(isConnected(deps));
  deps.calls.length = 0;

  rememberReceipt(KEY, '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b', deps);
  rejectLocally('claude:mcp-' + 'd'.repeat(40), deps);
  assert.equal(receipts(deps).length, 1);
  const first = await sync(deps);
  assert.deepEqual(first.proposals.map((p) => p.key), ['claude:mcp-' + 'e'.repeat(40)]);
  assert.equal(first.receiptsSent, 1);
  assert.equal(first.rejectionsSent, 1);
  const posted = deps.calls.filter((c) => c.init?.method === 'POST').map((c) => JSON.parse(c.init.body));
  assert.deepEqual(posted, [{ key: KEY, entity_type: 'reading_record', entity_id: '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b' }, { key: 'claude:mcp-' + 'd'.repeat(40) }]);
  deps.calls.length = 0;
  await sync(deps);
  assert.equal(deps.calls.filter((c) => c.init?.method === 'POST').length, 0);

  const forged = makeDeps(() => tokens());
  await beginConnect(forged);
  forged.session.setItem(CALLBACK_KEY, '?code=c&state=forged');
  await assert.rejects(completeStoredCallback(forged), (e) => e.kind === 'state');
});
