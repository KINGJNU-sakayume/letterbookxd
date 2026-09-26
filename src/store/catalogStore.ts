import { create } from 'zustand';
import { fetchCatalogRows } from '../services/db';
import { compareKo } from '../utils/format';

export interface CatalogEdition {
  id: string;
  cover_url: string | null;
  page_count: number | null;
  volume_number: string | null;
  publisher: string | null;
}

export interface CatalogWork {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  lists: string[] | null;
  published_year: number | null;
  series_id: string | null;
  series_order: number | null;
  representative_edition_id: string | null;
  created_at: string | null;
  editions: CatalogEdition[];
  /** 대표 판본 표지, 없으면 첫 표지 */
  cover: string | null;
}

export interface CatalogSeries {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  cover: string | null;
  /** series_order 순 */
  workIds: string[];
}

export interface CatalogAuthor {
  /** authors 행이 없는 작가는 이름을 id로 쓴다 */
  id: string;
  name: string;
  photo_url: string | null;
  country: string | null;
  workCount: number;
}

type RawWork = Omit<CatalogWork, 'cover' | 'editions'> & { editions: CatalogEdition[] | null };
type RawSeries = { id: string; title: string; author: string; genre: string | null; cover_url: string | null };
type RawAuthor = { id: string; name: string; photo_url: string | null; country: string | null };

interface CatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  works: CatalogWork[];
  series: CatalogSeries[];
  authors: CatalogAuthor[];
  /** 한 번만 불러오고 이후에는 캐시를 쓴다 */
  load: () => Promise<void>;
  /** 관리 화면에서 데이터를 바꾼 뒤 다시 불러온다 */
  reload: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

async function fetchCatalog() {
  const rows = await fetchCatalogRows();

  const works: CatalogWork[] = (rows.works as RawWork[]).map((w) => {
    const editions = w.editions ?? [];
    const rep = editions.find((e) => e.id === w.representative_edition_id);
    return { ...w, editions, cover: rep?.cover_url || editions.find((e) => e.cover_url)?.cover_url || null };
  });

  const series: CatalogSeries[] = (rows.series as RawSeries[]).map((s) => {
    const members = works
      .filter((w) => w.series_id === s.id)
      .sort((a, b) => (a.series_order ?? Infinity) - (b.series_order ?? Infinity));
    return {
      id: s.id,
      title: s.title,
      author: s.author,
      genre: s.genre,
      cover: s.cover_url || members.find((w) => w.cover)?.cover || null,
      workIds: members.map((w) => w.id),
    };
  });

  const countByAuthor = new Map<string, number>();
  works.forEach((w) => countByAuthor.set(w.author, (countByAuthor.get(w.author) ?? 0) + 1));
  const known = (rows.authors as RawAuthor[]).filter((a) => countByAuthor.has(a.name));
  const knownNames = new Set(known.map((a) => a.name));
  const authors: CatalogAuthor[] = [
    ...known.map((a) => ({ ...a, workCount: countByAuthor.get(a.name) ?? 0 })),
    ...Array.from(countByAuthor.keys())
      .filter((name) => !knownNames.has(name))
      .map((name) => ({ id: name, name, photo_url: null, country: null, workCount: countByAuthor.get(name) ?? 0 })),
  ].sort((a, b) => compareKo(a.name, b.name));

  return { works, series, authors };
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  status: 'idle',
  error: null,
  works: [],
  series: [],
  authors: [],

  load: async () => {
    if (get().status === 'ready') return;
    if (inflight) return inflight;
    set({ status: 'loading', error: null });
    inflight = fetchCatalog()
      .then((data) => set({ ...data, status: 'ready' }))
      .catch((err: unknown) => {
        console.error('카탈로그 로딩 에러:', err);
        set({ status: 'error', error: err instanceof Error ? err.message : '목록을 불러오지 못했습니다.' });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },

  reload: async () => {
    set({ status: 'idle' });
    return get().load();
  },
}));
