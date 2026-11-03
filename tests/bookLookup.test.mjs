import './setup.mjs';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import {
  asIsbn, buildNlkUrl, getLookupKey, LookupError, LookupKeyMissingError, nlkErrorMessage, parseNlkResponse,
  parsePageCount, searchBooks, setLookupKey, resetDbForTests, closeDbForTests, getDb, DB_NAME,
} from '../.test-dist/app.js';

// Synthetic data only. 국립중앙도서관에는 실제로 요청하지 않는다.
const KEY = 'synthetic-cert-key';
const doc = (patch = {}) => ({
  TITLE: '가상의 책', AUTHOR: '가상 작가 지음', PUBLISHER: '가상출판', EA_ISBN: '9790000000001',
  TITLE_URL: 'http://www.nl.go.kr/seoji/fu/ecip/dbfiles/CIP_FILES_TBL/synthetic.jpg', PAGE: '328 p.', VOL: '',
  ...patch,
});
const ok = (docs) => ({ PAGE_NO: '1', TOTAL_COUNT: String(docs.length), docs });
function fakeFetch(body, status = 200) {
  const calls = [];
  const fn = async (url) => { calls.push(String(url)); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); };
  fn.calls = calls;
  return fn;
}

beforeEach(async () => { await resetDbForTests(); });

test('쪽수 텍스트 해석', () => {
  assert.equal(parsePageCount('328 p.'), 328);
  assert.equal(parsePageCount('328쪽'), 328);
  assert.equal(parsePageCount('xii, 328 p.'), 328);
  assert.equal(parsePageCount('12, 345 p.'), 345);
  assert.equal(parsePageCount(200), 200);
  assert.equal(parsePageCount(''), null);
  assert.equal(parsePageCount('쪽수 없음'), null);
  assert.equal(parsePageCount(null), null);
});

test('응답 정규화: https 표지, 권차, 중복 제거, 빈 필드', () => {
  const list = parseNlkResponse(ok([
    doc(),
    doc(), // 같은 ISBN은 한 번만
    doc({ EA_ISBN: '979-0000000002', VOL: '제2권', TITLE_URL: '', PAGE: '' }),
    doc({ EA_ISBN: '', TITLE: '' }), // 둘 다 없으면 버림
    'garbage',
  ]));
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    isbn: '9790000000001', title: '가상의 책', author: '가상 작가 지음', publisher: '가상출판',
    cover: 'https://www.nl.go.kr/seoji/fu/ecip/dbfiles/CIP_FILES_TBL/synthetic.jpg', pageCount: 328, volume: '',
  });
  assert.deepEqual([list[1].isbn, list[1].volume, list[1].cover, list[1].pageCount], ['9790000000002', '2', '', null]);
  assert.deepEqual(parseNlkResponse({ PAGE_NO: '1', TOTAL_COUNT: '0' }), []);
});

test('오류 응답은 읽을 수 있는 메시지로', () => {
  assert.throws(() => parseNlkResponse({ RESULT: 'ERROR', ERR_CODE: '011', ERR_MESSAGE: '유효하지 않은 인증키 값입니다.' }),
    (e) => e instanceof LookupError && e.code === '011' && e.message.includes('인증키'));
  assert.match(nlkErrorMessage('010'), /인증키/);
  assert.match(nlkErrorMessage('999', '서버 점검'), /서버 점검.*999/);
  assert.throws(() => parseNlkResponse(null), LookupError);
});

test('ISBN이면 isbn, 아니면 title로 찾는다', () => {
  assert.equal(asIsbn('979-00-000-0000-1'), '9790000000001');
  assert.equal(asIsbn('89000000X'), null);
  assert.equal(asIsbn('890000000x'), '890000000X');
  assert.equal(asIsbn('가상의 책'), null);
  const byIsbn = new URL(buildNlkUrl(KEY, '9790000000001'));
  assert.equal(byIsbn.origin + byIsbn.pathname, 'https://www.nl.go.kr/seoji/SearchApi.do');
  assert.equal(byIsbn.searchParams.get('cert_key'), KEY);
  assert.equal(byIsbn.searchParams.get('result_style'), 'json');
  assert.equal(byIsbn.searchParams.get('isbn'), '9790000000001');
  assert.equal(byIsbn.searchParams.get('title'), null);
  const byTitle = new URL(buildNlkUrl(KEY, '  가상의 책 '));
  assert.equal(byTitle.searchParams.get('title'), '가상의 책');
  assert.equal(byTitle.searchParams.get('isbn'), null);
});

test('검색: 저장된 키를 쓰고, 키가 없으면 LookupKeyMissingError', async () => {
  const f = fakeFetch(ok([doc()]));
  await assert.rejects(searchBooks('가상의 책', { fetcher: f }), LookupKeyMissingError);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await searchBooks('   ', { fetcher: f }), []);

  await setLookupKey(`  ${KEY}  `);
  assert.equal(await getLookupKey(), KEY);
  const list = await searchBooks('가상의 책', { fetcher: f });
  assert.equal(list[0].pageCount, 328);
  assert.equal(new URL(f.calls[0]).searchParams.get('cert_key'), KEY);

  await assert.rejects(searchBooks('x', { fetcher: fakeFetch({}, 500) }), /HTTP 500/);
  await assert.rejects(searchBooks('x', { fetcher: async () => { throw new Error('net'); } }), /연결하지 못했습니다/);
  await assert.rejects(searchBooks('x', { fetcher: fakeFetch({ RESULT: 'ERROR', ERR_CODE: '011' }) }), /인증키/);

  await setLookupKey(null);
  assert.equal(await getLookupKey(), null);
  await setLookupKey('   ');
  assert.equal(await getLookupKey(), null);
});

test('IndexedDB v1 → 최신 업그레이드: 기존 기록과 편집본은 그대로', async () => {
  closeDbForTests();
  await Dexie.delete(DB_NAME);
  const v1 = new Dexie(DB_NAME);
  v1.version(1).stores({ logs: 'id, logType, volumeId, editionSetId, workId, seriesId', catalogOverride: 'key' });
  await v1.logs.put({ id: 'log-1', logType: 'volume', volumeId: 'v1' });
  await v1.catalogOverride.put({ key: 'current', baseHash: 'h', updatedAt: '2026-01-01T00:00:00.000Z', catalog: {} });
  v1.close();

  const db = getDb();
  assert.equal((await db.logs.get('log-1')).volumeId, 'v1');
  assert.equal((await db.catalogOverride.get('current')).baseHash, 'h');
  await setLookupKey(KEY);
  assert.equal(await getLookupKey(), KEY);
  assert.equal(db.verno, 3);
  assert.equal(await db.tombstones.count(), 0);
});
