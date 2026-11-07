import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './setup.mjs';
import {
  buildBoardTiles, clip, hasBoardData, monoOf, shortDate, IMAGE_ORIGINS, LINK_ORIGINS,
  createBoardUploader, readBoardState, boardNeedsReconnect, MIN_INTERVAL_MS, RESEND_AFTER_MS, BOARD_URL, BOARD_SCOPE,
} from '../.test-dist/app.js';
import { validateManifest } from './board/schema.js';
import { NOW, source, catalog, records, vol, setDone } from './board/fixture.mjs';

// 지어낸 값만 쓴다. policy는 board js/config.js와 같은 값이다.
const policy = { imageOrigins: [...IMAGE_ORIGINS], linkOrigins: [...LINK_ORIGINS] };

function check(manifest) {
  const r = validateManifest(manifest, policy);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  assert.equal(r.tiles.length, manifest.tiles.length, '남은 타일 수가 입력과 같아야 한다');
  return r;
}
function blanks(v, path = '$', out = []) {
  if (typeof v === 'string' && v !== '' && !v.trim()) out.push(path);
  if (typeof v === 'string' && v === '' && !path.endsWith('.alt')) out.push(path);
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) blanks(x, `${path}.${k}`, out);
  return out;
}

test('예시 출력: 저장소의 board/sample.json과 같고 규격 v1을 통과한다', () => {
  const manifest = buildBoardTiles(source, NOW);
  const sample = JSON.parse(readFileSync(new URL('../board/sample.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest, sample, 'board/sample.json을 다시 만들어 주세요');
  const r = check(manifest);
  assert.deepEqual(r.tiles.map((t) => t.id), ['reading', 'series', 'recent', 'next']);
  assert.ok(Buffer.byteLength(JSON.stringify(manifest)) <= 64 * 1024);
  assert.ok(!JSON.stringify(manifest).includes('data:'), 'data: 이미지는 넣지 않는다');
  assert.deepEqual(blanks(manifest), []);
});

test('policy 없이 검사하면 표지·링크 타일이 빠진다 (그래서 policy를 꼭 넘긴다)', () => {
  const r = validateManifest(buildBoardTiles(source, NOW), { imageOrigins: [], linkOrigins: [] });
  assert.equal(r.ok, true);
  assert.ok(r.errors.length > 0);
});

test('id·크기·기본 표시는 고정', () => {
  const tiles = Object.fromEntries(buildBoardTiles(source, NOW).tiles.map((t) => [t.id, t]));
  assert.deepEqual([tiles.reading.tone, tiles.reading.sizes, tiles.reading.size, tiles.reading.default], ['sleeve', ['1x1', '2x1', '2x2'], '2x2', true]);
  assert.deepEqual([tiles.series.form, tiles.series.sizes, tiles.series.size, tiles.series.default], ['cells', ['2x1', '4x1'], '2x1', true]);
  assert.deepEqual([tiles.recent.tone, tiles.recent.sizes, tiles.recent.size, tiles.recent.default], ['strip', ['2x1', '4x1'], '4x1', false]);
  assert.deepEqual([tiles.next.form, tiles.next.sizes, tiles.next.size, tiles.next.default], ['list', ['2x1', '2x2'], '2x2', false]);
  for (const t of Object.values(tiles)) {
    assert.ok(t.sizes.includes(t.size));
    assert.ok(t.href.startsWith('https://kingjnu-sakayume.github.io/letterbookxd/'));
  }
});

test('빈 상태: 기록이 없거나 안 읽음뿐이면 타일 0개, 완독만 있으면 읽는 중 자리에 최근 완독', () => {
  assert.deepEqual(buildBoardTiles({ records: [], catalog }, NOW).tiles, []);
  const unread = [vol('e-forest', 'w-forest', '숲길', 'unread', '2026-11-01T00:00:00Z')];
  assert.equal(hasBoardData(unread), false);
  assert.deepEqual(buildBoardTiles({ records: unread, catalog }, NOW).tiles, []);

  const onlyDone = [vol('e-wind', 'w-wind', '바람', 'completed', '2026-11-02T00:00:00Z'), setDone('w-wind', '바람', '2026-11-02T00:00:00Z')];
  const m = buildBoardTiles({ records: onlyDone, catalog }, NOW);
  check(m);
  const reading = m.tiles.find((t) => t.id === 'reading');
  assert.equal(reading.data.pill, '11/2 완독');
  assert.deepEqual(reading.data.cover, { mono: '바' }, 'sleeve 표지는 빼지 않고 글자 칸');
  assert.equal(m.tiles.find((t) => t.id === 'series'), undefined);
  assert.deepEqual(m.tiles.find((t) => t.id === 'next').data.rows, [{ title: '이어 읽을 책이 없어요', muted: true }]);
});

test('series: 가장 최근에 손댄 여러 권 판본(권) 또는 카탈로그 시리즈(편)', () => {
  const saga = [
    vol('e-saga-1', 'w-saga-1', '등대', 'completed', '2026-11-06T00:00:00Z'), setDone('w-saga-1', '등대', '2026-11-06T00:00:00Z'),
    vol('e-coast-1', 'w-coast', '예시 출판사', 'completed', '2026-11-01T00:00:00Z'),
  ];
  const m = buildBoardTiles({ records: saga, catalog }, NOW);
  check(m);
  const series = m.tiles.find((t) => t.id === 'series');
  assert.deepEqual(series.data, { label: '책장 · 등대의 연대기 · 1 / 3편', total: 3, filled: 1 });
  assert.ok(series.href.endsWith('#/series/s-saga'));
  const coast = buildBoardTiles({ records: saga.slice(2), catalog }, NOW).tiles.find((t) => t.id === 'series');
  assert.deepEqual(coast.data, { label: '책장 · 해안선의 기억 · 1 / 4권', total: 4, filled: 1 });
});

test('길이 자르기·빈 글자 빼기·주소 없는 표지', () => {
  assert.equal(clip('  ', 10), undefined);
  assert.equal(clip('', 10), undefined);
  assert.equal(clip('가나다라마바', 4), '가나다…');
  assert.equal(clip('a😀b', 2).length <= 2, true);
  assert.equal(monoOf(''), '책');
  const long = '아주'.repeat(120);
  const cat = {
    ...catalog,
    works: catalog.works.map((w) => (w.id === 'w-forest' ? { ...w, title: long, author: '   ' } : w)),
    editions: catalog.editions.map((e) => (e.id === 'e-forest' ? { ...e, publisher: '', cover_url: 'http://image.aladin.co.kr/x.jpg' } : e)),
  };
  const m = buildBoardTiles({ records: [vol('e-forest', 'w-forest', '숲길', 'reading', '2026-11-06T00:00:00Z', 10)], catalog: cat }, NOW);
  check(m);
  const reading = m.tiles.find((t) => t.id === 'reading');
  assert.equal(reading.data.title.length, 80);
  assert.ok(reading.data.title.endsWith('…'));
  assert.deepEqual(reading.data.cover, { mono: '아' }, 'https가 아닌 주소는 글자 칸');
  assert.equal(reading.data.sub, undefined, '출판사·작가가 비면 sub를 뺀다');
  assert.deepEqual(blanks(m), []);
});

test('날짜는 한국 시간 M/D, 해가 다르면 연도', () => {
  assert.equal(shortDate('2026-11-04T16:00:00Z', NOW), '11/5');
  assert.equal(shortDate('2025-12-31T16:00:00Z', NOW), '1/1');
  assert.equal(shortDate('2025-11-05T03:00:00Z', NOW), '2025/11/5');
  assert.equal(shortDate('nope', NOW), undefined);
});

test('같은 입력이면 같은 출력 (기록 순서가 달라도)', () => {
  const a = buildBoardTiles(source, NOW);
  const b = buildBoardTiles({ records: [...records].reverse(), catalog: { ...catalog, editions: [...catalog.editions].reverse(), works: [...catalog.works].reverse() } }, NOW);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(buildBoardTiles(source, NOW)));
});

/* ---------- 업로드 ---------- */

const TOKENS_KEY = 'letterbookxd.lifehub.tokens.v1';
function memory() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), map: m };
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function rig({ scope = 'letterbookxd:inbox letterbookxd:sync', recs = records, allowed = true } = {}) {
  const env = { clock: NOW, calls: [], replies: [], timers: [], lost: 0, logs: [], recs, allowed };
  const storage = memory();
  storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'a-synthetic', access_expires_at: NOW + 1e12, refresh_token: 'r-synthetic', scope }));
  env.storage = storage;
  env.deps = {
    storage, session: memory(), now: () => env.clock, random: (n) => new Uint8Array(n),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', d)),
    fetch: async (url, init) => {
      env.calls.push({ url: String(url), init });
      if (String(url).endsWith('/oauth/token')) return json({ access_token: 'a2-synthetic', refresh_token: 'r2-synthetic', token_type: 'Bearer', expires_in: 3600 });
      const next = env.replies.shift() ?? (() => json({ ok: true }));
      return next();
    },
  };
  env.make = () => createBoardUploader({
    deps: () => env.deps,
    load: async () => ({ records: env.recs, catalog }),
    allowed: () => env.allowed,
    onLost: () => env.lost++,
    setTimer: (fn, ms) => { env.timers.push({ fn, ms }); return env.timers.length; },
    clearTimer: () => {},
    log: (m) => env.logs.push(m),
  });
  env.puts = () => env.calls.filter((c) => c.url === BOARD_URL);
  return env;
}

