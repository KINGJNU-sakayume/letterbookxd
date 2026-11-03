import './setup.mjs';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  useLogStore, useBookStore, getDb, selectDbForTests, resetDbForTests, setBundledCatalogLoader, setNowForTests,
  runLogSyncPass, readConfig, writeConfig, setSyncEnabled, createLogSyncController, prepareReview,
  readLocalState, mergeStates, canonicalJson, STALE_AFTER_MS, MAX_ATTEMPTS, SYNC_MAX_BYTES,
} from '../.test-dist/app.js';
import { createFakeSyncServer } from './fakeSyncServer.mjs';

// Synthetic data only. No request goes to a real Life Hub.
const T0 = '2026-01-01T00:00:00.000Z';
const work = (id, series_id = null, series_order = null) => ({
  id, title: `가상 작품 ${id}`, author: '가상 작가', original_excerpt: '', representative_cover_url: null, series_id, series_order, created_at: T0,
});
const CATALOG = {
  version: 1, works: [work('w1', 's1', 1), work('w2', 's1', 2), work('w3')], editions: [],
  series: [{ id: 's1', title: '가상 시리즈', author: '가상 작가', created_at: T0 }], authors: [], flowcharts: [],
};
const VOLUMES = [
  { id: 'v1', editionSetId: 'set1', volumeNumber: 1, title: '1' },
  { id: 'v2', editionSetId: 'set1', volumeNumber: 2, title: '2' },
  { id: 'v3', editionSetId: 'set2', volumeNumber: 1, title: '1' },
  { id: 'v4', editionSetId: 'set3', volumeNumber: 1, title: '1' },
];
const WORK_OF = { set1: 'w1', set2: 'w2', set3: 'w3' };
const TOKENS_KEY = 'letterbookxd.lifehub.tokens.v1';

let clock;
let server;
const tick = (ms = 60_000) => { clock += ms; };

function memory() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), has: (k) => m.has(k) };
}
function makeDevice(name, { scope = 'letterbookxd:inbox letterbookxd:sync' } = {}) {
  const storage = memory();
  const calls = [];
  const deps = {
    storage, session: memory(), now: () => clock,
    random: (n) => new Uint8Array(n).fill(1),
    sha256: async (d) => new Uint8Array(createHash('sha256').update(d).digest()),
    fetch: async (url, init) => { calls.push({ url: String(url), method: init?.method ?? 'GET' }); return server.fetch(url, init); },
  };
  storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'access-synthetic', access_expires_at: clock + 1e12, refresh_token: 'refresh-synthetic', scope }));
  setSyncEnabled(deps, true);
  return { name, deps, storage, calls };
}

/** 이 기기의 IndexedDB로 바꾸고 화면 상태를 다시 읽는다 */
async function on(dev) {
  selectDbForTests(dev.name);
  useLogStore.setState({ volumeLogs: [], setCompletionLogs: [], seriesCompletionLogs: [], hasLoaded: false });
  await useLogStore.getState().loadLogs();
  return dev;
}
const vol = (volumeId, readingState, extra = {}) => {
  const editionSetId = VOLUMES.find((v) => v.id === volumeId).editionSetId;
  return useLogStore.getState().upsertVolumeLog({
    volumeId, editionSetId, workId: WORK_OF[editionSetId], logType: 'volume', readingState, currentPage: null, liked: false, rating: null, ...extra,
  });
};
const sync = async (dev, opts) => { await on(dev); return runLogSyncPass(dev.deps, opts); };
const canon = async (dev) => { await on(dev); const s = await readLocalState(); return canonicalJson({ logs: s.logs, tombstones: s.tombstones }); };
const liveTargets = async (dev) => { await on(dev); return (await getDb().logs.toArray()).map((r) => `${r.logType}:${r.volumeId ?? r.editionSetId ?? r.seriesId}`).sort(); };

beforeEach(async () => {
  clock = Date.parse('2026-06-01T00:00:00.000Z');
  setNowForTests(() => clock);
  server = createFakeSyncServer({ now: () => clock });
  for (const name of ['devA', 'devB', 'devC', 'letterbookxd']) { selectDbForTests(name); await resetDbForTests(); }
  setBundledCatalogLoader(async () => structuredClone(CATALOG));
  useBookStore.setState({ works: [], editionSets: [], volumes: VOLUMES });
});

