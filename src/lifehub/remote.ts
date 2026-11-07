/**
 * 책장 ↔ Life Hub connection.
 *
 * - Connect: OAuth 2.1 authorization code + PKCE (S256); 책장 is a public client identified by
 *   public/lifehub-client.json. It asks for `letterbookxd:inbox letterbookxd:sync letterbookxd:board`; Life Hub grants the sync scope only
 *   when the owner ticks the sync checkbox on the consent page, so the granted scope is kept from the token response. Life Hub returns to
 *   /lifehub/ (public/lifehub/index.html), which hands the result to the app.
 * - Proposals (`reading_record`) are fetched live (`status=open`: pending, plus those the owner approved in a
 *   Claude card) and validated again here. Nothing is recorded until the owner approves one, on the bookshelf
 *   page or in a Claude card; a card-approved proposal is recorded on opening only when the book is clear (autoPlan).
 * - The catalogue (works, editions) is shared with Life Hub for the card's title list and its "is the book clear" check.
 * - Receipts (proposal → reading log ID) and rejections are kept in localStorage and retried until answered.
 *
 * No imports, so the tests can compile this file on its own.
 */
export const LIFEHUB_ORIGIN = 'https://life-hub-api.213303.workers.dev';
export const APP_URL = 'https://kingjnu-sakayume.github.io/letterbookxd/';
export const CALLBACK_URL = APP_URL + 'lifehub/';
export const CLIENT_ID = APP_URL + 'lifehub-client.json';
export const RESOURCE = LIFEHUB_ORIGIN + '/letterbookxd';
export const INBOX_SCOPE = 'letterbookxd:inbox';
export const SYNC_SCOPE = 'letterbookxd:sync';
/** Life Board tile list upload (PUT /letterbookxd/v1/board). Connections made before it was added lack it. */
export const BOARD_SCOPE = 'letterbookxd:board';
export const SCOPE = `${INBOX_SCOPE} ${SYNC_SCOPE} ${BOARD_SCOPE}`;
const API = LIFEHUB_ORIGIN + '/letterbookxd/v1';
const SYNC_API = API + '/sync';
export const BOARD_URL = API + '/board';
/** Written by public/lifehub/index.html. */
export const CALLBACK_KEY = 'letterbookxd.lifehub.callback.v1';

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface Deps {
  fetch: typeof fetch;
  storage: KV;
  session: KV;
  now: () => number;
  random: (bytes: number) => Uint8Array;
  sha256: (data: Uint8Array) => Promise<Uint8Array>;
}
export function browserDeps(): Deps {
  return {
    fetch: (input, init) => fetch(input, init),
    storage: localStorage,
    session: sessionStorage,
    now: () => Date.now(),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(d))),
  };
}

