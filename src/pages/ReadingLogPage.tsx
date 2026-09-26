import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart, Pencil, Search, Trash2, X } from 'lucide-react';
import { Page, PageHeader } from '../components/layout/Page';
import { BookCover } from '../components/ui/BookCover';
import { StarRating } from '../components/ui/StarRating';
import { LikeButton } from '../components/ui/LikeButton';
import { Dialog } from '../components/ui/Dialog';
import { useConfirm } from '../components/ui/confirm';
import { EmptyState, PageLoader } from '../components/ui/States';
import { useLogStore } from '../store/logStore';
import { useAuthStore } from '../store/authStore';
import { useCatalogStore } from '../store/catalogStore';
import { toast } from '../store/toastStore';
import { parseEditionSetId, parseVolumeId } from '../utils/editionUtils';
import { compareKo, volumeLabel, WEEKDAYS } from '../utils/format';
import { matchesQuery } from '../lib/hangul';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Kind = 'volume' | 'set' | 'series' | 'reading';
type SortOption = 'date' | 'rating' | 'author';

const KIND_LABEL: Record<Kind, string> = {
  volume: '완독',
  set: '전권 완독',
  series: '시리즈 완주',
  reading: '읽는 중',
};
const SORT_LABEL: Record<SortOption, string> = { date: '날짜순', rating: '별점 높은순', author: '작가순' };

