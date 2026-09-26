import type { VolumeLog, SetCompletionLog } from '../types';

export type ReadingState = 'unread' | 'reading' | 'completed';

export const READING_STATE_LABEL: Record<ReadingState, string> = {
  unread: '안 읽음',
  reading: '읽는 중',
  completed: '완독',
};

/** 작품 단위 상태: 어느 판본이든 전권을 끝냈으면 완독, 읽는 권이 있으면 읽는 중 */
export function workReadingState(
  workId: string,
  volumeLogs: VolumeLog[],
  setCompletionLogs: SetCompletionLog[],
): ReadingState {
  if (setCompletionLogs.some((l) => l.workId === workId)) return 'completed';
  if (volumeLogs.some((l) => l.workId === workId && l.readingState === 'reading')) return 'reading';
  return 'unread';
}

export interface Review {
  rating: number | null;
  liked: boolean;
}

/**
 * 완독한 판본 세트의 별점·인생책 표시.
 * 한 권짜리 판본은 별점을 권 기록에 남기므로(자동 생성된 세트 기록은 비어 있음) 그 값을 이어 받는다.
 */
export function setReview(log: SetCompletionLog, volumeLogs: VolumeLog[]): Review {
  const volumes = volumeLogs.filter((v) => v.editionSetId === log.editionSetId);
  if (volumes.length === 1) {
    return { rating: log.rating ?? volumes[0].rating ?? null, liked: log.liked || volumes[0].liked };
  }
  return { rating: log.rating, liked: log.liked };
}

/** 한 작품의 완독 기록 중 대표(별점이 가장 높은 것, 같으면 최근) */
export function bestCompletion(
  workId: string,
  volumeLogs: VolumeLog[],
  setCompletionLogs: SetCompletionLog[],
): (Review & { log: SetCompletionLog }) | null {
  let best: (Review & { log: SetCompletionLog }) | null = null;
  for (const log of setCompletionLogs) {
    if (log.workId !== workId) continue;
    const review = setReview(log, volumeLogs);
    if (
      !best ||
      (review.rating ?? 0) > (best.rating ?? 0) ||
      ((review.rating ?? 0) === (best.rating ?? 0) && log.createdAt > best.log.createdAt)
    ) {
      best = { ...review, log };
    }
  }
  return best;
}

/** 읽는 중인 권 가운데 가장 최근에 손댄 기록 */
export function latestReadingLog(workId: string, volumeLogs: VolumeLog[]): VolumeLog | null {
  let latest: VolumeLog | null = null;
  for (const l of volumeLogs) {
    if (l.workId !== workId || l.readingState !== 'reading') continue;
    if (!latest || (l.updatedAt ?? l.createdAt) > (latest.updatedAt ?? latest.createdAt)) latest = l;
  }
  return latest;
}