/** 'no_scope': the token has no sync scope (the owner did not tick the sync checkbox). The token stays valid for the inbox. */
export type LifeHubErrorKind = 'not_connected' | 'denied' | 'state' | 'network' | 'server' | 'no_scope';
export class LifeHubError extends Error {
  kind: LifeHubErrorKind;
  constructor(kind: LifeHubErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/* ---------- contract (mirrors life-hub src/adapters/letterbookxd.js) ---------- */

export interface ReadingProposal {
  key: string;
  createdAt: string;
  /** 'approved' = the owner approved it in a Claude card (not recorded yet). */
  status: 'pending' | 'approved';
  needsAppReview: boolean;
  title: string;
  author: string | null;
  publisher: string | null;
  volume: number | null;
  state: 'reading' | 'completed';
  currentPage: number | null;
  rating: number | null;
  liked: boolean;
  date: string | null;
  note: string | null;
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every((k) => keys.includes(k));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optText = (v: unknown, max: number) => v === undefined || text(v, max);
const intIn = (v: unknown, lo: number, hi: number) => v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi);
const KEY = /^(claude|chatgpt|codex|manual):[A-Za-z0-9_.:-]{8,128}$/;
export const validDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** Validates one item from the hub; null for anything that does not match the contract. */
export function parseProposal(item: unknown): ReadingProposal | null {
  if (!obj(item) || typeof item.key !== 'string' || !KEY.test(item.key)) return null;
  if (item.status !== undefined && item.status !== 'pending' && item.status !== 'approved') return null;
  // The owner's edited version from a Claude card wins; it passes the same checks.
  const c = item.final_candidate ?? item.candidate;
  if (!obj(c)) return null;
  if (c.schema_version !== 1 || c.candidate_type !== 'reading_record' || typeof c.source !== 'string' ||
    `${c.source}:${String(c.idempotency_key)}` !== item.key || typeof c.created_at !== 'string' || !obj(c.payload)) return null;
  const p = c.payload;
  if (!only(p, ['title', 'author', 'publisher', 'volume', 'state', 'current_page', 'rating', 'liked', 'date', 'note']) ||
    !text(p.title, 200) || !optText(p.author, 100) || !optText(p.publisher, 100) || !optText(p.note, 500) ||
    (p.state !== 'reading' && p.state !== 'completed') || !intIn(p.volume, 1, 200) || !intIn(p.current_page, 1, 20000) ||
    !intIn(p.rating, 1, 5) || (p.liked !== undefined && p.liked !== true) || (p.date !== undefined && !validDate(p.date))) return null;
  if (p.state === 'completed' && p.current_page !== undefined) return null;
  if (p.state === 'reading' && (p.rating !== undefined || p.liked !== undefined)) return null;
  return {
    key: item.key, createdAt: c.created_at,
    status: item.status === 'approved' ? 'approved' : 'pending', needsAppReview: item.needs_app_review === true,
    title: p.title.trim(),
    author: typeof p.author === 'string' ? p.author.trim() : null,
    publisher: typeof p.publisher === 'string' ? p.publisher.trim() : null,
    volume: typeof p.volume === 'number' ? p.volume : null,
    state: p.state,
    currentPage: typeof p.current_page === 'number' ? p.current_page : null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    liked: p.liked === true,
    date: typeof p.date === 'string' ? p.date : null,
    note: typeof p.note === 'string' ? p.note.trim() : null,
  };
}

/* ---------- OAuth ---------- */

const TOKENS_KEY = 'letterbookxd.lifehub.tokens.v1';
const PENDING_AUTH_KEY = 'letterbookxd.lifehub.pending-auth.v1';
const OUTCOMES_KEY = 'letterbookxd.lifehub.outcomes.v1';
const REJECTIONS_KEY = 'letterbookxd.lifehub.rejections.v1';
const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
interface Tokens { access_token: string; access_expires_at: number; refresh_token: string; /** scope Life Hub granted (space separated), when it said */ scope?: string }
interface PendingAuth { state: string; verifier: string; created_at: number }
export type Outcome = 'confirmed' | 'rejected' | 'conflict' | 'missing';

function readJson<T>(store: KV, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function connectAvailable(loc: { origin: string; pathname: string }): boolean {
  const app = new URL(APP_URL);
  return loc.origin === app.origin && loc.pathname.startsWith(app.pathname) && !loc.pathname.startsWith(app.pathname + 'preview/');
}
export function isConnected(deps: Pick<Deps, 'storage'>): boolean {
  return typeof readJson<Tokens>(deps.storage, TOKENS_KEY)?.refresh_token === 'string';
}

export async function beginConnect(deps: Deps): Promise<string> {
  const verifier = b64url(deps.random(32));
  const state = b64url(deps.random(16));
  const challenge = b64url(await deps.sha256(new TextEncoder().encode(verifier)));
  const pending: PendingAuth = { state, verifier, created_at: deps.now() };
  deps.session.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));
  const q = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE,
  });
  return LIFEHUB_ORIGIN + '/authorize?' + q.toString();
}

async function tokenRequest(deps: Deps, params: Record<string, string>): Promise<Tokens> {
  let response: Response;
  try {
    response = await deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
    });
  } catch {
    throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (body.error === 'invalid_grant') {
      deps.storage.removeItem(TOKENS_KEY);
      throw new LifeHubError('not_connected', 'Life Hub 연결이 만료됐어요. 다시 연결해 주세요.');
    }
    throw new LifeHubError('server', `Life Hub 인증 서버 오류 (${response.status})`);
  }
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || String(body.token_type).toLowerCase() !== 'bearer')
    throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  // A refresh response may leave the scope out: keep what was granted before.
  const scope = typeof body.scope === 'string' ? body.scope : readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope;
  const tokens: Tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_expires_at: deps.now() + (typeof body.expires_in === 'number' ? body.expires_in : 300) * 1000,
    ...(scope === undefined ? {} : { scope }),
  };
  deps.storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/** Finish a sign-in whose result the callback page left in this tab. Returns false when there is none. */
