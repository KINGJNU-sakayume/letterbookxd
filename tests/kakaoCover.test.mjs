import './setup.mjs';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseKakaoThumbnail, pickKakaoCover, buildKakaoUrl, lookupKakaoCover, getKakaoKey, setKakaoKey, KakaoKeyMissingError,
  coverTargets, judgeCover, applyCoverChanges, coverReport, BookCover, resetDbForTests, LookupError,
} from '../.test-dist/app.js';

// 지어낸 값만 쓴다. 카카오에는 실제로 요청하지 않는다.
const ORIGINAL = 'http://t1.daumcdn.net/lbook/image/1234567?timestamp=20260101000000';
const thumbOf = (fname) => `https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=${fname}`;
const ONCE = thumbOf(encodeURIComponent(ORIGINAL));
const TWICE = thumbOf(encodeURIComponent(encodeURIComponent(ORIGINAL)));
const doc = (patch = {}) => ({ title: '가상의 책', isbn: '8900000000 9788900000001', thumbnail: ONCE, ...patch });
function fakeFetch(body, status = 200) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); };
  fn.calls = calls;
  return fn;
}

beforeEach(async () => { await resetDbForTests(); });

test('썸네일에서 원본 꺼내기: 한 번·두 번 인코딩, https로', () => {
  const want = 'https://t1.daumcdn.net/lbook/image/1234567?timestamp=20260101000000';
  assert.deepEqual(parseKakaoThumbnail(ONCE), { cover: want, thumb: ONCE });
  assert.deepEqual(parseKakaoThumbnail(TWICE), { cover: want, thumb: TWICE });
  assert.deepEqual(parseKakaoThumbnail(thumbOf(encodeURIComponent(ORIGINAL.replace('http:', 'https:')))).cover, want);
});

test('원본이 t1.daumcdn.net이 아니면 썸네일만, 썸네일도 카카오가 아니면 빈 값', () => {
  const other = thumbOf(encodeURIComponent('http://evil.example.com/x.jpg'));
  assert.deepEqual(parseKakaoThumbnail(other), { thumb: other });
  assert.deepEqual(parseKakaoThumbnail(thumbOf(encodeURIComponent('http://t1.daumcdn.net.evil.example/x.jpg'))).cover, undefined);
  assert.deepEqual(parseKakaoThumbnail('https://search1.kakaocdn.net/thumb/R120x174.q85/'), { thumb: 'https://search1.kakaocdn.net/thumb/R120x174.q85/' });
  assert.deepEqual(parseKakaoThumbnail('https://example.com/a.jpg'), {});
  assert.deepEqual(parseKakaoThumbnail(''), {});
  assert.deepEqual(parseKakaoThumbnail(null), {});
});

test('요청한 ISBN과 같은 책만 고른다 (ISBN10·13 어느 쪽이든)', () => {
  const json = { documents: [doc({ isbn: '8911111111 9788911111111', thumbnail: thumbOf('x') }), doc()] };
  assert.equal(pickKakaoCover(json, '9788900000001').cover, 'https://t1.daumcdn.net/lbook/image/1234567?timestamp=20260101000000');
  assert.ok(pickKakaoCover(json, '978-89-0000-000-1'));
  assert.ok(pickKakaoCover(json, '8900000000'));
  assert.equal(pickKakaoCover(json, '9780000000002'), null);
  assert.equal(pickKakaoCover({ documents: [doc({ thumbnail: '' })] }, '9788900000001'), null);
  assert.throws(() => pickKakaoCover({}, '9788900000001'), LookupError);
  assert.equal(buildKakaoUrl('978-89-0000-000-1'), 'https://dapi.kakao.com/v3/search/book?target=isbn&query=9788900000001');
});

test('호출: KakaoAK 헤더, 키 없음·401·네트워크 오류', async () => {
  const f = fakeFetch({ documents: [doc()] });
  const found = await lookupKakaoCover('9788900000001', { key: 'synthetic-rest-key', fetcher: f });
  assert.ok(found.cover);
  assert.equal(f.calls[0].init.headers.Authorization, 'KakaoAK synthetic-rest-key');

  await assert.rejects(lookupKakaoCover('9788900000001'), KakaoKeyMissingError);
  await setKakaoKey('  saved-synthetic  ');
  assert.equal(await getKakaoKey(), 'saved-synthetic');
  const f2 = fakeFetch({ documents: [] });
  assert.equal(await lookupKakaoCover('9788900000001', { fetcher: f2 }), null);
  assert.equal(f2.calls[0].init.headers.Authorization, 'KakaoAK saved-synthetic');
  await setKakaoKey(null);
  assert.equal(await getKakaoKey(), null);

  await assert.rejects(lookupKakaoCover('9788900000001', { key: 'k', fetcher: fakeFetch({ errorType: 'InvalidArgument' }, 401) }), (e) => e instanceof LookupError && e.code === '401');
  await assert.rejects(lookupKakaoCover('9788900000001', { key: 'k', fetcher: async () => { throw new TypeError('offline'); } }), LookupError);
  assert.equal(await lookupKakaoCover('', { key: 'k', fetcher: fakeFetch({}) }), null);
});

