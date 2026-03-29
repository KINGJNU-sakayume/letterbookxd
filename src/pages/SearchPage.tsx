import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { BookCover } from '../components/ui/BookCover';
import { useLogStore } from '../store/logStore';
import { supabase } from '../lib/supabase';

interface WorkData {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  series_id: string | null;
  representative_edition_id: string | null;
  display_cover: string | null;
  editions: { id: string; cover_url: string; page_count: number; volume_number: string }[];
}

interface SeriesData {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  cover_url: string | null;
}

interface AuthorData {
  id: string;
  name: string;
  photo_url: string | null;
}

// Extract distinct filter badges from genres
function extractBadges(works: WorkData[]): string[] {
  const badgeSet = new Set<string>();
  const COMMON_TAGS = ['러시아', '프랑스', '영국', '미국', '일본', '한국', '독일', '노벨문학상', '판타지', '고전'];
  works.forEach(w => {
    if (!w.genre) return;
    COMMON_TAGS.forEach(tag => {
      if (w.genre?.includes(tag)) badgeSet.add(tag);
    });
  });
  return COMMON_TAGS.filter(t => badgeSet.has(t));
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [works, setWorks] = useState<WorkData[]>([]);
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [authors, setAuthors] = useState<AuthorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'standalone' | 'series' | 'author'>('standalone');

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { volumeLogs, isLoading: logsLoading } = useLogStore();

  useEffect(() => {
    async function getInitialData() {
      try {
        const [worksResult, seriesResult, authorsResult] = await Promise.all([
          supabase
            .from('works')
            .select(`
              id,
              title,
              author,
              genre,
              series_id,
              representative_edition_id,
              editions!work_id (
                id,
                cover_url,
                page_count,
                volume_number
              )
            `)
            .order('title', { ascending: true }),
          supabase
            .from('series')
            .select('id, title, author, genre, cover_url')
            .order('title', { ascending: true }),
          supabase
            .from('authors')
            .select('id, name, photo_url')
            .order('name', { ascending: true }),
        ]);

        if (worksResult.error) throw worksResult.error;

        const processedWorks = worksResult.data?.map(work => {
          const editions = (work.editions as any[]) || [];
          const repEdition = editions.find(e => e.id === work.representative_edition_id);
          return {
            ...work,
            display_cover: repEdition?.cover_url || editions[0]?.cover_url || null,
          };
        }) || [];
        setWorks(processedWorks as WorkData[]);
        setSeries((seriesResult.data ?? []) as SeriesData[]);
        setAuthors((authorsResult.data ?? []) as AuthorData[]);
      } catch (error) {
        console.error('데이터 로딩 에러:', error);
      } finally {
        setLoading(false);
      }
    }
    getInitialData();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredWorks = query.trim() === ''
    ? []
    : works.filter(w =>
        w.title.toLowerCase().includes(query.toLowerCase()) ||
        w.author.toLowerCase().includes(query.toLowerCase())
      );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredWorks.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filteredWorks.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredWorks.length) {
        navigate(`/book/${filteredWorks[activeIndex].id}`);
        setIsOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  // Build "Continue Reading" data from volumeLogs
  const readingVolumeData = volumeLogs
    .filter(l => l.readingState === 'reading')
    .map(vl => {
      const work = works.find(w => w.id === vl.workId);
      if (!work) return null;
      const editionId = vl.volumeId.replace('vol-', '');
      const edition = work.editions.find(e => e.id === editionId);
      const totalPages = edition?.page_count ?? null;
      const pct = totalPages && vl.currentPage
        ? Math.min(100, Math.round((vl.currentPage / totalPages) * 100))
        : null;
      return { vl, work, totalPages, pct };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const badges = extractBadges(works);

  const standaloneWorks = selectedBadge
    ? works.filter(w => w.series_id === null && w.genre?.includes(selectedBadge))
    : works.filter(w => w.series_id === null);

  const filteredSeries = selectedBadge
    ? series.filter(s => s.genre?.includes(selectedBadge))
    : series;

  const filteredAuthors = authors.filter(a =>
    works.some(w => w.author === a.name) &&
    (!selectedBadge || works.some(w => w.author === a.name && w.genre?.includes(selectedBadge)))
  );

  const TABS = [
    { id: 'standalone' as const, label: '단행본 작품' },
    { id: 'series' as const,     label: '시리즈 작품' },
    { id: 'author' as const,     label: '작가' },
  ];

  function renderGrid() {
    if (activeTab === 'standalone') {
      if (standaloneWorks.length === 0) {
        return <p className="text-sm text-stone-400 text-center py-10">해당 조건의 단행본이 없습니다.</p>;
      }
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {standaloneWorks.map((w) => (
            <button key={w.id} onClick={() => navigate(`/book/${w.id}`)} className="group text-left">
              <BookCover src={w.display_cover ?? ''} alt={w.title} className="w-full shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1" />
              <div className="mt-2">
                <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-2 group-hover:text-stone-600 transition-colors">{w.title}</p>
                <p className="text-[11px] text-stone-500 mt-1">{w.author}</p>
              </div>
            </button>
          ))}
        </div>
      );
    }

    if (activeTab === 'series') {
      if (filteredSeries.length === 0) {
        return <p className="text-sm text-stone-400 text-center py-10">해당 조건의 시리즈가 없습니다.</p>;
      }
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {filteredSeries.map((s) => (
            <button key={s.id} onClick={() => navigate(`/series/${s.id}`)} className="group text-left">
              <BookCover src={s.cover_url ?? ''} alt={s.title} className="w-full shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1" />
              <div className="mt-2">
                <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-2 group-hover:text-stone-600 transition-colors">{s.title}</p>
                <p className="text-[11px] text-stone-500 mt-1">{s.author}</p>
              </div>
            </button>
          ))}
        </div>
      );
    }

    // author tab
    if (filteredAuthors.length === 0) {
      return <p className="text-sm text-stone-400 text-center py-10">해당 조건의 작가가 없습니다.</p>;
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
        {filteredAuthors.map((a) => {
          const workCount = works.filter(w => w.author === a.name).length;
          return (
            <button key={a.id} onClick={() => navigate(`/author/${encodeURIComponent(a.name)}`)} className="group text-left">
              <div className="w-full aspect-square bg-stone-200 rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1">
                {a.photo_url ? (
                  <img src={a.photo_url} alt={a.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-400 text-3xl font-serif">
                    {a.name[0]}
                  </div>
                )}
              </div>
              <div className="mt-2">
                <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-2 group-hover:text-stone-600 transition-colors">{a.name}</p>
                <p className="text-[11px] text-stone-500 mt-1">작품 {workCount}편</p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50/50">
      {/* Search bar */}
      <section className="bg-stone-900 pt-10 pb-14 px-4 sm:px-6 relative z-20">
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <div className={`flex items-center bg-white rounded-2xl px-4 py-3.5 shadow-lg transition-all ${isOpen && filteredWorks.length > 0 ? 'rounded-b-none border-b border-stone-100' : ''}`}>
              <Search size={20} className="text-stone-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIsOpen(true);
                  setActiveIndex(-1);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder="작품명이나 작가 이름으로 검색해보세요"
                className="flex-1 bg-transparent border-none outline-none px-3 text-stone-900 placeholder-stone-400 font-medium"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                  className="p-1 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {isOpen && query.trim() !== '' && (
              <div ref={dropdownRef} className="absolute top-full left-0 right-0 bg-white rounded-b-2xl shadow-xl border-t border-stone-100 overflow-hidden max-h-[360px] overflow-y-auto">
                {filteredWorks.length > 0 ? (
                  <ul className="py-2">
                    {filteredWorks.map((work, index) => (
                      <li key={work.id}>
                        <button
                          onClick={() => { navigate(`/book/${work.id}`); setIsOpen(false); setQuery(''); }}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={`w-full flex items-center gap-4 px-5 py-3 text-left transition-colors ${activeIndex === index ? 'bg-stone-50' : 'hover:bg-stone-50'}`}
                        >
                          <BookCover src={work.display_cover ?? ''} alt={work.title} className="w-10 h-14 shadow-sm shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-900 truncate">{work.title}</p>
                            <p className="text-[12px] text-stone-500 truncate mt-0.5">{work.author}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-8 text-center text-sm text-stone-500">
                    "{query}"에 대한 검색 결과가 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 pt-8 space-y-10">

        {/* Continue Reading section */}
        {!logsLoading && readingVolumeData.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-4">읽는 중</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              {readingVolumeData.map(({ vl, work, totalPages, pct }) => (
                <div
                  key={vl.id}
                  className="flex-none w-64 bg-white rounded-xl border border-stone-200 p-3 flex gap-3"
                >
                  <button onClick={() => navigate(`/book/${work.id}`)} className="shrink-0">
                    <BookCover src={work.display_cover ?? ''} alt={work.title} className="w-12 shadow-sm" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate(`/book/${work.id}`)} className="text-left">
                      <p className="text-sm font-medium text-stone-900 line-clamp-1">{work.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{work.author}</p>
                    </button>
                    {pct !== null && vl.currentPage ? (
                      <div className="mt-2">
                        <p className="text-[11px] mb-1" style={{ color: '#378ADD' }}>
                          p.{vl.currentPage} / {totalPages} · {pct}%
                        </p>
                        <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#378ADD' }} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-stone-400 mt-2">읽는 중</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discovery section */}
        <div>
          <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-4">발견하기</h2>

          {/* Tab selector */}
          <div className="flex gap-0.5 mb-5 bg-stone-100 p-1 rounded-xl w-fit">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {badges.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {badges.map(badge => (
                <button
                  key={badge}
                  onClick={() => setSelectedBadge(selectedBadge === badge ? null : badge)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                  style={selectedBadge === badge
                    ? { backgroundColor: '#E6F1FB', color: '#185FA5', borderColor: '#B5D4F4' }
                    : { backgroundColor: 'white', color: '#57534e', borderColor: '#e7e5e4' }
                  }
                >
                  {badge}
                  {selectedBadge === badge && (
                    <span className="ml-1.5 text-xs">✕</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-stone-400 justify-center py-20">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm font-medium">데이터를 불러오는 중입니다...</span>
            </div>
          ) : (
            renderGrid()
          )}
        </div>
      </section>
    </main>
  );
}
