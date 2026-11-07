/**
 * 책장 → Life Board 보드 목록(manifest v1). 규격: board 저장소 docs/TILES.md, 검증: board js/schema.js.
 *
 * 순수 함수: 네트워크·저장소·무작위·기기 시간대를 쓰지 않는다. 같은 입력이면 같은 출력이라
 * 업로드 쪽의 "내용이 같으면 보내지 않기"(sha256)가 동작한다. 기기 동기화(sync) 코드와 섞지 않는다.
 *
 * 타일 id는 한 번 정하면 바꾸지 않는다(보드의 사용자 배치가 id로 저장된다).
 */
import type { CatalogData } from '../catalog/model';
import type { LogRecord } from '../domain/logs/records';

export const BOARD_APP = 'letterbookxd';
export const APP_HREF = 'https://kingjnu-sakayume.github.io/letterbookxd/';
/** board js/config.js imageOrigins 와 같게 (정확히 일치해야 한다) */
export const IMAGE_ORIGINS: readonly string[] = [
  'https://kingjnu-sakayume.github.io',
  'https://image.aladin.co.kr',
  'https://upload.wikimedia.org',
  'https://i.scdn.co',
  'https://is1-ssl.mzstatic.com',
  'https://is2-ssl.mzstatic.com',
  'https://is3-ssl.mzstatic.com',
  'https://is4-ssl.mzstatic.com',
  'https://is5-ssl.mzstatic.com',
  'https://image.tmdb.org',
  'https://t1.daumcdn.net',
  'https://search1.kakaocdn.net',
];
/** board js/config.js linkOrigins */
export const LINK_ORIGINS: readonly string[] = ['https://kingjnu-sakayume.github.io'];

/** 보드에 보내는 타일 (board js/schema.js 최대 길이에 맞춰 자른 값) */
export interface BoardCover { src?: string; alt?: string; mono?: string }
export interface BoardProgress { value: number; max: number; text?: string }
export interface BoardRow {
  title: string; value?: string; sub?: string; cover?: BoardCover; progress?: BoardProgress; now?: boolean; muted?: boolean;
}
export interface BoardTile {
  id: 'reading' | 'series' | 'recent' | 'next';
  name: string;
  tone: 'sleeve' | 'strip' | 'type';
  form?: 'list' | 'cells';
  sizes: string[];
  size: string;
  default: boolean;
  href?: string;
  detail?: { title: string; rows: BoardRow[] };
  data: Record<string, unknown>;
}
export interface BoardManifest { version: 1; app: typeof BOARD_APP; generated_at: string; tiles: BoardTile[] }

/** 앱 상태 중 타일에 쓰는 것: 이 기기의 기록(동기화로 합친 뒤)과 카탈로그(편집본 포함) */
export interface BoardSource {
  records: readonly LogRecord[];
  catalog: Pick<CatalogData, 'works' | 'editions' | 'series'>;
}

/* ---------- 글자 ---------- */

/** 앞뒤 공백을 지우고 max(.length)를 넘으면 …로 자른다. 비면 undefined (빈 글자는 보드가 타일째 거절한다) */
export function clip(value: string | null | undefined, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  let s = value.replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  if (s.length > max) {
    s = s.slice(0, max - 1);
    if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1); // 서로게이트 쌍을 반으로 자르지 않는다
    s = s.trimEnd() + '…';
  }
  return s;
}
/** 줄바꿈을 살리는 긴 문장용 */
function clipLines(lines: Array<string | undefined>, max: number): string | undefined {
  const joined = lines.filter((l): l is string => !!l && !!l.trim()).map((l) => l.trim()).join('\n');
  if (!joined) return undefined;
  return joined.length > max ? clip(joined, max) : joined;
}
/** 글자 칸 한 글자 (mono 최대 2) */
export function monoOf(title: string | undefined): string {
  const first = Array.from((title ?? '').trim())[0];
  return first && first.length <= 2 ? first : '책';
}

/* ---------- 날짜: 한국 시간 기준 M/D (앱을 다시 열 때까지 남으므로 "오늘·어제"를 쓰지 않는다) ---------- */

const KST_MS = 9 * 3600 * 1000;
export function shortDate(iso: string | null | undefined, now: number): string | undefined {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return undefined;
  const d = new Date(t + KST_MS);
  const y = new Date(now + KST_MS).getUTCFullYear();
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return d.getUTCFullYear() === y ? md : `${d.getUTCFullYear()}/${md}`;
}

