import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Page, PageHeader, SectionHeading } from '../components/layout/Page';
import { BookCover } from '../components/ui/BookCover';
import { Portrait } from '../components/ui/Portrait';
import { ReadingMark } from '../components/ui/ReadingMark';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Tabs } from '../components/ui/Tabs';
import { CoverGridSkeleton, EmptyState, ErrorState } from '../components/ui/States';
import { ReadingCard } from '../components/book/ReadingCard';
import { useCatalogStore, type CatalogAuthor, type CatalogSeries, type CatalogWork } from '../store/catalogStore';
import { useLogStore } from '../store/logStore';
import { useAuthStore } from '../store/authStore';
import { useReadingItems, useWorkStatuses, type WorkStatus } from '../hooks/useLibrary';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { matchesQuery } from '../lib/hangul';
import { compareKo, splitGenre } from '../utils/format';
import type { ReadingState } from '../utils/readingState';

type View = 'works' | 'series' | 'authors';
type StateFilter = ReadingState;

const VIEW_LABEL: Record<View, string> = { works: '단행본', series: '시리즈', authors: '작가' };
const EMPTY_LABEL: Record<View, string> = { works: '등록된 단행본이 없습니다', series: '등록된 시리즈가 없습니다', authors: '등록된 작가가 없습니다' };
const STATE_LABEL: Record<StateFilter, string> = { reading: '읽는 중', completed: '완독', unread: '아직 안 읽음' };
const SORTS: Record<View, { value: string; label: string }[]> = {
  works: [
    { value: 'title', label: '제목순' },
    { value: 'author', label: '작가순' },
    { value: 'year', label: '발표 연도순' },
    { value: 'recent', label: '최근 등록순' },
  ],
  series: [{ value: 'title', label: '제목순' }],
  authors: [
    { value: 'name', label: '이름순' },
    { value: 'count', label: '작품 많은 순' },
  ],
};
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-5 gap-y-10 sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))] sm:gap-x-6 2xl:grid-cols-[repeat(auto-fill,minmax(164px,1fr))] 2xl:gap-x-8';

function countBy<T>(items: T[], keys: (item: T) => string[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => keys(item).forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1)));
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || compareKo(a.value, b.value));
}

