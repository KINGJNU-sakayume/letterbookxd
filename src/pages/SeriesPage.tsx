import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Breadcrumbs, Page, SectionHeading } from '../components/layout/Page';
import { BookCover } from '../components/ui/BookCover';
import { StarRating } from '../components/ui/StarRating';
import { LikeButton } from '../components/ui/LikeButton';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ReadingMark } from '../components/ui/ReadingMark';
import { Tabs } from '../components/ui/Tabs';
import { EmptyState, PageLoader } from '../components/ui/States';
import { VolumeRow } from '../components/book/VolumeRow';
import { SetReviewPanel } from '../components/book/SetReviewPanel';
import { useLogStore } from '../store/logStore';
import { useBookStore } from '../store/bookStore';
import { useAuthStore } from '../store/authStore';
import { fetchSeriesById, fetchWorksBySeriesId, groupEditionsByPublisher } from '../services/db';
import type { DbSeries, DbWork, DbEdition } from '../services/db';
import type { Work, EditionSet, Volume } from '../types';
import { groupKey, dbWorkToWork, groupToEditionSet, editionToVolume } from '../utils/bookMappers';
import { bestCompletion, workReadingState } from '../utils/readingState';
import { formatDate, splitGenre, volumeLabel } from '../utils/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type WorkWithEditions = DbWork & { editions: DbEdition[] };

