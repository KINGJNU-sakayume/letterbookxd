import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { SearchPage } from './pages/SearchPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { BookshelfPage } from './pages/BookshelfPage';
import { ReadingLogPage } from './pages/ReadingLogPage'; // 독서 기록 페이지 임포트
import { AdminPage } from './pages/AdminPage';
import { AuthorPage } from './pages/AuthorPage';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { useLogStore } from './store/logStore';
import { StatsPage } from './pages/StatsPage';
import { SeriesPage } from './pages/SeriesPage';

function AppContent() {
  const { setUser, setLoading } = useAuthStore();
  const { loadLogs, clearLogs } = useLogStore();

  useEffect(() => {
    // 세션 가져오기
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      setUser(user);
      setLoading(false);
      if (user) {
        loadLogs(user.id);
      }
    });

    // 인증 상태 변화 감지
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setUser(user);
      setLoading(false);
      
      if (event === 'SIGNED_IN' && user) {
        loadLogs(user.id);
      } else if (event === 'SIGNED_OUT') {
        clearLogs();
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [setUser, setLoading, loadLogs, clearLogs]);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <Navbar />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/book/:workId" element={<BookDetailPage />} />
        <Route path="/bookshelf" element={<BookshelfPage />} />
        <Route path="/reading-log" element={<ReadingLogPage />} /> 
        <Route path="/author/:name" element={<AuthorPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/series/:id" element={<SeriesPage />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;