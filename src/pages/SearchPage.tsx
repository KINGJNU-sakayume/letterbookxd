import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, BookOpen, Layers } from 'lucide-react';
import { BookCover } from '../components/ui/BookCover';
import { supabase } from '../lib/supabase';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [works, setWorks] = useState<any[]>([]);
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'works' | 'series'>('works');
  
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function getInitialData() {
      try {
        const { data: worksData, error: worksError } = await supabase
          .from('works')
          .select(`
            id,
            title,
            author,
            representative_edition_id,
            editions!work_id (
              id,
              cover_url
            )
          `)
          .order('title', { ascending: true });

        if (worksError) throw worksError;

        const processedWorks = worksData?.map(work => {
          const editions = (work.editions as any[]) || [];
          const repEdition = editions.find(e => e.id === work.representative_edition_id);
          
          return {
            ...work,
            display_cover: repEdition?.cover_url || editions[0]?.cover_url || null
          };
        }) || [];
        setWorks(processedWorks);

        const { data: seriesData, error: seriesError } = await supabase
          .from('series')
          .select('*')
          .order('title', { ascending: true });

        if (seriesError) throw seriesError;
        setSeriesList(seriesData || []);

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

  // [L-3] 키보드 네비게이션 — 검색 드롭다운에서 동작
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

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50/50">
      <section className="bg-stone-900 pt-12 pb-16 px-4 sm:px-6 relative z-20">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            어떤 책을 찾고 계신가요?
          </h1>
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
                          onClick={() => navigate(`/book/${work.id}`)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={`w-full flex items-center gap-4 px-5 py-3 text-left transition-colors ${activeIndex === index ? 'bg-stone-50' : 'hover:bg-stone-50'}`}
                        >
                          <BookCover src={work.display_cover} alt={work.title} className="w-10 h-14 shadow-sm shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-stone-900 truncate">{work.title}</p>
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

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 pt-8">
        
        <div className="flex gap-6 mb-8 border-b border-stone-200">
          <button
            onClick={() => setActiveTab('works')}
            className={`flex items-center gap-2 pb-3 text-sm font-bold transition-colors border-b-2 -mb-px ${
              activeTab === 'works' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            <BookOpen size={16} /> 단행본 작품
          </button>
          <button
            onClick={() => setActiveTab('series')}
            className={`flex items-center gap-2 pb-3 text-sm font-bold transition-colors border-b-2 -mb-px ${
              activeTab === 'series' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            <Layers size={16} /> 시리즈 세계관
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-stone-400 justify-center py-20">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm font-medium">데이터를 불러오는 중입니다...</span>
          </div>
        ) : (
          <>
            {activeTab === 'works' && (
              works.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-20">아직 등록된 작품이 없습니다.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 animate-in fade-in duration-300">
                  {works.map((w) => (
                    <button key={w.id} onClick={() => navigate(`/book/${w.id}`)} className="group text-left">
                      <BookCover src={w.display_cover} alt={w.title} className="w-full shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1" />
                      <div className="mt-2">
                        <p className="text-sm font-medium text-stone-800 leading-snug line-clamp-2 group-hover:text-stone-600 transition-colors">{w.title}</p>
                        <p className="text-[11px] text-stone-500 mt-1">{w.author}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}

            {activeTab === 'series' && (
              seriesList.length === 0 ? (
                <p className="text-sm text-stone-400 text-center py-20">아직 등록된 시리즈가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 animate-in fade-in duration-300">
                  {seriesList.map((s) => (
                    <button key={s.id} onClick={() => navigate(`/series/${s.id}`)} className="group text-left">
                      <BookCover src={s.cover_url || ''} alt={s.title} className="w-full shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1 border-2 border-transparent group-hover:border-stone-200" />
                      <div className="mt-2">
                        <p className="text-sm font-bold text-stone-900 leading-snug line-clamp-2 group-hover:text-stone-600 transition-colors">{s.title}</p>
                        <p className="text-[11px] text-stone-500 mt-1">{s.author}</p>
                        {s.genre && <p className="text-[10px] text-stone-400 mt-0.5">{s.genre}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </section>
    </main>
  );
}