/* ---------- 표지 ---------- */

/** 허용 출처의 https 주소면 그 주소, 아니면 글자 칸. 필수 칸(sleeve)에 쓴다. */
export function coverOf(url: string | null | undefined, title: string | undefined): BoardCover {
  const src = allowedImage(url);
  return src ? { src, alt: '' } : { mono: monoOf(title) };
}
export function allowedImage(url: string | null | undefined): string | undefined {
  if (typeof url !== 'string' || !url || url.length > 600) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && IMAGE_ORIGINS.includes(u.origin) ? url : undefined;
  } catch {
    return undefined;
  }
}

/* ---------- 카탈로그 색인 ---------- */

type Work = CatalogData['works'][number];
type Edition = CatalogData['editions'][number];

const KO_VOLUME: Record<string, number> = { 상: 1, 중: 2, 하: 3 };
function volumeOrder(v: string | null | undefined): number {
  const s = (v ?? '').trim();
  if (s in KO_VOLUME) return KO_VOLUME[s];
  const n = parseInt(s || '1', 10);
  return Number.isFinite(n) ? n : 999;
}
function volumeLabel(v: string | null | undefined): string {
  const s = (v ?? '').trim() || '1';
  return s in KO_VOLUME ? `${s}권` : /^\d+$/.test(s) ? `${s}권` : s;
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const latest = (a: string, b: string) => (b > a ? b : a);
const stamp = (r: Pick<LogRecord, 'updatedAt' | 'createdAt'>) => r.updatedAt || r.createdAt;
const setKey = (workId: string, publisher: string) => `${workId}::${publisher}`;

interface EditionSet { key: string; work: Work; publisher: string; volumes: Edition[] }

function indexCatalog(catalog: BoardSource['catalog']) {
  const works = new Map(catalog.works.map((w) => [w.id, w]));
  const editions = new Map(catalog.editions.map((e) => [e.id, e]));
  const sets = new Map<string, EditionSet>();
  for (const e of [...catalog.editions].sort((a, b) => volumeOrder(a.volume_number) - volumeOrder(b.volume_number) || cmp(a.id, b.id))) {
    const work = works.get(e.work_id);
    if (!work) continue;
    const key = setKey(e.work_id, e.publisher ?? '');
    const set = sets.get(key) ?? { key, work, publisher: e.publisher ?? '', volumes: [] };
    set.volumes.push(e);
    sets.set(key, set);
  }
  const seriesWorks = new Map<string, Work[]>();
  for (const w of [...catalog.works].sort((a, b) => (a.series_order ?? 999) - (b.series_order ?? 999) || cmp(a.id, b.id))) {
    if (!w.series_id) continue;
    seriesWorks.set(w.series_id, [...(seriesWorks.get(w.series_id) ?? []), w]);
  }
  return { works, editions, sets, seriesWorks };
}

const editionIdOf = (volumeId: string | null) => (volumeId && volumeId.startsWith('vol-') ? volumeId.slice(4) : volumeId ?? '');

/** 한 권 세트면 출판사만, 여러 권이면 "출판사 · 2권" */
function editionLine(set: EditionSet | undefined, e: Edition): string | undefined {
  const publisher = (e.publisher ?? '').trim();
  const vol = set && set.volumes.length > 1 ? volumeLabel(e.volume_number) : '';
  return [publisher, vol].filter(Boolean).join(' · ') || undefined;
}
/** 세트 대표 표지: 1권(첫 권) 표지, 없으면 작품 대표 표지 */
function setCover(set: EditionSet | undefined, work: Work): string | null {
  return set?.volumes.find((v) => allowedImage(v.cover_url))?.cover_url ?? work.representative_cover_url ?? set?.volumes[0]?.cover_url ?? null;
}

/* ---------- 타일 ---------- */

const hrefFor = (path?: string) => (path ? `${APP_HREF}#${path}` : APP_HREF);

export function buildBoardTiles(source: BoardSource, now: number): BoardManifest {
  const ix = indexCatalog(source.catalog);
  const volumeLogs = source.records.filter((r) => r.logType === 'volume' && r.volumeId);
  const setLogs = source.records.filter((r) => r.logType === 'set_completion' && r.workId && r.editionSetId);

  const completedSets = new Map<string, LogRecord>(); // 판본 세트 → 가장 최근 완독 기록
  for (const r of setLogs) {
    const prev = completedSets.get(r.editionSetId!);
    if (!prev || cmp(prev.createdAt, r.createdAt) < 0 || (prev.createdAt === r.createdAt && cmp(prev.id, r.id) < 0)) completedSets.set(r.editionSetId!, r);
  }
  const completedWorks = new Set([...completedSets.values()].map((r) => r.workId!));
  const volumeState = new Map<string, LogRecord>(); // 판본(권) id → 권 기록
  for (const r of volumeLogs) volumeState.set(editionIdOf(r.volumeId), r);

  // 읽는 중인 권: 마지막으로 손댄 순
  const reading = volumeLogs
    .filter((r) => r.readingState === 'reading')
    .map((r) => {
      const edition = ix.editions.get(editionIdOf(r.volumeId));
      const work = edition && ix.works.get(edition.work_id);
      return edition && work ? { r, edition, work, set: ix.sets.get(setKey(work.id, edition.publisher ?? '')) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => cmp(stamp(b.r), stamp(a.r)) || cmp(a.r.id, b.r.id));

  // 최근 완독: 판본 세트 완독일 순, 같은 작품은 한 번
  const recent: Array<{ r: LogRecord; work: Work; set: EditionSet | undefined }> = [];
  for (const r of [...completedSets.values()].sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id))) {
    const work = ix.works.get(r.workId!);
    if (!work || recent.some((x) => x.work.id === work.id)) continue;
    recent.push({ r, work, set: ix.sets.get(r.editionSetId!) });
  }

  const progressOf = (r: LogRecord, e: Edition): BoardProgress | undefined => {
    if (!(e.page_count > 0) || typeof r.currentPage !== 'number' || r.currentPage < 0) return undefined;
    const value = Math.min(Math.round(r.currentPage), e.page_count);
    return { value, max: e.page_count, text: `${value} / ${e.page_count}쪽` };
  };

  const tiles: BoardTile[] = [];

  /* reading — 읽는 중 (sleeve). 읽는 책이 없으면 가장 최근 완독, 그것도 없으면 뺀다. */
  if (reading.length) {
    const top = reading[0];
    const date = shortDate(stamp(top.r), now);
    const rows: BoardRow[] = reading.slice(0, 12).map((x, i) => compact<BoardRow>({
      title: clip(x.work.title, 80)!,
      value: clip(x.set && x.set.volumes.length > 1 ? volumeLabel(x.edition.volume_number) : undefined, 24),
      sub: clip([x.edition.publisher, shortDate(stamp(x.r), now) && `${shortDate(stamp(x.r), now)} 읽음`].filter(Boolean).join(' · '), 80),
      cover: coverOf(x.edition.cover_url, x.work.title),
      progress: progressOf(x.r, x.edition),
      now: i === 0 ? true : undefined,
    }));
    tiles.push({
      id: 'reading', name: '책장 · 읽는 중', tone: 'sleeve', sizes: ['1x1', '2x1', '2x2'], size: '2x2', default: true,
      href: hrefFor(`/book/${top.work.id}`),
      detail: { title: '책장 · 읽는 중', rows },
      data: compact({
        label: '책장',
        title: clip(top.work.title, 80)!,
        sub: clipLines([editionLine(top.set, top.edition), clip(top.work.author, 40)], 160),
        pill: clip(date ? `${date} 읽음` : '읽는 중', 20),
        cover: coverOf(top.edition.cover_url, top.work.title),
        progress: progressOf(top.r, top.edition),
        list: rows.length > 1 ? rows.slice(0, 5) : undefined,
        listLabel: rows.length > 1 ? '읽는 중' : undefined,
      }),
    });
  } else if (recent.length) {
    const last = recent[0];
    const date = shortDate(last.r.createdAt, now);
    tiles.push({
      id: 'reading', name: '책장 · 읽는 중', tone: 'sleeve', sizes: ['1x1', '2x1', '2x2'], size: '2x2', default: true,
      href: hrefFor(`/book/${last.work.id}`),
      data: compact({
        label: '책장 · 최근 완독',
        title: clip(last.work.title, 80)!,
        sub: clipLines([clip(last.set?.publisher, 40), clip(last.work.author, 40)], 160),
        pill: clip(date ? `${date} 완독` : '완독', 20),
        cover: coverOf(setCover(last.set, last.work), last.work.title),
      }),
    });
  }

  /* series — 칸 채우기 (type·cells). 가장 최근에 손댄 여러 권 판본(권 칸) 또는 카탈로그 시리즈(편 칸) 하나. */
  const seriesCandidates: Array<{ at: string; order: number; key: string; tile: () => BoardTile }> = [];
  for (const set of ix.sets.values()) {
    if (set.volumes.length < 2 || completedSets.has(set.key)) continue;
    const logs = set.volumes.map((v) => volumeState.get(v.id)).filter((r): r is LogRecord => !!r && r.readingState !== 'unread');
    if (!logs.length) continue;
    const at = logs.map(stamp).reduce(latest);
    const vols = set.volumes.slice(0, 60);
    const filled = vols.filter((v) => volumeState.get(v.id)?.readingState === 'completed').length;
    seriesCandidates.push({
      at, order: 0, key: set.key,
      tile: () => ({
        id: 'series', name: '책장 · 시리즈 진행', tone: 'type', form: 'cells', sizes: ['2x1', '4x1'], size: '2x1', default: true,
        href: hrefFor(`/book/${set.work.id}`),
        detail: {
          title: clip(`${set.work.title} · ${set.publisher}`, 80) ?? '책장 · 시리즈 진행',
          rows: vols.slice(0, 12).map((v) => volumeRow(v, volumeState.get(v.id), now, progressOf)),
        },
        data: { label: labelWithCount(set.work.title, filled, vols.length, '권'), total: vols.length, filled },
      }),
    });
  }
  for (const s of source.catalog.series) {
    const members = (ix.seriesWorks.get(s.id) ?? []).slice(0, 60);
    if (members.length < 2) continue;
    const memberIds = new Set(members.map((w) => w.id));
    const done = members.filter((w) => completedWorks.has(w.id)).length;
    if (done >= members.length) continue;
    const times = [
      ...[...completedSets.values()].filter((r) => memberIds.has(r.workId!)).map((r) => r.createdAt),
      ...volumeLogs.filter((r) => r.readingState !== 'unread' && memberIds.has(r.workId ?? '')).map(stamp),
    ].sort();
    if (!times.length) continue;
    seriesCandidates.push({
      at: times[times.length - 1], order: 1, key: s.id,
      tile: () => ({
        id: 'series', name: '책장 · 시리즈 진행', tone: 'type', form: 'cells', sizes: ['2x1', '4x1'], size: '2x1', default: true,
        href: hrefFor(`/series/${s.id}`),
        detail: {
          title: clip(s.title, 80) ?? '책장 · 시리즈 진행',
          rows: members.slice(0, 12).map((w, i) => {
            const isDone = completedWorks.has(w.id);
            const isReading = !isDone && reading.some((x) => x.work.id === w.id);
            return compact<BoardRow>({
              title: clip(`${i + 1}. ${w.title}`, 80)!,
              value: isDone ? '완독' : isReading ? '읽는 중' : undefined,
              now: isReading ? true : undefined,
              muted: !isDone && !isReading ? true : undefined,
            });
          }),
        },
        data: { label: labelWithCount(s.title, done, members.length, '편'), total: members.length, filled: done },
      }),
    });
  }
  seriesCandidates.sort((a, b) => cmp(b.at, a.at) || a.order - b.order || cmp(a.key, b.key));
  if (seriesCandidates.length) tiles.push(seriesCandidates[0].tile());

  /* recent — 최근 완독 (strip). 없으면 뺀다. */
  if (recent.length) {
    const items = recent.slice(0, 8);
    tiles.push({
      id: 'recent', name: '책장 · 최근 완독', tone: 'strip', sizes: ['2x1', '4x1'], size: '4x1', default: false,
      href: hrefFor('/bookshelf?tab=completed'),
      detail: {
        title: '책장 · 최근 완독',
        rows: recent.slice(0, 12).map((x) => compact<BoardRow>({
          title: clip(x.work.title, 80)!,
          value: clip([shortDate(x.r.createdAt, now), x.r.rating ? `★${x.r.rating}` : undefined].filter(Boolean).join(' · '), 24),
          sub: clip([x.set?.publisher, x.work.author].filter(Boolean).join(' · '), 80),
          cover: coverOf(setCover(x.set, x.work), x.work.title),
        })),
      },
      data: {
        label: '책장 · 최근 완독',
        items: items.map((x) => ({ title: clip(x.work.title, 80)!, cover: coverOf(setCover(x.set, x.work), x.work.title) })),
      },
    });
  }

  /* next — 이어 읽을 차례 (type·list). 진행 중인 여러 권 판본의 다음 권, 진행 중인 시리즈의 다음 편. */
  const readingVolumes = new Set(reading.map((x) => x.edition.id));
  const readingWorks = new Set(reading.map((x) => x.work.id));
  const nexts: Array<{ at: string; key: string; row: BoardRow }> = [];
  for (const set of ix.sets.values()) {
    if (set.volumes.length < 2 || completedSets.has(set.key)) continue;
    const doneVols = set.volumes.filter((v) => volumeState.get(v.id)?.readingState === 'completed');
    if (!doneVols.length) continue;
    const next = set.volumes.find((v) => volumeState.get(v.id)?.readingState !== 'completed');
    if (!next || readingVolumes.has(next.id)) continue;
    const at = doneVols.map((v) => stamp(volumeState.get(v.id)!)).reduce(latest);
    nexts.push({
      at, key: set.key,
      row: compact<BoardRow>({
        title: clip(`${set.work.title} ${volumeLabel(next.volume_number)}`, 80)!,
        value: clip(`${doneVols.length} / ${set.volumes.length}권`, 24),
        sub: clip([set.publisher, shortDate(at, now) && `${shortDate(at, now)} 앞 권 완독`].filter(Boolean).join(' · '), 80),
        cover: coverOf(next.cover_url, set.work.title),
      }),
    });
  }
  for (const s of source.catalog.series) {
    const members = ix.seriesWorks.get(s.id) ?? [];
    const doneMembers = members.filter((w) => completedWorks.has(w.id));
    if (!doneMembers.length || doneMembers.length >= members.length) continue;
    const next = members.find((w) => !completedWorks.has(w.id));
    if (!next || readingWorks.has(next.id)) continue;
    const at = [...completedSets.values()].filter((r) => doneMembers.some((w) => w.id === r.workId)).map((r) => r.createdAt).reduce(latest);
    nexts.push({
      at, key: s.id,
      row: compact<BoardRow>({
        title: clip(next.title, 80)!,
        value: clip(`${members.indexOf(next) + 1} / ${members.length}편`, 24),
        sub: clip([s.title, shortDate(at, now) && `${shortDate(at, now)} 앞 편 완독`].filter(Boolean).join(' · '), 80),
        cover: coverOf(setCover(ix.sets.get([...ix.sets.keys()].find((k) => k.startsWith(next.id + '::')) ?? ''), next), next.title),
      }),
    });
  }
  nexts.sort((a, b) => cmp(b.at, a.at) || cmp(a.key, b.key));
  if (hasBoardData(source.records)) {
    const rows = nexts.length ? nexts.slice(0, 12).map((x) => x.row) : [{ title: '이어 읽을 책이 없어요', muted: true }];
    tiles.push({
      id: 'next', name: '책장 · 이어 읽을 차례', tone: 'type', form: 'list', sizes: ['2x1', '2x2'], size: '2x2', default: false,
      href: hrefFor('/bookshelf?tab=incomplete_series'),
      data: { label: '책장 · 이어 읽을 차례', rows: rows.slice(0, 6) },
      ...(nexts.length > 6 ? { detail: { title: '책장 · 이어 읽을 차례', rows } } : {}),
    });
  }

  return { version: 1, app: BOARD_APP, generated_at: new Date(now).toISOString(), tiles };
}

function labelWithCount(title: string, filled: number, total: number, unit: string): string {
  const tail = ` · ${filled} / ${total}${unit}`;
  return `책장 · ${clip(title, 80 - '책장 · '.length - tail.length) ?? '시리즈'}${tail}`;
}

function volumeRow(
  v: Edition, r: LogRecord | undefined, now: number, progressOf: (r: LogRecord, e: Edition) => BoardProgress | undefined,
): BoardRow {
  const title = volumeLabel(v.volume_number);
  if (r?.readingState === 'completed') return compact<BoardRow>({ title, value: clip(`완독 ${shortDate(stamp(r), now) ?? ''}`, 24) });
  if (r?.readingState === 'reading') return compact<BoardRow>({ title, value: '읽는 중', progress: progressOf(r, v), now: true });
  return { title, muted: true };
}

/** undefined 필드를 뺀다 (JSON에 남지 않게, 키 순서는 그대로) */
function compact<T extends object>(o: { [K in keyof T]?: T[K] | undefined } & Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** 이 기기에 올릴 만한 기록이 있는지 (안 읽음으로 되돌린 권만 있으면 없음) */
export function hasBoardData(records: readonly LogRecord[]): boolean {
  return records.some((r) => r.logType !== 'volume' || r.readingState === 'reading' || r.readingState === 'completed');
}