export async function completeStoredCallback(deps: Deps): Promise<boolean> {
  const search = deps.session.getItem(CALLBACK_KEY);
  if (search === null) return false;
  deps.session.removeItem(CALLBACK_KEY);
  const q = new URLSearchParams(search);
  const pending = readJson<PendingAuth>(deps.session, PENDING_AUTH_KEY);
  deps.session.removeItem(PENDING_AUTH_KEY);
  if (!pending || q.get('state') !== pending.state || deps.now() - pending.created_at > AUTH_MAX_AGE_MS)
    throw new LifeHubError('state', '연결 요청이 만료됐거나 이 브라우저에서 시작되지 않았어요. 다시 연결해 주세요.');
  if (q.has('iss') && q.get('iss') !== LIFEHUB_ORIGIN) throw new LifeHubError('state', '다른 서버의 응답이라 연결하지 않았어요.');
  if (q.has('error')) throw new LifeHubError('denied', q.get('error') === 'access_denied' ? 'Life Hub 연결을 거절했어요.' : 'Life Hub 연결에 실패했어요.');
  const code = q.get('code');
  if (!code) throw new LifeHubError('state', '인증 코드가 없어요.');
  await tokenRequest(deps, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK_URL, code_verifier: pending.verifier, resource: RESOURCE });
  return true;
}

async function accessToken(deps: Deps, force = false): Promise<string> {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  if (!tokens?.refresh_token) throw new LifeHubError('not_connected', 'Life Hub에 연결되어 있지 않아요.');
  if (!force && tokens.access_expires_at - 60_000 > deps.now()) return tokens.access_token;
  return (await tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).access_token;
}

