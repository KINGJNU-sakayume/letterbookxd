import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, BookOpen, X, CheckCircle2, Award, Library, ChevronDown, ChevronUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Label,
} from 'recharts';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { supabase } from '../lib/supabase';

const OWNER_ID = import.meta.env.VITE_OWNER_ID;
const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const countryMapping: Record<string, string> = {
  '한국': 'South Korea', '일본': 'Japan', '러시아': 'Russia', '미국': 'United States of America',
  '영국': 'United Kingdom', '프랑스': 'France', '독일': 'Germany', '중국': 'China',
  '이탈리아': 'Italy', '스페인': 'Spain', '그리스': 'Greece', '오스트리아': 'Austria',
  '브라질': 'Brazil', '인도': 'India', '캐나다': 'Canada', '노르웨이': 'Norway', '스웨덴': 'Sweden',
};

const GENRE_COLORS = ['#378ADD', '#639922', '#e07b39', '#9333ea', '#db2777', '#0891b2'];
const KOR_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

interface WorkWithCover {
  id: string;
  title: string;
  author: string;
  displayCover: string;
  genre: string | null;
  lists: string[] | null;
  published_year?: number;
  [key: string]: unknown;
}

interface StatsData {
  totalWorks: number;
  annualAvg: number;
  totalPages: number;
  avgPagesPerBook: number;
  avgRating: string;
  lifeBookCount: number;
  seriesCompletionRate: number;
  seriesCompletedCount: number;
  seriesTotalCount: number;
  ratingDist: { rating: string; count: number }[];
  monthlyDist: { month: string; count: number }[];
  authorDist: { name: string; count: number }[];
  genreDist: { genre: string; count: number; percent: number }[];
  publisherDist: { publisher: string; count: number }[];
  countryDataMap: Record<string, { works: WorkWithCover[] }>;
  nobelBestBooks: WorkWithCover[];
  readWorkIds: Set<string>;
  challenge: { read: number; total: number; percent: number };
  allCompletedWorks: WorkWithCover[];
  completionYears: number[];
}

type YearFilter = 'all' | number;

