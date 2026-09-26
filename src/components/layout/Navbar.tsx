import { Link, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, Compass, Library, Settings, type LucideIcon } from 'lucide-react';
import { isAdminSession, useAuthStore } from '../../store/authStore';
import { GlobalSearch } from './GlobalSearch';
import { AccountMenu } from './AccountMenu';

type Section = 'browse' | 'shelf' | 'log' | 'stats' | 'admin';

interface NavItem {
  section: Section;
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { section: 'browse', to: '/', label: '둘러보기', short: '둘러보기', icon: Compass },
  { section: 'shelf', to: '/bookshelf', label: '내 책장', short: '내 책장', icon: Library },
  { section: 'log', to: '/reading-log', label: '독서 기록', short: '기록', icon: CalendarDays },
  { section: 'stats', to: '/stats', label: '통계', short: '통계', icon: BarChart3 },
];

/** 작품·시리즈·작가 상세는 '둘러보기' 아래에 있는 것으로 본다 */
function sectionOf(pathname: string): Section | null {
  if (pathname === '/' || /^\/(book|series|author)\//.test(pathname)) return 'browse';
  if (pathname.startsWith('/bookshelf')) return 'shelf';
  if (pathname.startsWith('/reading-log')) return 'log';
  if (pathname.startsWith('/stats')) return 'stats';
  if (pathname.startsWith('/admin')) return 'admin';
  return null;
}

export function Navbar() {
  const { pathname } = useLocation();
  const section = sectionOf(pathname);
  const admin = useAuthStore((s) => isAdminSession(s.session));
  const items = admin ? [...NAV, { section: 'admin' as const, to: '/admin', label: '관리', short: '관리', icon: Settings }] : NAV;

  return (
    <>
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus({ preventScroll: false });
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper-raised"
      >
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="page-x flex h-16 items-center gap-6 lg:gap-10">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="책장 처음으로">
            <span className="seal-mark transition-transform duration-200 group-hover:-rotate-3">책</span>
            <span className="font-serif text-[21px] font-bold tracking-[-0.01em] text-ink">책장</span>
          </Link>

          <nav aria-label="주요 메뉴" className="hidden h-full items-stretch gap-1 md:flex">
            {items.map((item) => {
              const active = section === item.section;
              return (
                <Link
                  key={item.section}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center px-3 text-[15px] font-medium transition-colors ${
                    active ? 'text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-colors ${active ? 'bg-ink' : 'bg-transparent'}`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            <GlobalSearch />
            <AccountMenu />
          </div>
        </div>
      </header>

      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="grid grid-cols-4">
          {NAV.map((item) => {
            const active = section === item.section;
            const Icon = item.icon;
            return (
              <Link
                key={item.section}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                <span aria-hidden className={`absolute inset-x-6 top-0 h-[2px] rounded-full ${active ? 'bg-ink' : 'bg-transparent'}`} />
                <Icon size={20} strokeWidth={active ? 2.1 : 1.7} aria-hidden />
                {item.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
