import { validateLogRecord, type LogRecord } from '../logs/records';
import { mergeStates, safeTargetKey, validateTombstone, type Tombstone } from './merge';

// 180일 넘게 쉰 기기의 검토 규칙 (life-hub docs/P6_SYNC.md 7절 "Coming back after 180 days").
// 저장소를 건드리지 않는 순수 함수만 둔다.
//
// 성공한 동기화는 로컬 항목을 모두 서버에 남긴다. 그러니 "마지막 동기화 이후 바뀐 적 없고(시각 ≤ F)
// 서버에 지금 없는(같은 id도, 같은 targetKey도 없는)" 항목은 다른 기기에서 지워졌고 그 묘비는 180일이 지나 정리된 것이다.
// F = 이 기기가 본 가장 최근 서버 written_at (settings의 sync.clock.server).

export interface RawState {
  logs: unknown[];
  tombstones?: unknown[];
}

export interface StaleRemovals {
  logs: LogRecord[];
  tombstones: Tombstone[];
}

/**
 * 검토에서 묘비 없이 지울 로컬 항목.
 * - 기록: updatedAt ≤ F 이고, 서버 문서에 같은 id의 기록·묘비가 없고, 같은 targetKey의 기록·묘비도 없다.
 * - 묘비: deletedAt ≤ F 이고, 서버 문서에 같은 id·같은 targetKey가 모두 없다.
 * 시각 > F 인 항목(오프라인 편집)과 검증을 통과하지 못한 로컬 행은 지우지 않는다.
 * 서버 문서의 잘못된 항목은 "있다"로 세지 않는다 (병합이 어차피 버린다).
 */
export function findStaleRemovals(local: RawState, remote: RawState, floorMs: number): StaleRemovals {
  const remoteIds = new Set<string>();
  const remoteTargets = new Set<string>();
  for (const row of remote.logs ?? []) {
    if (validateLogRecord(row) !== null) continue;
    const key = safeTargetKey(row as LogRecord);
    if (key === null) continue;
    remoteIds.add((row as LogRecord).id);
    remoteTargets.add(key);
  }
  for (const row of remote.tombstones ?? []) {
    const t = validateTombstone(row);
    if (!t) continue;
    remoteIds.add(t.id);
    remoteTargets.add(t.targetKey);
  }

  const logs: LogRecord[] = [];
  for (const row of local.logs ?? []) {
    if (validateLogRecord(row) !== null) continue;
    const record = row as LogRecord;
    const key = safeTargetKey(record);
    if (key === null) continue;
    if (Date.parse(record.updatedAt) <= floorMs && !remoteIds.has(record.id) && !remoteTargets.has(key)) logs.push(record);
  }
  const tombstones: Tombstone[] = [];
  for (const row of local.tombstones ?? []) {
    const t = validateTombstone(row);
    if (!t) continue;
    if (Date.parse(t.deletedAt) <= floorMs && !remoteIds.has(t.id) && !remoteTargets.has(t.targetKey)) tombstones.push(t);
  }
  return { logs, tombstones };
}

export interface MergeSummary {
  /** 이 기기에 없던 기록이 들어온다 */
  added: number;
  /** 같은 id의 기록 내용이 바뀐다 */
  updated: number;
  /** 서버의 묘비나 더 늦은 기록에 밀려 이 기기에서 사라진다 */
  removed: number;
}

/** 지울 것을 뺀 로컬과 서버 문서를 병합하면 이 기기의 기록이 어떻게 바뀌는지 센다 */
export function summarizeMerge(localAfterRemoval: RawState, remote: RawState): MergeSummary {
  const local = new Map<string, string>();
  for (const row of localAfterRemoval.logs ?? []) {
    if (validateLogRecord(row) === null) local.set((row as LogRecord).id, JSON.stringify(mergeStates({ logs: [row] }).logs[0]));
  }
  const merged = mergeStates(localAfterRemoval, remote);
  const after = new Map(merged.logs.map((r) => [r.id, JSON.stringify(r)]));
  let added = 0;
  let updated = 0;
  for (const [id, json] of after) {
    if (!local.has(id)) added++;
    else if (local.get(id) !== json) updated++;
  }
  let removed = 0;
  for (const id of local.keys()) if (!after.has(id)) removed++;
  return { added, updated, removed };
}
