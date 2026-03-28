import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, BookText, Loader2, CheckCircle2, LogIn, Heart } from 'lucide-react';
import { BookCover } from '../components/ui/BookCover';
import { VolumeRow } from '../components/book/VolumeRow';
import { StarRating } from '../components/ui/StarRating';
import { useLogStore } from '../store/logStore';
import { useAuthStore } from '../store/authStore';
import { useBookStore } from '../store/bookStore';
import { fetchSeriesById, fetchWorksBySeriesId, groupEditionsByPublisher } from '../services/db';
import type { DbSeries, DbWork, DbEdition, EditionGroup } from '../services/db';
import type { Work, EditionSet, Volume } from '../types';
// [M-6] 공통 헬퍼 import
import { groupKey, dbWorkToWork, groupToEditionSet, editionToVolume } from '../utils/bookMappers';

type WorkWithEditions = DbWork & { editions: DbEdition[] };

export function SeriesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [series, setSeries] = useState<DbSeries | null>(null);
  const [works, setWorks] = useState<WorkWithEditions[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedWorkId, setSelectedWorkId] = useState<string>('');
  const [selectedPublisher, setSelectedPublisher] = useState<string>('');
  const [repEditionIds, setRepEditionIds] = useState<Record<string, string | null>>({});

  const { setGroupedData } = useBookStore();
  const { getSetCompletionLog, upsertSetCompletionLog, getSeriesCompletionLog, upsertSeriesCompletionLog } = useLogStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);

    Promise.all([fetchSeriesById(id), fetchWorksBySeriesId(id)])
      .then(([s, ws]) => {
        if (!s) { setNotFound(true); return; }
        setSeries(s);
        setWorks(ws);

        const repMap: Record<string, string | null> = {};
        ws.forEach(w => { repMap[w.id] = w.representative_edition_id ?? null; });
        setRepEditionIds(repMap);

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
  const editionGroups = selectedWork ? groupEditionsByPublisher(selectedWork.editions) : [];

  // [H-6] stale closure 수정 — 의존성 배열에 필요한 값 모두 포함
  useEffect(() => {
    if (editionGroups.length > 0) {
      const repId = repEditionIds[selectedWorkId];
      const repEdition = selectedWork?.editions.find(e => e.id === repId);
      setSelectedPublisher(repEdition?.publisher ?? editionGroups[0].publisher);
    } else {
      setSelectedPublisher('');
    }
  }, [selectedWorkId, editionGroups, repEditionIds, selectedWork]);

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-stone-400" />
      </main>
    );
  }

  if (notFound || !series) {
    return (
      <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-500 mb-4">시리즈 정보를 찾을 수 없습니다.</p>
          <button onClick={() => navigate('/')} className="text-sm text-stone-700 underline">홈으로 돌아가기</button>
        </div>
      </main>
    );
  }

  const isSeriesComplete = works.length > 0 && works.every(work => {
    const groups = groupEditionsByPublisher(work.editions);
    return groups.some(g => !!getSetCompletionLog(groupKey(work.id, g.publisher)));
  });

  const seriesLog = getSeriesCompletionLog(series.id);

  function handleSeriesRating(rating: number | null) {
    if (!user || !series) return;
    upsertSeriesCompletionLog({ seriesId: series.id, liked: seriesLog?.liked ?? false, rating }, user.id);
  }

  function toggleSeriesLiked() {
    if (!user || !series) return;
    upsertSeriesCompletionLog({
      seriesId: series.id,
      liked: !(seriesLog?.liked ?? false),
      rating: seriesLog?.rating ?? null,
    }, user.id);
  }

  function handleWorkRating(rating: number | null, editionSetId: string, workId: string, currentLiked: boolean) {
    if (!user) return;
    upsertSetCompletionLog({ editionSetId, workId, liked: currentLiked, rating }, user.id);
  }

  function toggleWorkLiked(editionSetId: string, workId: string, currentLiked: boolean, currentRating: number | null) {
    if (!user) return;
    upsertSetCompletionLog({ editionSetId, workId, liked: !currentLiked, rating: currentRating }, user.id);
  }

  const seriesCover = series.cover_url || works[0]?.editions[0]?.cover_url || '';
  const selectedGroup = editionGroups.find(g => g.publisher === selectedPublisher);
  const repIdForWork = selectedWork ? (repEditionIds[selectedWork.id] ?? null) : null;

  const displayCoverUrl = (() => {
    if (!selectedWork) return '';
    if (selectedPublisher) {
      const pubGroup = editionGroups.find(g => g.publisher === selectedPublisher);
      if (pubGroup?.editions[0]?.cover_url) return pubGroup.editions[0].cover_url;
    }
    const repEdition = selectedWork.editions.find(e => e.id === repIdForWork);
    return repEdition?.cover_url || selectedWork.editions[0]?.cover_url || '';
  })();

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors mb-8"
        >
          <ArrowLeft size={16} />돌아가기
        </button>

        <div className="flex flex-col sm:flex-row gap-8 mb-10">
          <div className="w-36 sm:w-44 shrink-0 mx-auto sm:mx-0">
            <BookCover src={seriesCover} alt={series.title} className="w-full shadow-md transition-all duration-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 bg-stone-800 text-white text-[11px] font-bold rounded uppercase tracking-wider">시리즈</span>
                  {series.genre && (
                    <span className="px-2 py-0.5 border border-stone-200 bg-white text-stone-500 text-[11px] rounded">{series.genre}</span>
                  )}
                </div>
                <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 leading-tight mb-2">{series.title}</h1>
                <p className="text-lg text-stone-600">{series.author}</p>
              </div>
              {isSeriesComplete && user && (
                <div className="shrink-0 flex flex-col items-start sm:items-end gap-2 bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-200 shadow-sm animate-in fade-in zoom-in-95">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> 시리즈 전권 완독
                  </span>
                  <div className="flex items-center gap-3">
                    <StarRating rating={seriesLog?.rating ?? null} onChange={handleSeriesRating} size="sm" />
                    <button onClick={toggleSeriesLiked} className="transition-transform hover:scale-110">
                      <Heart size={18} className={seriesLog?.liked ? 'fill-rose-500 text-rose-500' : 'text-emerald-400 hover:text-rose-400'} />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-stone-500 mb-5 pb-4 border-b border-stone-100">
              <span className="flex items-center gap-1"><BookText size={14} />{works.length}개 작품</span>
            </div>
            {series.description && (
              <p className="text-stone-700 leading-relaxed font-serif text-base sm:text-lg break-keep whitespace-pre-wrap max-w-2xl">
                {series.description}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section>
              <h2 className="text-base font-semibold text-stone-800 mb-3">수록 작품</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {works.map(work => {
                  const firstPublisher = work.editions[0]?.publisher;
                  const setId = firstPublisher ? groupKey(work.id, firstPublisher) : '';
                  const setComplete = setId ? !!getSetCompletionLog(setId) : false;
                  return (
                    <button
                      key={work.id}
                      onClick={() => setSelectedWorkId(work.id)}
                      className={`relative px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        selectedWorkId === work.id
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500 hover:bg-stone-50'
                      }`}
                    >
                      {work.series_order != null && (
                        <span className={`mr-1.5 text-xs ${selectedWorkId === work.id ? 'text-stone-300' : 'text-stone-400'}`}>
                          {work.series_order}부
                        </span>
                      )}
                      {work.title}
                      {setComplete && (
                        <span className="absolute -top-1.5 -right-1.5 bg-white rounded-full">
                          <CheckCircle2 size={16} className="text-emerald-500 fill-white" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedWork && selectedGroup && (() => {
                const setId = groupKey(selectedWork.id, selectedGroup.publisher);
                const log = getSetCompletionLog(setId);
                const setComplete = !!log;
                const volCount = selectedGroup.editions.length;
                const isSingle = volCount === 1;

                return (
                  <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-stone-800 min-h-[48px]">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{selectedWork.title}</h3>
                      </div>
                      {setComplete && (
                        <div className="flex items-center gap-3 border-l border-stone-600 pl-3 ml-2 animate-in fade-in">
                          <CheckCircle2 size={16} className="text-emerald-400" />
                          {log && user && (
                            <>
                              <StarRating
                                rating={log.rating}
                                onChange={(r) => handleWorkRating(r, setId, selectedWork.id, log.liked)}
                                size="sm"
                              />
                              <button
                                onClick={() => toggleWorkLiked(setId, selectedWork.id, log.liked, log.rating)}
                                className="transition-transform hover:scale-110 p-1"
                              >
                                <Heart size={16} className={log.liked ? 'fill-rose-500 text-rose-500' : 'text-stone-400 hover:text-rose-400'} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-2 bg-stone-100 border-b border-stone-200 flex items-center justify-between text-xs text-stone-500">
                      <span>{isSingle ? '단권 구성' : `${volCount}권 구성`}</span>
                    </div>
                    {!user && (
                      <div className="mx-3 mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <LogIn size={13} />로그인 후 독서 기록을 저장할 수 있습니다.
                      </div>
                    )}
                    <div className="p-1">
                      {selectedGroup.editions.map(edition => (
                        <VolumeRow
                          key={edition.id}
                          volume={editionToVolume(edition, selectedWork.id)}
                          label={isSingle ? selectedWork.title : `${selectedWork.title} ${edition.volume_number}권`}
                          workId={selectedWork.id}
                          editionSetId={setId}
                          userId={user?.id ?? ''}
                          isSingleVolume={isSingle}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {works.length === 0 && (
                <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
                  아직 이 시리즈에 등록된 작품이 없습니다.
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {selectedWork && (
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
                <div className="p-4">
                  <div className="w-full max-w-[140px] mx-auto mb-4">
                    <BookCover src={displayCoverUrl} alt={selectedWork.title} className="w-full shadow-sm transition-all duration-300" />
                  </div>
                  <Link
                    to={`/book/${selectedWork.id}`}
                    className="block text-center text-sm font-semibold text-stone-800 hover:text-stone-500 transition-colors mb-1 truncate"
                  >
                    {selectedWork.title} ↗
                  </Link>
                  {selectedWork.description && (
                    <p className="text-xs text-stone-500 leading-relaxed line-clamp-4 text-center mt-2">
                      {selectedWork.description}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
