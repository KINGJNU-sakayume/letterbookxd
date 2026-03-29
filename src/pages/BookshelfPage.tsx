import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Loader2, ChevronDown } from 'lucide-react';
import { useLogStore } from '../store/logStore';
import { StarRating } from '../components/ui/StarRating';
import { BookCover } from '../components/ui/BookCover';
import { supabase } from '../lib/supabase';

interface WorkMeta {
  id: string;
  title: string;
  author: string;
  representative_cover_url: string | null;
  series_id: string | null;
}

interface EditionMeta {
  id: string;
  work_id: string;
  publisher: string;
  cover_url: string;
  volume_number: string;
  page_count: number;
}

interface SeriesMeta {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
}

function parseEditionSetId(editionSetId: string): { workId: string; publisher: string } {
  const sep = '::';
  const idx = editionSetId.indexOf(sep);
  if (idx === -1) return { workId: editionSetId, publisher: '' };
  return { workId: editionSetId.slice(0, idx), publisher: editionSetId.slice(idx + sep.length) };
}

function parseVolumeId(volumeId: string): string {
  return volumeId.replace('vol-', '');
}

type FilterTab = 'all' | 'reading' | 'completed' | 'incomplete_series';
type SortOption = 'recent' | 'rating' | 'author';

export function BookshelfPage() {
  const { volumeLogs, setCompletionLogs, updateReadingProgress, isLoading } = useLogStore();
  const navigate = useNavigate();

  const [works, setWorks] = useState<Map<string, WorkMeta>>(new Map());
  const [editions, setEditions] = useState<Map<string, EditionMeta>>(new Map());
  const [seriesMap, setSeriesMap] = useState<Map<string, SeriesMeta>>(new Map());
  const [metaLoading, setMetaLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [sortOpen, setSortOpen] = useState(false);

  // Page update modal state
  const [updatingVolumeId, setUpdatingVolumeId] = useState<string | null>(null);
  const [pageInputVal, setPageInputVal] = useState('');

  useEffect(() => {
    const fetchMeta = async () => {
      setMetaLoading(true);
      const [worksRes, editionsRes, seriesRes] = await Promise.all([
        supabase.from('works').select('id, title, author, representative_cover_url, series_id'),
        supabase.from('editions').select('id, work_id, publisher, cover_url, volume_number, page_count'),
        supabase.from('series').select('id, title, author, cover_url'),
      ]);

      const workMap = new Map<string, WorkMeta>();
      (worksRes.data ?? []).forEach(w => workMap.set(w.id, w as WorkMeta));
      setWorks(workMap);

      const editionMap = new Map<string, EditionMeta>();
      (editionsRes.data ?? []).forEach(e => editionMap.set(e.id, e as EditionMeta));
      setEditions(editionMap);

      const sMap = new Map<string, SeriesMeta>();
      (seriesRes.data ?? []).forEach(s => sMap.set(s.id, s as SeriesMeta));
      setSeriesMap(sMap);

      setMetaLoading(false);
    };
    fetchMeta();
  }, []);

  // Reading in progress: volume logs with readingState === 'reading'
  const readingLogs = volumeLogs.filter(l => l.readingState === 'reading');

  // Completed sets
  const completedLogs = Array.from(
    new Map(setCompletionLogs.map(log => [log.editionSetId, log])).values()
  );

  // Incomplete series: series where user has at least one completion but not all
  const incompleteSeries = (() => {
    const seriesCompletionCount: Record<string, number> = {};
    const seriesWorkCount: Record<string, number> = {};
    completedLogs.forEach(cl => {
      const work = works.get(cl.workId);
      if (work?.series_id) {
        seriesCompletionCount[work.series_id] = (seriesCompletionCount[work.series_id] ?? 0) + 1;
      }
    });
    works.forEach(w => {
      if (w.series_id) {
        seriesWorkCount[w.series_id] = (seriesWorkCount[w.series_id] ?? 0) + 1;
      }
    });
    return Object.entries(seriesCompletionCount)
      .filter(([sId, count]) => count < (seriesWorkCount[sId] ?? 0))
      .map(([sId, count]) => ({ seriesId: sId, completedCount: count, totalCount: seriesWorkCount[sId] ?? 0 }));
  })();

  // Sort completed logs
  const sortedCompletions = [...completedLogs].sort((a, b) => {
    if (sortOption === 'recent') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortOption === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
    if (sortOption === 'author') {
      const aWork = works.get(a.workId);
      const bWork = works.get(b.workId);
      return (aWork?.author ?? '').localeCompare(bWork?.author ?? '', 'ko');
    }
    return 0;
  });

  const readingCount = readingLogs.length;
  const completedCount = completedLogs.length;
  const incompleteSeriesCount = incompleteSeries.length;

  const sortLabels: Record<SortOption, string> = {
    recent: '최근 기록순',
    rating: '별점 높은순',
    author: '작가명순',
  };

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-stone-400" />
      </main>
    );
  }

  const showReading = filterTab === 'all' || filterTab === 'reading';
  const showCompleted = filterTab === 'all' || filterTab === 'completed';
  const showIncompleteSeries = filterTab === 'all' || filterTab === 'incomplete_series';

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold text-stone-900 mb-1">내 책장</h1>
          <p className="text-stone-500 text-sm">
            완독 {completedCount}권 · 읽는 중 {readingCount}권 · 미완독 시리즈 {incompleteSeriesCount}개
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between mb-8 border-b border-stone-200 pb-3">
          <div className="flex gap-1">
            {([
              ['all', '전체'],
              ['reading', `읽는 중 ${readingCount}`],
              ['completed', `완독 ${completedCount}`],
              ['incomplete_series', `미완독 시리즈 ${incompleteSeriesCount}`],
            ] as [FilterTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterTab === tab
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <button
              onClick={() => setSortOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 border border-stone-200 rounded-lg hover:border-stone-400 bg-white transition-colors"
            >
              {sortLabels[sortOption]}
              <ChevronDown size={14} />
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-10 min-w-[120px] py-1">
                {(Object.entries(sortLabels) as [SortOption, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setSortOption(key); setSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      sortOption === key ? 'text-stone-900 font-medium bg-stone-50' : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {metaLoading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-stone-300" />
          </div>
        )}

        {/* Section 1: Reading in progress */}
        {!metaLoading && showReading && readingLogs.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-4">읽는 중</h2>
            <div className="space-y-3">
              {readingLogs.map((vl) => {
                const work = works.get(vl.workId);
                const edition = editions.get(parseVolumeId(vl.volumeId));
                const coverSrc = edition?.cover_url || work?.representative_cover_url || '';
                const { publisher } = parseEditionSetId(vl.editionSetId);
                const totalPages = edition?.page_count;
                const pct = totalPages && vl.currentPage
                  ? Math.min(100, Math.round((vl.currentPage / totalPages) * 100))
                  : null;

                return (
                  <div key={vl.id} className="bg-white rounded-xl border border-stone-200 p-4 flex gap-4">
                    <button onClick={() => navigate(`/book/${vl.workId}`)} className="shrink-0">
                      <BookCover src={coverSrc} alt={work?.title ?? ''} className="w-12 shadow-sm" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => navigate(`/book/${vl.workId}`)} className="text-left">
                        <p className="text-sm font-medium text-stone-900 line-clamp-1">{work?.title}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{work?.author} · {publisher}</p>
                      </button>
                      {pct !== null && vl.currentPage ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                            <span style={{ color: '#378ADD' }}>p.{vl.currentPage} / {totalPages} · {pct}%</span>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden w-full max-w-xs">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: '#378ADD' }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-stone-400 mt-2">진행 중</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setUpdatingVolumeId(vl.volumeId);
                        setPageInputVal(vl.currentPage?.toString() ?? '');
                      }}
                      className="shrink-0 self-center px-3 py-1.5 text-xs font-medium border border-stone-200 rounded-lg text-stone-600 hover:border-stone-400 hover:text-stone-900 transition-colors"
                    >
                      페이지 업데이트
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 2: Completed */}
        {!metaLoading && showCompleted && sortedCompletions.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-4">완독</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {sortedCompletions.map((cl) => {
                const work = works.get(cl.workId);
                const { publisher } = parseEditionSetId(cl.editionSetId);
                const targetEditions = Array.from(editions.values()).filter(e => e.work_id === cl.workId && e.publisher === publisher);
                const firstEdition = targetEditions.find(e => e.volume_number === '1') || targetEditions[0];
                const coverSrc = firstEdition?.cover_url || work?.representative_cover_url || '';

                return (
                  <button key={cl.id} onClick={() => navigate(`/book/${cl.workId}`)} className="group text-left">
                    <BookCover src={coverSrc} alt={work?.title ?? ''} className="w-full shadow-sm group-hover:-translate-y-1 transition-transform" />
                    <div className="mt-2.5">
                      <p className="text-[13px] font-medium text-stone-900 line-clamp-1">{work?.title}</p>
                      <p className="text-[11px] text-stone-500 uppercase">{publisher}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <StarRating rating={cl.rating} size="sm" readonly />
                        {cl.liked && <Heart size={12} className="text-rose-500 fill-rose-500" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 3: Incomplete series */}
        {!metaLoading && showIncompleteSeries && incompleteSeries.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-4">미완독 시리즈</h2>
            <div className="space-y-3">
              {incompleteSeries.map(({ seriesId, completedCount: comp, totalCount }) => {
                const series = seriesMap.get(seriesId);
                if (!series) return null;
                // Collect cover thumbnails from completed works in this series
                const seriesWorks = Array.from(works.values()).filter(w => w.series_id === seriesId);
                const covers = seriesWorks
                  .map(w => {
                    const ed = Array.from(editions.values()).find(e => e.work_id === w.id);
                    return ed?.cover_url || '';
                  })
                  .filter(Boolean)
                  .slice(0, 3);

                return (
                  <button
                    key={seriesId}
                    onClick={() => navigate(`/series/${seriesId}`)}
                    className="w-full bg-white rounded-xl border border-stone-200 p-4 flex items-center gap-4 hover:border-stone-300 transition-colors text-left"
                  >
                    <div className="relative flex shrink-0" style={{ width: covers.length > 1 ? 52 : 36 }}>
                      {covers.map((src, i) => (
                        <div
                          key={i}
                          className="absolute"
                          style={{ left: i * 12, zIndex: covers.length - i, width: 32 }}
                        >
                          <BookCover src={src} alt="" className="w-8 shadow-sm border border-white" />
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0 pl-2">
                      <p className="text-sm font-medium text-stone-900 line-clamp-1">{series.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{series.author}</p>
                    </div>
                    <span className="shrink-0 text-xs text-stone-500">{comp}/{totalCount}권 완독</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!metaLoading && readingCount === 0 && completedCount === 0 && incompleteSeriesCount === 0 && (
          <div className="text-center py-20 text-stone-400">
            <p className="text-sm">아직 기록된 책이 없습니다.</p>
          </div>
        )}
      </div>

      {/* Page update modal */}
      {updatingVolumeId && (() => {
        const vl = volumeLogs.find(l => l.volumeId === updatingVolumeId);
        const work = vl ? works.get(vl.workId) : undefined;
        const edition = vl ? editions.get(parseVolumeId(updatingVolumeId)) : undefined;
        const totalPages = edition?.page_count;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm" onClick={() => setUpdatingVolumeId(null)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-stone-900 mb-1">{work?.title}</h3>
              <p className="text-xs text-stone-500 mb-4">현재 페이지를 입력해주세요</p>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-stone-500">p.</span>
                <input
                  type="number"
                  min={0}
                  max={totalPages}
                  value={pageInputVal}
                  onChange={e => setPageInputVal(e.target.value)}
                  className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
                  placeholder="127"
                  autoFocus
                />
                {totalPages && <span className="text-sm text-stone-500">/ {totalPages}p</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setUpdatingVolumeId(null)}
                  className="flex-1 py-2 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    const page = parseInt(pageInputVal, 10);
                    if (!isNaN(page) && page >= 0) {
                      await updateReadingProgress(updatingVolumeId, page);
                    }
                    setUpdatingVolumeId(null);
                  }}
                  className="flex-1 py-2 text-sm font-medium text-white rounded-lg transition-colors"
                  style={{ backgroundColor: '#378ADD' }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
