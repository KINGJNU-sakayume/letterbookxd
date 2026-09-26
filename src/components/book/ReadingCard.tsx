import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookCover } from '../ui/BookCover';
import { ProgressBar } from '../ui/ProgressBar';
import { progressPercent } from '../../utils/format';

interface ReadingCardProps {
  workId: string;
  title: string;
  author: string;
  cover: string | null;
  publisher: string;
  volume: string;
  currentPage: number | null;
  totalPages: number | null;
  action?: ReactNode;
}

/** 읽는 중인 한 권: 표지, 판본, 쪽수 진행 */
export function ReadingCard({ workId, title, author, cover, publisher, volume, currentPage, totalPages, action }: ReadingCardProps) {
  const pct = progressPercent(currentPage, totalPages);
  return (
    <article className="panel flex h-full gap-4 p-4 transition-colors hover:border-line-strong">
      <Link to={`/book/${workId}`} className="shrink-0" tabIndex={-1} aria-hidden>
        <BookCover src={cover} alt="" title={title} author={author} className="w-[60px]" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          to={`/book/${workId}`}
          className="line-clamp-1 font-serif text-[18px] font-bold leading-snug text-ink decoration-line-strong underline-offset-4 hover:underline"
        >
          {title}
        </Link>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">{[author, publisher, volume].filter(Boolean).join(' · ')}</p>
        <div className="mt-auto pt-3">
          {pct !== null ? (
            <>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="tnum text-ink-muted">
                  {currentPage} / {totalPages}쪽
                </span>
                <span className="tnum font-semibold text-reading">{pct}%</span>
              </div>
              <ProgressBar value={pct} label={`${title} 읽은 비율`} />
            </>
          ) : (
            <p className="text-[12.5px] text-ink-muted">
              {currentPage ? `${currentPage}쪽까지 읽음` : '아직 쪽수를 적지 않았습니다'}
            </p>
          )}
          {action && <div className="mt-3 sm:hidden">{action}</div>}
        </div>
      </div>
      {action && <div className="hidden shrink-0 self-center sm:block">{action}</div>}
    </article>
  );
}
