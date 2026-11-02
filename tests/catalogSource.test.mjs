import './setup.mjs';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDbForTests, setBundledCatalogLoader, getCatalog, getCatalogStatus, getCatalogOverride, mutateCatalog,
  discardCatalogEdits, replaceCatalogOverride, seriesInfoForWork, hashCatalog, normalizeCatalog, serializeCatalog,
  fetchCatalogRows, fetchWorksBySeriesId, insertWork, insertEdition, updateWork, deleteWork, upsertFlowchart,
} from '../.test-dist/app.js';

// Synthetic data only.
const T = '2026-01-01T00:00:00.000Z';
const BUNDLED = {
  version: 1,
  works: [
    { id: 'w2', title: '나 작품', author: '가상 작가', original_excerpt: '', representative_cover_url: null, series_id: 's1', series_order: 2, created_at: T },
    { id: 'w1', title: '가 작품', author: '가상 작가', original_excerpt: '', representative_cover_url: null, series_id: 's1', series_order: 1, created_at: T },
  ],
  editions: [{ id: 'e1', work_id: 'w1', publisher: '가상출판', isbn: '0', excerpt: null, cover_url: 'c', volume_number: '1', page_count: 100, created_at: T }],
  series: [{ id: 's1', title: '가상 시리즈', author: '가상 작가', created_at: T }],
  authors: [],
};
let bundled;

beforeEach(async () => {
  await resetDbForTests();
  bundled = structuredClone(BUNDLED);
  setBundledCatalogLoader(async () => bundled);
});

test('정규화: 빠진 배열을 채우고 id순 정렬, 직렬화는 안정적', () => {
  const n = normalizeCatalog(BUNDLED);
  assert.deepEqual(n.works.map((w) => w.id), ['w1', 'w2']);
  assert.deepEqual(n.flowcharts, []);
  assert.equal(hashCatalog(BUNDLED), hashCatalog(n));
  assert.ok(serializeCatalog(BUNDLED).endsWith('}\n'));
  assert.deepEqual(JSON.parse(serializeCatalog(BUNDLED)), n);
  assert.throws(() => normalizeCatalog({ works: [{ title: 'no id' }] }));
  assert.throws(() => normalizeCatalog(null));
});

test('편집본이 없으면 번들, 편집하면 편집본이 우선', async () => {
  assert.equal((await getCatalogStatus()).edited, false);
  const work = await insertWork({ title: '새 작품', author: '가상 작가' });
  assert.match(work.id, /^[0-9a-f-]{36}$/);
  await insertEdition({ work_id: work.id, publisher: 'p', isbn: '1', excerpt: null, cover_url: '', volume_number: '1', page_count: 10 });
  await updateWork('w1', { title: '가 작품 (개정)' });

  const status = await getCatalogStatus();
  assert.equal(status.edited, true);
  assert.equal(status.stale, false);
  assert.equal(status.counts.works, 3);
  assert.equal((await getCatalog()).works.find((w) => w.id === 'w1').title, '가 작품 (개정)');
  // 번들 원본은 그대로
  assert.equal(bundled.works.find((w) => w.id === 'w1').title, '가 작품');

  // 캐시 없이 IndexedDB에서 다시 읽어도 편집본
  setBundledCatalogLoader(async () => bundled);
  assert.equal((await getCatalog()).works.length, 3);
  const rows = await fetchCatalogRows();
  assert.deepEqual(rows.works.map((w) => w.title), ['가 작품 (개정)', '나 작품', '새 작품']);
  assert.equal(rows.works[0].editions.length, 1);
});

test('번들과 같아지면 편집본을 지운다, 버리기', async () => {
  await updateWork('w1', { title: '임시' });
  assert.equal((await getCatalogStatus()).edited, true);
  await updateWork('w1', { title: '가 작품' });
  assert.equal((await getCatalogStatus()).edited, false);

  await deleteWork('w1');
  const c = await getCatalog();
  assert.equal(c.works.length, 1);
  assert.equal(c.editions.length, 0);
  await discardCatalogEdits();
  assert.equal((await getCatalog()).works.length, 2);
  assert.equal(await getCatalogOverride(), null);
});

test('배포된 catalog.json이 바뀌면 stale 경고', async () => {
  await upsertFlowchart('가상 작가', [], []);
  const baseHash = (await getCatalogOverride()).baseHash;
  assert.equal(baseHash, hashCatalog(BUNDLED));
  bundled = { ...structuredClone(BUNDLED), authors: [{ id: 'a1', name: '새 작가' }] };
  setBundledCatalogLoader(async () => bundled);
  const status = await getCatalogStatus();
  assert.equal(status.edited, true);
  assert.equal(status.stale, true);
  assert.equal((await getCatalog()).flowcharts.length, 1);
});

test('mutateCatalog는 차례로, 실패하면 저장하지 않는다', async () => {
  await Promise.all([1, 2, 3].map((n) => insertWork({ title: `동시 ${n}`, author: 'x' })));
  assert.equal((await getCatalog()).works.length, 5);
  await assert.rejects(mutateCatalog(() => { throw new Error('boom'); }));
  await assert.rejects(insertEdition({ work_id: 'missing', publisher: 'p', isbn: '', excerpt: null, cover_url: '', volume_number: '1', page_count: 0 }));
  assert.equal((await getCatalog()).works.length, 5);
});

test('replaceCatalogOverride와 시리즈 조회', async () => {
  const catalog = normalizeCatalog({ ...BUNDLED, works: [BUNDLED.works[1]] });
  await replaceCatalogOverride({ catalog, baseHash: 'old', updatedAt: T });
  assert.equal((await getCatalog()).works.length, 1);
  assert.equal((await getCatalogStatus()).stale, true);
  await replaceCatalogOverride(null);
  assert.deepEqual(await seriesInfoForWork('w1'), { seriesId: 's1', workIds: ['w1', 'w2'] });
  assert.equal(await seriesInfoForWork('nope'), null);
  assert.deepEqual((await fetchWorksBySeriesId('s1')).map((w) => [w.id, w.editions.length]), [['w1', 1], ['w2', 0]]);
});
