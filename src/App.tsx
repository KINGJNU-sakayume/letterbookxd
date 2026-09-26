import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Navbar } from './components/layout/Navbar';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SearchPage } from './pages/SearchPage';
import { useLogStore } from './store/logStore';

const BookDetailPage = lazy(() => import('./pages/BookDetailPage').then(module => ({ default: module.BookDetailPage })));
const BookshelfPage = lazy(() => import('./pages/BookshelfPage').then(module => ({ default: module.BookshelfPage })));
const ReadingLogPage = lazy(() => import('./pages/ReadingLogPage').then(module => ({ default: module.ReadingLogPage })));
const AuthorPage = lazy(() => import('./pages/AuthorPage').then(module => ({ default: module.AuthorPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage').then(module => ({ default: module.AdminLoginPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then(module => ({ default: module.StatsPage })));
const SeriesPage = lazy(() => import('./pages/SeriesPage').then(module => ({ default: module.SeriesPage })));

function RouteFallback() {
  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-stone-50">
      <Loader2 size={26} className="animate-spin text-stone-400" />
    </div>
  );
}

function AppContent() {
  const { loadLogs } = useLogStore();

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 pb-16 sm:pb-0">
      <Navbar />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/book/:workId" element={<BookDetailPage />} />
          <Route path="/bookshelf" element={<BookshelfPage />} />
          <Route path="/reading-log" element={<ReadingLogPage />} />
          <Route path="/author/:name" element={<AuthorPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/series/:id" element={<SeriesPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

export default App;
