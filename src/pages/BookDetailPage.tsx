import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Star } from 'lucide-react';
import { Breadcrumbs, Page, SectionHeading, type Crumb } from '../components/layout/Page';
import { BookCover } from '../components/ui/BookCover';
import { Tabs } from '../components/ui/Tabs';
import { StarRating } from '../components/ui/StarRating';
import { PageLoader, EmptyState } from '../components/ui/States';
import { VolumeRow } from '../components/book/VolumeRow';
import { SetReviewPanel } from '../components/book/SetReviewPanel';
import { TranslationComparison } from '../components/book/TranslationComparison';
import { useLogStore } from '../store/logStore';
import { useBookStore } from '../store/bookStore';
import { isAdminSession, useAuthStore } from '../store/authStore';
import { useCatalogStore, type CatalogWork } from '../store/catalogStore';
import { toast } from '../store/toastStore';
import { supabase } from '../lib/supabase';
import { fetchWorkById, fetchEditionsByWorkId, fetchSeriesById, groupEditionsByPublisher } from '../services/db';
import type { DbWork, DbEdition, DbSeries, EditionGroup } from '../services/db';
import {
  groupKey,
  dbWorkToWork,
  buildWorkTranslations,
  groupToEditionSet,
  editionToVolume,
} from '../utils/bookMappers';
import { parseEditionSetId, parseVolumeId } from '../utils/editionUtils';
import { formatDate, progressPercent, splitGenre, volumeLabel } from '../utils/format';
import { setReview } from '../utils/readingState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useWorkStatuses } from '../hooks/useLibrary';
import { ReadingMark } from '../components/ui/ReadingMark';