interface Entry {
  id: string;
  kind: Kind;
  createdAt: string;
  date: Date;
  to: string;
  title: string;
  author: string;
  publisher: string;
  volume: string;
  cover: string | null;
  rating: number | null;
  liked: boolean;
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 시간대가 달라도 날짜가 밀리지 않도록 그날 정오로 저장한다 */
function fromDateInput(value: string): string | null {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export function ReadingLogPage() {
  useDocumentTitle('독서 기록');
  const { volumeLogs, setCompletionLogs, seriesCompletionLogs, hasLoaded, updateLogMetadata, deleteLogById } = useLogStore();
  const { works, series, status, load } = useCatalogStore();
  const { session, ready } = useAuthStore();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Entry | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo<Entry[]>(() => {
    const workById = new Map(works.map((w) => [w.id, w]));
    const seriesById = new Map(series.map((s) => [s.id, s]));
    const out: Entry[] = [];

    for (const log of volumeLogs) {
      if (log.readingState === 'unread') continue;
      const work = workById.get(log.workId);
      const edition = work?.editions.find((e) => e.id === parseVolumeId(log.volumeId));
      const publisher = edition?.publisher || parseEditionSetId(log.editionSetId).publisher;
      const setSize = work?.editions.filter((e) => e.publisher === publisher).length ?? 1;
      out.push({
        id: log.id,
        kind: log.readingState === 'reading' ? 'reading' : 'volume',
        createdAt: log.createdAt,
        date: new Date(log.createdAt),
        to: `/book/${log.workId}`,
        title: work?.title ?? '알 수 없는 작품',
        author: work?.author ?? '',
        publisher,
        volume: setSize > 1 ? volumeLabel(edition?.volume_number) : '',
        cover: edition?.cover_url || work?.cover || null,
        rating: log.rating,
        liked: log.liked,
      });
    }

    for (const log of setCompletionLogs) {
      const work = workById.get(log.workId);
      const { publisher } = parseEditionSetId(log.editionSetId);
      const setEditions = work?.editions.filter((e) => e.publisher === publisher) ?? [];
      // 한 권짜리 판본은 권 기록이 곧 완독 기록이다
      if (setEditions.length <= 1) continue;
      out.push({
        id: log.id,
        kind: 'set',
        createdAt: log.createdAt,
        date: new Date(log.createdAt),
        to: `/book/${log.workId}`,
        title: work?.title ?? '알 수 없는 작품',
        author: work?.author ?? '',
        publisher,
        volume: `전${setEditions.length}권`,
        cover: setEditions[0]?.cover_url || work?.cover || null,
        rating: log.rating,
        liked: log.liked,
      });
    }

    for (const log of seriesCompletionLogs) {
      const s = seriesById.get(log.seriesId);
      out.push({
        id: log.id,
        kind: 'series',
        createdAt: log.createdAt,
        date: new Date(log.createdAt),
        to: `/series/${log.seriesId}`,
        title: s?.title ?? '알 수 없는 시리즈',
        author: s?.author ?? '',
        publisher: '',
        volume: s ? `${s.workIds.length}부작` : '',
        cover: s?.cover ?? null,
        rating: log.rating,
        liked: log.liked,
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [volumeLogs, setCompletionLogs, seriesCompletionLogs, works, series]);

  // ---- 필터 ----
  const year = Number(params.get('year')) || null;
  const minRating = Number(params.get('min')) || null;
  const kind = (['volume', 'set', 'series', 'reading'] as Kind[]).find((k) => k === params.get('kind')) ?? null;
  const author = params.get('author') ?? '';
  const query = params.get('q') ?? '';
  const sort: SortOption = (['rating', 'author'] as const).find((s) => s === params.get('sort')) ?? 'date';
  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  }

  const years = useMemo(() => {
    const counts = new Map<number, number>();
    entries.forEach((e) => counts.set(e.date.getFullYear(), (counts.get(e.date.getFullYear()) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[0] - a[0]);
  }, [entries]);
  const authors = useMemo(
    () => Array.from(new Set(entries.map((e) => e.author).filter(Boolean))).sort(compareKo),
    [entries],
  );

  const filtered = useMemo(() => {
    const rows = entries.filter(
      (e) =>
        (!year || e.date.getFullYear() === year) &&
        (!minRating || (e.rating ?? 0) >= minRating) &&
        (!kind || e.kind === kind) &&
        (!author || e.author === author) &&
        (!query || matchesQuery(e.title, query) || matchesQuery(e.author, query)),
    );
    if (sort === 'rating') return [...rows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.createdAt.localeCompare(a.createdAt));
    if (sort === 'author') return [...rows].sort((a, b) => compareKo(a.author, b.author) || b.createdAt.localeCompare(a.createdAt));
    return rows;
  }, [entries, year, minRating, kind, author, query, sort]);

  const months = useMemo(() => {
    if (sort !== 'date') return [{ key: 'all', year: 0, month: 0, entries: filtered }];
    const map = new Map<string, Entry[]>();
    filtered.forEach((e) => {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      year: list[0].date.getFullYear(),
      month: list[0].date.getMonth() + 1,
      entries: list,
    }));
  }, [filtered, sort]);

  const hasFilters = !!(year || minRating || kind || author || query);

  async function remove(entry: Entry) {
    const ok = await confirm({
      title: '이 기록을 지울까요?',
      description:
        entry.kind === 'series'
          ? '시리즈 완주 기록이 지워집니다. 작품별 기록은 그대로 남습니다.'
          : entry.kind === 'set'
            ? '전권 완독 기록과 해당 시리즈의 완주 기록이 지워집니다. 권별 기록은 남습니다.'
            : '이 권의 기록과 함께, 이 판본의 전권 완독·시리즈 완주 기록도 지워집니다.',
      confirmLabel: '지우기',
      tone: 'danger',
    });
    if (!ok) return false;
    const done = await deleteLogById(entry.id);
    toast(done ? '기록을 지웠습니다.' : '기록을 지우지 못했습니다.', done ? 'default' : 'error');
    return done;
  }

  if (!ready) return <PageLoader />;

  if (!session) {
    return (
      <Page>
        <PageHeader title="독서 기록" />
        <EmptyState
          className="border-t-0 pt-2"
          title="로그인하면 독서 기록이 보입니다"
          description="완독한 날짜와 별점이 달력처럼 쌓입니다."
          action={<Link to="/login" state={{ from: '/reading-log' }} className="btn btn-primary">로그인</Link>}
        />
      </Page>
    );
  }

  if (!hasLoaded || status === 'idle' || status === 'loading') return <PageLoader />;

  const completedCount = entries.filter((e) => e.kind !== 'reading').length;

  return (
    <Page>
      <PageHeader
        title="독서 기록"
        description={
          <span className="tnum">
            완독 기록 {completedCount}건
            {years.length > 0 && ` · ${years[years.length - 1][0]}년부터`}
          </span>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          className="border-t-0 pt-2"
          title="아직 남긴 기록이 없습니다"
          description="작품 화면에서 권마다 ‘완독’을 누르면 그날 날짜로 기록이 쌓입니다."
          action={<Link to="/" className="btn btn-primary">둘러보기</Link>}
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[200px_minmax(0,1fr)] 2xl:gap-16">
          <aside className="hidden lg:block" aria-label="기록 필터">
            <div className="sticky top-24 space-y-8">
              <FilterList title="연도">
                <FilterItem active={!year} onClick={() => update({ year: null })} count={entries.length}>전체</FilterItem>
                {years.map(([y, n]) => (
                  <FilterItem key={y} active={year === y} onClick={() => update({ year: year === y ? null : String(y) })} count={n}>
                    {y}년
                  </FilterItem>
                ))}
              </FilterList>
              <FilterList title="별점">
                <FilterItem active={!minRating} onClick={() => update({ min: null })}>전체</FilterItem>
                {[5, 4, 3].map((r) => (
                  <FilterItem key={r} active={minRating === r} onClick={() => update({ min: minRating === r ? null : String(r) })}>
                    <span className="inline-flex items-center gap-1.5">
                      <StarRating rating={r} size="xs" readonly />
                      {r < 5 && <span className="text-[12.5px]">이상</span>}
                    </span>
                  </FilterItem>
                ))}
              </FilterList>
              <FilterList title="구분">
                <FilterItem active={!kind} onClick={() => update({ kind: null })}>전체</FilterItem>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <FilterItem
                    key={k}
                    active={kind === k}
                    onClick={() => update({ kind: kind === k ? null : k })}
                    count={entries.filter((e) => e.kind === k).length}
                  >
                    {KIND_LABEL[k]}
                  </FilterItem>
                ))}
              </FilterList>
            </div>
          </aside>

          <section className="min-w-0" aria-label="기록 목록">
            <div className="mb-6 flex flex-wrap items-center gap-2.5">
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[5px] border border-line bg-paper-raised px-3 transition-colors focus-within:border-ink-soft sm:max-w-xs">
                <Search size={15} className="shrink-0 text-ink-faint" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => update({ q: e.target.value || null })}
                  placeholder="제목, 작가로 찾기"
                  aria-label="기록 안에서 찾기"
                  className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button type="button" onClick={() => update({ q: null })} className="rounded p-0.5 text-ink-faint hover:text-ink" aria-label="지우기">
                    <X size={14} />
                  </button>
                )}
              </div>
              <select value={year ?? ''} onChange={(e) => update({ year: e.target.value || null })} aria-label="연도" className="field-select h-10 w-auto py-0 text-[14px] lg:hidden">
                <option value="">모든 연도</option>
                {years.map(([y]) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={kind ?? ''} onChange={(e) => update({ kind: e.target.value || null })} aria-label="구분" className="field-select h-10 w-auto py-0 text-[14px] lg:hidden">
                <option value="">모든 기록</option>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              {authors.length > 1 && (
                <select value={author} onChange={(e) => update({ author: e.target.value || null })} aria-label="작가" className="field-select h-10 w-auto max-w-[14rem] py-0 text-[14px]">
                  <option value="">모든 작가</option>
                  {authors.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              <p className="tnum text-[13.5px] text-ink-muted" aria-live="polite">{filtered.length}건</p>
              {hasFilters && (
                <button type="button" onClick={() => update({ year: null, min: null, kind: null, author: null, q: null })} className="text-[13.5px] text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
                  필터 지우기
                </button>
              )}
              <select value={sort} onChange={(e) => update({ sort: e.target.value === 'date' ? null : e.target.value })} aria-label="정렬" className="field-select ml-auto h-10 w-auto py-0 text-[14px]">
                {(Object.keys(SORT_LABEL) as SortOption[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
              </select>
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="조건에 맞는 기록이 없습니다" description="필터를 하나씩 풀어 보세요." />
            ) : (
              <>
                {/* 넓은 화면: 월별 일지 표 */}
                <table className="hidden w-full border-collapse md:table">
                  <thead>
                    <tr className="border-b border-line text-left text-[12.5px] font-medium text-ink-faint">
                      {sort === 'date' && <th scope="col" className="w-[104px] pb-2.5 font-medium">월</th>}
                      <th scope="col" className="w-16 pb-2.5 pl-4 font-medium">{sort === 'date' ? '일' : '날짜'}</th>
                      <th scope="col" className="pb-2.5 font-medium">작품</th>
                      <th scope="col" className="hidden pb-2.5 font-medium xl:table-cell">판본</th>
                      <th scope="col" className="pb-2.5 font-medium">구분</th>
                      <th scope="col" className="pb-2.5 font-medium">별점</th>
                      <th scope="col" className="w-10 pb-2.5 text-center font-medium"><span className="sr-only">인생책</span><Heart size={13} className="mx-auto" aria-hidden /></th>
                      <th scope="col" className="w-20 pb-2.5"><span className="sr-only">고치기</span></th>
                    </tr>
                  </thead>
                  {months.map((m) => (
                    <tbody key={m.key} className="border-b border-line">
                      {m.entries.map((e, i) => (
                        <tr key={e.id} className="group border-t border-line-soft transition-colors first:border-t-0 hover:bg-paper-raised/80">
                          {sort === 'date' && i === 0 && (
                            <td rowSpan={m.entries.length} className="border-r border-line-soft pr-4 align-top">
                              <div className="sticky top-24 pb-3 pt-3.5">
                                <p className="font-serif text-[28px] font-bold leading-none text-ink">{m.month}월</p>
                                <p className="tnum mt-1.5 text-[12.5px] text-ink-muted">{m.year} · {m.entries.length}건</p>
                              </div>
                            </td>
                          )}
                          <td className="py-2.5 pl-4 align-middle">
                            {sort === 'date' ? (
                              <span className="block leading-none">
                                <span className="tnum font-serif text-[21px] font-bold text-ink-soft">{e.date.getDate()}</span>
                                <span className="mt-1 block text-[11.5px] text-ink-faint">{WEEKDAYS[e.date.getDay()]}요일</span>
                              </span>
                            ) : (
                              <span className="tnum whitespace-nowrap text-[13px] text-ink-muted">
                                {e.date.getFullYear()}. {e.date.getMonth() + 1}. {e.date.getDate()}.
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4">
                            <Link to={e.to} className="flex min-w-0 items-center gap-3.5">
                              <BookCover src={e.cover} alt="" title={e.title} className="w-9 shrink-0" />
                              <span className="min-w-0">
                                <span className="block truncate text-[15px] font-semibold text-ink decoration-line-strong underline-offset-4 hover:underline">{e.title}</span>
                                <span className="block truncate text-[12.5px] text-ink-muted">
                                  {e.author}
                                  <span className="xl:hidden">{e.publisher ? ` · ${e.publisher}` : ''}{e.volume ? ` · ${e.volume}` : ''}</span>
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="hidden py-2.5 pr-4 text-[13.5px] text-ink-muted xl:table-cell">
                            {[e.publisher, e.volume].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="py-2.5 pr-4"><KindTag entry={e} /></td>
                          <td className="py-2.5 pr-4">{e.kind === 'reading' ? <span className="text-ink-faint">—</span> : <StarRating rating={e.rating} size="sm" readonly />}</td>
                          <td className="py-2.5 text-center">{e.liked && <Heart size={14} className="mx-auto fill-seal text-seal" aria-label="인생책" />}</td>
                          <td className="py-2.5 text-right">
                            <span className="inline-flex gap-0.5 text-ink-faint">
                              <button type="button" onClick={() => setEditing(e)} className="btn-icon h-8 w-8" aria-label={`${e.title} 기록 고치기`}>
                                <Pencil size={14} />
                              </button>
                              <button type="button" onClick={() => void remove(e)} className="btn-icon h-8 w-8 hover:text-seal" aria-label={`${e.title} 기록 지우기`}>
                                <Trash2 size={14} />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>

                {/* 좁은 화면: 월별 목록 */}
                <div className="space-y-8 md:hidden">
                  {months.map((m) => (
                    <section key={m.key}>
                      {sort === 'date' && (
                        <h2 className="mb-2 flex items-baseline gap-2 border-b border-line pb-2">
                          <span className="font-serif text-[22px] font-bold text-ink">{m.month}월</span>
                          <span className="tnum text-[12.5px] text-ink-muted">{m.year} · {m.entries.length}건</span>
                        </h2>
                      )}
                      <ul className="divide-y divide-line-soft">
                        {m.entries.map((e) => (
                          <li key={e.id} className="flex items-center gap-3 py-3">
                            <span className="w-9 shrink-0 text-center leading-none">
                              <span className="tnum font-serif text-[18px] font-bold text-ink-soft">{e.date.getDate()}</span>
                              <span className="mt-1 block text-[11px] text-ink-faint">{sort === 'date' ? WEEKDAYS[e.date.getDay()] : `${e.date.getMonth() + 1}월`}</span>
                            </span>
                            <Link to={e.to} className="flex min-w-0 flex-1 items-center gap-3">
                              <BookCover src={e.cover} alt="" title={e.title} className="w-9 shrink-0" />
                              <span className="min-w-0">
                                <span className="block truncate text-[14.5px] font-semibold text-ink">{e.title}</span>
                                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <KindTag entry={e} />
                                  {e.kind !== 'reading' && <StarRating rating={e.rating} size="xs" readonly showEmpty={false} />}
                                  {e.liked && <Heart size={11} className="fill-seal text-seal" aria-label="인생책" />}
                                </span>
                              </span>
                            </Link>
                            <button type="button" onClick={() => setEditing(e)} className="btn-icon h-9 w-9 text-ink-faint" aria-label={`${e.title} 기록 고치기`}>
                              <Pencil size={15} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <EditDialog
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          const ok = await updateLogMetadata(editing.id, patch);
          toast(ok ? '기록을 고쳤습니다.' : '기록을 고치지 못했습니다.', ok ? 'default' : 'error');
          if (ok) setEditing(null);
        }}
        onDelete={async () => {
          if (editing && (await remove(editing))) setEditing(null);
        }}
      />
    </Page>
  );
}

function FilterList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2.5 text-[12.5px] font-medium tracking-[0.02em] text-ink-faint">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function FilterItem({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group relative flex items-center justify-between gap-3 py-[5px] pl-3 text-left text-[14.5px] transition-colors ${
        active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      <span aria-hidden className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full ${active ? 'bg-ink' : 'bg-transparent group-hover:bg-line-strong'}`} />
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="tnum shrink-0 text-[12.5px] font-normal text-ink-faint">{count}</span>}
    </button>
  );
}

function KindTag({ entry }: { entry: Entry }) {
  if (entry.kind === 'reading') {
    return <span className="text-[12.5px] font-medium text-reading">읽는 중</span>;
  }
  if (entry.kind === 'volume') {
    return <span className="whitespace-nowrap text-[12.5px] font-medium text-completed-dark">{entry.volume ? `${entry.volume} 완독` : '완독'}</span>;
  }
  return (
    <span
      className={`inline-block -rotate-[3deg] whitespace-nowrap rounded-[3px] border-[1.5px] px-1.5 py-[3px] font-serif text-[12px] font-bold leading-none ${
        entry.kind === 'set' ? 'border-completed text-completed-dark' : 'border-ink-soft text-ink-soft'
      }`}
    >
      {KIND_LABEL[entry.kind]}
    </span>
  );
}

interface EditDialogProps {
  entry: Entry | null;
  onClose: () => void;
  onSave: (patch: { rating: number | null; liked: boolean; createdAt: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}

function EditDialog({ entry, onClose, onSave, onDelete }: EditDialogProps) {
  return (
    <Dialog open={entry !== null} onClose={onClose} title="기록 고치기">
      {entry && <EditForm key={entry.id} entry={entry} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Dialog>
  );
}

function EditForm({ entry, onClose, onSave, onDelete }: EditDialogProps & { entry: Entry }) {
  const [date, setDate] = useState(toDateInput(entry.date));
  const [rating, setRating] = useState<number | null>(entry.rating);
  const [liked, setLiked] = useState(entry.liked);
  const [saving, setSaving] = useState(false);
  const dateId = useId();
  const completed = entry.kind !== 'reading';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const createdAt = fromDateInput(date);
    if (!createdAt) return;
    setSaving(true);
    await onSave({ rating: completed ? rating : entry.rating, liked: completed ? liked : entry.liked, createdAt });
    setSaving(false);
  }

  return (
    <form onSubmit={submit}>
      <div className="flex items-center gap-4">
        <BookCover src={entry.cover} alt="" title={entry.title} className="w-14 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-serif text-[18px] font-bold text-ink">{entry.title}</p>
          <p className="truncate text-[13px] text-ink-muted">
            {[entry.author, entry.publisher, entry.volume].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1"><KindTag entry={entry} /></p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor={dateId} className="field-label">{completed ? '완독한 날' : '읽기 시작한 날'}</label>
          <input id={dateId} type="date" required value={date} max={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} className="field tnum w-48" />
        </div>
        {completed && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="field-label">별점</p>
              <StarRating rating={rating} onChange={setRating} size="lg" label="별점" />
            </div>
            <LikeButton liked={liked} onToggle={() => setLiked((v) => !v)} />
          </div>
        )}
      </div>

      <div className="-mx-6 -mb-4 mt-7 flex items-center gap-2 border-t border-line-soft bg-paper px-6 py-3.5">
        <button type="button" onClick={() => void onDelete()} className="btn btn-ghost -ml-2 text-seal hover:bg-seal-soft hover:text-seal-dark">
          <Trash2 size={15} aria-hidden /> 지우기
        </button>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">취소</button>
          <button type="submit" disabled={saving} className="btn btn-primary">{saving ? '저장 중' : '저장'}</button>
        </div>
      </div>
    </form>
  );
}
