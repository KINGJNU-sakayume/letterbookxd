import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkedSession, setCheckedSession] = useState(false);
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);

  if (!checkedSession) {
    supabase.auth.getSession().then(({ data }) => {
      setAlreadySignedIn(Boolean(data.session));
      setCheckedSession(true);
    });
  }

  if (alreadySignedIn) return <Navigate to="/admin" replace />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError('로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.');
      return;
    }

    const from = (location.state as { from?: string } | null)?.from ?? '/admin';
    navigate(from, { replace: true });
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
        <div className="w-11 h-11 rounded-xl bg-stone-900 text-white flex items-center justify-center mb-5">
          <LockKeyhole size={20} />
        </div>
        <h1 className="text-xl font-bold text-stone-900">관리자 로그인</h1>
        <p className="text-sm text-stone-500 mt-1 mb-6">서재 데이터를 수정하려면 소유자 계정으로 로그인하세요.</p>

        <label className="block text-sm font-medium text-stone-700 mb-1.5">이메일</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={event => setEmail(event.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-stone-300 mb-4"
          required
        />

        <label className="block text-sm font-medium text-stone-700 mb-1.5">비밀번호</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-stone-300"
          required
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          로그인
        </button>
      </form>
    </main>
  );
}
