import { useCallback, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { isAdminSession, useAuthStore } from '../../store/authStore';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import { toast } from '../../store/toastStore';

export function AccountMenu() {
  const { session, ready, signOut } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const close = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, open, close);

  if (!ready) return <div className="h-9 w-9" aria-hidden />;

  if (!session) {
    return (
      <Link to="/login" state={{ from: location.pathname + location.search }} className="btn btn-ghost">
        로그인
      </Link>
    );
  }

  const email = session.user.email ?? '';
  const admin = isAdminSession(session);

  async function handleSignOut() {
    setBusy(true);
    const ok = await signOut();
    setBusy(false);
    setOpen(false);
    toast(ok ? '로그아웃했습니다.' : '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.', ok ? 'default' : 'error');
  }

  const item = 'flex w-full items-center px-3.5 py-2 text-left text-[14px] text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="계정 메뉴"
        className="flex h-9 items-center gap-1 rounded-full pl-0.5 pr-1.5 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold uppercase text-paper-raised">
          {email.charAt(0) || '나'}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="animate-drop panel absolute right-0 top-[calc(100%+8px)] z-50 w-64 py-1.5 shadow-pop">
          <div className="px-3.5 pb-2.5 pt-2">
            <p className="text-[12px] text-ink-muted">{admin ? '관리자 계정' : '로그인 계정'}</p>
            <p className="truncate text-[14px] font-medium text-ink">{email}</p>
          </div>
          <div className="my-1 h-px bg-line-soft" />
          <Link role="menuitem" to="/bookshelf" onClick={close} className={item}>
            내 책장
          </Link>
          <Link role="menuitem" to="/reading-log" onClick={close} className={item}>
            독서 기록
          </Link>
          {admin && (
            <Link role="menuitem" to="/admin" onClick={close} className={item}>
              서가 관리
            </Link>
          )}
          <div className="my-1 h-px bg-line-soft" />
          <button role="menuitem" type="button" disabled={busy} onClick={() => void handleSignOut()} className={`${item} disabled:opacity-50`}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
