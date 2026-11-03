import './setup.mjs';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import {
  useLogStore, useBookStore, getDb, resetDbForTests, closeDbForTests, DB_NAME, setBundledCatalogLoader, setNowForTests, noteServerTimeForTests,
} from '../.test-dist/app.js';

// Synthetic data only.
const T = '2026-01-01T00:00:00.000Z';
const work = (id, series_id = null, series_order = null) => ({
  id, title: `가상 작품 ${id}`, author: '가상 작가', original_excerpt: '', representative_cover_url: null, series_id, series_order, created_at: T,
});
const CATALOG = {
  version: 1,
  works: [work('w1', 's1', 1), work('w2', 's1', 2), work('w3')],
  editions: [], series: [{ id: 's1', title: '가상 시리즈', author: '가상 작가', created_at: T }], authors: [], flowcharts: [],
};
const VOLUMES = [
  { id: 'v1', editionSetId: 'set1', volumeNumber: 1, title: '1' },
  { id: 'v2', editionSetId: 'set1', volumeNumber: 2, title: '2' },
  { id: 'v3', editionSetId: 'set2', volumeNumber: 1, title: '1' },
  { id: 'v4', editionSetId: 'set3', volumeNumber: 1, title: '1' },
];
const WORK_OF = { set1: 'w1', set2: 'w2', set3: 'w3' };
const store = () => useLogStore.getState();
const vol = (volumeId, readingState, extra = {}) => {
  const editionSetId = VOLUMES.find((v) => v.id === volumeId).editionSetId;
  return store().upsertVolumeLog({
    volumeId, editionSetId, workId: WORK_OF[editionSetId], logType: 'volume', readingState, currentPage: null, liked: false, rating: null, ...extra,
  });
};
const tombs = async () => Object.fromEntries((await getDb().tombstones.toArray()).map((t) => [t.id, t]));
const completeAll = async () => { for (const v of ['v1', 'v2', 'v3']) await vol(v, 'completed'); };

let clock;
beforeEach(async () => {
  clock = Date.parse('2026-06-01T00:00:00.000Z');
  setNowForTests(() => clock);
  await resetDbForTests();
  setBundledCatalogLoader(async () => structuredClone(CATALOG));
  useBookStore.setState({ works: [], editionSets: [], volumes: VOLUMES });
  useLogStore.setState({ volumeLogs: [], setCompletionLogs: [], seriesCompletionLogs: [], hasLoaded: false });
  await store().loadLogs();
});

test('쓰기마다 updatedAt이 이 기기의 직전 값보다 커진다 (시계가 멈춰도)', async () => {
  await vol('v4', 'reading', { currentPage: 1 });
  const a = store().getVolumeLog('v4').updatedAt;
  await store().updateReadingProgress('v4', 2);
  const b = store().getVolumeLog('v4').updatedAt;
  await store().updateLogMetadata(store().getVolumeLog('v4').id, { rating: 3, liked: true, createdAt: T });
  const c = store().getVolumeLog('v4').updatedAt;
  assert.ok(a < b && b < c, [a, b, c].join(' < '));
});

test('서버에서 본 written_at보다 늦은 도장을 찍는다 (시계가 뒤처진 기기)', async () => {
  await noteServerTimeForTests(getDb(), '2026-12-01T00:00:00.000Z');
  await vol('v4', 'reading');
  assert.equal(store().getVolumeLog('v4').updatedAt, '2026-12-01T00:00:00.001Z');
});

test('연쇄로 생기는 세트·시리즈 기록도 새 도장을 받는다', async () => {
  await completeAll();
  const rows = await getDb().logs.toArray();
  assert.equal(rows.length, 6); // 권 3 + 세트 2 + 시리즈 1
  assert.equal(new Set(rows.map((r) => r.updatedAt)).size, rows.length);
});

test('삭제 경로: 완독을 되돌리면 세트·시리즈 완독이 묘비가 된다', async () => {
  await completeAll();
  const before = await getDb().logs.toArray();
  const setId = before.find((r) => r.logType === 'set_completion' && r.editionSetId === 'set1').id;
  const seriesId = before.find((r) => r.logType === 'series_completion').id;
  clock += 1000;
  await vol('v1', 'reading');
  const t = await tombs();
  assert.equal(t[setId].targetKey, 'set:set1');
  assert.equal(t[seriesId].targetKey, 'series:s1');
  assert.equal(t[setId].supersededBy, null);
  assert.equal(await getDb().logs.get(setId), undefined);
});

