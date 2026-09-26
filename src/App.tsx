import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, useParams } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { ScrollManager } from './components/layout/ScrollManager';
import { AdminGate } from './components/auth/AdminGate';
import { ConfirmProvider } from './components/ui/ConfirmProvider';
import { Toaster } from './components/ui/Toaster';
import { PageLoader } from './components/ui/States';
import { useLogStore } from './store/logStore';
import { useAuthStore } from './store/authStore';

const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const BookDetailPage = lazy(() => import('./pages/BookDetailPage').then(m => ({ default: m.BookDetailPage })));
const BookshelfPage = lazy(() => import('./pages/BookshelfPage').then(m => ({ default: m.BookshelfPage })));
const ReadingLogPage = lazy(() => import('./pages/ReadingLogPage').then(m => ({ default: m.ReadingLogPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const AuthorPage = lazy(() => import('./pages/AuthorPage').then(m => ({ default: m.AuthorPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then(m => ({ default: m.StatsPage })));
const SeriesPage = lazy(() => import('./pages/SeriesPage').then(m => ({ default: m.SeriesPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// 같은 화면에서 다른 작품으로 이동하면 상태를 새로 시작한다
function BookRoute() {
  const { workId } = useParams();
  return <BookDetailPage key={workId} />;
}
function SeriesRoute() {
  const { id } = useParams();
  return <SeriesPage key={id} />;
}
function AuthorRoute() {
  const { name } = useParams();
  return <AuthorPage key={name} />;
}

function AppContent() {
  const loadLogs = useLogStore((s) => s.loadLogs);
  const clearLogs = useLogStore((s) => s.clearLogs);
  const startAuth = useAuthStore((s) => s.start);
  const authReady = useAuthStore((s) => s.ready);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  useEffect(() => startAuth(), [startAuth]);

  // 로그인·로그아웃할 때마다 내 기록을 다시 맞춘다
  useEffect(() => {
    if (!authReady) return;
    if (userId) void loadLogs();
    else clearLogs();
  }, [authReady, userId, loadLogs, clearLogs]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <ScrollManager />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/book/:workId" element={<BookRoute />} />
          <Route path="/bookshelf" element={<BookshelfPage />} />
          <Route path="/reading-log" element={<ReadingLogPage />} />
          <Route path="/author/:name" element={<AuthorRoute />} />
          <Route path="/admin" element={<AdminGate><AdminPage /></AdminGate>} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/series/:id" element={<SeriesRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Toaster />
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </HashRouter>
  );
}

export default App;
