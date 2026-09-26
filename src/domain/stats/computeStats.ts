export type YearFilter = 'all' | number;

export interface WorkWithCover {
  id: string;
  title: string;
  author: string;
  displayCover: string;
  genre: string | null;
  lists: string[] | null;
  published_year?: number;
  [key: string]: unknown;
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

interface RawStatsData {
  logs: Array<Record<string, unknown>>;
  works: Array<Record<string, unknown>>;
  editions: Array<Record<string, unknown>>;
  seriesTotal: number;
}

const COUNTRY_MAPPING: Record<string, string> = {
  '한국': 'South Korea', '일본': 'Japan', '러시아': 'Russia', '미국': 'United States of America',
  '영국': 'United Kingdom', '프랑스': 'France', '독일': 'Germany', '중국': 'China',
  '이탈리아': 'Italy', '스페인': 'Spain', '그리스': 'Greece', '오스트리아': 'Austria',
  '브라질': 'Brazil', '인도': 'India', '캐나다': 'Canada', '노르웨이': 'Norway', '스웨덴': 'Sweden',
};

const KOR_MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function yearOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
}

function matchesYear(log: Record<string, unknown>, yearFilter: YearFilter): boolean {
  return yearFilter === 'all' || yearOf(log.created_at) === yearFilter;
}

function isCompletedVolume(log: Record<string, unknown>): boolean {
  return log.log_type === 'volume' &&
    (log.reading_state === 'completed' || (log.reading_state == null && log.watched === true));
}

