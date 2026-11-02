import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useOutsideClick } from '../../hooks/useOutsideClick';

/** 예전 계정 메뉴 자리. 로그인이 없으므로 내 서재 바로가기와 설정·백업을 둔다. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, open, close);

  const item = 'flex w-full items-center px-3.5 py-2 text-left text-[14px] text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="내 서재 메뉴"
        className="flex h-9 items-center gap-1 rounded-full pl-0.5 pr-1.5 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink coarse:h-11 coarse:pl-1.5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-paper-raised">
          나
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="animate-drop panel absolute right-0 top-[calc(100%+8px)] z-50 w-64 py-1.5 shadow-pop">
          <div className="px-3.5 pb-2.5 pt-2">
            <p className="text-[12px] text-ink-muted">이 기기에 저장된 서재</p>
            <p className="text-[13px] text-ink-soft">기록은 이 브라우저에만 있습니다. 가끔 백업해 두세요.</p>
          </div>
          <div className="my-1 h-px bg-line-soft" />
          <Link role="menuitem" to="/bookshelf" onClick={close} className={item}>
            내 책장
          </Link>
          <Link role="menuitem" to="/reading-log" onClick={close} className={item}>
            독서 기록
          </Link>
          <Link role="menuitem" to="/admin" onClick={close} className={item}>
            서가 관리
          </Link>
          <div className="my-1 h-px bg-line-soft" />
          <Link role="menuitem" to="/settings" onClick={close} className={item}>
            설정 · 백업
          </Link>
        </div>
      )}
    </div>
  );
}
