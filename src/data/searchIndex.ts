// TODO(L-1): 이 파일은 현재 사용되지 않습니다. (SearchPage는 Supabase에서 직접 검색)
// 클라이언트 사이드 검색 인덱스가 필요할 때 다시 구현하거나 삭제하세요.
import { works } from './mockData';
import type { SearchCandidate } from '../types';

export const searchCandidates: SearchCandidate[] = works.map((work) => ({
  workId: work.id,
  title: work.title,
  author: work.author,
  coverImageUrl: work.coverImageUrl,
  genre: work.genre,
}));

export function searchWorks(query: string): SearchCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return searchCandidates.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q)
  );
}