export function BookDetailPage() {
  const { workId } = useParams<{ workId: string }>();

  const [dbWork, setDbWork] = useState<DbWork | null>(null);
  const [dbEditions, setDbEditions] = useState<DbEdition[]>([]);
  const [editionGroups, setEditionGroups] = useState<EditionGroup[]>([]);
  const [series, setSeries] = useState<DbSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [repEditionId, setRepEditionId] = useState<string | null>(null);
  const [savingCover, setSavingCover] = useState(false);
  const [selectedPublisher, setSelectedPublisher] = useState<string>('');

  const { setGroupedData } = useBookStore();
  const { getSetCompletionLog, volumeLogs, setCompletionLogs } = useLogStore();
  const session = useAuthStore((s) => s.session);
  const signedIn = !!session;
  const admin = isAdminSession(session);
  useDocumentTitle(dbWork?.title);

  useEffect(() => {
    if (!workId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setNotFound(false);
    setSelectedPublisher('');
    setSeries(null);

    Promise.all([fetchWorkById(workId), fetchEditionsByWorkId(workId)])
      .then(([w, eds]) => {
        if (!w) { setNotFound(true); return; }
        setDbWork(w);
        setRepEditionId(w.representative_edition_id ?? null);
        setDbEditions(eds);

        const groups = groupEditionsByPublisher(eds);
        setEditionGroups(groups);

        setGroupedData({
          works: [dbWorkToWork(w)],
          editionSets: groups.map((g) => groupToEditionSet(g, w.id)),
          volumes: eds.map((e) => editionToVolume(e, w.id)),
        });

        if (w.series_id) {
          fetchSeriesById(w.series_id).then(setSeries).catch(() => setSeries(null));
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [workId, setGroupedData]);

  async function handleSetRepresentative(editionId: string) {
    if (!workId || savingCover) return;
    setSavingCover(true);
    try {
      const { error } = await supabase
        .from('works')
        .update({ representative_edition_id: editionId })
        .eq('id', workId);
      if (error) throw error;
      setRepEditionId(editionId);
      toast('대표 표지를 바꿨습니다.');
      void useCatalogStore.getState().reload();
    } catch (err) {
      console.error('대표 설정 실패:', err);
      toast('대표 표지를 바꾸지 못했습니다.', 'error');
    } finally {
      setSavingCover(false);
    }
  }

  // 이 작품에 대한 내 기록 요약
  const myRecord = useMemo(() => {
    if (!dbWork) return null;
    const completions = setCompletionLogs
      .filter((l) => l.workId === dbWork.id)
      .map((l) => ({ log: l, ...setReview(l, volumeLogs), publisher: parseEditionSetId(l.editionSetId).publisher }))
      .sort((a, b) => b.log.createdAt.localeCompare(a.log.createdAt));
    const reading = volumeLogs
      .filter((l) => l.workId === dbWork.id && l.readingState === 'reading')
      .map((l) => {
        const edition = dbEditions.find((e) => e.id === parseVolumeId(l.volumeId));
        return { log: l, edition };
      });
    return { completions, reading };
  }, [dbWork, setCompletionLogs, volumeLogs, dbEditions]);

  const related = useRelatedWorks(dbWork, series);

  if (loading) return <PageLoader />;

  if (notFound || !dbWork) {
    return (
      <Page>
        <EmptyState
          className="mt-6"
          title="작품을 찾을 수 없습니다"
          description="지워졌거나 주소가 잘못된 작품입니다."
          action={<Link to="/" className="btn btn-primary">둘러보기로 가기</Link>}
        />
      </Page>
    );
  }

  // 고른 출판사가 이 작품에 없으면 대표 판본(없으면 첫 출판사)을 보여 준다
  const activePublisher = editionGroups.some((g) => g.publisher === selectedPublisher)
    ? selectedPublisher
    : dbEditions.find((e) => e.id === repEditionId)?.publisher ?? editionGroups[0]?.publisher ?? '';
  const selectedGroup = editionGroups.find((g) => g.publisher === activePublisher);

  const displayCoverUrl = (() => {
    if (activePublisher) {
      const pubGroup = editionGroups.find(g => g.publisher === activePublisher);
      if (pubGroup?.editions[0]?.cover_url) return pubGroup.editions[0].cover_url;
    }
    const repEdition = dbEditions.find(e => e.id === repEditionId);
    return repEdition?.cover_url || dbEditions[0]?.cover_url || '';
  })();

  const workTranslations = buildWorkTranslations(dbWork);
  const editionTranslations = editionGroups
    .map((g) => {
      const firstExcerpt = g.editions.find((e) => e.excerpt)?.excerpt ?? '';
      return firstExcerpt
        ? { key: `pub-${g.publisher}`, label: `${g.publisher} 번역`, text: firstExcerpt }
        : null;
    })
    .filter((t): t is { key: string; label: string; text: string } => t !== null);

  const allTranslations = [...workTranslations, ...editionTranslations];
  const hasTranslations = allTranslations.length > 0;
  const hasSide = hasTranslations || related.items.length > 0;
  const hasMultiplePublishers = editionGroups.length > 1;
  const tags = splitGenre(dbWork.genre);

  const crumbs: Crumb[] = [
    { label: '둘러보기', to: '/' },
    series
      ? { label: series.title, to: `/series/${series.id}` }
      : { label: dbWork.author, to: `/author/${encodeURIComponent(dbWork.author)}` },
    { label: dbWork.title },
  ];

  return (
    <Page>
      <Breadcrumbs items={crumbs} />

      <div
        className={`mt-6 grid gap-x-10 gap-y-10 lg:mt-8 lg:grid-cols-[232px_minmax(0,1fr)] 2xl:gap-x-16 ${
          hasSide
            ? 'xl:grid-cols-[248px_minmax(0,1fr)_320px] 2xl:grid-cols-[288px_minmax(0,1fr)_380px] 3xl:grid-cols-[320px_minmax(0,1fr)_440px]'
            : 'xl:grid-cols-[264px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]'
        }`}
      >
        {/* 표지와 내 기록 */}
        <aside className="lg:row-span-2 xl:row-span-1" aria-label="표지와 내 기록">
          <div className="lg:sticky lg:top-24">
            <BookCover
              src={displayCoverUrl}
              alt={`${dbWork.title} 표지`}
              title={dbWork.title}
              author={dbWork.author}
              loading="eager"
              className="mx-auto w-40 sm:w-48 lg:w-full"
            />
            {hasMultiplePublishers && activePublisher && (
              <p className="mt-3 text-center text-[12.5px] text-ink-muted lg:text-left">{activePublisher} 판 표지</p>
            )}
            {signedIn && myRecord && (
              <div className="hidden lg:block">
                <MyRecord record={myRecord} />
              </div>
            )}
          </div>
        </aside>

        {/* 본문 */}
        <div className="min-w-0">
          <header>
            <h1 className="text-balance font-serif text-[34px] font-bold leading-[1.12] tracking-[-0.015em] text-ink sm:text-[44px] 2xl:text-[52px]">
              {dbWork.title}
            </h1>
            <p className="mt-3 text-[17px] text-ink-soft">
              <Link to={`/author/${encodeURIComponent(dbWork.author)}`} className="link-quiet font-medium">
                {dbWork.author}
              </Link>
              {dbWork.published_year ? <span className="tnum text-ink-muted"> · {dbWork.published_year}년</span> : null}
              {series && (
                <>
                  <span className="text-ink-muted"> · </span>
                  <Link to={`/series/${series.id}`} className="link-quiet text-ink-muted">
                    {series.title}
                    {dbWork.series_order != null ? ` ${dbWork.series_order}부` : ''}
                  </Link>
                </>
              )}
            </p>
            {(tags.length > 0 || (dbWork.lists?.length ?? 0) > 0) && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="chip transition-colors hover:border-ink-faint hover:text-ink">
                    {t}
                  </Link>
                ))}
                {dbWork.lists?.map((list) => (
                  <Link key={list} to={`/?list=${encodeURIComponent(list)}`} className="chip border-transparent bg-paper-sunken transition-colors hover:text-ink">
                    {list}
                  </Link>
                ))}
              </div>
            )}
          </header>

          {signedIn && myRecord && (
            <div className="max-w-md lg:hidden">
              <MyRecord record={myRecord} />
            </div>
          )}

          <p className="text-pretty mt-7 max-w-[68ch] whitespace-pre-line font-serif text-[17px] leading-[1.9] text-ink-soft">
            {dbWork.description || '등록된 작품 소개가 없습니다.'}
          </p>

          <section className="mt-12" aria-labelledby="editions-heading">
            <SectionHeading
              id="editions-heading"
              title="판본"
              count={`${editionGroups.length}개 출판사 · ${dbEditions.length}권`}
            />

            {editionGroups.length === 0 && (
              <p className="border-y border-line py-8 text-[14.5px] text-ink-muted">아직 등록된 판본이 없습니다.</p>
            )}

            {hasMultiplePublishers && (
              <Tabs
                label="출판사"
                value={activePublisher}
                onChange={setSelectedPublisher}
                items={editionGroups.map((g) => {
                  const complete = !!getSetCompletionLog(groupKey(dbWork.id, g.publisher));
                  return {
                    value: g.publisher,
                    label: g.publisher,
                    count: g.editions.length,
                    adornment: complete ? <Check size={14} strokeWidth={3} className="text-completed" aria-label="완독" /> : undefined,
                  };
                })}
              />
            )}

            {selectedGroup && (() => {
              const setId = groupKey(dbWork.id, selectedGroup.publisher);
              const setComplete = !!getSetCompletionLog(setId);
              const volCount = selectedGroup.editions.length;
              const isSingle = volCount === 1;
              const firstEditionId = selectedGroup.editions[0]?.id;
              const isRepresentative = repEditionId === firstEditionId;
              const totalPages = selectedGroup.editions.reduce((sum, e) => sum + (e.page_count || 0), 0);

              return (
                <div className={`panel overflow-hidden ${hasMultiplePublishers ? 'mt-4' : ''}`}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft bg-paper px-4 py-3 text-[13px] text-ink-muted sm:px-5">
                    <span className="font-medium text-ink-soft">{selectedGroup.publisher}</span>
                    <span className="tnum">
                      {isSingle ? '한 권' : `${volCount}권 구성`}
                      {totalPages > 0 && ` · ${totalPages.toLocaleString()}쪽`}
                    </span>
                    {setComplete && (
                      <span className="inline-flex items-center gap-1 font-medium text-completed-dark">
                        <Check size={13} strokeWidth={3} aria-hidden /> 완독
                      </span>
                    )}
                    {admin && firstEditionId && hasMultiplePublishers && (
                      <button
                        type="button"
                        onClick={() => void handleSetRepresentative(firstEditionId)}
                        disabled={savingCover || isRepresentative}
                        className={`ml-auto inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[12.5px] font-medium transition-colors disabled:cursor-default ${
                          isRepresentative ? 'text-star' : 'text-ink-muted hover:bg-paper-sunken hover:text-ink'
                        }`}
                      >
                        <Star size={12} className={isRepresentative ? 'fill-star' : ''} aria-hidden />
                        {isRepresentative ? '대표 표지' : '대표 표지로 지정'}
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-line-soft">
                    {selectedGroup.editions.map((edition) => (
                      <VolumeRow
                        key={edition.id}
                        volume={editionToVolume(edition, dbWork.id)}
                        volumeMark={edition.volume_number}
                        label={isSingle ? dbWork.title : `${dbWork.title} ${volumeLabel(edition.volume_number)}`}
                        workId={dbWork.id}
                        editionSetId={setId}
                        isSingleVolume={isSingle}
                        totalPages={edition.page_count || undefined}
                        canEdit={signedIn}
                      />
                    ))}
                  </ul>
                  {!isSingle && setComplete && (
                    <SetReviewPanel
                      editionSetId={setId}
                      workId={dbWork.id}
                      publisher={selectedGroup.publisher}
                      title={dbWork.title}
                      isSinglePublisher={!hasMultiplePublishers}
                      canEdit={signedIn}
                    />
                  )}
                  {!signedIn && (
                    <p className="border-t border-line-soft px-4 py-3 text-[13px] text-ink-muted sm:px-5">
                      <Link to="/login" state={{ from: `/book/${dbWork.id}` }} className="link-quiet font-medium text-ink-soft">
                        로그인
                      </Link>
                      하면 읽는 중인 쪽수와 완독, 별점을 남길 수 있습니다.
                    </p>
                  )}
                </div>
              );
            })()}
          </section>
        </div>

        {hasSide && (
          <aside className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1" aria-label="번역 비교와 관련 작품">
            <div className="space-y-8 xl:sticky xl:top-24">
              {hasTranslations && <TranslationComparison translations={allTranslations} highlightKey={`pub-${activePublisher}`} />}
              {related.items.length > 0 && <RelatedWorks title={related.title} items={related.items} currentId={dbWork.id} moreLink={related.more} />}
            </div>
          </aside>
        )}
      </div>
    </Page>
  );
}

interface MyRecordData {
  completions: { log: { id: string; createdAt: string }; rating: number | null; liked: boolean; publisher: string }[];
  reading: { log: { id: string; currentPage: number | null }; edition?: DbEdition }[];
}

function MyRecord({ record }: { record: MyRecordData }) {
  const { completions, reading } = record;
  if (completions.length === 0 && reading.length === 0) {
    return <p className="mt-6 border-t border-line pt-4 text-[13px] text-ink-muted">아직 읽지 않은 책입니다.</p>;
  }
  return (
    <div className="mt-6 space-y-4 border-t border-line pt-4">
      <p className="text-[12.5px] font-medium text-ink-faint">내 기록</p>
      {completions.map((c) => (
        <div key={c.log.id}>
          <div className="flex items-center gap-2">
            <span className="-rotate-[4deg] rounded-[3px] border-[1.5px] border-completed px-1.5 py-[3px] font-serif text-[12.5px] font-bold leading-none text-completed-dark">
              완독
            </span>
            <span className="tnum text-[13px] text-ink-soft">{formatDate(c.log.createdAt)}</span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">{c.publisher} 판</p>
          {(c.rating || c.liked) && (
            <div className="mt-1.5 flex items-center gap-2">
              <StarRating rating={c.rating} size="sm" readonly showEmpty={false} />
              {c.liked && <span className="text-[12.5px] font-medium text-seal">인생책</span>}
            </div>
          )}
        </div>
      ))}
      {reading.map((r) => {
        const pct = progressPercent(r.log.currentPage, r.edition?.page_count);
        return (
          <div key={r.log.id}>
            <p className="text-[13px] font-medium text-reading">
              읽는 중{r.edition ? ` · ${r.edition.publisher} ${volumeLabel(r.edition.volume_number)}` : ''}
            </p>
            <p className="tnum mt-0.5 text-[12.5px] text-ink-muted">
              {r.log.currentPage ? `${r.log.currentPage}${r.edition?.page_count ? ` / ${r.edition.page_count}` : ''}쪽` : '쪽수 미입력'}
              {pct !== null && ` · ${pct}%`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** 같은 시리즈(없으면 같은 작가)의 다른 작품 */
function useRelatedWorks(work: DbWork | null, series: DbSeries | null) {
  const { works, load } = useCatalogStore();
  useEffect(() => {
    void load();
  }, [load]);
  return useMemo(() => {
    if (!work) return { title: '', items: [] as CatalogWork[], more: undefined };
    if (work.series_id) {
      const items = works
        .filter((w) => w.series_id === work.series_id)
        .sort((a, b) => (a.series_order ?? Infinity) - (b.series_order ?? Infinity));
      return { title: series ? `${series.title} 수록 작품` : '같은 시리즈', items: items.length > 1 ? items : [], more: `/series/${work.series_id}` };
    }
    const items = works
      .filter((w) => w.author === work.author && w.id !== work.id)
      .sort((a, b) => (a.published_year ?? 9999) - (b.published_year ?? 9999));
    return { title: `${work.author}의 다른 작품`, items: items.slice(0, 6), more: items.length > 0 ? `/author/${encodeURIComponent(work.author)}` : undefined };
  }, [work, series, works]);
}

function RelatedWorks({ title, items, currentId, moreLink }: { title: string; items: CatalogWork[]; currentId: string; moreLink?: string }) {
  const statuses = useWorkStatuses(items);
  const signedIn = useAuthStore((s) => !!s.session);
  return (
    <section aria-labelledby="related-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="related-heading" className="font-serif text-[19px] font-bold text-ink">
          {title}
        </h2>
        {moreLink && (
          <Link to={moreLink} className="shrink-0 text-[13px] text-ink-muted transition-colors hover:text-ink">
            모두 보기
          </Link>
        )}
      </div>
      <ul className="divide-y divide-line-soft border-y border-line">
        {items.map((w) => {
          const current = w.id === currentId;
          const status = statuses.get(w.id);
          return (
            <li key={w.id}>
              <Link
                to={`/book/${w.id}`}
                aria-current={current ? 'page' : undefined}
                className={`group flex items-center gap-3 py-2.5 ${current ? 'pointer-events-none' : ''}`}
              >
                <BookCover src={w.cover} alt="" title={w.title} className="w-9 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-medium ${current ? 'text-ink-muted' : 'text-ink group-hover:underline'} decoration-line-strong underline-offset-4`}>
                    {w.series_order != null && w.series_id ? `${w.series_order}부 · ` : ''}
                    {w.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-muted">
                    {current ? '지금 보는 작품' : w.published_year ? <span className="tnum">{w.published_year}</span> : null}
                    {signedIn && status && !current && <ReadingMark state={status.state} percent={status.percent} rating={status.rating} liked={status.liked} />}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