export function SeriesPage() {
  const { id } = useParams<{ id: string }>();

  const [series, setSeries] = useState<DbSeries | null>(null);
  const [works, setWorks] = useState<WorkWithEditions[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedWorkId, setSelectedWorkId] = useState<string>('');
  const [selectedPublisher, setSelectedPublisher] = useState<string>('');

  const { setGroupedData } = useBookStore();
  const {
    volumeLogs,
    setCompletionLogs,
    getSetCompletionLog,
    getSeriesCompletionLog,
    upsertSeriesCompletionLog,
  } = useLogStore();
  const signedIn = useAuthStore((s) => !!s.session);
  useDocumentTitle(series?.title);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);

    Promise.all([fetchSeriesById(id), fetchWorksBySeriesId(id)])
      .then(([s, ws]) => {
        if (!s) { setNotFound(true); return; }
        setSeries(s);
        setWorks(ws);

        if (ws.length > 0) setSelectedWorkId(ws[0].id);

        const allEditionSets: EditionSet[] = [];
        const allVolumes: Volume[] = [];
        const allWorks: Work[] = ws.map(dbWorkToWork);

        ws.forEach(w => {
          const groups = groupEditionsByPublisher(w.editions);
          groups.forEach(g => allEditionSets.push(groupToEditionSet(g, w.id)));
          w.editions.forEach(e => allVolumes.push(editionToVolume(e, w.id)));
        });

        setGroupedData({ works: allWorks, editionSets: allEditionSets, volumes: allVolumes });
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, setGroupedData]);

  const selectedWork = works.find(w => w.id === selectedWorkId) ?? null;
  const editionGroups = useMemo(
    () => selectedWork ? groupEditionsByPublisher(selectedWork.editions) : [],
    [selectedWork]
  );

  if (loading) return <PageLoader />;

  if (notFound || !series) {
    return (
      <Page>
        <EmptyState
          className="mt-6"
          title="시리즈를 찾을 수 없습니다"
          description="지워졌거나 주소가 잘못된 시리즈입니다."
          action={<Link to="/?view=series" className="btn btn-primary">시리즈 목록으로</Link>}
        />
      </Page>
    );
  }

  const isSeriesComplete = works.length > 0 && works.every(work => {
    const groups = groupEditionsByPublisher(work.editions);
    return groups.some(g => !!getSetCompletionLog(groupKey(work.id, g.publisher)));
  });
  const completedCount = works.filter(w => workReadingState(w.id, volumeLogs, setCompletionLogs) === 'completed').length;

  const seriesLog = getSeriesCompletionLog(series.id);

  function handleSeriesRating(rating: number | null) {
    if (!series) return;
    upsertSeriesCompletionLog({ seriesId: series.id, liked: seriesLog?.liked ?? false, rating });
  }

  function toggleSeriesLiked() {
    if (!series) return;
    upsertSeriesCompletionLog({
      seriesId: series.id,
      liked: !(seriesLog?.liked ?? false),
      rating: seriesLog?.rating ?? null,
    });
  }

  const seriesCover = series.cover_url || works.find(w => w.editions[0]?.cover_url)?.editions[0]?.cover_url || '';

  // 고른 출판사가 없으면 대표 판본, 그것도 없으면 첫 출판사
  const repEdition = selectedWork?.editions.find(e => e.id === selectedWork.representative_edition_id);
  const activePublisher = editionGroups.some(g => g.publisher === selectedPublisher)
    ? selectedPublisher
    : repEdition?.publisher ?? editionGroups[0]?.publisher ?? '';
  const selectedGroup = editionGroups.find(g => g.publisher === activePublisher);

  const selectedCover = (() => {
    if (!selectedWork) return '';
    if (selectedGroup?.editions[0]?.cover_url) return selectedGroup.editions[0].cover_url;
    return repEdition?.cover_url || selectedWork.editions[0]?.cover_url || '';
  })();

  const tags = splitGenre(series.genre);

  return (
    <Page>
      <Breadcrumbs
        items={[
          { label: '둘러보기', to: '/' },
          { label: '시리즈', to: '/?view=series' },
          { label: series.title },
        ]}
      />

      <div className="mt-6 grid gap-x-10 gap-y-10 lg:mt-8 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_320px] 2xl:grid-cols-[288px_minmax(0,1fr)_380px] 2xl:gap-x-16 3xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        {/* 시리즈 표지와 진행 */}
        <aside className="lg:row-span-2 xl:row-span-1" aria-label="시리즈 진행">
          <div className="lg:sticky lg:top-24">
            <div className="relative mx-auto w-40 sm:w-48 lg:w-full">
              <span aria-hidden className="absolute inset-0 translate-x-[8px] translate-y-[-8px] rounded-[3px] bg-paper-deep shadow-[0_0_0_1px_rgb(29_27_23/0.06)]" />
              <span aria-hidden className="absolute inset-0 translate-x-[4px] translate-y-[-4px] rounded-[3px] bg-line shadow-[0_0_0_1px_rgb(29_27_23/0.06)]" />
              <BookCover src={seriesCover} alt={`${series.title} 표지`} title={series.title} author={series.author} loading="eager" className="relative w-full" />
            </div>

            {signedIn && works.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-[12.5px] font-medium text-ink-faint">내 진행</p>
                <p className="mt-1.5 text-[14px] text-ink-soft">
                  <span className="tnum font-semibold text-ink">{completedCount}</span>
                  <span className="tnum text-ink-muted"> / {works.length}작품 완독</span>
                </p>
                <ProgressBar value={(completedCount / works.length) * 100} tone="completed" className="mt-2" label="시리즈 완독 비율" />

                <div className="mt-5">
                  {isSeriesComplete ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="-rotate-[4deg] rounded-[3px] border-[1.5px] border-completed px-1.5 py-[3px] font-serif text-[12.5px] font-bold leading-none text-completed-dark">
                          완주
                        </span>
                        {seriesLog && <span className="tnum text-[13px] text-ink-soft">{formatDate(seriesLog.createdAt)}</span>}
                      </div>
                      <p className="mt-3 text-[12.5px] text-ink-muted">시리즈 전체 평가</p>
                      <div className="mt-1 flex items-center gap-2">
                        <StarRating rating={seriesLog?.rating ?? null} onChange={handleSeriesRating} size="md" label="시리즈 별점" />
                        <LikeButton liked={seriesLog?.liked ?? false} onToggle={toggleSeriesLiked} compact />
                      </div>
                    </>
                  ) : (
                    <p className="text-[12.5px] leading-relaxed text-ink-muted">모든 작품을 읽으면 시리즈 전체에 별점을 남길 수 있습니다.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* 본문 */}
        <div className="min-w-0">
          <header>
            <p className="mb-2 text-[13px] font-medium text-ink-muted">
              시리즈 · <span className="tnum">{works.length}부작</span>
            </p>
            <h1 className="text-balance font-serif text-[34px] font-bold leading-[1.12] tracking-[-0.015em] text-ink sm:text-[44px] 2xl:text-[52px]">
              {series.title}
            </h1>
            <p className="mt-3 text-[17px] text-ink-soft">
              <Link to={`/author/${encodeURIComponent(series.author)}`} className="link-quiet font-medium">
                {series.author}
              </Link>
            </p>
            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Link key={t} to={`/?view=series&tag=${encodeURIComponent(t)}`} className="chip transition-colors hover:border-ink-faint hover:text-ink">
                    {t}
                  </Link>
                ))}
              </div>
            )}
          </header>

          {series.description && (
            <p className="text-pretty mt-7 max-w-[68ch] whitespace-pre-line font-serif text-[17px] leading-[1.9] text-ink-soft">
              {series.description}
            </p>
          )}

          <section className="mt-12" aria-labelledby="series-works">
            <SectionHeading id="series-works" title="수록 작품" count={`${works.length}편`} />

            {works.length === 0 ? (
              <p className="border-y border-line py-8 text-[14.5px] text-ink-muted">아직 이 시리즈에 등록된 작품이 없습니다.</p>
            ) : (
              <ol className="divide-y divide-line-soft border-y border-line">
                {works.map((work, index) => {
                  const state = workReadingState(work.id, volumeLogs, setCompletionLogs);
                  const best = state === 'completed' ? bestCompletion(work.id, volumeLogs, setCompletionLogs) : null;
                  const active = work.id === selectedWorkId;
                  const cover = work.editions.find(e => e.id === work.representative_edition_id)?.cover_url || work.editions[0]?.cover_url;
                  return (
                    <li key={work.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedWorkId(work.id)}
                        aria-pressed={active}
                        className={`group relative flex w-full items-center gap-4 py-3 pl-4 pr-3 text-left transition-colors ${
                          active ? 'bg-paper-raised' : 'hover:bg-paper-raised/60'
                        }`}
                      >
                        <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${active ? 'bg-ink' : 'bg-transparent'}`} />
                        <span className="tnum w-9 shrink-0 font-serif text-[15px] font-bold text-ink-muted">
                          {work.series_order != null ? `${work.series_order}부` : index + 1}
                        </span>
                        <BookCover src={cover} alt="" title={work.title} className="w-10 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15.5px] font-semibold text-ink">{work.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
                            {work.published_year ? <span className="tnum">{work.published_year}</span> : null}
                            <span className="tnum">{groupEditionsByPublisher(work.editions).length > 1 ? `${groupEditionsByPublisher(work.editions).length}개 출판사` : `${work.editions.length}권`}</span>
                            {signedIn && <ReadingMark state={state} rating={best?.rating} liked={best?.liked} />}
                          </span>
                        </span>
                        <ChevronRight size={16} className={`shrink-0 transition-colors ${active ? 'text-ink' : 'text-line-strong group-hover:text-ink-muted'}`} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            {selectedWork && selectedGroup && (() => {
              const setId = groupKey(selectedWork.id, selectedGroup.publisher);
              const setComplete = !!getSetCompletionLog(setId);
              const volCount = selectedGroup.editions.length;
              const isSingle = volCount === 1;
              const totalPages = selectedGroup.editions.reduce((sum, e) => sum + (e.page_count || 0), 0);

              return (
                <div className="mt-8">
                  <h3 className="mb-3 font-serif text-[19px] font-bold text-ink">
                    {selectedWork.series_order != null && <span className="text-ink-muted">{selectedWork.series_order}부 </span>}
                    {selectedWork.title}
                  </h3>
                  {editionGroups.length > 1 && (
                    <Tabs
                      label="출판사"
                      size="sm"
                      className="mb-4"
                      value={activePublisher}
                      onChange={setSelectedPublisher}
                      items={editionGroups.map(g => ({ value: g.publisher, label: g.publisher, count: g.editions.length }))}
                    />
                  )}
                  <div className="panel overflow-hidden">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft bg-paper px-4 py-3 text-[13px] text-ink-muted sm:px-5">
                      <span className="font-medium text-ink-soft">{selectedGroup.publisher}</span>
                      <span className="tnum">
                        {isSingle ? '한 권' : `${volCount}권 구성`}
                        {totalPages > 0 && ` · ${totalPages.toLocaleString()}쪽`}
                      </span>
                    </div>
                    <ul className="divide-y divide-line-soft">
                      {selectedGroup.editions.map(edition => (
                        <VolumeRow
                          key={edition.id}
                          volume={editionToVolume(edition, selectedWork.id)}
                          volumeMark={edition.volume_number}
                          label={isSingle ? selectedWork.title : `${selectedWork.title} ${volumeLabel(edition.volume_number)}`}
                          workId={selectedWork.id}
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
                        workId={selectedWork.id}
                        publisher={selectedGroup.publisher}
                        title={selectedWork.title}
                        isSinglePublisher={editionGroups.length === 1}
                        canEdit={signedIn}
                      />
                    )}
                    {!signedIn && (
                      <p className="border-t border-line-soft px-4 py-3 text-[13px] text-ink-muted sm:px-5">
                        <Link to="/login" state={{ from: `/series/${series.id}` }} className="link-quiet font-medium text-ink-soft">
                          로그인
                        </Link>
                        하면 읽은 권과 별점을 남길 수 있습니다.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>
        </div>

        {/* 고른 작품 미리보기 */}
        {selectedWork && (
          <aside className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1" aria-label="고른 작품">
            <div className="xl:sticky xl:top-24">
              <div className="panel p-5">
                <div className="flex gap-4 xl:block">
                  <BookCover src={selectedCover} alt={`${selectedWork.title} 표지`} title={selectedWork.title} author={selectedWork.author} className="w-24 shrink-0 xl:w-40" />
                  <div className="min-w-0 xl:mt-4">
                    <p className="text-[12.5px] font-medium text-ink-muted">
                      {selectedWork.series_order != null ? `${selectedWork.series_order}부` : '수록 작품'}
                      {selectedWork.published_year ? ` · ${selectedWork.published_year}` : ''}
                    </p>
                    <Link to={`/book/${selectedWork.id}`} className="mt-1 block font-serif text-[21px] font-bold leading-snug text-ink decoration-line-strong underline-offset-4 hover:underline">
                      {selectedWork.title}
                    </Link>
                  </div>
                </div>
                {selectedWork.description && (
                  <p className="mt-3 line-clamp-6 whitespace-pre-line font-serif text-[15px] leading-[1.8] text-ink-soft">{selectedWork.description}</p>
                )}
                <Link to={`/book/${selectedWork.id}`} className="btn btn-secondary mt-5 w-full">
                  작품 페이지로
                </Link>
              </div>
            </div>
          </aside>
        )}
      </div>
    </Page>
  );
}
