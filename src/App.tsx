import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Routes, Route, useParams } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { ScrollManager } from './components/layout/ScrollManager';
import { ConfirmProvider } from './components/ui/ConfirmProvider';
import { Toaster } from './components/ui/Toaster';
import { PageLoader } from './components/ui/States';
import { useLogStore } from './store/logStore';

const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const BookDetailPage = lazy(() => import('./pages/BookDetailPage').then(m => ({ default: m.BookDetailPage })));
const BookshelfPage = lazy(() => import('./pages/BookshelfPage').then(m => ({ default: m.BookshelfPage })));
const ReadingLogPage = lazy(() => import('./pages/ReadingLogPage').then(m => ({ default: m.ReadingLogPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const AuthorPage = lazy(() => import('./pages/AuthorPage').then(m => ({ default: m.AuthorPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then(m => ({ default: m.StatsPage })));
const SeriesPage = lazy(() => import('./pages/SeriesPage').then(m => ({ default: m.SeriesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
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

  // 기록은 이 브라우저에 저장되어 있다. 처음 한 번 불러온다.
  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

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
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/series/:id" element={<SeriesRoute />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
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
