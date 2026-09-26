import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Page, PageHeader, SectionHeading } from '../components/layout/Page';
import { BookCover } from '../components/ui/BookCover';
import { StarRating } from '../components/ui/StarRating';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Tabs } from '../components/ui/Tabs';
import { EmptyState, ErrorState, PageLoader } from '../components/ui/States';
import { ReadingCard } from '../components/book/ReadingCard';
import { ProgressDialog } from '../components/book/ProgressDialog';
import { useLogStore } from '../store/logStore';
import { useAuthStore } from '../store/authStore';
import { useCatalogStore, type CatalogSeries, type CatalogWork } from '../store/catalogStore';
import { useReadingItems, type ReadingItem } from '../hooks/useLibrary';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { parseEditionSetId } from '../utils/editionUtils';
import { compareKo, formatDate } from '../utils/format';
import { setReview } from '../utils/readingState';

type FilterTab = 'all' | 'reading' | 'completed' | 'incomplete_series';
type SortOption = 'recent' | 'rating' | 'author';

const SORT_LABEL: Record<SortOption, string> = {
  recent: '최근 완독순',
  rating: '별점 높은순',
  author: '작가순',
};

interface Completion {
  id: string;
  work: CatalogWork;
  publisher: string;
  cover: string | null;
  createdAt: string;
  rating: number | null;
  liked: boolean;
}

interface SeriesProgress {
  series: CatalogSeries;
  done: number;
  total: number;
  covers: (string | null)[];
  next: CatalogWork | null;
}

const COVER_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:gap-x-6 2xl:grid-cols-[repeat(auto-fill,minmax(144px,1fr))]';

