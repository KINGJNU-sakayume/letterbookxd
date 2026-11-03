import { getDb } from '../storage/db';
import {
  hashCatalog,
  normalizeCatalog,
  type CatalogData,
  type CatalogOverride,
} from '../catalog/model';

/**
 * 카탈로그 = repo에 번들된 src/data/catalog.json
 *          + (있으면) 이 기기에서 고친 편집본(IndexedDB, 통째로 덮어씀)
 *
 * 관리 화면의 모든 쓰기는 편집본에 쌓이고, "카탈로그 JSON 내보내기"로 받은 파일을
 * src/data/catalog.json에 커밋하면 배포본에 반영된다.
 */

type Loader = () => Promise<unknown>;

interface Snapshot {
  catalog: CatalogData;
  override: CatalogOverride | null;
  bundledHash: string;
}

let loadBundled: Loader = () => import('../data/catalog.json').then((m) => m.default);
let snapshot: Promise<Snapshot> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

async function readSnapshot(): Promise<Snapshot> {
  const bundled = normalizeCatalog(await loadBundled());
  const bundledHash = hashCatalog(bundled);
  let override: CatalogOverride | null = null;
  try {
    const row = await getDb().catalogOverride.get('current');
    if (row) override = { catalog: normalizeCatalog(row.catalog), baseHash: row.baseHash, updatedAt: row.updatedAt };
  } catch (err) {
    console.error('카탈로그 편집본을 읽지 못했습니다:', err);
  }
  return { catalog: override?.catalog ?? bundled, override, bundledHash };
}

function current(): Promise<Snapshot> {
  if (!snapshot) {
    snapshot = readSnapshot();
    snapshot.catch(() => { snapshot = null; });
  }
  return snapshot;
}

function notify() {
  for (const l of listeners) l();
}

/** 번들 카탈로그를 다른 것으로 바꾼다 (테스트용) */
export function setBundledCatalogLoader(loader: Loader): void {
  loadBundled = loader;
  snapshot = null;
}

/** 캐시를 버리고 다음 호출에서 다시 읽는다 */
export function invalidateCatalog(): void {
  snapshot = null;
}

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getCatalog(): Promise<CatalogData> {
  return (await current()).catalog;
}

export interface CatalogStatus {
  /** 이 기기에 편집본이 있는지 */
  edited: boolean;
  updatedAt: string | null;
  /** 편집을 시작한 뒤 배포된 catalog.json이 바뀌었는지 */
  stale: boolean;
  counts: { works: number; editions: number; series: number; authors: number; flowcharts: number };
}

export async function getCatalogStatus(): Promise<CatalogStatus> {
  const s = await current();
  const c = s.catalog;
  return {
    edited: !!s.override,
    updatedAt: s.override?.updatedAt ?? null,
    stale: !!s.override && s.override.baseHash !== s.bundledHash,
    counts: { works: c.works.length, editions: c.editions.length, series: c.series.length, authors: c.authors.length, flowcharts: c.flowcharts.length },
  };
}

export async function getCatalogOverride(): Promise<CatalogOverride | null> {
  return (await current()).override;
}

async function save(next: CatalogData, s: Snapshot): Promise<void> {
  const db = getDb();
  if (hashCatalog(next) === s.bundledHash) {
    // 번들과 같아졌으면 편집본이 필요 없다
    await db.catalogOverride.delete('current');
    snapshot = Promise.resolve({ catalog: next, override: null, bundledHash: s.bundledHash });
    return;
  }
  const override: CatalogOverride = {
    catalog: next,
    baseHash: s.override?.baseHash ?? s.bundledHash,
    updatedAt: new Date().toISOString(),
  };
  await db.catalogOverride.put({ key: 'current', ...override });
  snapshot = Promise.resolve({ catalog: next, override, bundledHash: s.bundledHash });
}

/** 카탈로그 사본을 고쳐 편집본으로 저장한다. 한 번에 하나씩 차례로 처리한다. */
export function mutateCatalog<T>(fn: (draft: CatalogData) => T): Promise<T> {
  const run = queue.then(async () => {
    const s = await current();
    const draft = structuredClone(s.catalog);
    const result = fn(draft);
    await save(normalizeCatalog(draft), s);
    return result;
  });
  queue = run.catch(() => undefined);
  return run.finally(notify);
}

/** 백업에서 불러온 편집본으로 바꾸거나(null이면) 편집본을 버린다 */
export function replaceCatalogOverride(override: CatalogOverride | null): Promise<void> {
  const run = queue.then(async () => {
    const db = getDb();
    if (override) {
      const catalog = normalizeCatalog(override.catalog);
      await db.catalogOverride.put({ key: 'current', catalog, baseHash: override.baseHash, updatedAt: override.updatedAt });
    } else {
      await db.catalogOverride.delete('current');
    }
    snapshot = null;
  });
  queue = run.catch(() => undefined);
  return run.finally(notify);
}

export function discardCatalogEdits(): Promise<void> {
  return replaceCatalogOverride(null);
}

/** 작품이 속한 시리즈와 그 시리즈의 작품 id들 (완독 연쇄 판정용) */
export async function seriesInfoForWork(workId: string): Promise<{ seriesId: string; workIds: string[] } | null> {
  const { works } = await getCatalog();
  const seriesId = works.find((w) => w.id === workId)?.series_id;
  if (!seriesId) return null;
  return { seriesId, workIds: works.filter((w) => w.series_id === seriesId).map((w) => w.id) };
}

/** 시리즈에 속한 작품 id들 (완독 연쇄를 다시 판정할 때 쓴다). 카탈로그에 없으면 null. */
export async function seriesWorkIds(seriesId: string): Promise<string[] | null> {
  const { works } = await getCatalog();
  const ids = works.filter((w) => w.series_id === seriesId).map((w) => w.id);
  return ids.length ? ids : null;
}
