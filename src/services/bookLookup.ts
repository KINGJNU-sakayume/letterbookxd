// 판본 추가 화면의 자동 채우기: 국립중앙도서관 ISBN 서지정보 API (seoji).
// 외부 도서 API 호출은 모두 이 파일을 거친다.
//
// - 브라우저에서 바로 부른다 (응답에 Access-Control-Allow-Origin: * 가 있어 서버가 필요 없다).
// - 인증키는 저장소·번들에 넣지 않는다. 관리 화면에서 입력하면 이 브라우저(IndexedDB)에만 저장된다.
// - 안내: https://www.nl.go.kr/NL/contents/N31101030500.do

import { getDb } from '../storage/db';

export const NLK_ENDPOINT = 'https://www.nl.go.kr/seoji/SearchApi.do';
export const NLK_KEY_GUIDE_URL = 'https://www.nl.go.kr/NL/contents/N31101020000.do';
const KEY_SETTING = 'nlkCertKey';

export interface BookCandidate {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  /** 표지 이미지 (https), 없으면 '' */
  cover: string;
  /** 쪽수, 모르면 null */
  pageCount: number | null;
  /** 권차 ('1', '상' 등), 모르면 '' */
  volume: string;
}

export class LookupKeyMissingError extends Error {
  constructor() {
    super('국립중앙도서관 인증키가 없습니다. 먼저 인증키를 저장해 주세요.');
    this.name = 'LookupKeyMissingError';
  }
}

export class LookupError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'LookupError';
  }
}

// --- 인증키 (이 브라우저에만) ---

export async function getLookupKey(): Promise<string | null> {
  const row = await getDb().settings.get(KEY_SETTING);
  return typeof row?.value === 'string' && row.value ? row.value : null;
}

export async function setLookupKey(key: string | null): Promise<void> {
  const value = key?.trim();
  if (value) await getDb().settings.put({ key: KEY_SETTING, value });
  else await getDb().settings.delete(KEY_SETTING);
}

// --- 응답 해석 (순수 함수) ---

/** "328 p.", "328쪽", "xii, 328 p." 같은 형태사항에서 본문 쪽수를 뽑는다 */
export function parsePageCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const nums = value.match(/\d+/g);
  if (!nums) return null;
  const n = Math.max(...nums.map(Number));
  return n > 0 ? n : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function httpsUrl(value: unknown): string {
  const url = text(value);
  if (!/^https?:\/\//i.test(url)) return '';
  return url.replace(/^http:\/\//i, 'https://');
}

/** 오류 코드를 사람이 읽을 말로 */
export function nlkErrorMessage(code: string, message?: string): string {
  if (code === '010' || code === '011') return '국립중앙도서관 인증키가 없거나 올바르지 않습니다. 키를 다시 확인해 주세요.';
  return `국립중앙도서관 검색에 실패했습니다${message ? `: ${message}` : ''} (오류 ${code})`;
}

/** seoji 응답 JSON을 후보 목록으로 바꾼다. 오류 응답이면 LookupError를 던진다. */
export function parseNlkResponse(json: unknown): BookCandidate[] {
  if (!json || typeof json !== 'object') throw new LookupError('국립중앙도서관 응답을 읽지 못했습니다.');
  const data = json as Record<string, unknown>;
  if (data.RESULT === 'ERROR' || data.ERR_CODE) {
    const code = text(data.ERR_CODE) || '???';
    throw new LookupError(nlkErrorMessage(code, text(data.ERR_MESSAGE)), code);
  }
  const docs = Array.isArray(data.docs) ? data.docs : [];
  const seen = new Set<string>();
  const out: BookCandidate[] = [];
  for (const raw of docs) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    const isbn = text(d.EA_ISBN).replace(/[^0-9X]/gi, '');
    const title = text(d.TITLE);
    if (!isbn && !title) continue;
    const key = isbn || title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      isbn,
      title,
      author: text(d.AUTHOR),
      publisher: text(d.PUBLISHER),
      cover: httpsUrl(d.TITLE_URL),
      pageCount: parsePageCount(d.PAGE),
      volume: text(d.VOL).replace(/^제\s*/, '').replace(/\s*권$/, ''),
    });
  }
  return out;
}

/** ISBN(10·13자리, 하이픈 허용)이면 숫자만, 아니면 null */
export function asIsbn(query: string): string | null {
  const digits = query.replace(/[-\s]/g, '');
  return /^(\d{13}|\d{9}[\dXx])$/.test(digits) ? digits.toUpperCase() : null;
}

export function buildNlkUrl(key: string, query: string, pageSize = 10): string {
  const params = new URLSearchParams({ cert_key: key, result_style: 'json', page_no: '1', page_size: String(pageSize) });
  const isbn = asIsbn(query);
  if (isbn) params.set('isbn', isbn);
  else params.set('title', query.trim());
  return `${NLK_ENDPOINT}?${params}`;
}

// --- 호출 ---

/** 제목 또는 ISBN으로 찾는다. 키는 인자로 주거나, 없으면 저장된 키를 쓴다. */
export async function searchBooks(
  query: string,
  options: { key?: string | null; fetcher?: typeof fetch; pageSize?: number } = {},
): Promise<BookCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const key = options.key ?? (await getLookupKey());
  if (!key) throw new LookupKeyMissingError();
  const fetcher = options.fetcher ?? fetch;
  let res: Response;
  try {
    res = await fetcher(buildNlkUrl(key, q, options.pageSize));
  } catch {
    throw new LookupError('국립중앙도서관에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!res.ok) throw new LookupError(`국립중앙도서관 검색에 실패했습니다 (HTTP ${res.status}).`);
  return parseNlkResponse(await res.json());
}
