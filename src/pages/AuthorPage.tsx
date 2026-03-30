import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Eye, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLogStore } from '../store/logStore';
import { StarRating } from '../components/ui/StarRating';
import { fetchFlowchartByAuthor } from '../services/db';
import type { DbFlowchart } from '../types';
import { FlowchartSidebar, FlowchartModal } from '../components/flowchart';

interface WorkItem {
  id: string;
  title: string;
  published_year: number;
  representative_edition_id: string | null;
  series_id: string | null;
  display_cover: string;
  editions: { id: string; cover_url: string }[];
}

const EYE_STATE_STYLES = {
  unread: { icon: '#a8a29e', bg: 'rgba(0,0,0,0.45)', size: 12 },
  reading: { icon: '#378ADD', bg: '#E6F1FB', size: 12 },
  completed: { icon: '#639922', bg: '#EAF3DE', size: 12 },
} as const;

export function AuthorPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [author, setAuthor] = useState<any>(null);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [lifeBookOpen, setLifeBookOpen] = useState(false);
  const [flowchart, setFlowchart] = useState<DbFlowchart | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { volumeLogs, setCompletionLogs } = useLogStore();

  useEffect(() => {
    async function fetchAuthorData() {
      if (!name) return;
      try {
        const { data: authorData } = await supabase
          .from('authors')
          .select('*')
          .eq('name', name)
          .maybeSingle();
        setAuthor(authorData);

        const { data: worksData, error } = await supabase
          .from('works')
          .select(`
            id,
            title,
            published_year,
            representative_edition_id,
            series_id,
            editions!work_id (
              id,
              cover_url,
              publisher
            )
          `)
          .eq('author', name)
          .order('published_year', { ascending: true });

        if (error) { console.error('데이터 로드 에러:', error); return; }

        const processedWorks = worksData?.map(work => {
          const editions = (work.editions as any[]) || [];
          const repEdition = editions.find((e: any) => e.id === work.representative_edition_id);
          return {
            ...work,
            display_cover: repEdition?.cover_url || editions[0]?.cover_url || '',
          };
        });

        setWorks(processedWorks || []);

        // Fetch flowchart data for this author
        const fc = await fetchFlowchartByAuthor(name);
        setFlowchart(fc);
      } catch (err) {
        console.error('처리 중 에러:', err);
      }
    }
    fetchAuthorData();
  }, [name]);

  if (!author) return <div className="p-10 text-center text-stone-500 font-serif">작가 정보를 불러오는 중...</div>;

  // Personalization band data
  const authorWorkIds = new Set(works.map(w => w.id));

  const completedForAuthor = setCompletionLogs.filter(l => authorWorkIds.has(l.workId));
  const readCount = new Set(completedForAuthor.map(l => l.workId)).size;

  const ratedCompletions = completedForAuthor.filter(l => l.rating !== null);
  const avgRating = ratedCompletions.length > 0
    ? (ratedCompletions.reduce((s, l) => s + (l.rating ?? 0), 0) / ratedCompletions.length).toFixed(1)
    : null;

  const lifeBookLogs = completedForAuthor.filter(l => l.liked);
  const lifeBookCount = lifeBookLogs.length;

  // Life books with work data
  const lifeBooks = lifeBookLogs.map(l => works.find(w => w.id === l.workId)).filter(Boolean) as WorkItem[];

  // Determine reading state per work (based on all volumes completed = set_completion exists)
  function getWorkState(workId: string): 'unread' | 'reading' | 'completed' {
    const hasCompletion = setCompletionLogs.some(l => l.workId === workId);
    if (hasCompletion) return 'completed';
    const hasReading = volumeLogs.some(l => l.workId === workId && l.readingState === 'reading');
    if (hasReading) return 'reading';
    return 'unread';
  }

  const hasFlowchart = flowchart !== null && flowchart.nodes.length > 0;

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="flex flex-col md:flex-row gap-10 mb-10">
        <div className="w-48 h-64 bg-stone-200 rounded-lg overflow-hidden shadow-lg shrink-0">
          <img src={author.photo_url} alt={author.name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <h1 className="text-4xl font-bold text-stone-900 mb-2">{author.name}</h1>
          <p className="text-xl text-stone-500 mb-4 font-serif">{author.birth_death}</p>

          <div className="flex flex-wrap gap-2 mb-6">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-stone-800 text-white text-[11px] font-bold rounded uppercase tracking-wider shadow-sm">
              <MapPin size={11} className="text-stone-300" /> {author.country}
            </span>
            {author.awards && author.awards.map((award: string, index: number) => (
              <span
                key={index}
                className="px-2 py-0.5 border border-stone-200 bg-white text-stone-600 text-[11px] font-medium rounded hover:border-stone-400 transition-colors shadow-sm"
              >
                {award}
              </span>
            ))}
          </div>

          <p className="text-stone-700 leading-relaxed text-lg break-keep max-w-2xl font-serif">
            {author.bio}
          </p>
        </div>
      </div>

      {/* Personalization band */}
      <div className="grid grid-cols-3 border border-stone-200 rounded-xl overflow-hidden bg-white mb-10 divide-x divide-stone-200">
        <div className="px-6 py-5 text-center">
          <p className="text-2xl font-bold text-stone-900">{readCount}</p>
          <p className="text-xs text-stone-500 mt-1">내가 읽은 작품</p>
        </div>
        <div className="px-6 py-5 text-center">
          {avgRating !== null ? (
            <>
              <p className="text-2xl font-bold text-stone-900">★ {avgRating}</p>
              <p className="text-xs text-stone-500 mt-1">이 작가 평균 별점</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-stone-400">—</p>
              <p className="text-xs text-stone-500 mt-1">이 작가 평균 별점</p>
            </>
          )}
        </div>
        <button
          onClick={() => lifeBookCount > 0 && setLifeBookOpen(v => !v)}
          className={`px-6 py-5 text-center w-full transition-colors ${lifeBookCount > 0 ? 'hover:bg-stone-50 cursor-pointer' : 'cursor-default'}`}
        >
          <p className="text-2xl font-bold text-stone-900">♥ {lifeBookCount}</p>
          <p className="text-xs text-stone-500 mt-1 flex items-center justify-center gap-1">
            인생책
            {lifeBookCount > 0 && (lifeBookOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
          </p>
        </button>
      </div>

      {/* Life books accordion */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: lifeBookOpen ? `${lifeBooks.length * 80 + 48}px` : '0px' }}
      >
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            {lifeBooks.map(work => (
              <Link key={work.id} to={`/book/${work.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-10 h-14 bg-stone-100 rounded overflow-hidden shadow-sm shrink-0">
                  <img src={work.display_cover} alt={work.title} className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-medium text-stone-800 line-clamp-2 max-w-[120px]">{work.title}</p>
              </Link>
            ))}
          </div>
          <button
            onClick={() => setLifeBookOpen(false)}
            className="mt-3 text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
          >
            <ChevronUp size={12} /> 접기
          </button>
        </div>
      </div>

      <hr className="border-stone-100 mb-10" />

      {/* Works section — two-column when flowchart exists */}
      <section>
        <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-8">등록된 작품</h2>
        <div className={`grid gap-8 items-start ${hasFlowchart ? 'grid-cols-1 md:grid-cols-[1fr_300px]' : ''}`}>
          {/* Left: works grid */}
          <div className={`grid gap-4 ${hasFlowchart ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6'}`}>
            {works.map((work) => {
              const state = getWorkState(work.id);
              const stateStyle = EYE_STATE_STYLES[state];
              const completionLog = completedForAuthor.find(l => l.workId === work.id);

              return (
                <button
                  key={work.id}
                  onClick={() => navigate(`/book/${work.id}`)}
                  className="group text-left"
                >
                  <div className="relative aspect-[2/3] bg-stone-100 rounded-md overflow-hidden mb-2 shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1">
                    <img
                      src={work.display_cover}
                      alt={work.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    {/* Eye state overlay */}
                    <div
                      className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: stateStyle.bg }}
                    >
                      <Eye size={stateStyle.size} style={{ color: stateStyle.icon }} />
                    </div>
                  </div>
                  <h3 className="text-[13px] font-medium text-stone-800 line-clamp-1 group-hover:text-stone-600">
                    {work.title}
                  </h3>
                  <div className="mt-0.5">
                    {state === 'completed' && completionLog?.rating ? (
                      <StarRating rating={completionLog.rating} size="sm" readonly />
                    ) : state === 'reading' ? (
                      <p className="text-[11px] text-stone-400">읽는 중</p>
                    ) : (
                      <p className="text-[11px] text-stone-400 font-serif">{work.published_year}년</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: flowchart sidebar (sticky) */}
          {hasFlowchart && (
            <div className="sticky top-20">
              <FlowchartSidebar
                nodes={flowchart!.nodes}
                edges={flowchart!.edges}
                setCompletionLogs={setCompletionLogs}
                onExpand={() => setModalOpen(true)}
              />
            </div>
          )}
        </div>
      </section>

      {/* Flowchart modal */}
      {modalOpen && hasFlowchart && (
        <FlowchartModal
          nodes={flowchart!.nodes}
          edges={flowchart!.edges}
          setCompletionLogs={setCompletionLogs}
          works={works}
          onClose={() => setModalOpen(false)}
        />
      )}
    </main>
  );
}