test('첫 동기화는 If-None-Match: *, 문서 본문은 app·version 2·logs·tombstones (catalogOverrides 없음)', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading', { currentPage: 12 });
  const r = await sync(a);
  assert.equal(r.status, 'on');
  assert.equal(r.pushed, true);
  assert.equal(server.puts[0].ifNoneMatch, '*');
  const doc = JSON.parse(server.puts[0].body);
  assert.deepEqual(Object.keys(doc).sort(), ['app', 'exportedAt', 'logs', 'tombstones', 'version']);
  assert.equal(doc.app, 'letterbookxd');
  assert.equal(doc.version, 2);
  assert.equal(doc.logs.length, 1); // 읽는 중인 권 1건 (세트 완독은 아직 없음)
});

test('서버 문서에 더할 것이 없으면 PUT하지 않는다', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  await sync(a);
  const puts = server.puts.length;
  tick();
  const r = await sync(a);
  assert.equal(r.status, 'on');
  assert.equal(r.pushed, false);
  assert.equal(server.puts.length, puts);
  assert.equal(readConfig(a.deps).version, 1);
});

test('수렴: 같은 권을 오프라인에서 각각 기록 → 더 늦은 쪽만 남고 양쪽이 같아진다', async () => {
  const a = makeDevice('devA'); const b = makeDevice('devB');
  await on(a); await vol('v4', 'reading', { currentPage: 10 }); tick(); // A가 먼저
  await on(b); await vol('v4', 'completed', { rating: 5 }); tick();      // B가 나중
  await sync(a); tick(); await sync(b); tick(); await sync(a);
  assert.equal(await canon(a), await canon(b));
  await on(a);
  const rows = await getDb().logs.toArray();
  assert.equal(rows.filter((r) => r.volumeId === 'v4').length, 1);
  assert.equal(rows.find((r) => r.volumeId === 'v4').readingState, 'completed');
  const tombs = await getDb().tombstones.toArray();
  assert.ok(tombs.some((t) => t.supersededBy !== null && t.targetKey === 'volume:v4'));
});

test('수렴: 한 기기에서 지우면 다른 기기의 같은 권 기록도 사라진다', async () => {
  const a = makeDevice('devA'); const b = makeDevice('devB');
  await on(a); await vol('v4', 'reading'); await sync(a); tick();
  await sync(b); tick();
  await on(a); await useLogStore.getState().deleteLogById(useLogStore.getState().getVolumeLog('v4').id); tick();
  await sync(a); tick(); await sync(b);
  assert.deepEqual(await liveTargets(b), []);
  assert.equal(await canon(a), await canon(b));
});

test('수렴: 삭제 뒤 더 늦은 기록은 되살아난다', async () => {
  const a = makeDevice('devA'); const b = makeDevice('devB');
  await on(a); await vol('v4', 'reading'); await sync(a); tick();
  await sync(b); tick();
  await on(a); await useLogStore.getState().deleteLogById(useLogStore.getState().getVolumeLog('v4').id); tick();
  await sync(a); tick();
  await on(b); await vol('v4', 'completed'); tick();           // 삭제를 아직 모르는 B가 더 늦게 기록
  await sync(b); tick(); await sync(a);
  assert.deepEqual((await liveTargets(a)).filter((k) => k.startsWith('volume')), ['volume:v4']);
  assert.equal(await canon(a), await canon(b));
});

