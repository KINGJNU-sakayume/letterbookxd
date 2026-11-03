import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginConnect, CALLBACK_KEY, CALLBACK_URL, CLIENT_ID, completeStoredCallback, isConnected, LIFEHUB_ORIGIN,
  parseProposal, receipts, rejectLocally, rememberReceipt, RESOURCE, sync,
  autoApplyEnabled, setAutoApply, catalogRefs, uploadCatalogRefs,
} from '../.test-dist/remote.js';
import { autoPlan, dayToIso, findWorks, normalizeTitle, publishersOf, volumesOf } from '../.test-dist/resolve.js';

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
    key: KEY, createdAt: '2026-11-02T01:00:00Z', status: 'pending', needsAppReview: false, title: '가상의 책', author: '가상 작가', publisher: null, volume: null,
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
    [CLIENT_ID, CALLBACK_URL, 'letterbookxd:inbox letterbookxd:sync', RESOURCE]);
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

/* ---------- Claude 카드 승인 (Life Hub P4 6단계) ---------- */

test('카드에서 승인한 제안: 고친 내용(final_candidate)이 우선이고 같은 검사를 거친다', () => {
  const item = { ...candidate({ title: '가상의 책', state: 'reading' }), status: 'approved', needs_app_review: false, revision: 1 };
  item.final_candidate = { ...item.candidate, payload: { title: '가상의 대하소설', publisher: '가', volume: 2, state: 'completed', rating: 5 } };
  const p = parseProposal(item);
  assert.equal(p.status, 'approved');
  assert.equal(p.title, '가상의 대하소설');
  assert.equal(p.rating, 5);
  assert.equal(parseProposal({ ...item, final_candidate: { ...item.final_candidate, payload: { title: 'x', state: 'reading', rating: 3 } } }), null);
  assert.equal(parseProposal({ ...item, status: 'confirmed' }), null);
  assert.equal(parseProposal({ ...item, needs_app_review: true }).needsAppReview, true);
  const codex = 'codex:mcp-' + 'f'.repeat(40);
  assert.equal(parseProposal(candidate({ title: '가상의 책', state: 'reading' }, codex)).key, codex, 'Codex 제안도 받는다');
});

test('자동 반영: 승인됨·확인 불필요·설정 켜짐이고 책·판본·권이 하나일 때만', () => {
  const p = (patch) => ({ ...q(patch), status: 'approved', needsAppReview: false });
  assert.equal(autoPlan(p({ author: '가상 작가' }), works, true).edition.id, 'e1');
  assert.equal(autoPlan(p({}), works, true), null, '같은 제목 두 작품');
  assert.equal(autoPlan(p({ title: '가상의 대하소설', publisher: '가', volume: 2 }), works, true).edition.id, 'e3');
  assert.equal(autoPlan(p({ title: '가상의 대하소설', publisher: '가' }), works, true), null, '권이 여러 개');
  assert.equal(autoPlan(p({ title: '가상의 대하소설' }), works, true), null, '판본이 여러 개');
  assert.equal(autoPlan(p({ title: '가상의 대하소설', publisher: '나 출판' }), works, true).edition.id, 'e5');
  assert.equal(autoPlan({ ...p({ author: '가상 작가' }), status: 'pending' }, works, true), null);
  assert.equal(autoPlan({ ...p({ author: '가상 작가' }), needsAppReview: true }, works, true), null);
  assert.equal(autoPlan(p({ author: '가상 작가' }), works, false), null);
  const deps = makeDeps(() => json({}));
  assert.equal(autoApplyEnabled(deps), true);
  setAutoApply(false, deps);
  assert.equal(autoApplyEnabled(deps), false);
});

test('카탈로그 공유: 작품·판본 목록, 바뀔 때만 보내고 409는 보낸 것으로 치지 않는다', async () => {
  const W1 = '00000000-0000-4000-8000-000000000001';
  const cat = [{ id: W1, title: '가상의 대하소설', author: '가상 작가', editions: [{ id: 'e1', volume_number: '2', publisher: '가상출판' }, { id: 'e2', volume_number: null, publisher: null }] }];
  assert.deepEqual(catalogRefs(cat), {
    works: [{ id: W1, label: '가상의 대하소설', group: '가상 작가' }],
    editions: [{ id: 'e1', label: '가상출판', group: W1 + '/2' }, { id: 'e2', label: '출판사 없음', group: W1 + '/1' }],
  });
  let status = 409;
  const deps = makeDeps((url) => (url.endsWith('/oauth/token') ? tokens() : url.includes('/refs/') ? json({}, status) : json({ candidates: [] })));
  deps.storage.setItem('letterbookxd.lifehub.tokens.v1', JSON.stringify({ access_token: 'a', refresh_token: 'r', access_expires_at: 9e15 }));
  assert.equal(await uploadCatalogRefs(cat, deps), false);
  status = 200;
  deps.calls.length = 0;
  await sync(deps, cat);
  const puts = deps.calls.filter((c) => c.init?.method === 'PUT');
  assert.deepEqual(puts.map((c) => c.url.split('/v1')[1]), ['/refs/works', '/refs/editions'], '409 뒤에는 다시 보낸다');
  assert.ok(deps.calls.some((c) => c.url.includes('/candidates?status=open')));
  deps.calls.length = 0;
  await sync(deps, cat);
  assert.equal(deps.calls.filter((c) => c.init?.method === 'PUT').length, 0, '바뀌지 않으면 보내지 않는다');
});
