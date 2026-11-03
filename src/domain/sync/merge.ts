import { pickLogRecord, targetKey, validateLogRecord, type LogRecord } from '../logs/records';

// 기기 동기화 병합 (life-hub docs/P6_SYNC.md 6절 letterbookxd).
// 대상(targetKey)별 마지막 쓰기 우선(LWW, Last-Writer-Wins). 저장소를 건드리지 않는 순수 함수만 둔다.
// 결과는 "본 이벤트(기록·묘비)의 집합"에만 달려 있어 교환·결합·멱등이다.

/** 지워진 기록의 흔적. 병합이 삭제를 되살리지 않게 한다. */
export interface Tombstone {
  id: string;
  /** volume:<volumeId> | set:<editionSetId> | series:<seriesId> */
  targetKey: string;
  deletedAt: string;
  /** 같은 대상의 더 늦은 기록에 밀려 사라진 경우 그 기록의 id */
  supersededBy: string | null;
}

export interface SyncState {
  logs: LogRecord[];
  tombstones: Tombstone[];
}

export interface MergeResult extends SyncState {
  /** 검증에 실패하거나 targetKey를 알 수 없어 버린 기록·묘비 수 */
  dropped: number;
}

/** 키를 정렬하고 공백 없이 쓴 JSON. 동률을 깨는 데만 쓴다. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const canonicalRecord = (r: LogRecord) => canonicalJson(pickLogRecord(r));
const canonicalTombstone = (t: Tombstone) =>
  canonicalJson({ id: t.id, targetKey: t.targetKey, deletedAt: t.deletedAt, supersededBy: t.supersededBy });

/** 기록의 대상 열쇠. 알 수 없으면 null. */
export function safeTargetKey(r: LogRecord): string | null {
  const key =
    r.logType === 'volume' ? r.volumeId : r.logType === 'set_completion' ? r.editionSetId : r.logType === 'series_completion' ? r.seriesId : null;
  return typeof key === 'string' && key !== '' ? targetKey(r) : null;
}

const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const ms = (iso: string) => Date.parse(iso);

export function validateTombstone(v: unknown): Tombstone | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  if (typeof t.id !== 'string' || t.id === '') return null;
  if (typeof t.targetKey !== 'string' || !/^(volume|set|series):.+/.test(t.targetKey)) return null;
  if (!isTime(t.deletedAt)) return null;
  if (t.supersededBy !== null && t.supersededBy !== undefined && typeof t.supersededBy !== 'string') return null;
  return { id: t.id, targetKey: t.targetKey, deletedAt: t.deletedAt, supersededBy: (t.supersededBy as string | null | undefined) ?? null };
}

type Event =
  | { kind: 'record'; time: number; canon: string; record: LogRecord; key: string }
  | { kind: 'tombstone'; time: number; canon: string; tombstone: Tombstone };

/** a가 b보다 이기면 양수. 동률: 기록 > 묘비, 그다음 정규 JSON 문자열이 큰 쪽. */
function compareEvents(a: Event, b: Event): number {
  if (a.time !== b.time) return a.time - b.time;
  if (a.kind !== b.kind) return a.kind === 'record' ? 1 : -1;
  return a.canon === b.canon ? 0 : a.canon > b.canon ? 1 : -1;
}

/**
 * 로컬·서버 상태(여러 개도 됨)를 하나로 합친다.
 * 1) id마다 기록 하나·묘비 하나만 남긴다. 2) 대상마다 가장 늦은 이벤트가 승자.
 * 3) 승자가 기록이면 그 대상의 나머지 id는 묘비(deletedAt=승자 시각, supersededBy=승자 id),
 *    승자가 묘비면 대상의 모든 id가 묘비(deletedAt=승자 시각, supersededBy=null).
 */
export function mergeStates(...states: Array<{ logs: unknown[]; tombstones?: unknown[] }>): MergeResult {
  let dropped = 0;
  const records = new Map<string, Event & { kind: 'record' }>();
  const tombs = new Map<string, Event & { kind: 'tombstone' }>();

  for (const state of states) {
    for (const row of state.logs ?? []) {
      if (validateLogRecord(row) !== null) { dropped++; continue; }
      const record = pickLogRecord(row as LogRecord);
      const key = safeTargetKey(record);
      if (key === null) { dropped++; continue; }
      const event: Event & { kind: 'record' } = { kind: 'record', time: ms(record.updatedAt), canon: canonicalRecord(record), record, key };
      const prev = records.get(record.id);
      if (!prev || compareEvents(event, prev) > 0) records.set(record.id, event);
    }
    for (const row of state.tombstones ?? []) {
      const tombstone = validateTombstone(row);
      if (!tombstone) { dropped++; continue; }
      const event: Event & { kind: 'tombstone' } = { kind: 'tombstone', time: ms(tombstone.deletedAt), canon: canonicalTombstone(tombstone), tombstone };
      const prev = tombs.get(tombstone.id);
      if (!prev || compareEvents(event, prev) > 0) tombs.set(tombstone.id, event);
    }
  }

  // 대상별로 모은다.
  const byTarget = new Map<string, { events: Event[]; ids: Set<string> }>();
  const slot = (key: string) => {
    let s = byTarget.get(key);
    if (!s) byTarget.set(key, (s = { events: [], ids: new Set() }));
    return s;
  };
  for (const e of records.values()) { const s = slot(e.key); s.events.push(e); s.ids.add(e.record.id); }
  for (const e of tombs.values()) { const s = slot(e.tombstone.targetKey); s.events.push(e); s.ids.add(e.tombstone.id); }

  const logs: LogRecord[] = [];
  const tombstones: Tombstone[] = [];
  for (const [key, { events, ids }] of byTarget) {
    let winner = events[0];
    for (const e of events) if (compareEvents(e, winner) > 0) winner = e;
    if (winner.kind === 'record') {
      logs.push(winner.record);
      for (const id of ids) {
        if (id === winner.record.id) continue;
        tombstones.push({ id, targetKey: key, deletedAt: winner.record.updatedAt, supersededBy: winner.record.id });
      }
    } else {
      for (const id of ids) tombstones.push({ id, targetKey: key, deletedAt: winner.tombstone.deletedAt, supersededBy: null });
    }
  }
  logs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  tombstones.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { logs, tombstones, dropped };
}

/** 두 상태의 병합. mergeStates(a, b)와 같다. */
export const mergeLogState = (a: SyncState, b: SyncState): MergeResult => mergeStates(a, b);

/** 두 상태가 같은 내용인지 (정규 JSON 비교) */
export function sameState(a: { logs: unknown[]; tombstones?: unknown[] }, b: { logs: unknown[]; tombstones?: unknown[] }): boolean {
  const norm = (s: { logs: unknown[]; tombstones?: unknown[] }) => {
    const m = mergeStates(s);
    return canonicalJson({ logs: m.logs.map(pickLogRecord), tombstones: m.tombstones });
  };
  return norm(a) === norm(b);
}

/** 묘비 보관 기간 */
export const TOMBSTONE_KEEP_MS = 180 * 24 * 60 * 60 * 1000;

/** 보관 기간이 지난 묘비를 뺀다. 지금 시각에 달려 있으므로 병합 안에서 부르지 않고 쓰기 직전에만 쓴다. */
export function pruneTombstones(tombstones: Tombstone[], nowMs: number): Tombstone[] {
  return tombstones.filter((t) => nowMs - ms(t.deletedAt) <= TOMBSTONE_KEEP_MS);
}
