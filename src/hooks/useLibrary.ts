import { useMemo } from 'react';
import { useLogStore } from '../store/logStore';
import type { CatalogEdition, CatalogWork } from '../store/catalogStore';
import type { VolumeLog } from '../types';
import { parseEditionSetId, parseVolumeId } from '../utils/editionUtils';
import { progressPercent, volumeLabel } from '../utils/format';
import { bestCompletion, latestReadingLog, workReadingState, type ReadingState } from '../utils/readingState';

export interface WorkStatus {
  state: ReadingState;
  percent: number | null;
  rating: number | null;
  liked: boolean;
}

/** 목록 표지 아래에 붙일 작품별 읽기 상태 */
export function useWorkStatuses(works: CatalogWork[]): Map<string, WorkStatus> {
  const { volumeLogs, setCompletionLogs } = useLogStore();
  return useMemo(() => {
    const map = new Map<string, WorkStatus>();
    for (const w of works) {
      const state = workReadingState(w.id, volumeLogs, setCompletionLogs);
      if (state === 'completed') {
        const best = bestCompletion(w.id, volumeLogs, setCompletionLogs);
        map.set(w.id, { state, percent: null, rating: best?.rating ?? null, liked: best?.liked ?? false });
      } else if (state === 'reading') {
        const log = latestReadingLog(w.id, volumeLogs);
        const edition = log ? w.editions.find((e) => e.id === parseVolumeId(log.volumeId)) : undefined;
        map.set(w.id, { state, percent: progressPercent(log?.currentPage, edition?.page_count), rating: null, liked: false });
      } else {
        map.set(w.id, { state, percent: null, rating: null, liked: false });
      }
    }
    return map;
  }, [works, volumeLogs, setCompletionLogs]);
}

export interface ReadingItem {
  log: VolumeLog;
  work: CatalogWork;
  edition: CatalogEdition | undefined;
  publisher: string;
  /** 여러 권짜리 판본일 때만 '2권' 같은 표시 */
  volume: string;
}

/** 읽는 중인 권들, 최근에 손댄 순서 */
export function useReadingItems(works: CatalogWork[]): ReadingItem[] {
  const volumeLogs = useLogStore((s) => s.volumeLogs);
  return useMemo(() => {
    const byId = new Map(works.map((w) => [w.id, w]));
    return volumeLogs
      .filter((l) => l.readingState === 'reading')
      .map((log) => {
        const work = byId.get(log.workId);
        if (!work) return null;
        const edition = work.editions.find((e) => e.id === parseVolumeId(log.volumeId));
        const publisher = edition?.publisher || parseEditionSetId(log.editionSetId).publisher;
        const multi = work.editions.filter((e) => e.publisher === publisher).length > 1;
        return { log, work, edition, publisher, volume: multi ? volumeLabel(edition?.volume_number) : '' };
      })
      .filter((x): x is ReadingItem => x !== null)
      .sort((a, b) => (b.log.updatedAt ?? b.log.createdAt).localeCompare(a.log.updatedAt ?? a.log.createdAt));
  }, [works, volumeLogs]);
}