export function computeStats(rawData: RawStatsData, yearFilter: YearFilter): StatsData {
  const { logs, works, editions, seriesTotal } = rawData;

  const editionMap = new Map<string, Record<string, unknown>>(
    editions.map(e => [String(e.id), e])
  );

  const workWithCoverLookup: Record<string, WorkWithCover> = {};
  for (const rawWork of works) {
    const id = String(rawWork.id);
    const repEdition = editions.find(e => e.id === rawWork.representative_edition_id);
    const firstEdition = editions.find(e => e.work_id === rawWork.id);
    workWithCoverLookup[id] = {
      ...rawWork,
      id,
      title: String(rawWork.title ?? ''),
      author: String(rawWork.author ?? ''),
      genre: typeof rawWork.genre === 'string' ? rawWork.genre : null,
      lists: Array.isArray(rawWork.lists) ? rawWork.lists.map(String) : null,
      displayCover: String(repEdition?.cover_url ?? firstEdition?.cover_url ?? ''),
    } as WorkWithCover;
  }

  const completionLogs = logs.filter(log => log.log_type === 'set_completion');
  const completionLogsForPeriod = completionLogs.filter(log => matchesYear(log, yearFilter));

  const completionYears = Array.from(new Set(
    completionLogs
      .map(log => yearOf(log.created_at))
      .filter((year): year is number => year !== null)
  ));

  const readWorkIds = new Set<string>(
    completionLogsForPeriod
      .map(log => String(log.work_id ?? ''))
      .filter(Boolean)
  );

  const allReadWorkIds = new Set<string>(
    completionLogs
      .map(log => String(log.work_id ?? ''))
      .filter(Boolean)
  );

  const completedVolumeLogs = logs.filter(isCompletedVolume);
  const completedVolumeLogsForPeriod = yearFilter === 'all'
    ? completedVolumeLogs
    : completedVolumeLogs.filter(log => {
        const workId = String(log.work_id ?? '');
        return readWorkIds.has(workId);
      });

  const readEditionIds = new Set<string>();
  for (const log of completedVolumeLogsForPeriod) {
    if (!log.volume_id) continue;
    readEditionIds.add(String(log.volume_id).replace(/^vol-/, ''));
  }

  const totalWorks = readWorkIds.size;
  const totalPages = Array.from(readEditionIds).reduce((sum, editionId) => {
    const pageCount = Number(editionMap.get(editionId)?.page_count ?? 0);
    return sum + (Number.isFinite(pageCount) ? pageCount : 0);
  }, 0);

  const yearsWithData = completionYears.length || 1;
  const annualAvg = yearFilter === 'all'
    ? parseFloat((totalWorks / yearsWithData).toFixed(1))
    : totalWorks;
  const avgPagesPerBook = totalWorks > 0 ? Math.round(totalPages / totalWorks) : 0;

  const ratingLogs = logs.filter(log => {
    const rating = Number(log.rating ?? 0);
    return rating > 0 && matchesYear(log, yearFilter);
  });
  const avgRating = ratingLogs.length > 0
    ? (ratingLogs.reduce((sum, log) => sum + Number(log.rating ?? 0), 0) / ratingLogs.length).toFixed(1)
    : '0.0';

  const lifeBookCount = completionLogsForPeriod.filter(log => log.liked === true).length;

  const seriesCompletionLogs = logs.filter(log => log.log_type === 'series_completion');
  const seriesCompletedCount = yearFilter === 'all'
    ? seriesCompletionLogs.length
    : seriesCompletionLogs.filter(log => matchesYear(log, yearFilter)).length;
  const seriesCompletionRate = seriesTotal > 0
    ? Math.round((seriesCompletedCount / seriesTotal) * 100)
    : 0;

  const ratingDist = [1, 2, 3, 4, 5].map(rating => ({
    rating: `${rating}점`,
    count: ratingLogs.filter(log => Math.floor(Number(log.rating ?? 0)) === rating).length,
  }));

  const monthCounts: Record<number, number> = {};
  for (const log of completionLogsForPeriod) {
    const date = new Date(String(log.created_at));
    const month = date.getMonth();
    if (!Number.isNaN(month)) monthCounts[month] = (monthCounts[month] ?? 0) + 1;
  }
  const monthlyDist = KOR_MONTHS.map((month, idx) => ({ month, count: monthCounts[idx] ?? 0 }));

  const authorCounts: Record<string, number> = {};
  readWorkIds.forEach(workId => {
    const author = workWithCoverLookup[workId]?.author;
    if (author) authorCounts[author] = (authorCounts[author] ?? 0) + 1;
  });
  const authorDist = Object.entries(authorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const genreCounts: Record<string, number> = {};
  readWorkIds.forEach(workId => {
    const genre = workWithCoverLookup[workId]?.genre;
    if (!genre) return;
    genre.split(',').map(tag => tag.trim()).filter(Boolean).forEach(tag => {
      genreCounts[tag] = (genreCounts[tag] ?? 0) + 1;
    });
  });
  const totalGenreEntries = Object.values(genreCounts).reduce((sum, count) => sum + count, 0) || 1;
  const genreDist = Object.entries(genreCounts)
    .map(([genre, count]) => ({ genre, count, percent: Math.round((count / totalGenreEntries) * 100) }))
    .sort((a, b) => b.count - a.count);

  const publisherCounts: Record<string, number> = {};
  completionLogsForPeriod.forEach(log => {
    const setId = String(log.edition_set_id ?? '');
    const publisher = setId.split('::')[1] ?? '';
    if (publisher) publisherCounts[publisher] = (publisherCounts[publisher] ?? 0) + 1;
  });
  const publisherDist = Object.entries(publisherCounts)
    .map(([publisher, count]) => ({ publisher, count }))
    .sort((a, b) => b.count - a.count);

  const countryDataMap: Record<string, { works: WorkWithCover[] }> = {};
  readWorkIds.forEach(workId => {
    const work = workWithCoverLookup[workId];
    if (!work) return;
    const tags = work.genre?.split(',').map(tag => tag.trim()) ?? [];
    let found = '미분류';
    for (const tag of tags) {
      const match = Object.keys(COUNTRY_MAPPING).find(country => tag.includes(country));
      if (match) {
        found = match;
        break;
      }
    }
    (countryDataMap[found] ??= { works: [] }).works.push(work);
  });

  const targetTitle = '노벨 연구소 선정 최고의 책';
  const nobelBestBooks = works
    .filter(work => Array.isArray(work.lists)
      ? work.lists.map(String).includes(targetTitle)
      : String(work.lists ?? '').includes(targetTitle))
    .map(work => {
      const id = String(work.id);
      return { ...workWithCoverLookup[id], ...work, displayCover: workWithCoverLookup[id]?.displayCover ?? '' } as WorkWithCover;
    });

  const readNobelCount = nobelBestBooks.filter(work => allReadWorkIds.has(work.id)).length;
  const challengeTotal = nobelBestBooks.length || 100;

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
    readWorkIds,
    challenge: {
      read: readNobelCount,
      total: challengeTotal,
      percent: Math.round((readNobelCount / challengeTotal) * 100),
    },
    allCompletedWorks: Array.from(allReadWorkIds)
      .map(id => workWithCoverLookup[id])
      .filter((work): work is WorkWithCover => Boolean(work)),
    completionYears,
  };
}
