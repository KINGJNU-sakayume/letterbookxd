import type { DbFlowchart } from '../types';

export type { DbFlowchart };

// 카탈로그(공개 데이터)의 행 모양. Supabase 시절 테이블 컬럼을 그대로 따른다.

export interface DbSeries {
  id: string;
  title: string;
  author: string;
  genre?: string | null;
  description?: string | null;
  cover_url?: string | null;
  created_at: string;
}

export interface DbWork {
  id: string;
  title: string;
  author: string;
  genre?: string | null;
  lists?: string[] | null;
  description?: string | null;
  ai_translation?: string | null;
  original_excerpt: string;
  representative_cover_url: string | null;
  representative_edition_id?: string | null;
  series_id?: string | null;
  series_order?: number | null;
  published_year?: number | null;
  created_at: string;
}

export interface DbEdition {
  id: string;
  work_id: string;
  publisher: string;
  isbn: string;
  excerpt: string | null;
  cover_url: string;
  volume_number: string;
  page_count: number;
  created_at: string;
}

export interface DbAuthor {
  id: string;
  name: string;
  birth_death?: string | null;
  country?: string | null;
  awards?: string[] | null;
  bio?: string | null;
  photo_url?: string | null;
  created_at?: string;
}

export interface CatalogData {
  version: 1;
  works: DbWork[];
  editions: DbEdition[];
  series: DbSeries[];
  authors: DbAuthor[];
  flowcharts: DbFlowchart[];
}

/** 로컬에서 고친 카탈로그. 편집을 시작할 때의 번들 해시를 함께 기억한다. */
export interface CatalogOverride {
  catalog: CatalogData;
  baseHash: string;
  updatedAt: string;
}

export function emptyCatalog(): CatalogData {
  return { version: 1, works: [], editions: [], series: [], authors: [], flowcharts: [] };
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 빠진 배열을 채우고 id 순으로 정렬해 커밋 diff가 안정적이게 한다. */
export function normalizeCatalog(input: unknown): CatalogData {
  if (!input || typeof input !== 'object') throw new Error('카탈로그 형식이 아닙니다.');
  const raw = input as Partial<Record<keyof CatalogData, unknown>>;
  const list = <T extends { id: string }>(v: unknown, name: string): T[] => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw new Error(`카탈로그의 ${name}가 배열이 아닙니다.`);
    for (const row of v) {
      if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string') {
        throw new Error(`카탈로그의 ${name}에 id가 없는 행이 있습니다.`);
      }
    }
    return [...(v as T[])].sort(byId);
  };
  return {
    version: 1,
    works: list<DbWork>(raw.works, 'works'),
    editions: list<DbEdition>(raw.editions, 'editions'),
    series: list<DbSeries>(raw.series, 'series'),
    authors: list<DbAuthor>(raw.authors, 'authors'),
    flowcharts: list<DbFlowchart>(raw.flowcharts, 'flowcharts'),
  };
}

/** 커밋용 JSON 문자열 (마지막 줄바꿈 포함) */
export function serializeCatalog(catalog: CatalogData): string {
  return JSON.stringify(normalizeCatalog(catalog), null, 2) + '\n';
}

/** 내용 비교용 짧은 해시 (FNV-1a 32bit 두 번) */
export function hashCatalog(catalog: CatalogData): string {
  const text = JSON.stringify(normalizeCatalog(catalog));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
