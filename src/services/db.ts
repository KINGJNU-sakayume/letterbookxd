import { getCatalog, mutateCatalog } from './catalogSource';
import type { FlowchartNode, FlowchartEdge } from '../types';
import type { CatalogData, DbAuthor, DbEdition, DbFlowchart, DbSeries, DbWork } from '../catalog/model';

export type { DbAuthor, DbEdition, DbFlowchart, DbSeries, DbWork } from '../catalog/model';

// 카탈로그 읽기·쓰기: 번들 JSON + 이 기기의 편집본 (catalogSource.ts 참고).

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

// --- 조회 ---

const compareTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'ko');
const byVolume = (a: DbEdition, b: DbEdition) =>
  a.volume_number.localeCompare(b.volume_number, undefined, { numeric: true });
const now = () => new Date().toISOString();

function editionsOf(catalog: CatalogData, workId: string): DbEdition[] {
  return catalog.editions.filter((e) => e.work_id === workId).sort(byVolume);
}

export async function fetchAllWorks(): Promise<DbWork[]> {
  const { works } = await getCatalog();
  return [...works].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export async function fetchWorkById(workId: string): Promise<DbWork | null> {
  const { works } = await getCatalog();
  return works.find((w) => w.id === workId) ?? null;
}

export async function fetchEditionsByWorkId(workId: string): Promise<DbEdition[]> {
  return editionsOf(await getCatalog(), workId);
}

export async function fetchSeriesById(seriesId: string): Promise<DbSeries | null> {
  const { series } = await getCatalog();
  return series.find((s) => s.id === seriesId) ?? null;
}

export async function fetchAllSeries(): Promise<DbSeries[]> {
  const { series } = await getCatalog();
  return [...series].sort(compareTitle);
}

export async function fetchWorksBySeriesId(seriesId: string): Promise<(DbWork & { editions: DbEdition[] })[]> {
  const catalog = await getCatalog();
  return catalog.works
    .filter((w) => w.series_id === seriesId)
    .sort((a, b) => (a.series_order ?? Infinity) - (b.series_order ?? Infinity))
    .map((w) => ({ ...w, editions: editionsOf(catalog, w.id) }));
}

export async function fetchWorksByAuthor(author: string): Promise<(DbWork & { editions: DbEdition[] })[]> {
  const catalog = await getCatalog();
  return catalog.works
    .filter((w) => w.author === author)
    .sort((a, b) => (a.published_year ?? Infinity) - (b.published_year ?? Infinity))
    .map((w) => ({ ...w, editions: editionsOf(catalog, w.id) }));
}

export async function fetchAuthorByName(name: string): Promise<DbAuthor | null> {
  const { authors } = await getCatalog();
  return authors.find((a) => a.name === name) ?? null;
}

/** 작품에 등장하는 작가 이름 (가나다순, 중복 없음) */
export async function fetchWorkAuthorNames(): Promise<string[]> {
  const { works } = await getCatalog();
  return Array.from(new Set(works.map((w) => w.author))).sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 둘러보기·검색용: 작품(판본 요약 포함), 시리즈, 작가 */
export async function fetchCatalogRows() {
  const catalog = await getCatalog();
  const works = [...catalog.works].sort(compareTitle).map((w) => ({
    id: w.id,
    title: w.title,
    author: w.author,
    genre: w.genre ?? null,
    lists: w.lists ?? null,
    published_year: w.published_year ?? null,
    series_id: w.series_id ?? null,
    series_order: w.series_order ?? null,
    representative_edition_id: w.representative_edition_id ?? null,
    created_at: w.created_at ?? null,
    editions: editionsOf(catalog, w.id).map((e) => ({
      id: e.id, cover_url: e.cover_url, page_count: e.page_count, volume_number: e.volume_number, publisher: e.publisher,
    })),
  }));
  const series = [...catalog.series].sort(compareTitle).map((s) => ({
    id: s.id, title: s.title, author: s.author, genre: s.genre ?? null, cover_url: s.cover_url ?? null,
  }));
  const authors = [...catalog.authors].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((a) => ({
    id: a.id, name: a.name, photo_url: a.photo_url ?? null, country: a.country ?? null,
  }));
  return { works: works as unknown[], series: series as unknown[], authors: authors as unknown[] };
}

// --- 쓰기 (이 기기의 편집본에 쌓인다) ---

export async function insertWork(payload: Omit<DbWork, 'id' | 'original_excerpt' | 'representative_cover_url' | 'created_at'>): Promise<DbWork> {
  const work: DbWork = {
    ...payload,
    id: crypto.randomUUID(),
    original_excerpt: '',
    representative_cover_url: null,
    created_at: now(),
  };
  await mutateCatalog((c) => { c.works.push(work); });
  return work;
}

export async function updateWork(workId: string, patch: Partial<Omit<DbWork, 'id' | 'created_at'>>): Promise<void> {
  await mutateCatalog((c) => {
    const w = c.works.find((x) => x.id === workId);
    if (!w) throw new Error('작품을 찾을 수 없습니다.');
    Object.assign(w, patch);
  });
}

/** 작품과 그 판본을 지운다 (읽기 기록은 logStore.deleteLogsByWorkId로 따로 지운다) */
export async function deleteWork(workId: string): Promise<void> {
  await mutateCatalog((c) => {
    c.editions = c.editions.filter((e) => e.work_id !== workId);
    c.works = c.works.filter((w) => w.id !== workId);
  });
}

export async function insertEdition(payload: Omit<DbEdition, 'id' | 'created_at'>): Promise<DbEdition> {
  const edition: DbEdition = {
    id: crypto.randomUUID(),
    work_id: payload.work_id,
    publisher: payload.publisher,
    isbn: payload.isbn,
    excerpt: payload.excerpt,
    cover_url: payload.cover_url,
    volume_number: payload.volume_number,
    page_count: payload.page_count,
    created_at: now(),
  };
  await mutateCatalog((c) => {
    if (!c.works.some((w) => w.id === edition.work_id)) throw new Error('작품을 찾을 수 없습니다.');
    c.editions.push(edition);
  });
  return edition;
}

export async function insertSeries(payload: Omit<DbSeries, 'id' | 'created_at'>): Promise<DbSeries> {
  const series: DbSeries = { ...payload, id: crypto.randomUUID(), created_at: now() };
  await mutateCatalog((c) => { c.series.push(series); });
  return series;
}

/** 같은 이름의 작가가 있으면 덮어쓴다 (id는 유지) */
export async function upsertAuthorByName(payload: Omit<DbAuthor, 'id' | 'created_at'>): Promise<void> {
  await mutateCatalog((c) => {
    const existing = c.authors.find((a) => a.name === payload.name);
    if (existing) Object.assign(existing, payload);
    else c.authors.push({ ...payload, id: crypto.randomUUID(), created_at: now() });
  });
}

// --- 플로우차트 ---

export async function fetchFlowchartByAuthor(authorName: string): Promise<DbFlowchart | null> {
  const { flowcharts } = await getCatalog();
  return flowcharts.find((f) => f.author_name === authorName) ?? null;
}

export async function upsertFlowchart(
  authorName: string,
  nodes: FlowchartNode[],
  edges: FlowchartEdge[]
): Promise<void> {
  await mutateCatalog((c) => {
    const existing = c.flowcharts.find((f) => f.author_name === authorName);
    if (existing) Object.assign(existing, { nodes, edges, updated_at: now() });
    else c.flowcharts.push({ id: crypto.randomUUID(), author_name: authorName, nodes, edges, created_at: now(), updated_at: now() });
  });
}
