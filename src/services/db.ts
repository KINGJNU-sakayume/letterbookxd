import { supabase } from '../lib/supabase';
import { buildAladinFetchUrl } from './api';
import type { FlowchartNode, FlowchartEdge, DbFlowchart } from '../types';

// --- 인터페이스 정의 ---

export interface DbSeries {
  id: string;
  title: string;
  author: string;
  genre?: string;
  description?: string;
  cover_url?: string;
  created_at: string;
}

export interface DbWork {
  id: string;
  title: string;
  author: string;
  genre?: string;
  lists?: string[];
  description?: string;
  ai_translation?: string;
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

export interface EditionGroup {
  publisher: string;
  editions: DbEdition[];
}

// --- 헬퍼 함수 ---

export function groupEditionsByPublisher(editions: DbEdition[]): EditionGroup[] {
  const map = new Map<string, DbEdition[]>();
  for (const e of editions) {
    const list = map.get(e.publisher) ?? [];
    list.push(e);
    map.set(e.publisher, list);
  }
  return Array.from(map.entries()).map(([publisher, eds]) => ({
    publisher,
    editions: eds.sort((a, b) =>
      a.volume_number.localeCompare(b.volume_number, undefined, { numeric: true })
    ),
  }));
}

export function extractVolumeFromTitle(title: string): string {
  const numMatch = title.match(/(\d+)\s*권/);
  if (numMatch) return numMatch[1];
  if (/상권|상\s*$|[([]\s*상/.test(title)) return '상';
  if (/하권|하\s*$|[([]\s*하/.test(title)) return '하';
  if (/중권|중\s*$/.test(title)) return '중';
  const numOnly = title.match(/\s(\d+)\s*$/);
  if (numOnly) return numOnly[1];
  return '';
}

// --- 데이터베이스 함수 ---

export async function fetchAllWorks(): Promise<DbWork[]> {
  const { data, error } = await supabase
    .from('works').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbWork[];
}

export async function fetchWorkById(workId: string): Promise<DbWork | null> {
  const { data, error } = await supabase
    .from('works').select('*').eq('id', workId).maybeSingle();
  if (error) throw error;
  return data as DbWork | null;
}

export async function fetchEditionsByWorkId(workId: string): Promise<DbEdition[]> {
  const { data, error } = await supabase
    .from('editions').select('*').eq('work_id', workId).order('volume_number');
  if (error) throw error;
  return (data ?? []) as DbEdition[];
}

export async function fetchSeriesById(seriesId: string): Promise<DbSeries | null> {
  const { data, error } = await supabase
    .from('series').select('*').eq('id', seriesId).maybeSingle();
  if (error) throw error;
  return data as DbSeries | null;
}

export async function fetchWorksBySeriesId(seriesId: string): Promise<(DbWork & { editions: DbEdition[] })[]> {
  const { data, error } = await supabase
    .from('works')
    .select('*, editions!editions_work_id_fkey(*)')
    .eq('series_id', seriesId)
    .order('series_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as (DbWork & { editions: DbEdition[] })[];
}

export async function insertWork(payload: Omit<DbWork, 'id' | 'original_excerpt' | 'representative_cover_url' | 'created_at'>): Promise<DbWork> {
  const { data, error } = await supabase.from('works').insert([payload]).select().single();
  if (error) throw error;
  return data as DbWork;
}

export async function insertEdition(payload: Omit<DbEdition, 'id' | 'created_at'>): Promise<DbEdition> {
  const { data, error } = await supabase
    .from('editions')
    .insert([{
      work_id: payload.work_id,
      publisher: payload.publisher,
      isbn: payload.isbn,
      excerpt: payload.excerpt,
      cover_url: payload.cover_url,
      volume_number: payload.volume_number,
      page_count: payload.page_count,
    }])
    .select()
    .single();
  if (error) throw error;
  return data as DbEdition;
}

// --- 둘러보기·검색용 카탈로그 ---

/** 작품(판본 표지·쪽수 포함), 시리즈, 작가를 한 번에 읽는다. 시리즈·작가 오류는 빈 목록으로 넘긴다. */
export async function fetchCatalogRows() {
  const [worksRes, seriesRes, authorsRes] = await Promise.all([
    supabase
      .from('works')
      .select(`
        id, title, author, genre, lists, published_year, series_id, series_order,
        representative_edition_id, created_at,
        editions!work_id ( id, cover_url, page_count, volume_number, publisher )
      `)
      .order('title', { ascending: true }),
    supabase.from('series').select('id, title, author, genre, cover_url').order('title', { ascending: true }),
    supabase.from('authors').select('id, name, photo_url, country').order('name', { ascending: true }),
  ]);
  if (worksRes.error) throw worksRes.error;
  if (seriesRes.error) console.warn('시리즈 목록을 불러오지 못했습니다:', seriesRes.error);
  if (authorsRes.error) console.warn('작가 목록을 불러오지 못했습니다:', authorsRes.error);
  return {
    works: (worksRes.data ?? []) as unknown[],
    series: (seriesRes.data ?? []) as unknown[],
    authors: (authorsRes.data ?? []) as unknown[],
  };
}

// --- 플로우차트 함수 ---

export async function fetchFlowchartByAuthor(authorName: string): Promise<DbFlowchart | null> {
  const { data, error } = await supabase
    .from('author_flowcharts')
    .select('*')
    .eq('author_name', authorName)
    .maybeSingle();
  if (error) throw error;
  return data as DbFlowchart | null;
}

export async function upsertFlowchart(
  authorName: string,
  nodes: FlowchartNode[],
  edges: FlowchartEdge[]
): Promise<void> {
  const { error } = await supabase
    .from('author_flowcharts')
    .upsert(
      { author_name: authorName, nodes, edges, updated_at: new Date().toISOString() },
      { onConflict: 'author_name' }
    );
  if (error) throw error;
}

// 개발 중에는 vite 프록시(/aladin-api), 배포본에서는 Supabase Edge Function을 거친다
export async function getAladinDetail(isbn: string) {
  const params = new URLSearchParams({
    itemIdType: 'ISBN13',
    ItemId: isbn,
    output: 'js',
    Version: '20131101',
    OptResult: 'itemPage',
  });

  const res = await fetch(buildAladinFetchUrl('ItemLookUp.aspx', params));
  if (!res.ok) throw new Error(`Aladin API error: ${res.status}`);
  const json = await res.json();
  const item = json.item?.[0];
  if (!item) return null;

  return {
    page_count: item.subInfo?.itemPage ? parseInt(item.subInfo.itemPage, 10) : 0,
    cover: item.cover?.replace('coversum', 'cover500'),
  };
}