test('수렴: 완독 연쇄(세트·시리즈)가 양쪽에서 겹쳐도 같아지고, 순서를 바꿔도 같다', async () => {
  async function scenario(order) {
    server = createFakeSyncServer({ now: () => clock });
    clock = Date.parse('2026-06-01T00:00:00.000Z');
    for (const n of ['devA', 'devB']) { selectDbForTests(n); await resetDbForTests(); }
    const a = makeDevice('devA'); const b = makeDevice('devB');
    await on(a); await vol('v1', 'completed'); await vol('v2', 'completed'); tick();
    await sync(a); tick(); await sync(b); tick();
    // 둘 다 오프라인에서 마지막 권을 완독 → 각자 세트·시리즈 완독을 따로 만든다
    await on(a); await vol('v3', 'completed'); tick();
    await on(b); await vol('v3', 'completed', { rating: 4 }); tick();
    for (const who of order) { await sync(who === 'a' ? a : b); tick(); }
    for (const who of ['a', 'b', 'a', 'b']) { await sync(who === 'a' ? a : b); tick(); }
    const ca = await canon(a); const cb = await canon(b);
    assert.equal(ca, cb);
    const targets = await liveTargets(a);
    assert.equal(targets.filter((t) => t.startsWith('set_completion')).length, 2);
    assert.equal(targets.filter((t) => t.startsWith('series_completion')).length, 1);
    // 기록 id는 무작위라 순서를 내용으로 맞춘 뒤 비교한다
    return JSON.parse(ca).logs.map((r) => JSON.stringify([r.logType, r.volumeId, r.editionSetId, r.seriesId, r.readingState, r.rating])).sort();
  }
  const first = await scenario(['a', 'b']);
  const second = await scenario(['b', 'a']);
  assert.deepEqual(second, first);
});

test('수렴: 한쪽이 연쇄를 되돌리면(삭제) 양쪽 모두 되돌아간다', async () => {
  const a = makeDevice('devA'); const b = makeDevice('devB');
  await on(a); for (const v of ['v1', 'v2', 'v3']) await vol(v, 'completed'); tick();
  await sync(a); tick(); await sync(b); tick();
  await on(b); await vol('v1', 'reading'); tick();       // 세트·시리즈 완독이 지워진다
  await sync(b); tick(); await sync(a); tick(); await sync(b);
  assert.equal(await canon(a), await canon(b));
  const t = await liveTargets(a);
  assert.deepEqual(t.filter((k) => k.startsWith('set_completion') || k.startsWith('series_completion')), ['set_completion:set2']);
});

test('412: 최대 3회까지만 다시 시도하고 "나중에 재시도", 로컬은 그대로', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading'); tick();
  let n = 0;
  server.commit(JSON.stringify({ app: 'letterbookxd', version: 2, exportedAt: T0, logs: [], tombstones: [] }));
  server.beforePut = (s) => { n++; s.commit(JSON.stringify({ app: 'letterbookxd', version: 2, exportedAt: T0, logs: [], tombstones: [] })); };
  const r = await sync(a);
  assert.equal(r.status, 'retry_later');
  assert.equal(server.puts.length, MAX_ATTEMPTS);
  assert.equal(n, MAX_ATTEMPTS);
  await on(a);
  assert.equal(useLogStore.getState().getVolumeLog('v4').readingState, 'reading');
});

test('412인데 current.sha256이 내가 보낸 것과 같으면 성공', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  server.nextPut = 'stale-after-commit';
  const r = await sync(a);
  assert.equal(r.status, 'on');
  assert.equal(server.puts.length, 1);
  assert.equal(readConfig(a.deps).version, 1);
});

test('412에서 current가 null이면 If-None-Match: *로 다시 쓴다 (다시 읽지 않고)', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading'); await sync(a); tick();
  await vol('v4', 'completed'); tick();
  server.beforePut = (s) => { s.deleteAll(); server.beforePut = null; };
  const gets = server.gets;
  const r = await sync(a);
  assert.equal(r.status, 'on');
  assert.equal(server.puts.at(-1).ifNoneMatch, '*');
  assert.equal(server.puts.at(-2).ifMatch, '"1"');
  assert.equal(server.gets, gets + 1);
  assert.equal(server.current().version, 1);
});

test('응답 유실: 서버 meta의 sha256이 보낸 바이트와 같으면 다시 쓰지 않는다', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  server.nextPut = 'lose-response';
  const r = await sync(a);
  assert.equal(r.status, 'on');
  assert.equal(server.puts.length, 1, '중복 쓰기 없음');
  assert.equal(server.versions.length, 1);
});

test('5xx로 결과를 모를 때도 meta를 먼저 확인하고, 반영 안 됐으면 다시 쓴다', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  server.nextPut = 'status:500';
  const r = await sync(a);
  assert.equal(r.status, 'on');
  assert.equal(server.puts.length, 2);
  assert.equal(server.versions.length, 1);
});

