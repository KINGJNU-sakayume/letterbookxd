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

/** 읽는 중인 한 권: 원장의 한 줄. 표지, 판본, 그리고 오른쪽에 쪽수 진행 */
export function ReadingCard({ workId, title, author, cover, publisher, volume, currentPage, totalPages, action }: ReadingCardProps) {
  const pct = progressPercent(currentPage, totalPages);
  const edition = [publisher, volume].filter(Boolean).join(' ');
  return (
    <article className="grid h-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4">
      <Link to={`/book/${workId}`} tabIndex={-1} aria-hidden>
        <BookCover src={cover} alt="" title={title} author={author} className="w-[44px]" />
      </Link>
      <div className="min-w-0">
        <Link
          to={`/book/${workId}`}
          className="line-clamp-1 text-[16px] font-semibold leading-snug text-ink decoration-line-strong underline-offset-4 hover:underline"
        >
          {title}
        </Link>
        <p className="mt-0.5 flex min-w-0 gap-x-3 text-[13px] text-ink-muted">
          <span className="shrink-0">{author}</span>
          {edition && <span className="truncate">{edition}</span>}
        </p>
        {pct !== null ? (
          <ProgressBar value={pct} label={`${title} 읽은 비율`} className="mt-2.5 max-w-[22rem]" />
        ) : (
          <p className="mt-1.5 text-[12.5px] text-ink-muted">{currentPage ? `${currentPage}쪽까지 읽음` : '아직 쪽수를 적지 않았습니다'}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 self-start text-right">
        {pct !== null && (
          <p className="leading-none">
            <span className="tnum block font-serif text-[22px] font-bold tracking-[-0.03em] text-reading">{pct}%</span>
            <span className="tnum mt-1 block text-[12px] text-ink-muted">
              {currentPage} / {totalPages}쪽
            </span>
          </p>
        )}
        {action && <div className="hidden sm:block">{action}</div>}
      </div>
      {action && <div className="col-span-3 sm:hidden">{action}</div>}
    </article>
  );
}
