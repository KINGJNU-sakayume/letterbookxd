import { Link, useLocation } from 'react-router-dom';
import { BarChart3, BookMarked, Library, CalendarDays, Search } from 'lucide-react';

export function Navbar() {
  const location = useLocation();

  // [M-4] 공통 링크 스타일 헬퍼
  const linkClass = (path: string) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
      location.pathname === path
        ? 'text-stone-900 bg-stone-100'
        : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
    }`;

  return (
    <>
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <BookMarked size={22} className="text-stone-800 group-hover:text-stone-600 transition-colors" />
          <span className="font-serif text-lg font-semibold text-stone-900 tracking-tight">책장</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          <Link to="/" className={linkClass('/')}>검색</Link>

          <Link to="/bookshelf" className={linkClass('/bookshelf')}>
            <Library size={15} />내 책장
          </Link>

          <Link to="/reading-log" className={linkClass('/reading-log')}>
            <CalendarDays size={15} />독서 기록
          </Link>

          {/* [M-4] /stats 링크도 동일한 스타일 적용 */}
          <Link to="/stats" className={linkClass('/stats')}>
            <BarChart3 size={15} />통계
          </Link>

        </nav>
      </div>
    </header>

    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-white/95 backdrop-blur border-t border-stone-200 grid grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
      {[
        { to: '/', label: '찾기', icon: Search },
        { to: '/bookshelf', label: '책장', icon: Library },
        { to: '/reading-log', label: '기록', icon: CalendarDays },
        { to: '/stats', label: '통계', icon: BarChart3 },
      ].map(item => {
        const Icon = item.icon;
        const active = location.pathname === item.to;
        return (
          <Link key={item.to} to={item.to} className={`flex flex-col items-center justify-center gap-1 text-[11px] ${active ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>
            <Icon size={19} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
    </>
  );
}