test('저장: PUT /letterbookxd/v1/board, Bearer, JSON, generated_at은 올리는 순간', async () => {
  const env = rig();
  const up = env.make();
  assert.equal(await up.changed(), 'saved');
  const [put] = env.puts();
  assert.equal(put.init.method, 'PUT');
  assert.equal(put.init.headers.Authorization, 'Bearer a-synthetic');
  assert.equal(put.init.headers['Content-Type'], 'application/json');
  const body = JSON.parse(put.init.body);
  assert.equal(body.generated_at, new Date(NOW).toISOString());
  check(body);
  const st = readBoardState(env.deps);
  assert.equal(st.pending, false);
  assert.equal(st.sentAt, NOW);
  assert.match(st.sha, /^[0-9a-f]{64}$/);
});

test('unchanged·ignored도 성공, sha가 같으면 보내지 않는다', async () => {
  for (const reply of [{ unchanged: true }, { ignored: true }]) {
    const env = rig();
    env.replies.push(() => json(reply));
    const up = env.make();
    assert.equal(await up.changed(), reply.unchanged ? 'unchanged' : 'ignored');
    env.clock += MIN_INTERVAL_MS * 3;
    assert.equal(await up.changed(), 'same');
    assert.equal(env.puts().length, 1);
  }
});

