/**
 * 180일 넘게 쉰 기기의 검토 (life-hub docs/P6_SYNC.md 7절 "Coming back after 180 days").
 *
 * prepareReview: 서버 문서를 읽고 지울 기록과 나머지 병합 결과를 계산한다. 아무것도 쓰지 않는다 (취소하면 상태 그대로).
 * applyReview: 확인을 받은 뒤에만 부른다. ① 지울 항목을 묘비 없이 지운다 ② 나머지를 병합한다 ③ 완독 연쇄를 다시 판정한다.
 * 검토 상태를 푸는 것과 바로 한 번 동기화하는 것은 컨트롤러의 completeReview가 한다.
 * 서버 문서가 없거나(404) F를 모르면 아무것도 지우지 않는다.
 */
import { getDb } from '../storage/db';
import { readServerFloor } from '../storage/clock';
import { applyRemoteState, reconcileCompletions, reloadLogStore } from '../store/logSyncApply';
import { findStaleRemovals, summarizeMerge, type MergeSummary, type StaleRemovals } from '../domain/sync/staleReview';
import { fetchRemoteDoc, type RemoteDoc } from './logSync';
import type { Deps } from './remote';

export type ReviewSkipReason = 'no-server-doc' | 'no-floor';

export interface ReviewPlan {
  remote: RemoteDoc | null;
  /** F (ms). 모르면 null */
  floorMs: number | null;
  /** 규칙이 적용되지 않으면 이유. 이때 removals는 비어 있다. */
  skipped: ReviewSkipReason | null;
  removals: StaleRemovals;
  summary: MergeSummary;
}

const EMPTY: StaleRemovals = { logs: [], tombstones: [] };

export async function prepareReview(deps: Deps): Promise<ReviewPlan> {
  const remote = await fetchRemoteDoc(deps);
  const db = getDb();
  const floorMs = await readServerFloor(db);
  const local = { logs: await db.logs.toArray(), tombstones: await db.tombstones.toArray() };
  if (!remote || floorMs === null) {
    return {
      remote, floorMs, skipped: remote ? 'no-floor' : 'no-server-doc', removals: EMPTY,
      summary: summarizeMerge(local, remote?.doc ?? { logs: [] }),
    };
  }
  const removals = findStaleRemovals(local, remote.doc, floorMs);
  const gone = new Set(removals.logs.map((r) => r.id));
  const goneTombs = new Set(removals.tombstones.map((t) => t.id));
  const rest = { logs: local.logs.filter((r) => !gone.has(r.id)), tombstones: local.tombstones.filter((t) => !goneTombs.has(t.id)) };
  return { remote, floorMs, skipped: null, removals, summary: summarizeMerge(rest, remote.doc) };
}

/**
 * 확인된 계획을 적용한다. 지울 목록은 미리보기 때의 것을 쓰지 않고 지금의 로컬로 다시 계산한다:
 * 미리보기 뒤에 생긴 편집(시각 > F)은 지우지 않는다. 새 묘비는 남기지 않는다.
 */
export async function applyReview(plan: ReviewPlan): Promise<void> {
  const db = getDb();
  if (plan.remote && plan.floorMs !== null) {
    const { remote, floorMs } = { remote: plan.remote, floorMs: plan.floorMs };
    await db.transaction('rw', db.logs, db.tombstones, async () => {
      const removals = findStaleRemovals(
        { logs: await db.logs.toArray(), tombstones: await db.tombstones.toArray() }, remote.doc, floorMs,
      );
      if (removals.logs.length) await db.logs.bulkDelete(removals.logs.map((r) => r.id));
      if (removals.tombstones.length) await db.tombstones.bulkDelete(removals.tombstones.map((t) => t.id));
    });
  }
  await applyRemoteState(plan.remote?.doc ?? null);
  await reconcileCompletions();
  await reloadLogStore();
}
