import { Link, useLocation } from 'react-router-dom';
import { BarChart3, BookMarked, Library, CalendarDays, Settings } from 'lucide-react';

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
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <BookMarked size={22} className="text-stone-800 group-hover:text-stone-600 transition-colors" />
          <span className="font-serif text-lg font-semibold text-stone-900 tracking-tight">책장</span>
        </Link>

        <nav className="flex items-center gap-1">
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

          <Link to="/admin" className={linkClass('/admin')} title="관리자">
            <Settings size={14} />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
