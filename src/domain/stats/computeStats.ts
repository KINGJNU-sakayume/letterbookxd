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
};

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

  const validRatingLogs = completionLogsForPeriod.filter(l => (l.rating ?? 0) > 0);
  const avgRating = validRatingLogs.length
    ? (validRatingLogs.reduce((sum, l) => sum + (l.rating ?? 0), 0) / validRatingLogs.length).toFixed(1)
    : '0.0';
  const lifeBookCount = completionLogsForPeriod.filter(l => l.liked).length;

  const seriesCompletedCount = logs.filter(l => l.log_type === 'series_completion' && filterByYear(l)).length;
  const seriesCompletionRate = seriesTotal > 0 ? Math.round((seriesCompletedCount / seriesTotal) * 100) : 0;

  const ratingDist = [1,2,3,4,5].map(r => ({
    rating: `${r}점`,
    count: validRatingLogs.filter(l => Math.floor(l.rating ?? 0) === r).length,
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
    const found = Object.keys(COUNTRY_MAPPING).find(k => tags.some(t => t.includes(k))) || '미분류';
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
