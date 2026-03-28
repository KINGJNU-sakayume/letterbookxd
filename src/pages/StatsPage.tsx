import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, BookOpen, Star, Map as MapIcon, X, CheckCircle2, Award, Library, LogIn } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Label } from 'recharts';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const countryMapping: Record<string, string> = {
  '한국': 'South Korea', '일본': 'Japan', '러시아': 'Russia', '미국': 'United States of America',
  '영국': 'United Kingdom', '프랑스': 'France', '독일': 'Germany', '중국': 'China',
  '이탈리아': 'Italy', '스페인': 'Spain', '그리스': 'Greece', '오스트리아': 'Austria',
  '브라질': 'Brazil', '인도': 'India', '캐나다': 'Canada', '노르웨이': 'Norway', '스웨덴': 'Sweden',
};

// [M-1] stats 타입 명시
interface StatsData {
  totalWorks: number;
  totalPages: number;
  avgRating: string;
  ratingDist: { rating: string; count: number }[];
  countryDataMap: Record<string, { works: WorkWithCover[] }>;
  nobelBestBooks: WorkWithCover[];
  readWorkIds: Set<string>;
  challenge: { read: number; total: number; percent: number };
}

interface WorkWithCover {
  id: string;
  title: string;
  author: string;
  displayCover: string;
  [key: string]: unknown;
}