async function api(deps: Deps, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(API + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

/**
 * false only when Life Hub told us which scope it granted and the sync scope is not in it. Unknown (a connection
 * from before the scope was kept) counts as "maybe": the server decides, and answers with insufficient_scope.
 */
export function mayHaveSyncScope(deps: Pick<Deps, 'storage'>): boolean {
  const scope = readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope;
  return scope === undefined || scope.split(/\s+/).includes(SYNC_SCOPE);
}

/** true only when Life Hub said the sync scope was granted. */
function hasSyncScope(deps: Pick<Deps, 'storage'>): boolean {
  const scope = readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope;
  return scope !== undefined && scope.split(/\s+/).includes(SYNC_SCOPE);
}

/**
 * A request to the sync resource (`/letterbookxd/v1/sync`, `path` '' or '/meta').
 * 403 + `WWW-Authenticate: ... error="insufficient_scope"` means the token has the inbox scope only: the token stays
 * (the inbox still works with it) and a 'no_scope' error is thrown. If the browser cannot read that header (CORS
 * exposes only some headers) and the sync scope is not confirmed in the token, it is treated the same way (the token is kept). Any other
 * 403, and a 401 that survives a refresh, end the connection exactly like api().
 */
export async function syncRequest(
  deps: Deps, method: 'GET' | 'PUT', path: '' | '/meta', init: { headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(SYNC_API + path, {
        method,
        headers: { Authorization: 'Bearer ' + token, ...(init.headers ?? {}) },
        ...(init.body === undefined ? {} : { body: init.body }),
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 403) {
    const challenge = response.headers.get('WWW-Authenticate') ?? '';
    if (/error="?insufficient_scope"?/i.test(challenge) || (challenge === '' && !hasSyncScope(deps)))
      throw new LifeHubError('no_scope', '동기화 권한이 없어요. Life Hub를 다시 연결하며 동기화에 체크해 주세요.');
  }
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

/** true only when Life Hub said the board scope was granted. */
export function hasBoardScope(deps: Pick<Deps, 'storage'>): boolean {
  const scope = readJson<Tokens>(deps.storage, TOKENS_KEY)?.scope;
  return scope !== undefined && scope.split(/\s+/).includes(BOARD_SCOPE);
}

/**
 * The board tile list upload (`PUT /letterbookxd/v1/board`), kept apart from api() so that a missing board scope
 * never ends the connection used by the inbox and sync.
 * 403 with `insufficient_scope` (checked first), or a 403 whose header the browser cannot read while the board scope is
 * not confirmed in the token, throws 'no_scope' and keeps the token. Any other 403, and a 401 that survives a refresh,
 * end the connection exactly like api().
 */
export async function boardRequest(deps: Deps, body: string): Promise<Response> {
  const send = async (token: string) => {
    try {
      return await deps.fetch(BOARD_URL, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.');
    }
  };
  let response = await send(await accessToken(deps));
  if (response.status === 401) response = await send(await accessToken(deps, true));
  if (response.status === 403) {
    const challenge = response.headers.get('WWW-Authenticate') ?? '';
    if (/error="?insufficient_scope"?/i.test(challenge) || (challenge === '' && !hasBoardScope(deps)))
      throw new LifeHubError('no_scope', '보드에 올리려면 Life Hub에 다시 연결해 주세요.');
  }
  if (response.status === 401 || response.status === 403) {
    deps.storage.removeItem(TOKENS_KEY);
    throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
  }
  return response;
}

export function disconnect(deps: Deps): void {
  const tokens = readJson<Tokens>(deps.storage, TOKENS_KEY);
  deps.storage.removeItem(TOKENS_KEY);
  if (tokens?.refresh_token)
    void deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token, token_type_hint: 'refresh_token', client_id: CLIENT_ID }).toString(),
    }).catch(() => undefined);
}

/* ---------- local decisions and outbox ---------- */

const RECEIPTS_KEY = 'letterbookxd.lifehub.receipts.v1';
const ENTITY_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function outcomes(deps: Pick<Deps, 'storage'>): Record<string, Outcome> {
  const map = readJson<Record<string, Outcome>>(deps.storage, OUTCOMES_KEY);
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}
export function rejectLocally(key: string, deps: Pick<Deps, 'storage'>): void {
  const list = readJson<string[]>(deps.storage, REJECTIONS_KEY) ?? [];
  if (!list.includes(key)) deps.storage.setItem(REJECTIONS_KEY, JSON.stringify([...list, key]));
}
/** The owner approved a proposal and it was saved as this reading log. */
export function rememberReceipt(key: string, logId: string, deps: Pick<Deps, 'storage'>): void {
  const map = readJson<Record<string, string>>(deps.storage, RECEIPTS_KEY) ?? {};
  map[key] = logId;
  deps.storage.setItem(RECEIPTS_KEY, JSON.stringify(map));
}
export function receipts(deps: Pick<Deps, 'storage'>): Array<{ key: string; logId: string }> {
  const map = readJson<Record<string, string>>(deps.storage, RECEIPTS_KEY) ?? {};
  return Object.entries(map).filter(([key, id]) => KEY.test(key) && typeof id === 'string' && ENTITY_ID.test(id)).map(([key, logId]) => ({ key, logId }));
}

/* ---------- Claude card approvals and the shared catalogue ---------- */

const AUTO_APPLY_KEY = 'letterbookxd.lifehub.auto-apply.v1';
/** 「Claude에서 승인된 항목 자동 반영」, per device, on unless turned off. */
export const autoApplyEnabled = (deps: Pick<Deps, 'storage'>) => deps.storage.getItem(AUTO_APPLY_KEY) !== 'off';
export function setAutoApply(on: boolean, deps: Pick<Deps, 'storage'>): void {
  if (on) deps.storage.removeItem(AUTO_APPLY_KEY);
  else deps.storage.setItem(AUTO_APPLY_KEY, 'off');
}

export interface RefItem { id: string; label: string; group?: string }
/** Structural (no imports): CatalogWork satisfies it. */
export interface RefWork { id: string; title: string; author: string; editions: Array<{ id: string; volume_number: string | null; publisher: string | null }> }
const REF_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
const volumeNumber = (v: string | null) => parseInt(v || '1', 10) || 1;

/**
 * The catalogue as Life Hub reference lists: works {id, title, author} and editions {id, publisher,
 * "<work id>/<volume>"}. Public catalogue data only, never reading logs.
 */
export function catalogRefs(works: RefWork[]): { works: RefItem[]; editions: RefItem[] } {
  const out = { works: [] as RefItem[], editions: [] as RefItem[] };
  for (const w of works) {
    if (!REF_ID.test(w.id) || !w.title.trim() || out.works.length >= 500) continue;
    const author = clip(w.author.trim(), 40);
    out.works.push(author ? { id: w.id, label: clip(w.title.trim(), 80), group: author } : { id: w.id, label: clip(w.title.trim(), 80) });
    for (const e of w.editions) {
      const group = `${w.id}/${volumeNumber(e.volume_number)}`;
      if (!REF_ID.test(e.id) || group.length > 40 || out.editions.length >= 500) continue;
      out.editions.push({ id: e.id, label: clip((e.publisher ?? '').trim() || '출판사 없음', 80), group });
    }
  }
  return out;
}

const REFS_KEY = 'letterbookxd.lifehub.refs.v1';
/**
 * Shares one reference list when it changed. A newer revision wins on Life Hub; a 409 (another device, or a
 * clock behind the stored revision) is not "sent", so the list goes again next time with a later revision.
 */
async function uploadRef(kind: 'works' | 'editions', items: RefItem[], deps: Deps): Promise<boolean> {
  const sent = readJson<Record<string, { revision: number; body: string }>>(deps.storage, REFS_KEY) ?? {};
  const body = JSON.stringify(items);
  if (sent[kind]?.body === body) return true;
  const revision = Math.max(deps.now(), (sent[kind]?.revision ?? 0) + 1);
  const response = await api(deps, 'PUT', '/refs/' + kind, { revision, items });
  if (!response.ok) return false;
  sent[kind] = { revision, body };
  deps.storage.setItem(REFS_KEY, JSON.stringify(sent));
  return true;
}
export async function uploadCatalogRefs(works: RefWork[], deps: Deps): Promise<boolean> {
  const refs = catalogRefs(works);
  const a = await uploadRef('works', refs.works, deps);
  const b = await uploadRef('editions', refs.editions, deps);
  return a && b;
}

export interface SyncResult { proposals: ReadingProposal[]; receiptsSent: number; rejectionsSent: number; conflicts: number; waiting: number }

/** `works`: the catalogue to share first (omit when it is not loaded yet). */
export async function sync(deps: Deps, works?: RefWork[]): Promise<SyncResult> {
  const done = outcomes(deps);
  const result: SyncResult = { proposals: [], receiptsSent: 0, rejectionsSent: 0, conflicts: 0, waiting: 0 };
  const record = (key: string, response: Response, ok: Outcome) => {
    if (response.ok) done[key] = ok;
    else if (response.status === 409) done[key] = 'conflict';
    else if (response.status === 404) done[key] = 'missing';
    else {
      result.waiting++;
      return false;
    }
    deps.storage.setItem(OUTCOMES_KEY, JSON.stringify(done));
    return response.ok;
  };
  const decided = new Set<string>();
  for (const r of receipts(deps)) {
    decided.add(r.key);
    if (done[r.key]) continue;
    const response = await api(deps, 'POST', '/receipts', { key: r.key, entity_type: 'reading_record', entity_id: r.logId });
    if (record(r.key, response, 'confirmed')) result.receiptsSent++;
  }
  for (const key of readJson<string[]>(deps.storage, REJECTIONS_KEY) ?? []) {
    decided.add(key);
    if (done[key]) continue;
    if (record(key, await api(deps, 'POST', '/rejections', { key }), 'rejected')) result.rejectionsSent++;
  }
  if (works?.length) await uploadCatalogRefs(works, deps).catch(() => false);
  const response = await api(deps, 'GET', '/candidates?status=open&limit=100');
  if (!response.ok) throw new LifeHubError('server', `Life Hub 제안을 가져오지 못했어요 (${response.status})`);
  const body = (await response.json().catch(() => null)) as { candidates?: unknown } | null;
  if (!body || !Array.isArray(body.candidates)) throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
  for (const item of body.candidates) {
    const p = parseProposal(item);
    if (p && !decided.has(p.key)) result.proposals.push(p);
  }
  result.conflicts = Object.values(done).filter((v) => v === 'conflict').length;
  return result;
}