export function StatsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState<any>(null);
  const [selectedYear, setSelectedYear] = useState<YearFilter>('all');
  const [yearDropOpen, setYearDropOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showNobelDetail, setShowNobelDetail] = useState(false);
  const [openMilestoneIdx, setOpenMilestoneIdx] = useState<number | null>(null);
  const yearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchRaw() {
      setLoading(true);
      try {
        const [logsRes, worksRes, editionsRes, seriesRes] = await Promise.all([
          supabase.from('logs').select('*').eq('user_id', OWNER_ID),
          supabase.from('works').select('*'),
          supabase.from('editions').select('id, work_id, cover_url, page_count, publisher'),
          supabase.from('series').select('id'),
        ]);
        setRawData({
          logs: logsRes.data || [],
          works: worksRes.data || [],
          editions: editionsRes.data || [],
          seriesTotal: (seriesRes.data || []).length,
        });
      } catch (e) {
        console.error(e);
        setRawData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchRaw();
  }, []);

  // Close year dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) {
        setYearDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] text-stone-400">
        <Loader2 size={32} className="animate-spin mb-4" />
        <p>독서 기록을 분석하고 있습니다...</p>
      </div>
    );
  }

  if (!rawData || rawData.logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] text-stone-400">
        <Library size={48} className="mb-4 opacity-20" />
        <p>아직 등록된 독서 기록이 없습니다.</p>
      </div>
    );
  }

  // Compute stats with year filter
  const stats = computeStats(rawData, selectedYear);
  const completionYears = stats.completionYears;

  const yearLabel = selectedYear === 'all' ? '전체' : `${selectedYear}`;

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10">

        {/* Title with inline year dropdown */}
        <div className="flex items-center gap-2 mb-10">
          <h1 className="text-3xl font-bold text-stone-900">나의 서재</h1>
          <div className="relative" ref={yearRef}>
            <button
              onClick={() => setYearDropOpen(v => !v)}
              className="flex items-center gap-0.5 text-3xl font-bold text-stone-900 hover:text-stone-600 transition-colors"
            >
              {yearLabel}
              <span className="text-base font-normal text-stone-500 ml-0.5">▾</span>
            </button>
            {yearDropOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-20 min-w-[100px] py-1">
                {(['all', ...completionYears.sort((a, b) => b - a)] as YearFilter[]).map(y => (
                  <button
                    key={y}
                    onClick={() => { setSelectedYear(y); setYearDropOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      selectedYear === y ? 'text-stone-900 font-semibold bg-stone-50' : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {y === 'all' ? '전체' : `${y}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <h1 className="text-3xl font-bold text-stone-900">통계</h1>
        </div>

        {/* 4 Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <MetricCard
            main={`${stats.totalWorks}권`}
            label="완독"
            sub={`연평균 ${stats.annualAvg.toFixed(1)}권`}
          />
          <MetricCard
            main={`${stats.totalPages.toLocaleString()}쪽`}
            label="읽은 페이지"
            sub={`권당 평균 ${stats.avgPagesPerBook}쪽`}
          />
          <MetricCard
            main={`${stats.avgRating}점`}
            label="평균 별점"
            sub={`♥ 인생책 ${stats.lifeBookCount}권`}
          />
          <MetricCard
            main={`${stats.seriesCompletionRate}%`}
            label="시리즈 완주율"
            sub={`${stats.seriesCompletedCount}개 중 ${stats.seriesCompletedCount}개 완주`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Monthly completion bar chart */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
            <h3 className="text-sm font-semibold text-stone-800 mb-4">월별 완독</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyDist} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#78716c' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#a8a29e' }} />
                  <Tooltip
                    cursor={{ fill: '#f5f5f4' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.07)', fontSize: 12 }}
                    formatter={(v: number) => [`${v}권`, '']}
                  />
                  <Bar
                    dataKey="count"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={32}
                    fill="#d6d3d1"
                  >
                    {stats.monthlyDist.map((entry, idx) => {
                      const maxCount = Math.max(...stats.monthlyDist.map(e => e.count));
                      return (
                        <Cell
                          key={idx}
                          fill={entry.count === maxCount && maxCount > 0 ? '#1c1917' : '#d6d3d1'}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Star rating distribution (horizontal bars) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
            <h3 className="text-sm font-semibold text-stone-800 mb-4">별점 분포</h3>
            <div className="space-y-2.5">
              {[...stats.ratingDist].reverse().map(({ rating, count }) => {
                const maxCount = Math.max(...stats.ratingDist.map(r => r.count), 1);
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={rating} className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 w-8 shrink-0 text-right">{rating}</span>
                    <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-stone-500 w-6 shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-stone-400 mt-4">
              {stats.ratingDist.reduce((s, r) => s + r.count, 0) < stats.totalWorks &&
                `${stats.totalWorks - stats.ratingDist.reduce((s, r) => s + r.count, 0)}권 별점 미입력 제외`
              }
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Most-read authors */}
          {stats.authorDist.length > 0 && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
              <h3 className="text-sm font-semibold text-stone-800 mb-4">많이 읽은 작가</h3>
              <div className="space-y-3">
                {stats.authorDist.slice(0, 4).map(({ name, count }, idx) => {
                  const maxCount = stats.authorDist[0]?.count || 1;
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <button
                      key={name}
                      onClick={() => navigate(`/author/${encodeURIComponent(name)}`)}
                      className="w-full flex items-center gap-3 group"
                    >
                      <span className="text-xs text-stone-400 w-4 shrink-0">{idx + 1}</span>
                      <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 shrink-0">
                        {name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-stone-800 group-hover:text-blue-600 group-hover:underline transition-colors truncate">{name}</span>
                          <span className="text-xs text-stone-500 shrink-0 ml-2">{count}권</span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-stone-300 group-hover:bg-stone-400 transition-colors" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Genre breakdown */}
          {stats.genreDist.length > 0 && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
              <h3 className="text-sm font-semibold text-stone-800 mb-4">장르 분포</h3>
              <div className="space-y-2.5">
                {stats.genreDist.slice(0, 6).map(({ genre, count, percent }, idx) => (
                  <div key={genre} className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: GENRE_COLORS[idx % GENRE_COLORS.length] }} />
                    <span className="text-sm text-stone-700 flex-1 truncate">{genre}</span>
                    <div className="w-20 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${percent}%`, backgroundColor: GENRE_COLORS[idx % GENRE_COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs text-stone-400 w-8 text-right shrink-0">{percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Edition preference */}
          {stats.publisherDist.length > 0 && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
              <h3 className="text-sm font-semibold text-stone-800 mb-1">출판사 선호도</h3>
              <p className="text-[11px] text-stone-400 mb-4">복수 판본 존재 시 선택 기준</p>
              <div className="space-y-2">
                {stats.publisherDist.slice(0, 5).map(({ publisher, count }) => {
                  const maxCount = stats.publisherDist[0]?.count || 1;
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={publisher} className="flex items-center gap-3">
                      <span className="text-sm text-stone-700 flex-1 truncate">{publisher}</span>
                      <div className="w-24 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-stone-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-stone-400 w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nobel milestone donut */}
          <div
            onClick={() => setShowNobelDetail(v => !v)}
            className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex flex-col items-center justify-center cursor-pointer hover:border-amber-300 transition-colors group relative"
          >
            <div className="absolute top-4 right-4 text-[11px] text-stone-400 group-hover:text-amber-500 transition-colors font-medium opacity-0 group-hover:opacity-100">
              클릭하여 목록 보기 ↗
            </div>
            <div className="h-[200px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: '완독', value: stats.challenge.read },
                      { name: '미완독', value: stats.challenge.total - stats.challenge.read },
                    ]}
                    cx="50%" cy="50%" innerRadius={65} outerRadius={85}
                    startAngle={90} endAngle={-270} dataKey="value" stroke="none"
                  >
                    <Cell fill="#f59e0b" />
                    <Cell fill="#f5f5f4" />
                    <Label
                      content={({ viewBox }) => {
                        const { cx, cy } = viewBox as { cx: number; cy: number };
                        return (
                          <g textAnchor="middle" dominantBaseline="middle">
                            <text x={cx} y={cy - 10} fontSize={10} fill="#78716c">노벨 연구소</text>
                            <text x={cx} y={cy + 10} fontSize={22} fontWeight="bold" fill="#1c1917">{stats.challenge.percent}%</text>
                          </g>
                        );
                      }}
                    />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-stone-500 text-center">{stats.challenge.read} / {stats.challenge.total}권</p>
          </div>
        </div>

        {/* Nobel detail expandable */}
        {showNobelDetail && (
          <div className="bg-white p-8 rounded-2xl border border-amber-200/60 shadow-md mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Award className="text-amber-500" size={18} /> 노벨 연구소 선정 최고의 책 100선
              </h4>
              <button onClick={() => setShowNobelDetail(false)} className="text-stone-400 hover:text-stone-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-3">
              {stats.nobelBestBooks.map(work => {
                const isRead = stats.readWorkIds.has(work.id);
                return (
                  <div key={work.id} className="relative aspect-[2/3] bg-stone-100 rounded-lg shadow-sm">
                    <div className={`w-full h-full rounded-lg overflow-hidden border transition-all ${isRead ? 'border-amber-400 opacity-100 shadow-md' : 'border-stone-200 grayscale opacity-40 blur-[1px]'}`}>
                      {work.displayCover ? (
                        <img src={work.displayCover} alt={work.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300"><BookOpen size={16} /></div>
                      )}
                    </div>
                    {isRead && (
                      <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 shadow">
                        <CheckCircle2 size={13} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Literary map */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 relative mb-8">
          <h3 className="text-sm font-semibold text-stone-800 mb-1">문학 지도</h3>
          <p className="text-xs text-stone-400 mb-4">어느 나라의 작품을 주로 읽었는지 확인하세요.</p>
          <div className="w-full h-[360px] bg-[#f8fafc] rounded-xl overflow-hidden border border-stone-100 relative">
            <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={400} style={{ width: '100%', height: '100%' }}>
              <ZoomableGroup center={[0, 20]} zoom={1}>
                <Geographies geography={geoUrl}>
                  {({ geographies }) =>
                    geographies.map(geo => {
                      const countryName = geo.properties.name;
                      const hasData = Object.entries(countryMapping).some(([k, v]) => v === countryName && stats.countryDataMap[k]);
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onClick={() => {
                            const k = Object.keys(countryMapping).find(k => countryMapping[k] === countryName);
                            if (k && stats.countryDataMap[k]) setSelectedCountry(k);
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
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-base font-bold text-stone-900">{selectedCountry} 문학</h4>
                <button onClick={() => setSelectedCountry(null)} className="p-1.5 bg-stone-100 text-stone-500 hover:text-stone-900 rounded-full">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                  {stats.countryDataMap[selectedCountry].works.map(w => (
                    <div key={w.id} className="text-center group">
                      <div className="aspect-[2/3] rounded shadow-sm overflow-hidden mb-1 bg-stone-100 border border-stone-200">
                        {w.displayCover ? (
                          <img src={w.displayCover} alt={w.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-300"><BookOpen size={16} /></div>
                        )}
                      </div>
                      <p className="text-[10px] font-medium text-stone-800 line-clamp-2 leading-tight">{w.title}</p>
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

// ---------- helpers ----------

function MetricCard({ main, label, sub }: { main: string; label: string; sub: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100">
      <p className="text-xs text-stone-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-stone-900 mb-1">{main}</p>
      <p className="text-xs text-stone-400">{sub}</p>
    </div>
  );
}

function computeStats(rawData: any, yearFilter: YearFilter): StatsData {
  const { logs, works, editions, seriesTotal } = rawData;

  const editionMap = new Map(editions.map((e: any) => [e.id, e]));

  const workWithCoverLookup: Record<string, WorkWithCover> = works.reduce((acc: any, w: any) => {
    const repEdition = editions.find((e: any) => e.id === w.representative_edition_id);
    const firstEdition = editions.find((e: any) => e.work_id === w.id);
    acc[w.id] = { ...w, displayCover: repEdition?.cover_url || firstEdition?.cover_url || '' };
    return acc;
  }, {});

  // Filter logs by year if needed
  const filterByYear = (log: any) => {
    if (yearFilter === 'all') return true;
    return new Date(log.created_at).getFullYear() === yearFilter;
  };

  // Determine read works (set_completion or all volumes watched)
  const editionSetTotalCounts: Record<string, number> = {};
  editions.forEach((e: any) => {
    const setKey = `${e.work_id}::${e.publisher || 'unknown'}`;
    editionSetTotalCounts[setKey] = (editionSetTotalCounts[setKey] || 0) + 1;
  });

  const userReadVolumesPerSet: Record<string, Set<string>> = {};
  const readEditionIds = new Set<string>();
  const completionLogsByYear: any[] = [];

  logs.forEach((log: any) => {
    if (log.log_type === 'set_completion' && filterByYear(log)) {
      completionLogsByYear.push(log);
    }
    if (!log.volume_id) return;
    const editionId = log.volume_id.replace('vol-', '');
    readEditionIds.add(editionId);
    const edition = editionMap.get(editionId) as any;
    if (edition) {
      const setKey = `${edition.work_id}::${edition.publisher || 'unknown'}`;
      if (!userReadVolumesPerSet[setKey]) userReadVolumesPerSet[setKey] = new Set();
      userReadVolumesPerSet[setKey].add(editionId);
    }
  });

  const allReadWorkIds = new Set<string>();
  Object.keys(userReadVolumesPerSet).forEach(setKey => {
    if (userReadVolumesPerSet[setKey].size === editionSetTotalCounts[setKey]) {
      allReadWorkIds.add(setKey.split('::')[0]);
    }
  });

  // Year-filtered read work IDs
  const yearReadWorkIds = new Set<string>(completionLogsByYear.map((l: any) => l.work_id));

  const readWorkIds = yearFilter === 'all' ? allReadWorkIds : yearReadWorkIds;
  const totalWorks = readWorkIds.size;

  // Completion years for dropdown
  const completionYears = Array.from(new Set(
    logs
      .filter((l: any) => l.log_type === 'set_completion')
      .map((l: any) => new Date(l.created_at).getFullYear())
  )) as number[];

  // Pages (all time — progress tracking)
  const totalPages = Array.from(readEditionIds).reduce((acc, editionId) => {
    return acc + ((editionMap.get(editionId) as any)?.page_count || 0);
  }, 0);

  // Annual avg
  const yearsWithData = completionYears.length || 1;
  const annualAvg = yearFilter === 'all'
    ? parseFloat((totalWorks / yearsWithData).toFixed(1))
    : totalWorks;

  // Avg pages per book
  const avgPagesPerBook = totalWorks > 0 ? Math.round(totalPages / totalWorks) : 0;

  // Ratings
  const validRatingLogs = logs.filter((l: any) => l.rating && l.rating > 0 && filterByYear(l));
  const avgRating = validRatingLogs.length > 0
    ? (validRatingLogs.reduce((acc: number, l: any) => acc + l.rating, 0) / validRatingLogs.length).toFixed(1)
    : '0.0';

  // Life books count (liked completions)
  const lifeBookCount = logs.filter((l: any) => l.log_type === 'set_completion' && l.liked && filterByYear(l)).length;

  // Series completion rate
  const seriesCompletedCount = logs.filter((l: any) => l.log_type === 'series_completion').length;
  const seriesCompletionRate = seriesTotal > 0 ? Math.round((seriesCompletedCount / seriesTotal) * 100) : 0;

  // Rating distribution
  const ratingDist = [1, 2, 3, 4, 5].map(r => ({
    rating: `${r}점`,
    count: validRatingLogs.filter((l: any) => Math.floor(l.rating) === r).length,
  }));

  // Monthly distribution
  const monthCounts: Record<number, number> = {};
  completionLogsByYear.forEach((l: any) => {
    const m = new Date(l.created_at).getMonth();
    monthCounts[m] = (monthCounts[m] || 0) + 1;
  });
  if (yearFilter === 'all') {
    logs.filter((l: any) => l.log_type === 'set_completion').forEach((l: any) => {
      const m = new Date(l.created_at).getMonth();
      monthCounts[m] = (monthCounts[m] || 0) + 1;
    });
  }
  const monthlyDist = KOR_MONTHS.map((month, idx) => ({
    month,
    count: monthCounts[idx] || 0,
  }));

  // Author distribution
  const authorCounts: Record<string, number> = {};
  readWorkIds.forEach(wId => {
    const w = workWithCoverLookup[wId];
    if (w?.author) authorCounts[w.author] = (authorCounts[w.author] || 0) + 1;
  });
  const authorDist = Object.entries(authorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Genre distribution
  const genreCounts: Record<string, number> = {};
  readWorkIds.forEach(wId => {
    const w = workWithCoverLookup[wId];
    if (!w?.genre) return;
    const tags = typeof w.genre === 'string' ? w.genre.split(',') : (w.genre as string[]);
    tags.forEach((t: string) => {
      const trimmed = t.trim();
      if (trimmed) genreCounts[trimmed] = (genreCounts[trimmed] || 0) + 1;
    });
  });
  const totalGenreEntries = Object.values(genreCounts).reduce((s, n) => s + n, 0) || 1;
  const genreDist = Object.entries(genreCounts)
    .map(([genre, count]) => ({ genre, count, percent: Math.round((count / totalGenreEntries) * 100) }))
    .sort((a, b) => b.count - a.count);

  // Publisher distribution
  const publisherCounts: Record<string, number> = {};
  logs.filter((l: any) => l.log_type === 'set_completion' && filterByYear(l)).forEach((l: any) => {
    const setId = l.edition_set_id || '';
    const pub = setId.split('::')[1] || '';
    if (pub) publisherCounts[pub] = (publisherCounts[pub] || 0) + 1;
  });
  const publisherDist = Object.entries(publisherCounts)
    .map(([publisher, count]) => ({ publisher, count }))
    .sort((a, b) => b.count - a.count);

  // Country map
  const countryDataMap: Record<string, { works: WorkWithCover[] }> = {};
  readWorkIds.forEach(workId => {
    const w = workWithCoverLookup[workId];
    if (!w) return;
    const tags = typeof w.genre === 'string' ? w.genre.split(',') : ((w.genre as string[] | null) || []);
    let found = '미분류';
    for (const tag of tags) {
      const trimmed = tag.trim();
      for (const k of Object.keys(countryMapping)) {
        if (trimmed.includes(k)) { found = k; break; }
      }
      if (found !== '미분류') break;
    }
    if (!countryDataMap[found]) countryDataMap[found] = { works: [] };
    countryDataMap[found].works.push(w);
  });

  // Nobel challenge
  const targetTitle = '노벨 연구소 선정 최고의 책';
  const nobelBestBooks = works
    .filter((w: any) => Array.isArray(w.lists) ? w.lists.includes(targetTitle) : w.lists?.toString().includes(targetTitle))
    .map((w: any) => ({ ...workWithCoverLookup[w.id], ...w, displayCover: workWithCoverLookup[w.id]?.displayCover || '' }));
  const readNobelCount = nobelBestBooks.filter((w: any) => allReadWorkIds.has(w.id)).length;

  return {
    totalWorks,
    annualAvg,
    totalPages,
    avgPagesPerBook,
    avgRating,
    lifeBookCount,
    seriesCompletionRate,
    seriesCompletedCount,
    seriesTotalCount: seriesTotal,
    ratingDist,
    monthlyDist,
    authorDist,
    genreDist,
    publisherDist,
    countryDataMap,
    nobelBestBooks,
    readWorkIds: allReadWorkIds,
    challenge: {
      read: readNobelCount,
      total: nobelBestBooks.length || 100,
      percent: Math.round((readNobelCount / (nobelBestBooks.length || 100)) * 100),
    },
    allCompletedWorks: Array.from(allReadWorkIds).map(id => workWithCoverLookup[id]).filter(Boolean),
    completionYears,
  };
}
