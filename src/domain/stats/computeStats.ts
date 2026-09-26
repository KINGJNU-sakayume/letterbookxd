export type YearFilter = 'all' | number;

export interface WorkWithCover {
  id: string;
  title: string;
  author: string;
  displayCover: string;
  genre: string | null;
  lists: string[] | null;
  published_year?: number;
  representative_edition_id?: string | null;
}

export interface StatsData {
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

interface StatsLog {
  id?: string;
  log_type: string;
  work_id?: string | null;
  volume_id?: string | null;
  edition_set_id?: string | null;
  reading_state?: 'unread' | 'reading' | 'completed' | null;
  rating?: number | null;
  liked?: boolean | null;
  created_at: string;
}

interface StatsWork {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  lists: string[] | null;
  representative_edition_id?: string | null;
  published_year?: number;
}

interface StatsEdition {
  id: string;
  work_id: string;
  publisher: string | null;
  cover_url?: string | null;
  page_count?: number | null;
}

export interface RawStatsData {
  logs: StatsLog[];
  works: StatsWork[];
  editions: StatsEdition[];
  seriesTotal: number;
}

export const COUNTRY_MAPPING: Record<string, string> = {
  '한국': 'South Korea', '일본': 'Japan', '러시아': 'Russia', '미국': 'United States of America',
  '영국': 'United Kingdom', '프랑스': 'France', '독일': 'Germany', '중국': 'China',
  '이탈리아': 'Italy', '스페인': 'Spain', '그리스': 'Greece', '오스트리아': 'Austria',
  '브라질': 'Brazil', '인도': 'India', '캐나다': 'Canada', '노르웨이': 'Norway', '스웨덴': 'Sweden',
  '콜롬비아': 'Colombia', '체코': 'Czechia', '아일랜드': 'Ireland', '포르투갈': 'Portugal', '아르헨티나': 'Argentina',
  '칠레': 'Chile', '멕시코': 'Mexico', '페루': 'Peru', '쿠바': 'Cuba', '폴란드': 'Poland', '헝가리': 'Hungary',
  '루마니아': 'Romania', '우크라이나': 'Ukraine', '튀르키예': 'Turkey', '터키': 'Turkey',
  '네덜란드': 'Netherlands', '벨기에': 'Belgium', '스위스': 'Switzerland', '덴마크': 'Denmark', '핀란드': 'Finland',
  '아이슬란드': 'Iceland', '알바니아': 'Albania', '이스라엘': 'Israel', '이란': 'Iran', '이집트': 'Egypt',
  '나이지리아': 'Nigeria', '남아프리카': 'South Africa', '호주': 'Australia', '뉴질랜드': 'New Zealand',
  '베트남': 'Vietnam', '대만': 'Taiwan', '인도네시아': 'Indonesia',
};

/** 분류 태그에서 나라를 찾는다. '인도네시아'처럼 다른 이름을 품은 경우 긴 이름을 쓴다. */
export function findCountry(tags: string[]): string | undefined {
  const hits = Object.keys(COUNTRY_MAPPING).filter(k => tags.some(t => t.includes(k)));
  return hits.find(k => !hits.some(other => other !== k && other.includes(k)));
}

const KOR_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

export function computeStats(rawData: RawStatsData, yearFilter: YearFilter): StatsData {
  const { logs, works, editions, seriesTotal } = rawData;
  const editionMap = new Map(editions.map(e => [e.id, e]));

  const workWithCoverLookup = works.reduce<Record<string, WorkWithCover>>((acc, w) => {
    const repEdition = editions.find(e => e.id === w.representative_edition_id);
    const firstEdition = editions.find(e => e.work_id === w.id);
    acc[w.id] = { ...w, displayCover: repEdition?.cover_url || firstEdition?.cover_url || '' };
    return acc;
  }, {});

  const filterByYear = (log: StatsLog) =>
    yearFilter === 'all' || new Date(log.created_at).getFullYear() === yearFilter;

  const completionLogs = logs.filter(l => l.log_type === 'set_completion');
  const completionLogsForPeriod = completionLogs.filter(filterByYear);

  const editionSetTotalCounts: Record<string, number> = {};
  editions.forEach(e => {
    const setKey = `${e.work_id}::${e.publisher || 'unknown'}`;
    editionSetTotalCounts[setKey] = (editionSetTotalCounts[setKey] || 0) + 1;
  });

  const completedVolumesPerSet: Record<string, Set<string>> = {};
  const completedEditionIds = new Set<string>();

  logs.forEach(log => {
    if (log.log_type !== 'volume' || log.reading_state !== 'completed' || !log.volume_id) return;
    const editionId = log.volume_id.replace('vol-', '');
    const edition = editionMap.get(editionId);
    if (!edition) return;
    completedEditionIds.add(editionId);
    const setKey = `${edition.work_id}::${edition.publisher || 'unknown'}`;
    if (!completedVolumesPerSet[setKey]) completedVolumesPerSet[setKey] = new Set();
    completedVolumesPerSet[setKey].add(editionId);
  });

  const allReadWorkIds = new Set<string>();
  Object.entries(completedVolumesPerSet).forEach(([setKey, editionIds]) => {
    if (editionIds.size === editionSetTotalCounts[setKey]) allReadWorkIds.add(setKey.split('::')[0]);
  });
  completionLogs.forEach(log => { if (log.work_id) allReadWorkIds.add(log.work_id); });

  const periodReadWorkIds = yearFilter === 'all'
    ? allReadWorkIds
    : new Set(completionLogsForPeriod.map(l => l.work_id).filter((id): id is string => Boolean(id)));

  const totalWorks = periodReadWorkIds.size;
  const completionYears = Array.from(new Set(
    completionLogs.map(l => new Date(l.created_at).getFullYear())
  ));

  const periodCompletedEditionIds = yearFilter === 'all'
    ? completedEditionIds
    : new Set<string>(
        logs
          .filter(l => l.log_type === 'volume' && l.reading_state === 'completed' && filterByYear(l) && l.volume_id)
          .map(l => l.volume_id!.replace('vol-', ''))
      );

  const totalPages = Array.from(periodCompletedEditionIds).reduce(
    (acc, id) => acc + (editionMap.get(id)?.page_count || 0), 0
  );
  const yearsWithData = completionYears.length || 1;
  const annualAvg = yearFilter === 'all' ? Number((totalWorks / yearsWithData).toFixed(1)) : totalWorks;
  const avgPagesPerBook = totalWorks > 0 ? Math.round(totalPages / totalWorks) : 0;

  // 한 권짜리 판본은 별점·인생책을 권 기록에 남긴다(자동 생성된 세트 기록은 비어 있음)
  const volumeReviewBySet = new Map<string, { rating: number | null; liked: boolean }>();
  logs.forEach(log => {
    if (log.log_type !== 'volume' || log.reading_state !== 'completed' || !log.edition_set_id) return;
    volumeReviewBySet.set(log.edition_set_id, { rating: log.rating ?? null, liked: !!log.liked });
  });
  const reviewOf = (log: StatsLog) => {
    const own = { rating: log.rating ?? null, liked: !!log.liked };
    if (!log.edition_set_id || editionSetTotalCounts[log.edition_set_id] !== 1) return own;
    const vol = volumeReviewBySet.get(log.edition_set_id);
    return vol ? { rating: own.rating ?? vol.rating, liked: own.liked || vol.liked } : own;
  };
  const periodReviews = completionLogsForPeriod.map(reviewOf);

  const validRatings = periodReviews.map(r => r.rating ?? 0).filter(r => r > 0);
  const avgRating = validRatings.length
    ? (validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length).toFixed(1)
    : '0.0';
  const lifeBookCount = periodReviews.filter(r => r.liked).length;

  const seriesCompletedCount = logs.filter(l => l.log_type === 'series_completion' && filterByYear(l)).length;
  const seriesCompletionRate = seriesTotal > 0 ? Math.round((seriesCompletedCount / seriesTotal) * 100) : 0;

  const ratingDist = [1,2,3,4,5].map(r => ({
    rating: `${r}점`,
    count: validRatings.filter(v => Math.floor(v) === r).length,
  }));

  const monthCounts: Record<number, number> = {};
  completionLogsForPeriod.forEach(l => {
    const month = new Date(l.created_at).getMonth();
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  });
  const monthlyDist = KOR_MONTHS.map((month, index) => ({ month, count: monthCounts[index] || 0 }));

  const authorCounts: Record<string, number> = {};
  periodReadWorkIds.forEach(id => {
    const w = workWithCoverLookup[id];
    if (w?.author) authorCounts[w.author] = (authorCounts[w.author] || 0) + 1;
  });
  const authorDist = Object.entries(authorCounts).map(([name,count]) => ({name,count})).sort((a,b)=>b.count-a.count);

  const genreCounts: Record<string, number> = {};
  periodReadWorkIds.forEach(id => {
    const genre = workWithCoverLookup[id]?.genre;
    if (!genre) return;
    genre.split(',').map(t=>t.trim()).filter(Boolean).forEach(tag => {
      genreCounts[tag] = (genreCounts[tag] || 0) + 1;
    });
  });
  const totalGenreEntries = Object.values(genreCounts).reduce((s,n)=>s+n,0) || 1;
  const genreDist = Object.entries(genreCounts)
    .map(([genre,count]) => ({genre,count,percent:Math.round((count/totalGenreEntries)*100)}))
    .sort((a,b)=>b.count-a.count);

  const publisherCounts: Record<string, number> = {};
  completionLogsForPeriod.forEach(l => {
    const pub = (l.edition_set_id || '').split('::')[1] || '';
    if (pub) publisherCounts[pub] = (publisherCounts[pub] || 0) + 1;
  });
  const publisherDist = Object.entries(publisherCounts).map(([publisher,count])=>({publisher,count})).sort((a,b)=>b.count-a.count);

  const countryDataMap: Record<string, { works: WorkWithCover[] }> = {};
  periodReadWorkIds.forEach(id => {
    const w = workWithCoverLookup[id];
    if (!w) return;
    const tags = (w.genre || '').split(',').map(t=>t.trim());
    const found = findCountry(tags) || '미분류';
    (countryDataMap[found] ??= { works: [] }).works.push(w);
  });

  const targetTitle = '노벨 연구소 선정 최고의 책';
  const nobelBestBooks = works
    .filter(w => Array.isArray(w.lists) ? w.lists.includes(targetTitle) : false)
    .map(w => ({ ...workWithCoverLookup[w.id], ...w, displayCover: workWithCoverLookup[w.id]?.displayCover || '' }));
  const readNobelCount = nobelBestBooks.filter(w => allReadWorkIds.has(w.id)).length;
  const challengeTotal = nobelBestBooks.length || 100;

  return {
    totalWorks, annualAvg, totalPages, avgPagesPerBook, avgRating, lifeBookCount,
    seriesCompletionRate, seriesCompletedCount, seriesTotalCount: seriesTotal,
    ratingDist, monthlyDist, authorDist, genreDist, publisherDist, countryDataMap,
    nobelBestBooks, readWorkIds: allReadWorkIds,
    challenge: { read: readNobelCount, total: challengeTotal, percent: Math.round((readNobelCount/challengeTotal)*100) },
    allCompletedWorks: Array.from(allReadWorkIds).map(id=>workWithCoverLookup[id]).filter((w): w is WorkWithCover => Boolean(w)),
    completionYears,
  };
}
