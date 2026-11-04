import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import { useLifeHubAttention } from '../../lifehub/hubStore';

/** 상태 C(확인 필요)일 때 설정 진입점 오른쪽 위에 그리는 지름 8px 점 */
const AttentionDot = () => <span aria-hidden data-attention-dot className="absolute right-0 top-0 h-2 w-2 rounded-full bg-seal" />;
const ATTENTION_SUFFIX = ' (확인 필요)';

/** 예전 계정 메뉴 자리. 로그인이 없으므로 내 서재 바로가기와 설정·백업을 둔다. */
export function AccountMenu({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const attention = useLifeHubAttention();
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
        aria-label={`내 서재 메뉴${attention ? ATTENTION_SUFFIX : ''}`}
        className="relative flex h-9 items-center gap-1 rounded-full pl-0.5 pr-1.5 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink coarse:h-11 coarse:pl-1.5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-paper-raised">
          나
        </span>
        <ChevronDown size={14} aria-hidden />
        {attention && <AttentionDot />}
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
          <Link role="menuitem" to="/settings" onClick={close} className={`relative ${item}`} aria-label={attention ? `설정 · 백업${ATTENTION_SUFFIX}` : undefined}>
            설정 · 백업
            {attention && <span aria-hidden data-attention-dot className="ml-1.5 inline-block h-2 w-2 -translate-y-1.5 rounded-full bg-seal" />}
          </Link>
        </div>
      )}
    </div>
  );
}
