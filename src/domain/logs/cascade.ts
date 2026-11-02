import type { SetCompletionLog, VolumeLog } from '../../types';

export type CascadeDecision = 'create' | 'delete' | 'none';

/**
 * 한 판본(세트)의 모든 권이 완독이면 세트 완독 기록을 만들고, 아니면 지운다.
 * 권 목록을 모르면(빈 배열) 아무것도 하지 않는다.
 */
export function decideSetCompletion(
  setVolumeIds: string[],
  volumeLogs: Pick<VolumeLog, 'volumeId' | 'readingState'>[],
  hasExisting: boolean,
): CascadeDecision {
  if (setVolumeIds.length === 0) return 'none';
  const allCompleted = setVolumeIds.every(
    (id) => volumeLogs.find((l) => l.volumeId === id)?.readingState === 'completed',
  );
  if (allCompleted && !hasExisting) return 'create';
  if (!allCompleted && hasExisting) return 'delete';
  return 'none';
}

/** 시리즈의 모든 작품에 세트 완독 기록이 있으면 시리즈 완독을 만들고, 아니면 지운다. */
export function decideSeriesCompletion(
  seriesWorkIds: string[],
  setCompletionLogs: Pick<SetCompletionLog, 'workId'>[],
  hasExisting: boolean,
): CascadeDecision {
  if (seriesWorkIds.length === 0) return 'none';
  const completed = new Set(setCompletionLogs.map((l) => l.workId));
  const all = seriesWorkIds.every((id) => completed.has(id));
  if (all && !hasExisting) return 'create';
  if (!all && hasExisting) return 'delete';
  return 'none';
}