test('meta도 못 읽으면 다시 쓰지 않고 나중에 재시도, 로컬은 그대로', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  server.nextPut = 'lose-response';
  server.failNext = 'GET/meta';
  const r = await sync(a);
  assert.equal(r.status, 'retry_later');
  assert.equal(server.puts.length, 1);
  await on(a);
  assert.ok(useLogStore.getState().getVolumeLog('v4'));
});

test('insufficient_scope: 토큰을 지우지 않고 "권한 없음"만', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  server.scopeMode = 'inbox-only';
  const r = await sync(a);
  assert.equal(r.status, 'no_scope');
  assert.ok(a.storage.has(TOKENS_KEY), '토큰 유지');
  assert.equal(readConfig(a.deps).blocked, 'no_scope');
  // 자동 패스는 요청도 하지 않는다
  const before = a.calls.length;
  await sync(a);
  assert.equal(a.calls.length, before);
});

test('토큰 응답에 동기화 scope가 없으면 요청 전에 "권한 없음"', async () => {
  const a = makeDevice('devA', { scope: 'letterbookxd:inbox' });
  await on(a); await vol('v4', 'reading');
  const r = await sync(a);
  assert.equal(r.status, 'no_scope');
  assert.equal(a.calls.length, 0);
  assert.ok(a.storage.has(TOKENS_KEY));
});

test('그 밖의 403(소유자·역할 불일치)은 기존처럼 토큰을 지운다', async () => {
  const a = makeDevice('devA', { scope: 'letterbookxd:inbox letterbookxd:sync' });
  await on(a); await vol('v4', 'reading');
  server.scopeMode = 'other';
  const r = await sync(a);
  assert.equal(r.status, 'error');
  assert.equal(a.storage.has(TOKENS_KEY), false);
});

test('413: 자동 push를 멈추고 로컬은 그대로, 「지금 동기화」로 다시 시도', async () => {
  const a = makeDevice('devA');
  server = createFakeSyncServer({ now: () => clock, maxBytes: 100 });
  await on(a); await vol('v4', 'reading');
  const r = await sync(a);
  assert.equal(r.status, 'too_large');
  assert.equal(readConfig(a.deps).blocked, 'too_large');
  const before = server.puts.length;
  assert.equal((await sync(a)).status, 'too_large');
  assert.equal(server.puts.length, before, '자동 패스는 다시 보내지 않는다');
  await on(a);
  assert.ok(useLogStore.getState().getVolumeLog('v4'));
  server = createFakeSyncServer({ now: () => clock });
  assert.equal((await sync(a, { manual: true })).status, 'on');
});

test('네트워크 실패: 로컬 보존, 나중에 재시도', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  server.failNext = 'GET';
  const r = await sync(a);
  assert.equal(r.status, 'retry_later');
  await on(a);
  assert.ok(useLogStore.getState().getVolumeLog('v4'));
  assert.equal((await sync(a)).status, 'on');
});

test('서버 문서가 책장 문서가 아니거나 비어 있어도 로컬을 지우지 않는다', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  server.commit(JSON.stringify({ app: 'animan', version: 2, progress: {} }));
  assert.equal((await sync(a)).status, 'error');
  server.commit(JSON.stringify({ app: 'letterbookxd', version: 2, exportedAt: T0, logs: [], tombstones: [] }));
  assert.equal((await sync(a)).status, 'on');
  await on(a);
  assert.ok(useLogStore.getState().getVolumeLog('v4'));
});

test('서버 문서의 잘못된 항목은 버리고 개수를 알려 준다', async () => {
  const a = makeDevice('devA');
  server.commit(JSON.stringify({ app: 'letterbookxd', version: 2, exportedAt: T0, logs: [{ id: 'x' }, 7], tombstones: [{ id: 't' }] }));
  const r = await sync(a);
  assert.equal(r.dropped, 3);
});

test('180일 규칙: 오래 쉰 기기는 자동 병합하지 않고 검토를 요구한다', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading'); await sync(a);
  clock += STALE_AFTER_MS + 1000;
  const calls = a.calls.length;
  const r = await sync(a);
  assert.equal(r.status, 'review');
  assert.equal(a.calls.length, calls, '병합도 요청도 없음');
  assert.equal((await sync(a, { manual: true })).status, 'review', '지금 동기화로도 풀리지 않는다');
  // 검토를 거쳐야만 풀린다 (자세한 흐름은 staleReview.test.mjs)
  const plan = await prepareReview(a.deps);
  assert.equal(plan.skipped, null);
  await createLogSyncController({ deps: () => a.deps }).completeReview(plan);
  assert.equal(readConfig(a.deps).blocked, null);
  assert.equal((await sync(a)).status, 'on');
});

