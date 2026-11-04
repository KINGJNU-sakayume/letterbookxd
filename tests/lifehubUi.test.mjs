// Life Hub 화면 규격: 설정의 「Life Hub」 섹션, 책장의 제안 띠, 계정 메뉴의 「확인 필요」 점.
// react-dom/server로 그려서 마크업을 본다 (새 의존성 없음). 합성 데이터만 쓴다.
import './setup.mjs';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

function memory() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}
const local = memory();
const session = memory();
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true, writable: true });
// 배포 주소가 아닌 곳 (연결 버튼은 비활성)
Object.defineProperty(globalThis, 'location', { value: { origin: 'http://localhost:5173', pathname: '/' }, configurable: true, writable: true });

const {
  ensureSyncOn, deriveHubView, formatSyncTime, readConfig, writeConfig,
  ProposalStrip, LifeHubPanel, LifeHubSection, AccountMenu,
} = await import('../.test-dist/app.js');

const TOKENS_KEY = 'letterbookxd.lifehub.tokens.v1';
const FULL = 'letterbookxd:inbox letterbookxd:sync';
const INBOX = 'letterbookxd:inbox';
const connect = (scope) =>
  local.setItem(TOKENS_KEY, JSON.stringify({ access_token: 'a-synthetic', access_expires_at: 0, refresh_token: 'r-synthetic', scope }));
const render = (el) => renderToStaticMarkup(h(MemoryRouter, null, el));
const noop = () => {};
const proposal = (key) => ({
  key, status: 'open', title: '가상 작품', volume: null, author: '가상 작가', state: 'completed', currentPage: null,
  rating: null, liked: false, date: null, note: null, needsAppReview: false,
});
const dots = (html) => (html.match(/data-attention-dot/g) ?? []).length;
const deps = { storage: local };

beforeEach(() => {
  local.clear();
  session.clear();
});

test('(1) 제안 0건이면 책장의 제안 진입점을 렌더하지 않는다', () => {
  assert.equal(render(h(ProposalStrip, { proposals: [], onReject: noop, onSaved: noop })), '');
  assert.equal(render(h(LifeHubPanel)), '');
  const two = render(h(ProposalStrip, { proposals: [proposal('k1'), proposal('k2')], onReject: noop, onSaved: noop }));
  assert.match(two, /Claude가 제안한 기록 <span class="tnum">2<\/span>건/);
  assert.match(two, />검토</);
  assert.doesNotMatch(two, /Life Hub 연결|연결 해제|자동 반영/);
});

test('(2) 상태 C이면 계정 메뉴 버튼과 설정 항목에 점이 있고 접근성 이름에 (확인 필요)가 붙는다', () => {
  connect(INBOX); // 동기화 권한이 없는 연결 → C
  const c = render(h(AccountMenu, { initialOpen: true }));
  assert.equal(dots(c), 2);
  assert.match(c, /aria-label="내 서재 메뉴 \(확인 필요\)"/);
  assert.match(c, /aria-label="설정 · 백업 \(확인 필요\)"/);

  connect(FULL); // 정상 연결 → B
  const b = render(h(AccountMenu, { initialOpen: true }));
  assert.equal(dots(b), 0);
  assert.doesNotMatch(b, /확인 필요/);

  local.clear(); // 연결 전 → A
  assert.equal(dots(render(h(AccountMenu, { initialOpen: true }))), 0);
});

test('(3) 연결 전에는 설정의 Life Hub 섹션에만 「Life Hub 연결」 버튼이 있다', () => {
  const section = render(h(LifeHubSection));
  assert.match(section, /<h2[^>]*>Life Hub<\/h2>/);
  assert.match(section, /Claude가 제안한 기록을 받고, 이 앱의 기록을 다른 기기와 맞춥니다\./);
  assert.match(section, /<button[^>]*disabled=""[^>]*>Life Hub 연결<\/button>/);
  assert.match(section, /배포된 주소에서만 연결할 수 있어요\./);
  assert.doesNotMatch(render(h(LifeHubPanel)), /Life Hub 연결/);
  assert.doesNotMatch(render(h(AccountMenu, { initialOpen: true })), /Life Hub 연결/);

  // 소스 전체에서 「Life Hub 연결」 버튼 문구는 설정 섹션 한 곳에만 있다
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx')) files.push(p);
    }
  };
  walk('src');
  const withButton = files.filter((f) => />\s*Life Hub 연결\s*</.test(readFileSync(f, 'utf8')));
  assert.deepEqual(withButton.map((f) => f.replace(/\\/g, '/')), ['src/lifehub/LifeHubSection.tsx']);
});

