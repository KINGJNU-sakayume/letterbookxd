// 알라딘 API 호출은 모두 이 파일을 거친다.
// 알라딘은 CORS를 열어 주지 않고 TTB 키가 필요하므로 서버 프록시를 통해 부른다.
//  - 개발: vite dev 서버의 /aladin-api 프록시. 로컬 .env의 ALADIN_TTB_KEY를 붙인다 (vite.config.ts).
//  - 배포: VITE_ALADIN_PROXY_URL (Cloudflare Worker, workers/aladin-proxy)
// 관리 화면(판본 추가)의 자동 채우기에서만 쓰인다.

import { groupBooks } from '../utils/bookGrouping';
import type { GroupedBookData } from '../utils/bookGrouping';

export class AladinUnavailableError extends Error {
  constructor() {
    super('알라딘 프록시 주소(VITE_ALADIN_PROXY_URL)가 설정되지 않았습니다.');
    this.name = 'AladinUnavailableError';
  }
}

function proxyBase(): string {
  if (import.meta.env.DEV) return '/aladin-api';
  const configured = (import.meta.env.VITE_ALADIN_PROXY_URL as string | undefined)?.trim();
  if (!configured) throw new AladinUnavailableError();
  return configured.replace(/\/+$/, '');
}

export function buildAladinFetchUrl(path: string, params: URLSearchParams): string {
  return `${proxyBase()}/${path}?${params}`;
}

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

async function getJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(buildAladinFetchUrl(path, params));
  if (!res.ok) throw new Error(`Aladin API error: ${res.status}`);
  return res.json() as Promise<T>;
}

/** 키워드로 책을 찾는다 (관리 화면 판본 추가) */
export async function searchAladinItems(query: string, maxResults = 10): Promise<AladinBook[]> {
  const params = new URLSearchParams({
    Query: query,
    QueryType: 'Keyword',
    MaxResults: String(maxResults),
    start: '1',
    SearchTarget: 'Book',
    output: 'js',
    Version: '20131101',
  });
  const data = await getJson<AladinSearchResponse>('ItemSearch.aspx', params);
  return data.item ?? [];
}

/** ISBN으로 쪽수와 큰 표지를 가져온다 */
export async function getAladinDetail(isbn: string): Promise<{ page_count: number; cover: string | undefined } | null> {
  const params = new URLSearchParams({
    itemIdType: 'ISBN13',
    ItemId: isbn,
    output: 'js',
    Version: '20131101',
    OptResult: 'itemPage',
  });
  const json = await getJson<{ item?: { subInfo?: { itemPage?: string }; cover?: string }[] }>('ItemLookUp.aspx', params);
  const item = json.item?.[0];
  if (!item) return null;
  return {
    page_count: item.subInfo?.itemPage ? parseInt(item.subInfo.itemPage, 10) : 0,
    cover: item.cover?.replace('coversum', 'cover500'),
  };
}

/**
 * 알라딘 검색 결과를 작품·판본·권으로 묶는다.
 * 지금은 UI에서 쓰지 않는다 (둘러보기는 카탈로그를 쓴다). 필요하면 다시 연결한다.
 */
export async function searchBooks(query: string): Promise<GroupedBookData> {
  const params = new URLSearchParams({
    Query: query,
    QueryType: 'Keyword',
    MaxResults: '50',
    start: '1',
    SearchTarget: 'Book',
    Cover: 'Big',
    output: 'js',
    Version: '20131101',
  });
  const data = await getJson<AladinSearchResponse>('ItemSearch.aspx', params);
  return groupBooks(data.item ?? []);
}