test('삭제 경로: deleteLogById (권 → 세트·시리즈 완독까지)', async () => {
  await completeAll();
  const all = await getDb().logs.toArray();
  const volId = all.find((r) => r.volumeId === 'v3').id;
  const setId = all.find((r) => r.logType === 'set_completion' && r.editionSetId === 'set2').id;
  const seriesId = all.find((r) => r.logType === 'series_completion').id;
  assert.equal(await store().deleteLogById(volId), true);
  const t = await tombs();
  assert.deepEqual(Object.keys(t).sort(), [volId, setId, seriesId].sort());
  assert.equal(t[volId].targetKey, 'volume:v3');
});

test('삭제 경로: 세트 완독 → 시리즈 완독, 시리즈 완독 혼자', async () => {
  await completeAll();
  const all = await getDb().logs.toArray();
  const set1 = all.find((r) => r.logType === 'set_completion' && r.editionSetId === 'set1').id;
  const seriesId = all.find((r) => r.logType === 'series_completion').id;
  await store().deleteLogById(set1);
  assert.deepEqual(Object.keys(await tombs()).sort(), [set1, seriesId].sort());
  await resetTombs();
  await completeAll();
  const s = (await getDb().logs.toArray()).find((r) => r.logType === 'series_completion');
  await store().deleteLogById(s.id);
  assert.deepEqual(Object.keys(await tombs()), [s.id]);
});
async function resetTombs() {
  await resetDbForTests();
  setBundledCatalogLoader(async () => structuredClone(CATALOG));
  useLogStore.setState({ volumeLogs: [], setCompletionLogs: [], seriesCompletionLogs: [] });
}

test('삭제 경로: deleteLogsByWorkId', async () => {
  await completeAll();
  const mine = (await getDb().logs.toArray()).filter((r) => r.workId === 'w1').map((r) => r.id);
  assert.equal(mine.length, 3); // 권 2 + 세트 1
  assert.equal(await store().deleteLogsByWorkId('w1'), true);
  assert.deepEqual(Object.keys(await tombs()).sort(), mine.sort());
});

test('삭제 경로 + 가져오기: deleteIds는 묘비, 덮어쓰는 기록은 지금 도장, 새 기록은 파일 시각', async () => {
  await vol('v4', 'reading', { currentPage: 3 });
  const existing = (await getDb().logs.toArray())[0];
  const incomingSameTarget = { ...existing, id: 'other-id', currentPage: 99, updatedAt: '2020-01-01T00:00:00.000Z' };
  const added = { ...existing, id: 'new-id', volumeId: 'v1', editionSetId: 'set1', workId: 'w1', updatedAt: '2020-02-02T00:00:00.000Z' };
  clock += 5000;
  const ok = await store().applyImport([incomingSameTarget, added], [existing.id], ['other-id']);
  assert.equal(ok, true);
  const t = await tombs();
  assert.equal(t[existing.id].targetKey, 'volume:v4');
  const rows = Object.fromEntries((await getDb().logs.toArray()).map((r) => [r.id, r]));
  assert.ok(rows['other-id'].updatedAt > '2026-06-01', '덮어쓴 기록은 지금 도장');
  assert.equal(rows['new-id'].updatedAt, '2020-02-02T00:00:00.000Z');
  assert.ok(t[existing.id].deletedAt <= rows['other-id'].updatedAt, '같은 시각이면 기록이 이긴다');
});

test('Dexie v2 → v3 업그레이드: 기존 기록·설정·편집본은 그대로, 묘비 테이블이 생긴다', async () => {
  closeDbForTests();
  await Dexie.delete(DB_NAME);
  const v2 = new Dexie(DB_NAME);
  v2.version(1).stores({ logs: 'id, logType, volumeId, editionSetId, workId, seriesId', catalogOverride: 'key' });
  v2.version(2).stores({ settings: 'key' });
  await v2.logs.put({ id: 'log-1', logType: 'volume', volumeId: 'v1' });
  await v2.settings.put({ key: 'k', value: 1 });
  await v2.catalogOverride.put({ key: 'current', baseHash: 'h', updatedAt: T, catalog: {} });
  v2.close();

  const db = getDb();
  assert.equal((await db.logs.get('log-1')).volumeId, 'v1');
  assert.equal((await db.settings.get('k')).value, 1);
  assert.equal((await db.catalogOverride.get('current')).baseHash, 'h');
  assert.equal(await db.tombstones.count(), 0);
  assert.equal(db.verno, 3);
});

test('롤백: 묘비가 남은 v3 DB에서도 기존 기능은 그대로 동작한다', async () => {
  await vol('v4', 'completed');
  await store().deleteLogById(store().getVolumeLog('v4').id);
  await vol('v4', 'reading', { currentPage: 7 });
  assert.equal(store().getVolumeLog('v4').currentPage, 7);
  assert.equal(Object.keys(await tombs()).length, 2); // 권 + 자동 생성된 세트 완독
});