const catalog = {
  works: [{ id: 'w1', title: '가상의 책', representative_cover_url: 'https://image.aladin.co.kr/product/0/0/cover500/a.jpg' }],
  editions: [
    { id: 'e1', work_id: 'w1', publisher: '가', volume_number: '1', isbn: '9788900000001', cover_url: 'https://image.aladin.co.kr/product/0/0/cover500/a.jpg' },
    { id: 'e2', work_id: 'w1', publisher: '가', volume_number: '2', isbn: '', cover_url: 'https://image.aladin.co.kr/product/0/0/cover500/b.jpg' },
    { id: 'e3', work_id: 'w1', publisher: '나', volume_number: '1', isbn: '9788900000002', cover_url: 'https://t1.daumcdn.net/lbook/image/1' },
    { id: 'e4', work_id: 'w1', publisher: '다', volume_number: '1', isbn: '9788900000003', cover_url: 'https://i.namu.wiki/x.jpg' },
  ],
};

test('대상: ISBN 있는 알라딘 표지만 / 다시 확인은 카카오 표지만', () => {
  assert.deepEqual(coverTargets(catalog, 'aladin').map((t) => t.editionId), ['e1']);
  assert.deepEqual(coverTargets(catalog, 'recheck').map((t) => t.editionId), ['e3']);
});

test('판정과 반영: 같은 주소는 바꾸지 않고, 그 사이 바뀐 표지는 건너뛰고, 대표 표지도 같이', () => {
  const old = catalog.editions[0].cover_url;
  assert.deepEqual(judgeCover(old, null), { kind: 'not_found' });
  assert.deepEqual(judgeCover('https://t1.daumcdn.net/lbook/image/1', { cover: 'https://t1.daumcdn.net/lbook/image/1' }), { kind: 'same' });
  assert.deepEqual(judgeCover(old, { thumb: 'https://search1.kakaocdn.net/t' }), { kind: 'found', newUrl: 'https://search1.kakaocdn.net/t', original: false });
  const found = judgeCover(old, { cover: 'https://t1.daumcdn.net/lbook/image/9', thumb: 'https://search1.kakaocdn.net/t' });
  assert.deepEqual(found, { kind: 'found', newUrl: 'https://t1.daumcdn.net/lbook/image/9', original: true });

  const draft = structuredClone(catalog);
  const n = applyCoverChanges(draft, [
    { editionId: 'e1', oldUrl: old, newUrl: found.newUrl },
    { editionId: 'e3', oldUrl: 'https://changed-meanwhile', newUrl: 'https://t1.daumcdn.net/x' },
  ]);
  assert.equal(n, 1);
  assert.equal(draft.editions[0].cover_url, found.newUrl);
  assert.equal(draft.works[0].representative_cover_url, found.newUrl);
  assert.equal(draft.editions[2].cover_url, 'https://t1.daumcdn.net/lbook/image/1');

  const report = coverReport([
    { ...coverTargets(catalog, 'aladin')[0], outcome: found, applied: true },
    { ...coverTargets(catalog, 'recheck')[0], outcome: { kind: 'not_found' }, applied: false },
  ], '2026-11-07T00:00:00Z');
  assert.match(report, /바꿈 1권 · 못 찾음 1권/);
  assert.ok(report.includes(found.newUrl));
});

test('표지가 없으면 기본(천 장정) 표지, 있으면 이미지 + 로드 실패 시 기본 표지로 바꾸는 처리', () => {
  const none = renderToStaticMarkup(h(BookCover, { src: null, alt: '', title: '가상의 책' }));
  assert.match(none, /cover-fallback/);
  const img = renderToStaticMarkup(h(BookCover, { src: 'https://t1.daumcdn.net/lbook/image/1', alt: '', title: '가상의 책' }));
  assert.match(img, /<img[^>]+src="https:\/\/t1\.daumcdn\.net\/lbook\/image\/1"/);
});