test('(4) 연결된 설정 섹션에 「동기화 켜기/끄기」 컨트롤이 없다', () => {
  connect(FULL);
  const html = render(h(LifeHubSection));
  assert.match(html, /연결됨 · /);
  assert.match(html, /지금 동기화/);
  assert.match(html, /연결 해제/);
  assert.match(html, /Claude에서 승인한 기록은 바로 반영/);
  assert.match(html, /<summary[^>]*>고급<\/summary>/);
  assert.doesNotMatch(html, /동기화 켜기|동기화 끄기|Life Hub 연결</);
  assert.doesNotMatch(html, /클라우드/);
  // 체크박스는 자동 반영 하나뿐
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 1);
});

test('(5) 연결 + 동기화 권한이 있으면 저장값이 꺼짐이어도 동기화가 켜진다', () => {
  writeConfig(deps, { enabled: false });
  connect(FULL);
  assert.equal(ensureSyncOn(deps), true);
  assert.equal(readConfig(deps).enabled, true);
  assert.equal(ensureSyncOn(deps), false, '이미 켜져 있으면 그대로');

  local.clear();
  writeConfig(deps, { enabled: false });
  connect(INBOX);
  ensureSyncOn(deps);
  assert.equal(readConfig(deps).enabled, false, '동기화 권한이 없는 연결은 켜지 않는다');

  local.clear();
  writeConfig(deps, { enabled: false });
  ensureSyncOn(deps);
  assert.equal(readConfig(deps).enabled, false, '연결 전에는 켜지 않는다');
});

test('상태 매핑: error·no_scope·review·너무 큼은 C, 진행·재시도·정상은 B', () => {
  const now = new Date(2026, 10, 4, 15, 0).getTime();
  const base = { connected: true, lost: false, mayHaveScope: true, proposalSyncing: false, now };
  const snap = (status, extra = {}) => ({ status, detail: null, lastSuccessAt: null, ...extra });
  assert.deepEqual(deriveHubView({ ...base, connected: false, snap: snap('off') }), { kind: 'A' });
  assert.equal(deriveHubView({ ...base, connected: false, lost: true, snap: snap('error') }).cause, 'lost');
  assert.equal(deriveHubView({ ...base, mayHaveScope: false, snap: snap('on') }).cause, 'no_scope');
  for (const s of ['error', 'no_scope', 'review', 'too_large']) {
    const v = deriveHubView({ ...base, snap: snap(s, { detail: '기존 문구' }) });
    assert.equal(v.kind, 'C', s);
    assert.equal(v.cause, s);
  }
  assert.equal(deriveHubView({ ...base, snap: snap('syncing') }).line, '연결됨 · 동기화 중…');
  assert.equal(deriveHubView({ ...base, proposalSyncing: true, snap: snap('on') }).line, '연결됨 · 동기화 중…');
  assert.equal(deriveHubView({ ...base, snap: snap('retry_later') }).line, '연결됨 · 잠시 뒤 다시 시도');
  assert.equal(deriveHubView({ ...base, snap: snap('on') }).line, '연결됨 · 아직 동기화 전');
  const at = new Date(2026, 10, 4, 9, 5).toISOString();
  assert.equal(deriveHubView({ ...base, snap: snap('on', { lastSuccessAt: at }) }).line, '연결됨 · 오늘 09:05 동기화');
});

test('동기화 시각: 오늘이면 「오늘 HH:MM」, 아니면 「M월 D일 HH:MM」', () => {
  const now = new Date(2026, 10, 4, 23, 59).getTime();
  assert.equal(formatSyncTime(new Date(2026, 10, 4, 0, 7).toISOString(), now), '오늘 00:07');
  assert.equal(formatSyncTime(new Date(2026, 2, 9, 18, 30).toISOString(), now), '3월 9일 18:30');
});
