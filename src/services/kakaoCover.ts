// 표지 찾기: 카카오(다음) 책 검색 API. 알라딘 Open API 종료(2026-10-30) 뒤 표지를 채우는 길.
//
// - 브라우저에서 바로 부른다 (dapi.kakao.com이 CORS를 허용한다. 2026-11-07 배포 사이트에서 확인).
// - REST API 키는 저장소·번들·백업·Life Hub에 넣지 않는다. 관리 화면에서 입력하면 이 브라우저(IndexedDB)에만 저장된다.
// - 응답의 `thumbnail`(search1.kakaocdn.net, 120×174) 안 `fname`에 원본(t1.daumcdn.net, 약 400×680) 주소가 들어 있다.
//   원본 경로는 공식 문서에 없는 것이라 바뀔 수 있다. 꺼내지 못하면 썸네일만 쓴다.
// - 이미지는 내려받지 않는다. 주소만 카탈로그에 둔다.
// - 안내: https://developers.kakao.com/docs/latest/ko/daum-search/dev-guide#search-book

import { getDb } from '../storage/db';
import { LookupError } from './bookLookup';

export const KAKAO_BOOK_ENDPOINT = 'https://dapi.kakao.com/v3/search/book';
export const KAKAO_KEY_GUIDE_URL = 'https://developers.kakao.com/console/app';
export const KAKAO_ORIGINAL_ORIGIN = 'https://t1.daumcdn.net';
export const KAKAO_THUMB_ORIGIN = 'https://search1.kakaocdn.net';
const KEY_SETTING = 'kakaoRestKey';

export interface KakaoCover {
  /** 원본 표지 (https://t1.daumcdn.net/…). 꺼내지 못하면 없음 */
  cover?: string;
  /** 응답의 썸네일 (https://search1.kakaocdn.net/…, 120×174) */
  thumb?: string;
}

export class KakaoKeyMissingError extends Error {
  constructor() {
    super('카카오 REST API 키가 없습니다. 먼저 키를 저장해 주세요.');
    this.name = 'KakaoKeyMissingError';
  }
}

// --- 키 (이 브라우저에만) ---

export async function getKakaoKey(): Promise<string | null> {
  const row = await getDb().settings.get(KEY_SETTING);
  return typeof row?.value === 'string' && row.value ? row.value : null;
}

export async function setKakaoKey(key: string | null): Promise<void> {
  const value = key?.trim();
  if (value) await getDb().settings.put({ key: KEY_SETTING, value });
  else await getDb().settings.delete(KEY_SETTING);
}

// --- 응답 해석 (순수 함수) ---

function httpsOn(url: string, origin: string): string | null {
  try {
    const u = new URL(url.trim().replace(/^http:\/\//i, 'https://'));
    return u.origin === origin ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * 썸네일 주소에서 원본 표지를 꺼낸다. `fname`이 두 번 인코딩된 경우가 있어 `%xx`가 남아 있으면 한 번 더 푼다.
 * 원본은 t1.daumcdn.net(https)일 때만 쓴다. 썸네일 주소는 바꾸지 않는다(크기 부분을 바꾸면 403).
 */
export function parseKakaoThumbnail(thumbnail: unknown): KakaoCover {
  if (typeof thumbnail !== 'string' || !thumbnail.trim()) return {};
  const thumb = httpsOn(thumbnail, KAKAO_THUMB_ORIGIN) ? thumbnail.trim().replace(/^http:\/\//i, 'https://') : undefined;
  let fname: string | null = null;
  try {
    fname = new URL(thumbnail.trim()).searchParams.get('fname');
  } catch {
    fname = null;
  }
  if (fname && /%[0-9a-f]{2}/i.test(fname)) {
    try {
      fname = decodeURIComponent(fname);
    } catch { /* 그대로 둔다 */ }
  }
  const cover = fname ? httpsOn(fname, KAKAO_ORIGINAL_ORIGIN) ?? undefined : undefined;
  return { ...(cover ? { cover } : {}), ...(thumb ? { thumb } : {}) };
}

const isbnDigits = (s: string) => s.replace(/[^0-9Xx]/g, '').toUpperCase();

/** 응답 문서 중 요청한 ISBN과 같은 책의 표지. 카카오의 isbn 필드는 "ISBN10 ISBN13"처럼 공백으로 나뉜다. */
export function pickKakaoCover(json: unknown, isbn: string): KakaoCover | null {
  const want = isbnDigits(isbn);
  if (!json || typeof json !== 'object') throw new LookupError('카카오 응답을 읽지 못했습니다.');
  const docs = (json as { documents?: unknown }).documents;
  if (!Array.isArray(docs)) throw new LookupError('카카오 응답을 읽지 못했습니다.');
  for (const d of docs) {
    if (!d || typeof d !== 'object') continue;
    const doc = d as { isbn?: unknown; thumbnail?: unknown };
    const ids = typeof doc.isbn === 'string' ? doc.isbn.split(/\s+/).map(isbnDigits).filter(Boolean) : [];
    if (!ids.includes(want)) continue;
    const found = parseKakaoThumbnail(doc.thumbnail);
    return found.cover || found.thumb ? found : null;
  }
  return null;
}

export function buildKakaoUrl(isbn: string): string {
  return `${KAKAO_BOOK_ENDPOINT}?${new URLSearchParams({ target: 'isbn', query: isbnDigits(isbn) })}`;
}

/** 표지로 쓸 주소: 원본이 있으면 원본, 없으면 썸네일 */
export const bestKakaoCover = (c: KakaoCover | null): string | null => c?.cover ?? c?.thumb ?? null;

// --- 호출 ---

/** ISBN으로 표지를 찾는다. 못 찾으면 null. 키는 인자로 주거나, 없으면 저장된 키를 쓴다. */
export async function lookupKakaoCover(
  isbn: string,
  options: { key?: string | null; fetcher?: typeof fetch } = {},
): Promise<KakaoCover | null> {
  if (!isbnDigits(isbn)) return null;
  const key = options.key ?? (await getKakaoKey());
  if (!key) throw new KakaoKeyMissingError();
  const fetcher = options.fetcher ?? fetch;
  let res: Response;
  try {
    res = await fetcher(buildKakaoUrl(isbn), { headers: { Authorization: `KakaoAK ${key}` } });
  } catch {
    throw new LookupError('카카오에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (res.status === 401 || res.status === 403) throw new LookupError(`카카오 REST API 키가 올바르지 않거나 책 검색 권한이 없습니다 (HTTP ${res.status}).`, String(res.status));
  if (res.status === 429) throw new LookupError('카카오 호출 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.', '429');
  if (!res.ok) throw new LookupError(`카카오 책 검색에 실패했습니다 (HTTP ${res.status}).`, String(res.status));
  return pickKakaoCover(await res.json(), isbn);
}