test('180일 직전이면 병합한다', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading'); await sync(a);
  clock += STALE_AFTER_MS - 1000;
  assert.equal((await sync(a)).status, 'on');
});

test('X-Device-Label: 1–40자 ASCII만 보내고 비면 헤더를 생략', async () => {
  const a = makeDevice('devA');
  writeConfig(a.deps, { deviceLabel: '  phone-1  ' });
  await on(a); await vol('v4', 'reading'); await sync(a);
  assert.equal(server.puts[0].device, 'phone-1');
  const b = makeDevice('devB');
  writeConfig(b.deps, { deviceLabel: '   ' });
  await on(b); await vol('v1', 'reading'); await sync(b);
  assert.equal(server.puts.at(-1).device, null);
});

test('오래된 묘비는 쓰기 직전에만 빠진다 (병합은 now에 의존하지 않는다)', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading');
  await useLogStore.getState().deleteLogById(useLogStore.getState().getVolumeLog('v4').id);
  await sync(a);
  assert.equal(JSON.parse(server.puts[0].body).tombstones.length, 1);
  clock += STALE_AFTER_MS - 1000;
  await vol('v1', 'reading');                 // 새 변경이 있어 PUT이 일어난다
  clock += 2000;                               // 이제 묘비가 180일을 넘는다
  writeConfig(a.deps, { lastSuccessAt: new Date(clock).toISOString() });
  await sync(a);
  assert.equal(JSON.parse(server.puts.at(-1).body).tombstones.length, 0);
});

test('컨트롤러: 5초 디바운스 push, 숨겨질 때 즉시 push, 한 번에 하나만', async () => {
  const timers = [];
  let runs = 0; let concurrent = 0; let maxConcurrent = 0;
  const dev = makeDevice('devA');
  const c = createLogSyncController({
    deps: () => dev.deps,
    run: async () => { runs++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); await new Promise((r) => setImmediate(r)); concurrent--; return { status: 'on', detail: null, dropped: 0, pushed: false }; },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; },
    clearTimer: (id) => { timers[id] = { fn: () => {}, ms: -1 }; },
  });
  c.markDirty(); c.markDirty(); c.markDirty();
  assert.equal(timers.filter((t) => t.ms === 5000).length, 1, '앞선 타이머는 취소되고 마지막 하나만 남는다');
  assert.equal(runs, 0);
  timers.at(-1).fn();                          // 마지막 타이머만 유효
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.equal(runs, 1);
  c.markDirty();
  await c.flush();                             // 숨겨짐: 기다리지 않고 바로
  assert.equal(runs, 2);
  const p = Promise.all([c.pull(), c.pull(), c.pull()]);
  await p; await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.equal(maxConcurrent, 1);
  assert.ok(runs >= 3 && runs <= 5);
  setSyncEnabled(dev.deps, false);
  const before = runs;
  c.markDirty(); await c.pull();
  assert.equal(runs, before, '꺼져 있으면 아무것도 하지 않는다');
});

test('여러 탭이 같은 기기에서 동시에 돌아도 412 처리로 하나로 합쳐진다', async () => {
  const a = makeDevice('devA');
  await on(a); await vol('v4', 'reading'); await vol('v1', 'reading');
  const tab2 = { ...a, deps: { ...a.deps } }; // 같은 DB·같은 저장소를 쓰는 다른 탭
  const [r1, r2] = await Promise.all([runLogSyncPass(a.deps), runLogSyncPass(tab2.deps)]);
  assert.ok(['on', 'retry_later'].includes(r1.status) && ['on', 'retry_later'].includes(r2.status));
  assert.equal((await runLogSyncPass(a.deps)).status, 'on');
  const docs = server.docs();
  const final = docs.at(-1);
  assert.equal(final.logs.length, 2);
  assert.equal(new Set(final.logs.map((l) => l.id)).size, 2);
  assert.ok(SYNC_MAX_BYTES > 0 && mergeStates(final).dropped === 0);
});
