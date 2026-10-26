import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, PageHeader } from '../components/layout/Page';
import { BookCover } from '../components/ui/BookCover';
import { ProgressBar } from '../components/ui/ProgressBar';
import { EmptyState, ErrorState, PageLoader } from '../components/ui/States';
import { StatFigure } from '../components/stats/StatFigure';
import { MonthlyChart, MonthlyTable } from '../components/stats/MonthlyChart';
import { BarList } from '../components/stats/BarList';
import { LiteraryMap, MapLegend } from '../components/stats/LiteraryMap';
import { rampColor } from '../components/stats/mapScale';
import { computeStats, type RawStatsData, type YearFilter } from '../domain/stats/computeStats';
import { useLogStore } from '../store/logStore';
import { useAuthStore } from '../store/authStore';
import { useCatalogStore } from '../store/catalogStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const OCHRE = 'var(--color-ink)';
const INK_MUTED = 'var(--color-map-3)';

export function StatsPage() {
  useDocumentTitle('독서 통계');
  const { volumeLogs, setCompletionLogs, seriesCompletionLogs, hasLoaded } = useLogStore();
  const { works, series, status, load, reload } = useCatalogStore();
  const { session, ready } = useAuthStore();
  const [params, setParams] = useSearchParams();
  const [showTable, setShowTable] = useState(false);
  const [country, setCountry] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 스토어의 기록과 카탈로그를 계산 함수가 받는 행 모양으로 맞춘다
  const raw = useMemo<RawStatsData>(() => ({
    logs: [
      ...volumeLogs.map((l) => ({
        id: l.id, log_type: 'volume', work_id: l.workId, volume_id: l.volumeId, edition_set_id: l.editionSetId,
        reading_state: l.readingState, rating: l.rating, liked: l.liked, created_at: l.createdAt,
      })),
      ...setCompletionLogs.map((l) => ({
        id: l.id, log_type: 'set_completion', work_id: l.workId, volume_id: null, edition_set_id: l.editionSetId,
        rating: l.rating, liked: l.liked, created_at: l.createdAt,
      })),
      ...seriesCompletionLogs.map((l) => ({
        id: l.id, log_type: 'series_completion', work_id: null, rating: l.rating, liked: l.liked, created_at: l.createdAt,
      })),
    ],
    works: works.map((w) => ({
      id: w.id, title: w.title, author: w.author, genre: w.genre, lists: w.lists,
      representative_edition_id: w.representative_edition_id, published_year: w.published_year ?? undefined,
    })),
    editions: works.flatMap((w) => w.editions.map((e) => ({
      id: e.id, work_id: w.id, publisher: e.publisher, cover_url: e.cover_url, page_count: e.page_count,
    }))),
    seriesTotal: series.length,
  }), [volumeLogs, setCompletionLogs, seriesCompletionLogs, works, series]);

  const allTime = useMemo(() => computeStats(raw, 'all'), [raw]);
  const allYears = useMemo(() => [...allTime.completionYears].sort((a, b) => b - a), [allTime]);
  const requested = Number(params.get('year'));
  const year: YearFilter = allYears.includes(requested) ? requested : 'all';
  const stats = useMemo(() => (year === 'all' ? allTime : computeStats(raw, year)), [raw, year, allTime]);

  if (!ready) return <PageLoader />;

  if (!session) {
    return (
      <Page>
        <PageHeader title="독서 통계" />
        <EmptyState
          title="로그인하면 통계가 보입니다"
          description="완독한 책이 쌓이면 달마다 읽은 양, 별점, 많이 읽은 작가와 나라를 정리해 보여 줍니다."
          action={<Link to="/login" state={{ from: '/stats' }} className="btn btn-primary">로그인</Link>}
        />
      </Page>
    );
  }

  if (!hasLoaded || status === 'idle' || status === 'loading') return <PageLoader />;
  if (status === 'error') {
    return (
      <Page>
        <PageHeader title="독서 통계" />
        <ErrorState onRetry={() => void reload()} />
      </Page>
    );
  }

  if (allTime.totalWorks === 0) {
    return (
      <Page>
        <PageHeader title="독서 통계" />
        <EmptyState
          title="아직 완독한 책이 없습니다"
          description="한 권을 끝까지 읽고 ‘완독’으로 표시하면 여기서부터 통계가 쌓입니다."
          action={<Link to="/" className="btn btn-primary">둘러보기</Link>}
        />
      </Page>
    );
  }

  const ratedCount = stats.ratingDist.reduce((s, r) => s + r.count, 0);
  // 맨 위 '완독'은 작품 수, 달별 그래프는 완독 기록 수다. 같은 작품을 다른 판본으로 또 읽으면 둘이 달라지므로 그 차이를 밝힌다.
  const completionCount = stats.monthlyDist.reduce((s, m) => s + m.count, 0);
  const rereadNote = completionCount > stats.totalWorks ? `, 다른 판본으로 다시 읽은 책까지 ${completionCount}번` : '';
  const countryCounts = Object.fromEntries(
    Object.entries(stats.countryDataMap).map(([k, v]) => [k, v.works.length]),
  );
  const countryRows = Object.entries(countryCounts).sort((a, b) => (a[0] === '미분류' ? 1 : b[0] === '미분류' ? -1 : b[1] - a[1]));
  const mapMax = Math.max(0, ...countryRows.filter(([k]) => k !== '미분류').map(([, n]) => n));
  const selectedCountry = country && stats.countryDataMap[country] ? country : null;
  const periodLabel = year === 'all' ? '전체 기간' : `${year}년`;

  return (
    <Page>
      <PageHeader
        title="독서 통계"
        description={`${periodLabel} 완독 기준`}
        actions={
          <div role="group" aria-label="기간" className="flex flex-wrap items-center gap-0.5 rounded-control bg-paper-sunken p-[3px]">
            {(['all', ...allYears] as YearFilter[]).map((y) => {
              const active = y === year;
              return (
                <button
                  key={y}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setCountry(null);
                    const next = new URLSearchParams(params);
                    if (y === 'all') next.delete('year');
                    else next.set('year', String(y));
                    setParams(next, { replace: true });
                  }}
                  className={`tnum h-8 rounded-[4px] px-3.5 text-[13.5px] font-medium transition-colors coarse:h-[38px] coarse:px-4 ${
                    active ? 'bg-paper-raised text-ink ring-1 ring-inset ring-line-strong' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {y === 'all' ? '전체' : `${y}`}
                </button>
              );
            })}
          </div>
        }
      />

      {/* 핵심 숫자 */}
      <dl className="well mb-12 grid grid-cols-2 gap-x-6 px-5 sm:grid-cols-3 sm:px-6 xl:grid-cols-6">
        <StatFigure
          hero
          label="완독"
          value={stats.totalWorks}
          unit="권"
          sub={year === 'all' ? `한 해 평균 ${stats.annualAvg.toFixed(1)}권` : `${year}년 한 해`}
        />
        <StatFigure label="읽은 쪽수" value={stats.totalPages.toLocaleString()} unit="쪽" sub={`한 권에 평균 ${stats.avgPagesPerBook.toLocaleString()}쪽`} />
        <StatFigure label="평균 별점" value={ratedCount ? stats.avgRating : '없음'} unit={ratedCount ? '점' : undefined} sub={`별점을 남긴 책 ${ratedCount}권`} />
        <StatFigure label="인생책" value={stats.lifeBookCount} unit="권" sub="하트를 누른 책" />
        <StatFigure
          label="시리즈 완주"
          value={`${stats.seriesCompletedCount}`}
          unit={`/ ${stats.seriesTotalCount}`}
          sub={`서가 시리즈의 ${stats.seriesCompletionRate}%`}
        />
        <StatFigure label="노벨 연구소 100선" value={stats.challenge.read} unit={`/ ${stats.challenge.total}`} sub={`${stats.challenge.percent}% 읽음`} />
      </dl>

      <div className="grid gap-x-10 gap-y-14 xl:grid-cols-12 2xl:gap-x-14">
        <Card
          className="xl:col-span-8"
          title="달마다 완독한 책"
          subtitle={`${year === 'all' ? '모든 해를 달별로 합친 수' : `${year}년`}${rereadNote}`}
          action={
            <button type="button" onClick={() => setShowTable((v) => !v)} className="btn btn-ghost btn-sm -mr-2" aria-pressed={showTable}>
              {showTable ? '그래프로 보기' : '표로 보기'}
            </button>
          }
        >
          {showTable ? <MonthlyTable data={stats.monthlyDist} /> : <MonthlyChart data={stats.monthlyDist} />}
        </Card>

        <Card className="xl:col-span-4" title="별점" subtitle={ratedCount ? `별점을 남긴 ${ratedCount}권` : '아직 남긴 별점이 없습니다'}>
          <BarList
            color={OCHRE}
            labelWidth="3rem"
            items={[...stats.ratingDist].reverse().map((r) => ({ key: r.rating, label: r.rating, value: r.count }))}
          />
          {ratedCount < stats.totalWorks && (
            <p className="mt-4 text-[12.5px] text-ink-muted">별점 없이 완독한 책 {stats.totalWorks - ratedCount}권은 빼고 셉니다.</p>
          )}
        </Card>

        <Card className="xl:col-span-4" title="많이 읽은 작가">
          <BarList
            ranked
            color={INK_MUTED}
            items={stats.authorDist.slice(0, 6).map((a) => ({ key: a.name, label: a.name, value: a.count, to: `/author/${encodeURIComponent(a.name)}` }))}
          />
        </Card>

        <Card className="xl:col-span-4" title="분류" subtitle="작품에 붙은 분류 태그 기준">
          <BarList
            color={INK_MUTED}
            items={stats.genreDist.slice(0, 7).map((g) => ({ key: g.genre, label: g.genre, value: g.count, to: `/?tag=${encodeURIComponent(g.genre)}` }))}
          />
        </Card>

        <Card className="xl:col-span-4" title="출판사" subtitle="여러 판본 가운데 고른 곳">
          <BarList
            color={INK_MUTED}
            items={stats.publisherDist.slice(0, 6).map((p) => ({ key: p.publisher, label: p.publisher, value: p.count }))}
          />
        </Card>

        <Card className="xl:col-span-8" title="원작의 나라" subtitle="지도나 목록에서 나라를 고르면 그 나라의 책이 보입니다" action={mapMax > 0 ? <MapLegend max={mapMax} /> : undefined}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_200px]">
            <LiteraryMap counts={countryCounts} selected={selectedCountry} onSelect={(c) => setCountry((cur) => (cur === c ? null : c))} />
            <ol className="space-y-0.5 self-start" aria-label="나라별 완독 수">
              {countryRows.map(([name, count]) => {
                const active = selectedCountry === name;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCountry(active ? null : name)}
                      className={`flex w-full items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left text-[13.5px] transition-colors coarse:py-3 ${
                        active ? 'bg-paper-sunken font-semibold text-ink' : 'text-ink-soft hover:bg-paper-sunken/70'
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: name === '미분류' ? 'transparent' : rampColor(count, mapMax), boxShadow: name === '미분류' ? 'inset 0 0 0 1px var(--color-rule-strong)' : undefined }}
                      />
                      <span className="min-w-0 flex-1 truncate">{name === '미분류' ? '나라 정보 없음' : name}</span>
                      <span className="tnum text-ink-muted">{count}권</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {selectedCountry && (
            <div className="animate-fade-in mt-6 border-t border-line pt-5">
              <p className="mb-3 text-[14px] font-semibold text-ink">
                {selectedCountry === '미분류' ? '나라 정보 없음' : selectedCountry}
                <span className="tnum ml-2 font-normal text-ink-muted">{stats.countryDataMap[selectedCountry].works.length}권</span>
              </p>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-3">
                {stats.countryDataMap[selectedCountry].works.map((w) => (
                  <li key={w.id}>
                    <Link to={`/book/${w.id}`} title={w.title} className="group block">
                      <BookCover src={w.displayCover} alt={w.title} title={w.title} className="lift w-full" />
                      <span className="mt-1.5 block truncate text-[12px] text-ink-soft">{w.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-4" title="노벨 연구소 선정 100선" subtitle="서가에 이 목록으로 등록된 작품 기준">
          <div className="flex items-baseline gap-1.5">
            <span className="tnum font-serif text-[40px] font-bold leading-none tracking-[-0.035em] text-ink">{stats.challenge.read}</span>
            <span className="tnum text-[15px] text-ink-muted">/ {stats.challenge.total}권</span>
            <span className="tnum ml-auto text-[15px] font-bold text-ink">{stats.challenge.percent}%</span>
          </div>
          <ProgressBar value={stats.challenge.percent} tone="completed" className="mt-3 h-2" label="100선 읽은 비율" />
          {stats.nobelBestBooks.length > 0 && (
            <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-2">
              {stats.nobelBestBooks.map((w) => {
                const read = stats.readWorkIds.has(w.id);
                return (
                  <li key={w.id}>
                    <Link to={`/book/${w.id}`} title={`${w.title}${read ? ', 읽음' : ''}`} className="group block">
                      <BookCover
                        src={w.displayCover}
                        alt={w.title}
                        title={w.title}
                        className={`w-full transition-[filter,opacity] ${read ? '' : 'opacity-35 grayscale group-hover:opacity-80 group-hover:grayscale-0'}`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-[12.5px] text-ink-muted">흐린 표지는 아직 읽지 않은 책입니다.</p>
        </Card>
      </div>
    </Page>
  );
}

function Card({ title, subtitle, action, className = '', children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col ${className}`}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-ink pb-2.5">
        <div className="min-w-0">
          <h2 className="font-serif text-[22px] font-bold leading-tight tracking-[-0.03em] text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  );
}
