import { useBookStore } from '../store/bookStore';
import { fetchWorkById, fetchEditionsByWorkId, groupEditionsByPublisher } from './db';
import { dbWorkToWork, groupToEditionSet, editionToVolume } from '../utils/bookMappers';

/**
 * 완독 자동 처리(세트·시리즈 완독 기록)는 bookStore에 올라온 권 목록을 기준으로 한다.
 * 작품 화면을 거치지 않고 책장에서 바로 상태를 바꿀 때 먼저 불러 둔다.
 */
export async function ensureWorkLoaded(workId: string): Promise<boolean> {
  const [work, editions] = await Promise.all([fetchWorkById(workId), fetchEditionsByWorkId(workId)]);
  if (!work) return false;
  const groups = groupEditionsByPublisher(editions);
  useBookStore.getState().setGroupedData({
    works: [dbWorkToWork(work)],
    editionSets: groups.map((g) => groupToEditionSet(g, work.id)),
    volumes: editions.map((e) => editionToVolume(e, work.id)),
  });
  return true;
}