test('insufficient_scope: 토큰을 지우지 않고 다시 연결 안내, 다시 연결하면 안내가 사라진다', async () => {
  const env = rig();
  env.replies.push(() => json({ error: 'insufficient_scope' }, 403, { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${BOARD_SCOPE}"` }));
  const up = env.make();
  assert.equal(await up.changed(), 'no_scope');
  assert.ok(env.storage.getItem(TOKENS_KEY), '토큰 유지');
  assert.equal(env.lost, 0);
  assert.equal(readBoardState(env.deps).pending, true);
  assert.equal(boardNeedsReconnect(env.deps), true);
  // 헤더를 못 읽어도(CORS) 보드 권한이 확인되지 않았으면 같은 처리
  const env2 = rig();
  env2.replies.push(() => json({ error: 'forbidden' }, 403));
  assert.equal(await env2.make().changed(), 'no_scope');
  assert.ok(env2.storage.getItem(TOKENS_KEY));
  // 다시 연결: 보드 권한이 있는 토큰
  env.storage.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'a3', access_expires_at: NOW + 1e12, refresh_token: 'r3', scope: `letterbookxd:inbox letterbookxd:sync ${BOARD_SCOPE}` }));
  assert.equal(boardNeedsReconnect(env.deps), false);
});

test('다른 403·갱신 뒤에도 401은 기존 규칙(연결 해제)', async () => {
  const env = rig({ scope: `letterbookxd:inbox letterbookxd:sync ${BOARD_SCOPE}` });
  env.replies.push(() => json({ error: 'nope' }, 403));
  assert.equal(await env.make().changed(), 'not_connected');
  assert.equal(env.storage.getItem(TOKENS_KEY), null);
  assert.equal(env.lost, 1);

  const env2 = rig();
  env2.replies.push(() => json({}, 401), () => json({}, 401));
  assert.equal(await env2.make().changed(), 'not_connected');
  assert.equal(env2.storage.getItem(TOKENS_KEY), null);

  const env3 = rig();
  env3.replies.push(() => json({}, 401), () => json({ ok: true }));
  assert.equal(await env3.make().changed(), 'saved', '401 한 번은 토큰 갱신 뒤 다시');
});

