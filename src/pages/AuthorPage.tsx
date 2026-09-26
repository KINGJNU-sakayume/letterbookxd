import { useParams, Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLogStore } from '../store/logStore';
import { useAuthStore } from '../store/authStore';
import { fetchFlowchartByAuthor } from '../services/db';
import type { DbFlowchart } from '../types';
import { FlowchartSidebar, FlowchartModal } from '../components/flowchart';
import { Breadcrumbs, Page, SectionHeading } from '../components/layout/Page';
import { BookCover } from '../components/ui/BookCover';
import { Portrait } from '../components/ui/Portrait';
import { ReadingMark } from '../components/ui/ReadingMark';
import { EmptyState, PageLoader } from '../components/ui/States';
import { bestCompletion, setReview, workReadingState } from '../utils/readingState';
import { progressPercent } from '../utils/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface WorkItem {
  id: string;
  title: string;
  published_year: number;
  representative_edition_id: string | null;
  series_id: string | null;
  display_cover: string;
  editions: { id: string; cover_url: string; publisher?: string; page_count?: number }[];
}

interface AuthorRecord {
  name: string;
  photo_url: string | null;
  birth_death: string | null;
  country: string | null;
  awards: string[] | null;
  bio: string | null;
}

export function AuthorPage() {
  const { name } = useParams();
  const [author, setAuthor] = useState<AuthorRecord | null>(null);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [flowchart, setFlowchart] = useState<DbFlowchart | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { volumeLogs, setCompletionLogs } = useLogStore();
  const signedIn = useAuthStore((s) => !!s.session);
  useDocumentTitle(name);

  useEffect(() => {
    async function fetchAuthorData() {
      if (!name) return;
      setIsLoading(true);
      try {
        const { data: authorData } = await supabase
          .from('authors')
          .select('*')
          .eq('name', name)
          .maybeSingle();
        setAuthor(authorData as AuthorRecord | null);

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
              publisher,
              page_count
            )
          `)
          .eq('author', name)
          .order('published_year', { ascending: true });

        if (error) { console.error('데이터 로드 에러:', error); return; }

        const processedWorks = ((worksData ?? []) as unknown as Omit<WorkItem, 'display_cover'>[]).map(work => {
          const editions = work.editions || [];
          const repEdition = editions.find(e => e.id === work.representative_edition_id);
          return {
            ...work,
            editions,
            display_cover: repEdition?.cover_url || editions[0]?.cover_url || '',
          };
        });

        setWorks(processedWorks);

        // Fetch flowchart data for this author
        const fc = await fetchFlowchartByAuthor(name);
        setFlowchart(fc);
      } catch (err) {
        console.error('처리 중 에러:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAuthorData();
  }, [name]);

  const personal = useMemo(() => {
    const ids = new Set(works.map(w => w.id));
    const completions = setCompletionLogs.filter(l => ids.has(l.workId));
    const readIds = new Set(completions.map(l => l.workId));
    const reviews = completions.map(l => ({ workId: l.workId, ...setReview(l, volumeLogs) }));
    const rated = reviews.filter(r => r.rating);
    const avg = rated.length > 0 ? (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(1) : null;
    const lifeBookIds = new Set(reviews.filter(r => r.liked).map(r => r.workId));
    return { readCount: readIds.size, avg, lifeBooks: works.filter(w => lifeBookIds.has(w.id)) };
  }, [works, setCompletionLogs, volumeLogs]);

  if (isLoading) return <PageLoader />;

  if (!name || (!author && works.length === 0)) {
    return (
      <Page>
        <EmptyState
          className="mt-6"
          title="작가 정보를 찾을 수 없습니다"
          description="등록되지 않았거나 이름이 바뀐 작가입니다."
          action={<Link to="/?view=authors" className="btn btn-primary">작가 목록으로</Link>}
        />
      </Page>
    );
  }

  const hasFlowchart = flowchart !== null && flowchart.nodes.length > 0;
  const displayName = author?.name ?? name;
  const facts: [string, string][] = [
    ['생몰', author?.birth_death ?? ''],
    ['국가', author?.country ?? ''],
  ].filter((f): f is [string, string] => !!f[1]);

  return (
    <Page>
      <Breadcrumbs
        items={[
          { label: '둘러보기', to: '/' },
          { label: '작가', to: '/?view=authors' },
          { label: displayName },
        ]}
      />

      <div
        className={`mt-6 grid gap-x-10 gap-y-10 lg:mt-8 lg:grid-cols-[232px_minmax(0,1fr)] 2xl:gap-x-16 ${
          hasFlowchart
            ? 'xl:grid-cols-[248px_minmax(0,1fr)_320px] 2xl:grid-cols-[288px_minmax(0,1fr)_360px] 3xl:grid-cols-[320px_minmax(0,1fr)_400px]'
            : 'xl:grid-cols-[264px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]'
        }`}
      >
        {/* 사진과 기본 정보 */}
        <aside className="lg:row-span-2 xl:row-span-1" aria-label="작가 정보">
          <div className="flex gap-5 lg:sticky lg:top-24 lg:block">
            <Portrait
              src={author?.photo_url}
              name={displayName}
              className="aspect-[3/4] w-32 shrink-0 shadow-[0_0_0_1px_rgb(29_27_23/0.07),0_12px_20px_-14px_rgb(29_27_23/0.5)] sm:w-40 lg:w-full"
            />
            {(facts.length > 0 || (author?.awards?.length ?? 0) > 0) && (
              <dl className="min-w-0 space-y-3 text-[13.5px] lg:mt-6 lg:border-t lg:border-line lg:pt-4">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[12.5px] text-ink-faint">{label}</dt>
                    <dd className="tnum mt-0.5 text-ink-soft">{value}</dd>
                  </div>
                ))}
                {author?.awards && author.awards.length > 0 && (
                  <div>
                    <dt className="text-[12.5px] text-ink-faint">수상</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {author.awards.map((award) => (
                        <span key={award} className="chip">{award}</span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </aside>

        {/* 본문 */}
        <div className="min-w-0">
          <header>
            <h1 className="text-balance font-serif text-[34px] font-bold leading-[1.12] tracking-[-0.015em] text-ink sm:text-[44px] 2xl:text-[52px]">
              {displayName}
            </h1>
            {(author?.birth_death || author?.country) && (
              <p className="tnum mt-3 text-[17px] text-ink-muted">
                {[author?.birth_death, author?.country].filter(Boolean).join(' · ')}
              </p>
            )}
          </header>

          {author?.bio && (
            <p className="text-pretty mt-7 max-w-[68ch] whitespace-pre-line font-serif text-[17px] leading-[1.9] text-ink-soft">{author.bio}</p>
          )}

          {signedIn && works.length > 0 && (
            <dl className="mt-9 grid max-w-2xl grid-cols-3 divide-x divide-line border-y border-line">
              <Figure label="읽은 작품" value={personal.readCount} suffix={`/ ${works.length}`} />
              <Figure label="평균 별점" value={personal.avg ?? '—'} />
              <Figure label="인생책" value={personal.lifeBooks.length} suffix="권" />
            </dl>
          )}

          {signedIn && personal.lifeBooks.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="text-[12.5px] font-medium text-seal">인생책</span>
              {personal.lifeBooks.map((w) => (
                <Link key={w.id} to={`/book/${w.id}`} className="group flex items-center gap-2.5">
                  <BookCover src={w.display_cover} alt="" title={w.title} className="w-8" />
                  <span className="text-[14px] font-medium text-ink decoration-line-strong underline-offset-4 group-hover:underline">{w.title}</span>
                </Link>
              ))}
            </div>
          )}

          <section className="mt-12" aria-labelledby="author-works">
            <SectionHeading id="author-works" title="작품" count={`${works.length}편 · 발표순`} />
            {works.length === 0 ? (
              <p className="border-y border-line py-8 text-[14.5px] text-ink-muted">아직 등록된 작품이 없습니다.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-5 gap-y-9 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-x-6">
                {works.map((work) => {
                  const state = workReadingState(work.id, volumeLogs, setCompletionLogs);
                  const best = state === 'completed' ? bestCompletion(work.id, volumeLogs, setCompletionLogs) : null;
                  const readingLog = state === 'reading' ? volumeLogs.find(l => l.workId === work.id && l.readingState === 'reading') : undefined;
                  const readingEdition = readingLog ? work.editions.find(e => `vol-${e.id}` === readingLog.volumeId) : undefined;
                  return (
                    <li key={work.id}>
                      <Link to={`/book/${work.id}`} className="group block outline-none">
                        <BookCover src={work.display_cover} alt={work.title} title={work.title} author={displayName} className="lift w-full" />
                        <p className="tnum mt-3 text-[12.5px] text-ink-faint">{work.published_year || '연도 미상'}</p>
                        <p className="mt-0.5 line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink decoration-line-strong underline-offset-4 group-hover:underline">
                          {work.title}
                        </p>
                        {signedIn && state !== 'unread' && (
                          <ReadingMark
                            className="mt-1.5"
                            state={state}
                            rating={best?.rating}
                            liked={best?.liked}
                            percent={progressPercent(readingLog?.currentPage, readingEdition?.page_count)}
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {hasFlowchart && (
          <aside className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1">
            <div className="xl:sticky xl:top-24">
              <FlowchartSidebar
                nodes={flowchart!.nodes}
                edges={flowchart!.edges}
                setCompletionLogs={setCompletionLogs}
                onExpand={() => setModalOpen(true)}
              />
            </div>
          </aside>
        )}
      </div>

      {modalOpen && hasFlowchart && (
        <FlowchartModal
          title={`${displayName} 읽기 순서`}
          nodes={flowchart!.nodes}
          edges={flowchart!.edges}
          setCompletionLogs={setCompletionLogs}
          works={works}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Page>
  );
}

function Figure({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="px-4 py-4 first:pl-0 sm:px-6 sm:first:pl-0">
      <dt className="text-[12.5px] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">
        {value}
        {suffix && <span className="tnum ml-1 text-[14px] font-medium tracking-normal text-ink-muted">{suffix}</span>}
      </dd>
    </div>
  );
}
