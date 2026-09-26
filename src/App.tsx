import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';






import { useLogStore } from './store/logStore';


import { AdminGate } from './components/auth/AdminGate';


const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const BookDetailPage = lazy(() => import('./pages/BookDetailPage').then(m => ({ default: m.BookDetailPage })));
const BookshelfPage = lazy(() => import('./pages/BookshelfPage').then(m => ({ default: m.BookshelfPage })));
const ReadingLogPage = lazy(() => import('./pages/ReadingLogPage').then(m => ({ default: m.ReadingLogPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const AuthorPage = lazy(() => import('./pages/AuthorPage').then(m => ({ default: m.AuthorPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then(m => ({ default: m.StatsPage })));
const SeriesPage = lazy(() => import('./pages/SeriesPage').then(m => ({ default: m.SeriesPage })));

function AppContent() {
  const { loadLogs } = useLogStore();

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <Navbar />
      <Suspense fallback={<div className="min-h-[calc(100vh-56px)] flex items-center justify-center text-sm text-stone-400">불러오는 중...</div>}>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/book/:workId" element={<BookDetailPage />} />
          <Route path="/bookshelf" element={<BookshelfPage />} />
          <Route path="/reading-log" element={<ReadingLogPage />} />
          <Route path="/author/:name" element={<AuthorPage />} />
          <Route path="/admin" element={<AdminGate><AdminPage /></AdminGate>} />
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