export function StatsPage() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData | 'no_data' | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showNobelDetail, setShowNobelDetail] = useState(false);

  // [H-4] 비로그인 상태 처리: useEffect보다 먼저 렌더링 분기
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchStatsData() {
      setLoading(true);
      try {
        const [logsRes, worksRes, editionsRes] = await Promise.all([
          supabase.from('logs').select('work_id, rating, volume_id').eq('user_id', user!.id),
          supabase.from('works').select('*'),
          supabase.from('editions').select('id, work_id, cover_url, page_count, publisher'),
        ]);

        if (logsRes.error) throw logsRes.error;
        const logs = logsRes.data || [];
        const works = worksRes.data || [];
        const editions = editionsRes.data || [];

        if (logs.length === 0) { setStats('no_data'); return; }

        const validRatingLogs = logs.filter(l => l.rating && l.rating > 0);
        const avgRating = validRatingLogs.length > 0
          ? (validRatingLogs.reduce((acc, l) => acc + l.rating, 0) / validRatingLogs.length).toFixed(1)
          : '0.0';

        const workWithCoverLookup = works.reduce((acc: Record<string, WorkWithCover>, w) => {
          const repEdition = editions.find(e => e.id === w.representative_edition_id);
          const firstEdition = editions.find(e => e.work_id === w.id);
          acc[w.id] = { ...w, displayCover: repEdition?.cover_url || firstEdition?.cover_url || '' };
          return acc;
        }, {});

        const editionSetTotalCounts: Record<string, number> = {};
        const editionMap = new Map(editions.map(e => [e.id, e]));
        editions.forEach(e => {
          const setKey = `${e.work_id}::${e.publisher || 'unknown'}`;
          editionSetTotalCounts[setKey] = (editionSetTotalCounts[setKey] || 0) + 1;
        });

        const userReadVolumesPerSet: Record<string, Set<string>> = {};
        const readEditionIds = new Set<string>();
        logs.forEach(log => {
          if (!log.volume_id) return;
          const editionId = log.volume_id.replace('vol-', '');
          readEditionIds.add(editionId);
          const edition = editionMap.get(editionId);
          if (edition) {
            const setKey = `${edition.work_id}::${edition.publisher || 'unknown'}`;
            if (!userReadVolumesPerSet[setKey]) userReadVolumesPerSet[setKey] = new Set();
            userReadVolumesPerSet[setKey].add(editionId);
          }
        });

        const readWorkIds = new Set<string>();
        Object.keys(userReadVolumesPerSet).forEach(setKey => {
          if (userReadVolumesPerSet[setKey].size === editionSetTotalCounts[setKey]) {
            readWorkIds.add(setKey.split('::')[0]);
          }
        });

        const totalPages = Array.from(readEditionIds).reduce((acc, editionId) => {
          return acc + (editionMap.get(editionId)?.page_count || 0);
        }, 0);

        const countryDataMap: Record<string, { works: WorkWithCover[] }> = {};
        readWorkIds.forEach(workId => {
          const work = workWithCoverLookup[workId];
          if (!work) return;
          const tags = Array.isArray(work.genre) ? work.genre as string[] : ((work.genre as string)?.split(',') || []);
          let foundCountry = '미분류';
          for (const tag of tags) {
            const trimmedTag = (tag as string).trim();
            for (const [koreanName] of Object.entries(countryMapping)) {
              if (trimmedTag.includes(koreanName)) { foundCountry = koreanName; break; }
            }
            if (foundCountry !== '미분류') break;
          }
          if (!countryDataMap[foundCountry]) countryDataMap[foundCountry] = { works: [] };
          countryDataMap[foundCountry].works.push(work);
        });

        const targetTitle = '노벨 연구소 선정 최고의 책';
        const nobelBestBooks = works
          .filter(w => Array.isArray(w.lists) ? w.lists.includes(targetTitle) : w.lists?.toString().includes(targetTitle))
          .map(w => ({ ...workWithCoverLookup[w.id], ...w, displayCover: workWithCoverLookup[w.id]?.displayCover || '' }));

        const readNobelCount = nobelBestBooks.filter(w => readWorkIds.has(w.id)).length;

        const ratingDist = [1, 2, 3, 4, 5].map(r => ({
          rating: `${r}점`,
          count: logs.filter(l => Math.floor(l.rating || 0) === r).length,
        }));

        setStats({
          totalWorks: readWorkIds.size,
          totalPages,
          avgRating,
          ratingDist,
          countryDataMap,
          nobelBestBooks,
          readWorkIds,
          challenge: {
            read: readNobelCount,
            total: nobelBestBooks.length || 100,
            percent: Math.round((readNobelCount / (nobelBestBooks.length || 100)) * 100),
          },
        });
      } catch (err) {
        console.error(err);
        setStats('no_data');
      } finally {
        setLoading(false);
      }
    }

    fetchStatsData();
  }, [user, location.pathname]);

  // [H-4] 비로그인 처리
  if (!user && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] text-stone-400 gap-4">
        <LogIn size={40} className="opacity-30" />
        <p className="text-stone-500 font-medium">로그인 후 통계를 확인할 수 있습니다.</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 bg-stone-900 text-white rounded-lg text-sm"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] text-stone-400">
        <Loader2 size={32} className="animate-spin mb-4" />
        <p>독서 기록을 분석하고 있습니다...</p>
      </div>
    );
  }

  if (stats === 'no_data' || stats === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] text-stone-400">
        <Library size={48} className="mb-4 opacity-20" />
        <p>아직 등록된 독서 기록이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10">
        <h1 className="text-3xl font-bold text-stone-900 mb-8">나의 서재 통계</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500 mb-1">완독한 작품</p>
              <p className="text-3xl font-bold text-stone-900">{stats.totalWorks}<span className="text-lg font-normal text-stone-500 ml-1">편</span></p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500 mb-1">읽은 페이지</p>
              <p className="text-3xl font-bold text-stone-900">{stats.totalPages.toLocaleString()}<span className="text-lg font-normal text-stone-500 ml-1">쪽</span></p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
              <Star size={24} className="fill-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500 mb-1">평균 별점</p>
              <p className="text-3xl font-bold text-stone-900">{stats.avgRating}<span className="text-lg font-normal text-stone-500 ml-1">점</span></p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 flex flex-col justify-center">
            <h3 className="text-lg font-bold text-stone-900 mb-6">별점 분포</h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.ratingDist} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="rating" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716c' }} />
                  <Tooltip cursor={{ fill: '#f5f5f4' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }} />
                  <Bar dataKey="count" fill="#1c1917" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            onClick={() => setShowNobelDetail(!showNobelDetail)}
            className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 flex flex-col items-center justify-center cursor-pointer hover:border-amber-300 transition-colors group relative"
          >
            <div className="absolute top-4 right-5 text-[11px] text-stone-400 group-hover:text-amber-500 transition-colors font-medium opacity-0 group-hover:opacity-100">
              클릭하여 목록 보기 ↗
            </div>
            <div className="h-[250px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Read', value: stats.challenge.read },
                      { name: 'Unread', value: stats.challenge.total - stats.challenge.read },
                    ]}
                    cx="50%" cy="50%" innerRadius={80} outerRadius={105}
                    startAngle={90} endAngle={-270} dataKey="value" stroke="none"
                  >
                    <Cell fill="#f59e0b" />
                    <Cell fill="#f5f5f4" />
                    <Label
                      content={({ viewBox }) => {
                        const { cx, cy } = viewBox as { cx: number; cy: number };
                        return (
                          <g textAnchor="middle" dominantBaseline="middle">
                            <text x={cx} y={cy - 22} className="fill-stone-500 text-[11px] font-semibold tracking-tight">노벨 연구소 선정 최고의 책</text>
                            <text x={cx} y={cy + 8} className="fill-stone-900 text-4xl font-bold">{stats.challenge.percent}%</text>
                            <text x={cx} y={cy + 32} className="fill-stone-400 text-xs font-medium">{stats.challenge.read} of {stats.challenge.total}</text>
                          </g>
                        );
                      }}
                    />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {showNobelDetail && (
          <div className="bg-white p-8 sm:p-10 rounded-2xl border border-amber-200/60 shadow-md mb-12 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center mb-8">
              <h4 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                <Award className="text-amber-500" /> 노벨 연구소 선정 최고의 책 100선
              </h4>
              <button onClick={() => setShowNobelDetail(false)} className="text-stone-400 hover:text-stone-700 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-4">
              {stats.nobelBestBooks.map((work) => {
                const isRead = stats.readWorkIds.has(work.id);
                return (
                  <div key={work.id} className="relative group aspect-[2/3] bg-stone-100 rounded-lg shadow-sm">
                    <div className={`w-full h-full rounded-lg overflow-hidden border transition-all duration-500 ${isRead ? 'border-amber-400 grayscale-0 opacity-100 shadow-md' : 'border-stone-200 grayscale opacity-40 blur-[1px]'}`}>
                      {work.displayCover ? (
                        <img src={work.displayCover} alt={work.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300"><BookOpen size={24} /></div>
                      )}
                    </div>
                    {isRead && (
                      <div className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-0.5 shadow-md">
                        <CheckCircle2 size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 relative mb-12">
          <h3 className="text-lg font-bold text-stone-900 mb-2 flex items-center gap-2">
            <MapIcon size={20} className="text-stone-400" /> 문학 지도
          </h3>
          <p className="text-sm text-stone-500 mb-6">어느 나라의 작품을 주로 읽었는지 확인하세요.</p>
          <div className="w-full h-[400px] sm:h-[500px] bg-[#f8fafc] rounded-xl overflow-hidden border border-stone-100 relative">
            <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={400} style={{ width: '100%', height: '100%' }}>
              <ZoomableGroup center={[0, 20]} zoom={1}>
                <Geographies geography={geoUrl}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const countryName = geo.properties.name;
                      const hasData = Object.values(countryMapping).includes(countryName) &&
                        Object.entries(countryMapping).some(([k, v]) => v === countryName && stats.countryDataMap[k]);
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onClick={() => {
                            const koreanName = Object.keys(countryMapping).find(k => countryMapping[k] === countryName);
                            if (koreanName && stats.countryDataMap[koreanName]) setSelectedCountry(koreanName);
                          }}
                          style={{
                            default: { fill: hasData ? '#1c1917' : '#e2e8f0', outline: 'none', cursor: hasData ? 'pointer' : 'default' },
                            hover: { fill: hasData ? '#44403c' : '#cbd5e1', outline: 'none' },
                            pressed: { fill: '#1c1917', outline: 'none' },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
          </div>
          {selectedCountry && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl p-6 z-10 flex flex-col animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xl font-bold text-stone-900">{selectedCountry} 문학</h4>
                <button onClick={() => setSelectedCountry(null)} className="p-2 bg-stone-100 text-stone-500 hover:text-stone-900 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {stats.countryDataMap[selectedCountry].works.map((w) => (
                    <div key={w.id} className="text-center group">
                      <div className="aspect-[2/3] rounded shadow-sm overflow-hidden mb-2 bg-stone-100 border border-stone-200">
                        {w.displayCover ? (
                          <img src={w.displayCover} alt={w.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-300"><BookOpen size={24} /></div>
                        )}
                      </div>
                      <p className="text-xs font-medium text-stone-800 line-clamp-2 leading-snug">{w.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