test('400·413은 같은 내용으로 다시 보내지 않고 콘솔에만, 5xx·네트워크는 다음 기회에', async () => {
  for (const status of [400, 413]) {
    const env = rig();
    env.replies.push(() => json({ error: 'bad' }, status));
    const up = env.make();
    assert.equal(await up.changed(), 'rejected');
    assert.equal(env.logs.length, 1);
    env.clock += MIN_INTERVAL_MS * 2;
    assert.equal(await up.changed(), 'rejected');
    assert.equal(env.puts().length, 1);
    assert.ok(env.storage.getItem(TOKENS_KEY));
  }
  const env = rig();
  env.replies.push(() => json({}, 503));
  const up = env.make();
  assert.equal(await up.changed(), 'retry');
  assert.equal(readBoardState(env.deps).pending, true);
  env.deps.fetch = async () => { throw new TypeError('offline'); };
  env.clock += MIN_INTERVAL_MS;
  assert.equal(await up.changed(), 'retry');
});

test('10분에 한 번 이하: 바뀐 내용은 10분이 차는 때 한 번', async () => {
  const env = rig();
  const up = env.make();
  assert.equal(await up.changed(), 'saved');
  env.clock += 60_000;
  env.recs = [...records, vol('e-coast-4', 'w-coast', '예시 출판사', 'reading', '2026-11-07T02:00:00Z', 10)];
  assert.equal(await up.changed(), 'scheduled');
  assert.equal(await up.changed(), 'scheduled');
  assert.equal(env.timers.length, 1, '타이머는 하나');
  assert.equal(env.timers[0].ms, MIN_INTERVAL_MS - 60_000);
  assert.equal(readBoardState(env.deps).pending, true);
  assert.equal(env.puts().length, 1);
  env.clock = NOW + MIN_INTERVAL_MS;
  env.timers[0].fn();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(env.puts().length, 2);
  assert.equal(readBoardState(env.deps).pending, false);
});

test('하루가 지나면 내용이 같아도 보낸다', async () => {
  const env = rig();
  const up = env.make();
  await up.changed();
  env.clock += RESEND_AFTER_MS - 1;
  assert.equal(await up.changed(), 'same');
  env.clock += 2;
  assert.equal(await up.changed(), 'saved');
  assert.equal(env.puts().length, 2);
});

test("'보낼 것 있음'은 다음 실행에서 나간다", async () => {
  const env = rig();
  await env.make().changed();
  env.clock += 60_000;
  env.recs = [...records, setDone('w-coast', '예시 출판사', '2026-11-07T02:30:00Z')];
  assert.equal(await env.make().changed(), 'scheduled');
  // 앱을 닫았다가 다음 날 다시 연다: 같은 저장소, 새 업로더
  env.clock += 3600_000;
  const reopened = env.make();
  assert.equal(reopened.hasPending(), true);
  assert.equal(await reopened.changed(), 'saved');
  assert.equal(env.puts().length, 2);
  assert.equal(reopened.hasPending(), false);
});

test('기록 없음·미리보기(허용 안 됨)·연결 안 됨이면 보내지 않는다', async () => {
  const empty = rig({ recs: [] });
  assert.equal(await empty.make().changed(), 'empty');
  const notAllowed = rig({ allowed: false });
  assert.equal(await notAllowed.make().changed(), 'not_allowed');
  assert.equal(readBoardState(notAllowed.deps).pending, true);
  const off = rig();
  off.storage.removeItem(TOKENS_KEY);
  assert.equal(await off.make().changed(), 'not_connected');
  for (const e of [empty, notAllowed, off]) assert.equal(e.puts().length, 0);
});