export function SearchPage() {
  useDocumentTitle(null);
  const { works, series, authors, status, error, load, reload } = useCatalogStore();
  const setCompletionLogs = useLogStore((s) => s.setCompletionLogs);
  const signedIn = useAuthStore((s) => !!s.session);
  const [params, setParams] = useSearchParams();
  const [showAllTags, setShowAllTags] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const view: View = params.get('view') === 'series' || params.get('view') === 'authors' ? (params.get('view') as View) : 'works';
  const tag = params.get('tag');
  const list = view === 'works' ? params.get('list') : null;
  const rawState = params.get('state');
  const stateFilter: StateFilter | null = signedIn && view !== 'authors' && (rawState === 'reading' || rawState === 'completed' || rawState === 'unread') ? rawState : null;
  const query = params.get('q') ?? '';
  const sort = SORTS[view].some((s) => s.value === params.get('sort')) ? (params.get('sort') as string) : SORTS[view][0].value;

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  }
  function switchView(next: View) {
    setShowAllTags(false);
    update({ view: next === 'works' ? null : next, tag: null, list: null, state: null, sort: null });
  }

  const standalone = useMemo(() => works.filter((w) => !w.series_id), [works]);
  const statuses = useWorkStatuses(works);
  const readingItems = useReadingItems(works);

  const seriesState = useMemo(() => {
    const map = new Map<string, { state: ReadingState; done: number }>();
    for (const s of series) {
      const done = s.workIds.filter((id) => statuses.get(id)?.state === 'completed').length;
      const reading = s.workIds.some((id) => statuses.get(id)?.state === 'reading');
      const state: ReadingState = s.workIds.length > 0 && done === s.workIds.length ? 'completed' : done > 0 || reading ? 'reading' : 'unread';
      map.set(s.id, { state, done });
    }
    return map;
  }, [series, statuses]);

  const readByAuthor = useMemo(() => {
    const authorOf = new Map(works.map((w) => [w.id, w.author]));
    const read = new Map<string, Set<string>>();
    for (const log of setCompletionLogs) {
      const author = authorOf.get(log.workId);
      if (author) read.set(author, (read.get(author) ?? new Set()).add(log.workId));
    }
    return new Map(Array.from(read, ([author, ids]) => [author, ids.size]));
  }, [setCompletionLogs, works]);

  // ---- 목록과 필터 ----
  const tagFacets = useMemo(() => {
    if (view === 'series') return countBy(series, (s) => splitGenre(s.genre));
    return countBy(view === 'works' ? standalone : works, (w) => splitGenre(w.genre));
  }, [view, series, standalone, works]);
  const listFacets = useMemo(() => (view === 'works' ? countBy(standalone, (w) => w.lists ?? []) : []), [view, standalone]);

  const filteredWorks = useMemo(() => {
    if (view !== 'works') return [];
    const rows = standalone.filter(
      (w) =>
        (!tag || splitGenre(w.genre).includes(tag)) &&
        (!list || (w.lists ?? []).includes(list)) &&
        (!stateFilter || statuses.get(w.id)?.state === stateFilter) &&
        (!query || matchesQuery(w.title, query) || matchesQuery(w.author, query)),
    );
    const byTitle = (a: CatalogWork, b: CatalogWork) => compareKo(a.title, b.title);
    if (sort === 'author') return rows.sort((a, b) => compareKo(a.author, b.author) || byTitle(a, b));
    if (sort === 'year') return rows.sort((a, b) => (a.published_year ?? 9999) - (b.published_year ?? 9999) || byTitle(a, b));
    if (sort === 'recent') return rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    return rows.sort(byTitle);
  }, [view, standalone, tag, list, stateFilter, query, sort, statuses]);

  const filteredSeries = useMemo(
    () =>
      view !== 'series'
        ? []
        : series
            .filter(
              (s) =>
                (!tag || splitGenre(s.genre).includes(tag)) &&
                (!stateFilter || seriesState.get(s.id)?.state === stateFilter) &&
                (!query || matchesQuery(s.title, query) || matchesQuery(s.author, query)),
            )
            .sort((a, b) => compareKo(a.title, b.title)),
    [view, series, tag, stateFilter, query, seriesState],
  );

  const filteredAuthors = useMemo(() => {
    if (view !== 'authors') return [];
    const rows = authors.filter(
      (a) =>
        (!tag || works.some((w) => w.author === a.name && splitGenre(w.genre).includes(tag))) &&
        (!query || matchesQuery(a.name, query)),
    );
    return sort === 'count' ? rows.sort((a, b) => b.workCount - a.workCount || compareKo(a.name, b.name)) : rows;
  }, [view, authors, works, tag, query, sort]);

  const stateFacets = useMemo(() => {
    if (!signedIn || view === 'authors') return [];
    const pool: ReadingState[] =
      view === 'works'
        ? standalone.map((w) => statuses.get(w.id)?.state ?? 'unread')
        : series.map((s) => seriesState.get(s.id)?.state ?? 'unread');
    return (['reading', 'completed', 'unread'] as StateFilter[]).map((value) => ({ value, count: pool.filter((s) => s === value).length }));
  }, [signedIn, view, standalone, series, statuses, seriesState]);

  const resultCount = view === 'works' ? filteredWorks.length : view === 'series' ? filteredSeries.length : filteredAuthors.length;
  const hasFilters = !!(tag || list || stateFilter || query);
  const visibleTags = showAllTags ? tagFacets : tagFacets.slice(0, 12);
  const loading = status === 'idle' || status === 'loading';

  const viewCounts: Record<View, number> = { works: standalone.length, series: series.length, authors: authors.length };

  return (
    <Page>
      <PageHeader
        title="둘러보기"
        description={
          status === 'ready' ? (
            <span className="tnum">
              작품 {works.length} · 시리즈 {series.length} · 작가 {authors.length}
            </span>
          ) : (
            '서가에 있는 책을 둘러봅니다'
          )
        }
      />

      {signedIn && readingItems.length > 0 && (
        <section className="mb-12 lg:mb-14" aria-labelledby="continue-reading">
          <SectionHeading
            id="continue-reading"
            title="이어 읽기"
            count={`${readingItems.length}권`}
            action={
              <Link to="/bookshelf" className="text-[13.5px] text-ink-muted transition-colors hover:text-ink">
                내 책장에서 보기
              </Link>
            }
          />
          <div className="hide-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3 3xl:grid-cols-4">
            {readingItems.slice(0, 8).map((it) => (
              <div key={it.log.id} className="w-[86%] shrink-0 snap-start sm:w-auto">
              <ReadingCard
                workId={it.work.id}
                title={it.work.title}
                author={it.work.author}
                cover={it.edition?.cover_url || it.work.cover}
                publisher={it.publisher}
                volume={it.volume}
                currentPage={it.log.currentPage}
                totalPages={it.edition?.page_count ?? null}
              />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[224px_minmax(0,1fr)] 2xl:gap-16">
        {/* 넓은 화면: 왼쪽 필터 */}
        <aside className="hidden lg:block" aria-label="목록 필터">
          <div className="hide-scrollbar sticky top-24 max-h-[calc(100vh-7rem)] space-y-8 overflow-y-auto pb-8">
            <FilterGroup title="보기">
              {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                <FilterOption key={v} active={view === v} count={loading ? undefined : viewCounts[v]} onClick={() => switchView(v)}>
                  {VIEW_LABEL[v]}
                </FilterOption>
              ))}
            </FilterGroup>

            {stateFacets.length > 0 && (
              <FilterGroup title="내 읽기 상태">
                <FilterOption active={!stateFilter} onClick={() => update({ state: null })}>
                  전체
                </FilterOption>
                {stateFacets.map((f) => (
                  <FilterOption
                    key={f.value}
                    active={stateFilter === f.value}
                    count={f.count}
                    onClick={() => update({ state: stateFilter === f.value ? null : f.value })}
                  >
                    {STATE_LABEL[f.value]}
                  </FilterOption>
                ))}
              </FilterGroup>
            )}

            {tagFacets.length > 0 && (
              <FilterGroup title="분류">
                {visibleTags.map((f) => (
                  <FilterOption key={f.value} active={tag === f.value} count={f.count} onClick={() => update({ tag: tag === f.value ? null : f.value })}>
                    {f.value}
                  </FilterOption>
                ))}
                {tagFacets.length > 12 && (
                  <button type="button" onClick={() => setShowAllTags((v) => !v)} className="mt-1 text-[13px] text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                    {showAllTags ? '접기' : `${tagFacets.length - 12}개 더 보기`}
                  </button>
                )}
              </FilterGroup>
            )}

            {listFacets.length > 0 && (
              <FilterGroup title="목록">
                {listFacets.map((f) => (
                  <FilterOption key={f.value} active={list === f.value} count={f.count} onClick={() => update({ list: list === f.value ? null : f.value })}>
                    {f.value}
                  </FilterOption>
                ))}
              </FilterGroup>
            )}
          </div>
        </aside>

        <section aria-label={`${VIEW_LABEL[view]} 목록`} className="min-w-0">
          {/* 좁은 화면: 탭과 가로 스크롤 칩 */}
          <div className="lg:hidden">
            <Tabs
              label="보기"
              items={(Object.keys(VIEW_LABEL) as View[]).map((v) => ({ value: v, label: VIEW_LABEL[v], count: loading ? undefined : viewCounts[v] }))}
              value={view}
              onChange={switchView}
            />
            {(stateFacets.length > 0 || tagFacets.length > 0) && (
              <div className="hide-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
                {stateFacets.map((f) => (
                  <Chip key={f.value} active={stateFilter === f.value} onClick={() => update({ state: stateFilter === f.value ? null : f.value })}>
                    {STATE_LABEL[f.value]} <span className="tnum opacity-60">{f.count}</span>
                  </Chip>
                ))}
                {stateFacets.length > 0 && tagFacets.length > 0 && <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-line" />}
                {tagFacets.map((f) => (
                  <Chip key={f.value} active={tag === f.value} onClick={() => update({ tag: tag === f.value ? null : f.value })}>
                    {f.value}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="mb-7 mt-5 flex flex-wrap items-center gap-3 lg:mt-0">
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[5px] border border-line bg-paper-raised px-3 transition-colors focus-within:border-ink-soft sm:max-w-sm">
              <Search size={15} className="shrink-0 text-ink-faint" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => update({ q: e.target.value || null })}
                placeholder={view === 'authors' ? '작가 이름으로 좁히기' : '제목, 작가로 좁히기'}
                aria-label="목록 안에서 찾기"
                className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button type="button" onClick={() => update({ q: null })} className="rounded p-0.5 text-ink-faint hover:text-ink" aria-label="지우기">
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="tnum text-[13.5px] text-ink-muted" aria-live="polite">
              {loading ? '불러오는 중' : `${resultCount}${view === 'authors' ? '명' : view === 'series' ? '개' : '권'}`}
            </p>
            {hasFilters && (
              <button type="button" onClick={() => update({ tag: null, list: null, state: null, q: null })} className="text-[13.5px] text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                필터 지우기
              </button>
            )}
            {SORTS[view].length > 1 && (
              <select
                value={sort}
                onChange={(e) => update({ sort: e.target.value === SORTS[view][0].value ? null : e.target.value })}
                aria-label="정렬"
                className="field-select ml-auto h-10 w-auto py-0 text-[14px]"
              >
                {SORTS[view].map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {(tag || list || stateFilter) && (
            <div className="-mt-3 mb-7 flex flex-wrap gap-2">
              {stateFilter && <ActiveFilter label={STATE_LABEL[stateFilter]} onClear={() => update({ state: null })} />}
              {tag && <ActiveFilter label={tag} onClear={() => update({ tag: null })} />}
              {list && <ActiveFilter label={list} onClear={() => update({ list: null })} />}
            </div>
          )}

          {status === 'error' ? (
            <ErrorState description={error} onRetry={() => void reload()} />
          ) : loading ? (
            <CoverGridSkeleton className={GRID} count={18} />
          ) : resultCount === 0 ? (
            <EmptyState
              title={hasFilters ? '조건에 맞는 항목이 없습니다' : EMPTY_LABEL[view]}
              description={hasFilters ? '필터를 하나씩 풀어 보세요.' : undefined}
              action={
                hasFilters && (
                  <button type="button" className="btn btn-secondary" onClick={() => update({ tag: null, list: null, state: null, q: null })}>
                    필터 지우기
                  </button>
                )
              }
            />
          ) : view === 'works' ? (
            <ul className={GRID}>
              {filteredWorks.map((w) => (
                <li key={w.id}>
                  <WorkTile work={w} status={signedIn ? statuses.get(w.id) : undefined} />
                </li>
              ))}
            </ul>
          ) : view === 'series' ? (
            <ul className={GRID}>
              {filteredSeries.map((s) => (
                <li key={s.id}>
                  <SeriesTile series={s} done={signedIn ? seriesState.get(s.id)?.done ?? 0 : null} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-5 gap-y-9 sm:grid-cols-[repeat(auto-fill,minmax(152px,1fr))] sm:gap-x-6 2xl:gap-x-8">
              {filteredAuthors.map((a) => (
                <li key={a.id}>
                  <AuthorTile author={a} read={signedIn ? readByAuthor.get(a.name) ?? 0 : null} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">{title}</h2>
      <div className="flex flex-col items-start">{children}</div>
    </div>
  );
}

function FilterOption({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group relative flex w-full items-baseline justify-between gap-3 py-[5px] pl-3 text-left text-[14.5px] transition-colors ${
        active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      <span aria-hidden className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full ${active ? 'bg-ink' : 'bg-transparent group-hover:bg-line-strong'}`} />
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="tnum shrink-0 text-[12.5px] font-normal text-ink-faint">{count}</span>}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] transition-colors ${
        active ? 'border-ink bg-ink text-paper-raised' : 'border-line bg-paper-raised text-ink-soft hover:border-line-strong'
      }`}
    >
      {children}
    </button>
  );
}

function ActiveFilter({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex h-7 items-center gap-1.5 rounded-[4px] bg-ink px-2.5 text-[13px] text-paper-raised transition-colors hover:bg-ink-soft"
      aria-label={`${label} 필터 해제`}
    >
      {label}
      <X size={13} aria-hidden />
    </button>
  );
}

function WorkTile({ work, status }: { work: CatalogWork; status?: WorkStatus }) {
  return (
    <Link to={`/book/${work.id}`} className="group block outline-none">
      <BookCover src={work.cover} alt={work.title} title={work.title} author={work.author} className="lift w-full" />
      <div className="mt-3">
        <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink decoration-line-strong underline-offset-4 group-hover:underline">
          {work.title}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">
          {work.author}
          {work.published_year ? <span className="tnum"> · {work.published_year}</span> : null}
        </p>
        {status && status.state !== 'unread' && (
          <ReadingMark className="mt-1.5" state={status.state} percent={status.percent} rating={status.rating} liked={status.liked} />
        )}
      </div>
    </Link>
  );
}

function SeriesTile({ series, done }: { series: CatalogSeries; done: number | null }) {
  const total = series.workIds.length;
  return (
    <Link to={`/series/${series.id}`} className="group block outline-none">
      <div className="relative">
        {/* 여러 권이 겹친 느낌의 뒷장 */}
        <span aria-hidden className="absolute inset-0 translate-x-[6px] translate-y-[-6px] rounded-[3px] bg-paper-deep shadow-[0_0_0_1px_rgb(29_27_23/0.06)]" />
        <span aria-hidden className="absolute inset-0 translate-x-[3px] translate-y-[-3px] rounded-[3px] bg-line shadow-[0_0_0_1px_rgb(29_27_23/0.06)]" />
        <BookCover src={series.cover} alt={series.title} title={series.title} author={series.author} className="lift relative w-full" />
      </div>
      <div className="mt-3">
        <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink decoration-line-strong underline-offset-4 group-hover:underline">
          {series.title}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">
          {series.author} · <span className="tnum">{total}부작</span>
        </p>
        {done !== null && done > 0 && total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={(done / total) * 100} tone="completed" className="flex-1" label={`${series.title} 완독 비율`} />
            <span className="tnum text-[12px] text-completed-dark">
              {done}/{total}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function AuthorTile({ author, read }: { author: CatalogAuthor; read: number | null }) {
  return (
    <Link to={`/author/${encodeURIComponent(author.name)}`} className="group block outline-none">
      <Portrait
        src={author.photo_url}
        name={author.name}
        className="aspect-[3/4] w-full shadow-[0_0_0_1px_rgb(29_27_23/0.06)] transition-transform duration-200 group-hover:-translate-y-1"
      />
      <p className="mt-3 line-clamp-1 font-serif text-[16px] font-bold text-ink decoration-line-strong underline-offset-4 group-hover:underline">
        {author.name}
      </p>
      <p className="mt-0.5 truncate text-[13px] text-ink-muted">
        {[author.country, `작품 ${author.workCount}편`].filter(Boolean).join(' · ')}
        {read ? <span className="text-completed-dark"> · {read}편 완독</span> : null}
      </p>
    </Link>
  );
}