export function BookshelfPage() {
  useDocumentTitle('내 책장');
  const { works, series, status, load, reload } = useCatalogStore();
  const { volumeLogs, setCompletionLogs, hasLoaded } = useLogStore();
  const { session, ready } = useAuthStore();
  const [params, setParams] = useSearchParams();
  const [progressItem, setProgressItem] = useState<ReadingItem | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const tab: FilterTab = (['reading', 'completed', 'incomplete_series'] as const).find((t) => t === params.get('tab')) ?? 'all';
  const sort: SortOption = (['rating', 'author'] as const).find((s) => s === params.get('sort')) ?? 'recent';
  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  }

  const readingItems = useReadingItems(works);
  const workById = useMemo(() => new Map(works.map((w) => [w.id, w])), [works]);

  // 같은 판본 세트의 완독 기록은 하나만 센다
  const completions = useMemo<Completion[]>(() => {
    const unique = Array.from(new Map(setCompletionLogs.map((log) => [log.editionSetId, log])).values());
    return unique
      .map((log) => {
        const work = workById.get(log.workId);
        if (!work) return null;
        const { publisher } = parseEditionSetId(log.editionSetId);
        const setEditions = work.editions.filter((e) => e.publisher === publisher);
        const first = setEditions.find((e) => e.volume_number === '1') ?? setEditions[0];
        return { id: log.id, work, publisher, cover: first?.cover_url || work.cover, createdAt: log.createdAt, ...setReview(log, volumeLogs) };
      })
      .filter((c): c is Completion => c !== null);
  }, [setCompletionLogs, volumeLogs, workById]);

  const incompleteSeries = useMemo<SeriesProgress[]>(() => {
    const doneIds = new Set(completions.map((c) => c.work.id));
    return series
      .map((s) => {
        const members = s.workIds.map((id) => workById.get(id)).filter((w): w is CatalogWork => !!w);
        const done = members.filter((w) => doneIds.has(w.id)).length;
        return {
          series: s,
          done,
          total: members.length,
          covers: members.slice(0, 4).map((w) => w.cover),
          next: members.find((w) => !doneIds.has(w.id)) ?? null,
        };
      })
      .filter((p) => p.done > 0 && p.done < p.total);
  }, [series, completions, workById]);

  const groups = useMemo(() => {
    if (sort === 'author') {
      return [{ key: 'all', label: '', items: [...completions].sort((a, b) => compareKo(a.work.author, b.work.author) || compareKo(a.work.title, b.work.title)) }];
    }
    if (sort === 'rating') {
      const buckets = new Map<number, Completion[]>();
      completions.forEach((c) => buckets.set(c.rating ?? 0, [...(buckets.get(c.rating ?? 0) ?? []), c]));
      return Array.from(buckets.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([rating, items]) => ({
          key: `r${rating}`,
          label: rating ? `별 ${rating}개` : '별점 없음',
          items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        }));
    }
    const byYear = new Map<number, Completion[]>();
    completions.forEach((c) => {
      const y = new Date(c.createdAt).getFullYear();
      byYear.set(y, [...(byYear.get(y) ?? []), c]);
    });
    return Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, items]) => ({ key: `y${year}`, label: `${year}년`, items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
  }, [completions, sort]);

  if (!ready) return <PageLoader />;

  if (!session) {
    return (
      <Page>
        <PageHeader title="내 책장" />
        <EmptyState
          className="border-t-0 pt-2"
          title="로그인하면 내 책장이 보입니다"
          description="읽는 중인 책과 완독한 책, 이어 읽을 시리즈가 여기에 모입니다."
          action={
            <Link to="/login" state={{ from: '/bookshelf' }} className="btn btn-primary">
              로그인
            </Link>
          }
        />
      </Page>
    );
  }

  if (!hasLoaded || status === 'idle' || status === 'loading') return <PageLoader />;

  const thisYear = new Date().getFullYear();
  const thisYearCount = completions.filter((c) => new Date(c.createdAt).getFullYear() === thisYear).length;
  const showReading = tab === 'all' || tab === 'reading';
  const showCompleted = tab === 'all' || tab === 'completed';
  const showSeries = tab === 'all' || tab === 'incomplete_series';
  const nothingAtAll = readingItems.length === 0 && completions.length === 0 && incompleteSeries.length === 0;

  return (
    <Page>
      <PageHeader
        title="내 책장"
        actions={
          <dl className="flex gap-7 sm:gap-10">
            <HeaderFigure label="완독" value={completions.length} unit="권" />
            <HeaderFigure label={`${thisYear}년 완독`} value={thisYearCount} unit="권" />
            <HeaderFigure label="읽는 중" value={readingItems.length} unit="권" />
          </dl>
        }
      />

      {status === 'error' ? (
        <ErrorState className="border-t-0 pt-2" onRetry={() => void reload()} />
      ) : nothingAtAll ? (
        <EmptyState
          className="border-t-0 pt-2"
          title="아직 기록한 책이 없습니다"
          description="둘러보기에서 책을 골라 권마다 ‘읽는 중’이나 ‘완독’으로 표시하면 이곳에 꽂힙니다."
          action={
            <Link to="/" className="btn btn-primary">
              둘러보기
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mb-10">
            <Tabs
              label="책장 보기"
              className="min-w-0 flex-1"
              value={tab}
              onChange={(t) => update({ tab: t === 'all' ? null : t })}
              items={[
                { value: 'all', label: '전체' },
                { value: 'reading', label: '읽는 중', count: readingItems.length },
                { value: 'completed', label: '완독', count: completions.length },
                { value: 'incomplete_series', label: '이어 읽을 시리즈', count: incompleteSeries.length },
              ]}
            />
            {showCompleted && completions.length > 0 && (
              <select
                value={sort}
                onChange={(e) => update({ sort: e.target.value === 'recent' ? null : e.target.value })}
                aria-label="완독 정렬"
                className="field-select h-10 w-auto py-0 text-[14px]"
              >
                {(Object.keys(SORT_LABEL) as SortOption[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {showReading && (readingItems.length > 0 || tab === 'reading') && (
            <Shelf title="읽는 중" count={`${readingItems.length}권`}>
              {readingItems.length === 0 ? (
                <p className="text-[14.5px] text-ink-muted">지금 읽는 책이 없습니다.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4">
                  {readingItems.map((it) => (
                    <ReadingCard
                      key={it.log.id}
                      workId={it.work.id}
                      title={it.work.title}
                      author={it.work.author}
                      cover={it.edition?.cover_url || it.work.cover}
                      publisher={it.publisher}
                      volume={it.volume}
                      currentPage={it.log.currentPage}
                      totalPages={it.edition?.page_count ?? null}
                      action={
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProgressItem(it)}>
                          쪽수 적기
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </Shelf>
          )}

          {showSeries && (incompleteSeries.length > 0 || tab === 'incomplete_series') && (
            <Shelf title="이어 읽을 시리즈" count={`${incompleteSeries.length}개`}>
              {incompleteSeries.length === 0 ? (
                <p className="text-[14.5px] text-ink-muted">중간까지 읽은 시리즈가 없습니다.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4">
                  {incompleteSeries.map((p) => (
                    <SeriesCard key={p.series.id} progress={p} />
                  ))}
                </div>
              )}
            </Shelf>
          )}

          {showCompleted && (completions.length > 0 || tab === 'completed') && (
            <Shelf title="완독" count={`${completions.length}권`}>
              {completions.length === 0 ? (
                <p className="text-[14.5px] text-ink-muted">아직 완독한 책이 없습니다.</p>
              ) : (
                <div className="space-y-10">
                  {groups.map((g) => (
                    <div key={g.key}>
                      {g.label && (
                        <h3 className="mb-4 flex items-baseline gap-2 font-serif text-[17px] font-bold text-ink-soft">
                          {g.label}
                          <span className="tnum font-sans text-[12.5px] font-normal text-ink-faint">{g.items.length}권</span>
                        </h3>
                      )}
                      <ul className={COVER_GRID}>
                        {g.items.map((c) => (
                          <li key={c.id}>
                            <CompletedTile item={c} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Shelf>
          )}
        </>
      )}

      <ProgressDialog item={progressItem} onClose={() => setProgressItem(null)} />
    </Page>
  );
}

function HeaderFigure({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">
        {value}
        <span className="ml-0.5 text-[14px] font-medium tracking-normal text-ink-muted">{unit}</span>
      </dd>
    </div>
  );
}

function Shelf({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  return (
    <section className="mb-14">
      <SectionHeading title={title} count={count} />
      {children}
    </section>
  );
}

function CompletedTile({ item }: { item: Completion }) {
  return (
    <Link to={`/book/${item.work.id}`} className="group block outline-none">
      <BookCover src={item.cover} alt={item.work.title} title={item.work.title} author={item.work.author} className="lift w-full" />
      <p className="mt-2.5 line-clamp-1 text-[14px] font-semibold text-ink decoration-line-strong underline-offset-4 group-hover:underline">
        {item.work.title}
      </p>
      <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
        {item.publisher} · <span className="tnum">{formatDate(item.createdAt)}</span>
      </p>
      {(item.rating || item.liked) && (
        <div className="mt-1 flex items-center gap-1.5">
          <StarRating rating={item.rating} size="xs" readonly showEmpty={false} />
          {item.liked && <Heart size={11} className="fill-seal text-seal" aria-label="인생책" />}
        </div>
      )}
    </Link>
  );
}

function SeriesCard({ progress }: { progress: SeriesProgress }) {
  const { series, done, total, covers, next } = progress;
  return (
    <Link to={`/series/${series.id}`} className="panel group flex items-center gap-5 p-4 transition-colors hover:border-line-strong">
      <div className="relative h-[92px] w-[104px] shrink-0" aria-hidden>
        {covers.slice(0, 3).map((src, i) => (
          <div key={i} className="absolute top-0 w-[60px]" style={{ left: i * 20, zIndex: 3 - i, transform: `translateY(${i * 3}px)` }}>
            <BookCover src={src} alt="" title={series.title} className="w-full" />
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[18px] font-bold text-ink decoration-line-strong underline-offset-4 group-hover:underline">{series.title}</p>
        <p className="truncate text-[13px] text-ink-muted">{series.author}</p>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={(done / total) * 100} tone="completed" className="flex-1" label={`${series.title} 완독 비율`} />
          <span className="tnum shrink-0 text-[12.5px] font-medium text-completed-dark">
            {done}/{total}
          </span>
        </div>
        {next && <p className="mt-1.5 truncate text-[12.5px] text-ink-muted">다음 차례 · {next.title}</p>}
      </div>
    </Link>
  );
}
