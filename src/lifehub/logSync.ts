/**
 * 독서 기록(logs) 기기 동기화 — Life Hub `/letterbookxd/v1/sync` (life-hub docs/P6_SYNC.md 5·6·7절).
 *
 * 한 번의 동기화 패스(runLogSyncPass): GET → 병합(로컬 ∪ 서버) → 완독 연쇄 다시 판정 → 서버와 다르면 PUT.
 * 언제 돌릴지는 logSyncController.ts가 정한다. 로컬 데이터를 지우거나 덮어쓰는 길은 병합 결과를 반영하는 것뿐이고,
 * 실패(네트워크·5xx·413 …)는 로컬을 건드리지 않는다.
 * 오류 문구에는 상태 코드와 고정 문구만 넣는다. 문서 내용·토큰·응답 본문은 넣지 않는다.
 */
import { getDb } from '../storage/db';
import { noteServerTime } from '../storage/clock';
import { applyRemoteState, pruneLocalTombstones, readLocalState, reconcileCompletions, reloadLogStore } from '../store/logSyncApply';
import { mergeStates, sameState, TOMBSTONE_KEEP_MS } from '../domain/sync/merge';
import { pickLogRecord } from '../domain/logs/records';
import { parseImportFile, type ImportSource } from '../domain/backup/backup';
import { isConnected, LifeHubError, mayHaveSyncScope, syncRequest, type Deps } from './remote';

export const SYNC_APP = 'letterbookxd';
export const SYNC_DOC_VERSION = 2;
/** Life Hub가 받는 문서의 상한 (UTF-8 바이트) */
export const SYNC_MAX_BYTES = 1048576;
export const MAX_ATTEMPTS = 3;
/** 이 기간보다 오래 동기화하지 못한 기기는 자동 병합하지 않는다 (묘비 보관 기간과 같다) */
export const STALE_AFTER_MS = TOMBSTONE_KEEP_MS;

export type LogSyncStatus = 'off' | 'on' | 'syncing' | 'error' | 'no_scope' | 'retry_later' | 'too_large' | 'review';

/** 설정 화면에 보이는 고정 문구 (상태 코드는 detail에 따로) */
export const STATUS_LABEL: Record<LogSyncStatus, string> = {
  off: '꺼짐',
  on: '켜짐',
  syncing: '동기화 중',
  error: '오류',
  no_scope: '권한 없음',
  retry_later: '나중에 재시도',
  too_large: '너무 큼',
  review: '검토 필요',
};

/** 이 기기의 동기화 설정과 마지막 결과 (localStorage) */
export interface LogSyncConfig {
  enabled: boolean;
  /** X-Device-Label (1–40자 ASCII). 비면 헤더를 보내지 않는다. */
  deviceLabel: string;
  lastSuccessAt: string | null;
  /** 마지막으로 본 서버 문서의 version */
  version: number | null;
  /** 자동 동기화를 멈춘 이유. 「지금 동기화」나 검토 완료로 풀린다. */
  blocked: Extract<LogSyncStatus, 'no_scope' | 'too_large' | 'review'> | null;
}

export interface PassResult {
  status: LogSyncStatus;
  /** 상태 코드나 고정 문구. 응답 본문은 넣지 않는다. */
  detail: string | null;
  /** 서버 문서에서 버린 항목 수 */
  dropped: number;
  pushed: boolean;
}

const CONFIG_KEY = 'letterbookxd.logsync.v1';
const DEFAULT_CONFIG: LogSyncConfig = { enabled: false, deviceLabel: '', lastSuccessAt: null, version: null, blocked: null };

