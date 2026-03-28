// TODO(L-1): searchBooks()는 현재 UI에서 호출되지 않습니다.
// SearchPage는 Supabase DB에서 직접 작품 목록을 가져옵니다.
// 알라딘 API 검색 기능이 필요할 경우 재활성화하세요.

import { groupBooks } from '../utils/bookGrouping';
import type { GroupedBookData } from '../utils/bookGrouping';

export interface AladinBook {
  isbn: string;
  isbn13: string;
  title: string;
  author: string;
  publisher: string;
  pubDate: string;
  cover: string;
  description: string;
  categoryName: string;
}

export interface AladinSearchResponse {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  item: AladinBook[];
}

export async function searchBooks(query: string): Promise<GroupedBookData> {
  const key = import.meta.env.VITE_ALADIN_API_KEY as string;

  const params = new URLSearchParams({
    ttbkey: key,
    Query: query,
    QueryType: 'Keyword',
    MaxResults: '50',
    start: '1',
    SearchTarget: 'Book',
    Cover: 'Big',
    output: 'js',
    Version: '20131101',
  });

  const response = await fetch(`/aladin-api/ItemSearch.aspx?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Aladin API error: ${response.status}`);
  }

  const data: AladinSearchResponse = await response.json();
  return groupBooks(data.item ?? []);
}