export function readConfig(deps: Pick<Deps, 'storage'>): LogSyncConfig {
  try {
    const raw = deps.storage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const v = JSON.parse(raw) as Partial<LogSyncConfig>;
    return {
      enabled: v.enabled === true,
      deviceLabel: typeof v.deviceLabel === 'string' ? v.deviceLabel : '',
      lastSuccessAt: typeof v.lastSuccessAt === 'string' ? v.lastSuccessAt : null,
      version: typeof v.version === 'number' ? v.version : null,
      blocked: v.blocked === 'no_scope' || v.blocked === 'too_large' || v.blocked === 'review' ? v.blocked : null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
export function writeConfig(deps: Pick<Deps, 'storage'>, patch: Partial<LogSyncConfig>): LogSyncConfig {
  const next = { ...readConfig(deps), ...patch };
  deps.storage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

/** X-Device-Label: 앞뒤 공백을 뗀 뒤 1–40자의 출력 가능한 ASCII. 아니면 null. */
export function normalizeDeviceLabel(value: string): string | null {
  const label = value.trim();
  return /^[\x20-\x7e]{1,40}$/.test(label) ? label : null;
}

/** 동기화 켜기/끄기. 끄면 이 기기의 기록은 그대로 두고 서버에도 아무것도 하지 않는다. */
export function setSyncEnabled(deps: Pick<Deps, 'storage'>, enabled: boolean): LogSyncConfig {
  return writeConfig(deps, { enabled, blocked: enabled ? null : readConfig(deps).blocked });
}

/** 검토를 마쳤다: 자동 병합 중지를 풀고 지금부터 다시 센다. */
export function acknowledgeReview(deps: Pick<Deps, 'storage' | 'now'>): LogSyncConfig {
  return writeConfig(deps, { blocked: null, lastSuccessAt: new Date(deps.now()).toISOString() });
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

interface RemoteDoc {
  version: number;
  sha256: string;
  writtenAt: string;
  doc: { logs: unknown[]; tombstones: unknown[] };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

class Stop extends Error {
  result: PassResult;
  constructor(result: PassResult) {
    super(result.status);
    this.result = result;
  }
}
const stop = (status: LogSyncStatus, detail: string | null): Stop => new Stop({ status, detail, dropped: 0, pushed: false });

/** GET /sync. 404면 null(문서 없음). */
async function fetchRemote(deps: Deps): Promise<RemoteDoc | null> {
  const response = await syncRequest(deps, 'GET', '');
  if (response.status === 404) return null;
  if (response.status >= 500 || response.status === 429) throw stop('retry_later', `Life Hub 서버가 바쁘거나 오류예요 (${response.status})`);
  if (!response.ok) throw stop('error', `Life Hub가 동기화 문서를 주지 않았어요 (${response.status})`);
  const body: unknown = await response.json().catch(() => null);
  if (!isObj(body) || typeof body.version !== 'number' || typeof body.sha256 !== 'string' || typeof body.written_at !== 'string' || !isObj(body.doc))
    throw stop('error', 'Life Hub 응답 형식이 올바르지 않아요.');
  const doc = body.doc;
  if (doc.app !== SYNC_APP || doc.version !== SYNC_DOC_VERSION || !Array.isArray(doc.logs) || (doc.tombstones !== undefined && !Array.isArray(doc.tombstones)))
    throw stop('error', '서버 문서 형식이 책장 동기화 문서가 아니에요. 로컬 기록은 그대로예요.');
  return {
    version: body.version, sha256: body.sha256, writtenAt: body.written_at,
    doc: { logs: doc.logs, tombstones: Array.isArray(doc.tombstones) ? doc.tombstones : [] },
  };
}

async function fetchMeta(deps: Deps): Promise<{ sha256: string; version: number } | null | 'unknown'> {
  try {
    const response = await syncRequest(deps, 'GET', '/meta');
    if (response.status === 404) return null;
    if (!response.ok) return 'unknown';
    const body: unknown = await response.json().catch(() => null);
    return isObj(body) && typeof body.sha256 === 'string' && typeof body.version === 'number' ? { sha256: body.sha256, version: body.version } : 'unknown';
  } catch (error) {
    if (error instanceof LifeHubError && error.kind !== 'network') throw error;
    return 'unknown';
  }
}

type PutOutcome =
  | { kind: 'ok'; version: number; writtenAt: string | null }
  | { kind: 'stale'; current: { version: number; sha256: string } | null }
  | { kind: 'unknown' };

/** PUT. 응답을 받지 못했거나 5xx면 'unknown' (서버에 반영됐는지 모른다). */
async function putDoc(deps: Deps, body: string, baseVersion: number | null, label: string | null): Promise<PutOutcome> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (baseVersion === null) headers['If-None-Match'] = '*';
  else headers['If-Match'] = `"${baseVersion}"`;
  if (label) headers['X-Device-Label'] = label;
  let response: Response;
  try {
    response = await syncRequest(deps, 'PUT', '', { headers, body });
  } catch (error) {
    if (error instanceof LifeHubError && error.kind === 'network') return { kind: 'unknown' };
    throw error;
  }
  if (response.ok) {
    const json: unknown = await response.json().catch(() => null);
    const version = isObj(json) && typeof json.version === 'number' ? json.version : null;
    if (version === null) return { kind: 'unknown' };
    return { kind: 'ok', version, writtenAt: isObj(json) && typeof json.written_at === 'string' ? json.written_at : null };
  }
  if (response.status === 412) {
    const json: unknown = await response.json().catch(() => null);
    const current = isObj(json) && isObj(json.current) && typeof json.current.sha256 === 'string' && typeof json.current.version === 'number'
      ? { version: json.current.version, sha256: json.current.sha256 } : null;
    return { kind: 'stale', current };
  }
  if (response.status === 413) throw stop('too_large', '문서가 너무 커서 자동 동기화를 멈췄어요 (413)');
  if (response.status === 400 || response.status === 415 || response.status === 428)
    throw stop('error', `동기화 요청이 거부됐어요 (${response.status}). 앱 오류일 수 있어요.`);
  if (response.status >= 500 || response.status === 429) return { kind: 'unknown' };
  throw stop('error', `Life Hub가 동기화를 거절했어요 (${response.status})`);
}

/** 서버로 보낼 문서. 검증을 통과한 항목만 담고(알 수 없는 필드는 떨군다), catalogOverrides는 넣지 않는다. */
function toDoc(state: { logs: unknown[]; tombstones: unknown[] }, exportedAt: string) {
  const merged = mergeStates(state);
  return {
    app: SYNC_APP,
    version: SYNC_DOC_VERSION,
    exportedAt,
    logs: merged.logs.map(pickLogRecord),
    tombstones: merged.tombstones.map((t) => ({ id: t.id, targetKey: t.targetKey, deletedAt: t.deletedAt, supersededBy: t.supersededBy })),
  };
}

/**
 * 동기화 패스 하나. 호출한 쪽(컨트롤러)이 한 번에 하나만 돌린다.
 * @param manual 「지금 동기화」: too_large·no_scope로 멈춘 자동 동기화를 한 번 다시 시도한다 (검토 필요는 검토를 마쳐야 풀린다).
 */
export async function runLogSyncPass(deps: Deps, opts: { manual?: boolean } = {}): Promise<PassResult> {
  const finish = (r: Partial<PassResult> & Pick<PassResult, 'status'>): PassResult => ({ detail: null, dropped: 0, pushed: false, ...r });
  const config = readConfig(deps);
  if (!config.enabled) return finish({ status: 'off' });
  if (!isConnected(deps)) return finish({ status: 'error', detail: 'Life Hub에 연결되어 있지 않아요.' });
  if (config.blocked === 'review') return finish({ status: 'review', detail: '오래 동기화하지 않았어요. 서버 문서를 검토해 주세요.' });
  if (!opts.manual && config.blocked) return finish({ status: config.blocked, detail: null });
  if (!mayHaveSyncScope(deps)) {
    writeConfig(deps, { blocked: 'no_scope' });
    return finish({ status: 'no_scope', detail: '동기화 권한이 없어요. Life Hub를 다시 연결하며 동기화에 체크해 주세요.' });
  }
  if (config.lastSuccessAt && deps.now() - Date.parse(config.lastSuccessAt) > STALE_AFTER_MS) {
    writeConfig(deps, { blocked: 'review' });
    return finish({ status: 'review', detail: '180일 넘게 동기화하지 않아 자동으로 합치지 않았어요. 서버 문서를 검토해 주세요.' });
  }

  const db = getDb();
  let dropped = 0;
  try {
    let forceCreate = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const remote = forceCreate ? null : await fetchRemote(deps);
      forceCreate = false;
      if (remote) await noteServerTime(db, remote.writtenAt);

      // 병합 → 로컬에 반영 → 완독 연쇄 다시 판정
      const applied = await applyRemoteState(remote?.doc ?? null);
      dropped += applied.dropped;
      const cascaded = await reconcileCompletions();
      if (applied.changed || cascaded) await reloadLogStore();

      const local = await readLocalState(db);
      // 서버 문서에 더할 것이 없으면 쓰지 않는다 (쓰기 횟수를 아낀다)
      if (remote && sameState(local, remote.doc)) {
        return done(deps, remote.version, dropped, false);
      }

      // 보관 기간이 지난 묘비는 쓰기 직전에만 뺀다 (병합은 지금 시각에 의존하지 않는다)
      await pruneLocalTombstones(deps.now());
      const state = await readLocalState(db);
      const body = JSON.stringify(toDoc(state, new Date(deps.now()).toISOString()));
      const bytes = new TextEncoder().encode(body);
      if (bytes.length > SYNC_MAX_BYTES) throw stop('too_large', '문서가 너무 커서 자동 동기화를 멈췄어요');
      const sha = hex(await deps.sha256(bytes));

      const label = config.deviceLabel ? normalizeDeviceLabel(config.deviceLabel) : null;
      const outcome = await putDoc(deps, body, remote ? remote.version : null, label);
      if (outcome.kind === 'ok') {
        if (outcome.writtenAt) await noteServerTime(db, outcome.writtenAt);
        return done(deps, outcome.version, dropped, true);
      }
      if (outcome.kind === 'stale') {
        // 내가 보낸 것이 이미 반영된 응답 유실이면 성공
        if (outcome.current?.sha256 === sha) return done(deps, outcome.current.version, dropped, true);
        // 문서가 지워졌다면 처음 쓰기처럼 다시 쓴다
        if (outcome.current === null) forceCreate = true;
        continue;
      }
      // 결과를 모른다: 보낸 바이트의 해시와 서버 meta를 먼저 비교하고, 반영되지 않았다는 것을 확인한 뒤에만 다시 쓴다
      const meta = await fetchMeta(deps);
      if (meta === 'unknown') throw stop('retry_later', '응답을 받지 못했어요. 나중에 다시 시도해요.');
      if (meta && meta.sha256 === sha) return done(deps, meta.version, dropped, true);
      if (meta === null) forceCreate = true;
    }
    return finish({ status: 'retry_later', detail: '다른 기기와 동시에 바뀌어 나중에 다시 시도해요 (412)', dropped });
  } catch (error) {
    if (error instanceof Stop) {
      if (error.result.status === 'too_large' || error.result.status === 'no_scope') writeConfig(deps, { blocked: error.result.status });
      return { ...error.result, dropped };
    }
    if (error instanceof LifeHubError) {
      if (error.kind === 'no_scope') {
        writeConfig(deps, { blocked: 'no_scope' });
        return finish({ status: 'no_scope', detail: error.message, dropped });
      }
      if (error.kind === 'network') return finish({ status: 'retry_later', detail: error.message, dropped });
      return finish({ status: 'error', detail: error.message, dropped });
    }
    console.error('기록 동기화 실패:', error);
    return finish({ status: 'error', detail: '동기화하는 중 오류가 났어요. 로컬 기록은 그대로예요.', dropped });
  }
}

function done(deps: Deps, version: number, dropped: number, pushed: boolean): PassResult {
  writeConfig(deps, { lastSuccessAt: new Date(deps.now()).toISOString(), version, blocked: null });
  return { status: 'on', detail: null, dropped, pushed };
}

/**
 * 180일 규칙: 서버 문서를 기존 가져오기 미리보기로 검토할 수 있게 ImportSource로 바꾼다.
 * 묘비는 가져오기 미리보기가 다루지 않으므로 기록만 담는다.
 */
export async function fetchRemoteAsImportSource(deps: Deps): Promise<ImportSource | null> {
  const remote = await fetchRemote(deps).catch((error: unknown) => {
    if (error instanceof Stop) throw new LifeHubError('server', error.result.detail ?? '서버 문서를 가져오지 못했어요.');
    throw error;
  });
  if (!remote) return null;
  const parsed = parseImportFile(JSON.stringify({ app: SYNC_APP, version: 1, exportedAt: remote.writtenAt, logs: remote.doc.logs }));
  if (!parsed.ok) throw new LifeHubError('server', parsed.error);
  return parsed.source;
}
