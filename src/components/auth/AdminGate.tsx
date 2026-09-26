import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2, LockKeyhole, LogIn, LogOut, RefreshCw } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export function AdminGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState('');

  const checkSession = useCallback(async () => {
    setChecking(true);
    setSessionError('');
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(data.session);
    } catch (error) {
      setSession(null);
      setSessionError(error instanceof Error ? error.message : '세션을 확인하지 못했습니다.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionError('');
      setChecking(false);
    });
    return () => listener.subscription.unsubscribe();
  }, [checkSession]);

  async function signOut() {
    setSigningOut(true);
    setMessage('');
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
    setSigningOut(false);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setMessage('');
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}#/admin`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setMessage(error ? error.message : '로그인 링크를 이메일로 보냈습니다.');
    setSending(false);
  }

  if (checking) {
    return <div className="min-h-[calc(100vh-56px)] flex items-center justify-center"><Loader2 className="animate-spin text-stone-400" /></div>;
  }
  if (sessionError) {
    return (
      <main className="min-h-[calc(100vh-56px)] bg-stone-50 flex items-center justify-center px-4">
        <section className="w-full max-w-sm bg-white border border-red-200 rounded-2xl p-6 shadow-sm text-center">
          <AlertCircle className="mx-auto text-red-500" size={30} />
          <h1 className="mt-3 text-xl font-bold text-stone-900">세션 확인 오류</h1>
          <p className="mt-2 text-sm text-stone-600">관리자 세션을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          <p className="mt-2 text-xs text-red-600 break-words">{sessionError}</p>
          <button onClick={() => void checkSession()} className="mt-5 w-full flex items-center justify-center gap-2 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-medium">
            <RefreshCw size={15} /> 다시 시도
          </button>
        </section>
      </main>
    );
  }

  const isAdmin = session?.user.app_metadata?.role === 'admin';
  if (isAdmin) return <>{children}</>;

  if (session) {
    return (
      <main className="min-h-[calc(100vh-56px)] bg-stone-50 flex items-center justify-center px-4">
        <section className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 shadow-sm text-center">
          <LockKeyhole className="mx-auto text-stone-500" size={30} />
          <h1 className="mt-3 text-xl font-bold text-stone-900">권한 없음</h1>
          <p className="mt-2 text-sm text-stone-600">이 계정에는 관리자 화면에 접근할 권한이 없습니다.</p>
          <button disabled={signingOut} onClick={() => void signOut()} className="mt-5 w-full flex items-center justify-center gap-2 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-medium disabled:opacity-50">
            {signingOut ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />} 로그아웃
          </button>
          {message && <p className="mt-3 text-xs text-red-600">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50 flex items-center justify-center px-4">
      <form onSubmit={sendMagicLink} className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mb-4"><LockKeyhole size={20} /></div>
        <h1 className="text-xl font-bold text-stone-900">관리자 로그인</h1>
        <p className="text-sm text-stone-500 mt-1 mb-5">관리자 권한이 설정된 Supabase Auth 계정으로 로그인합니다.</p>
        <label className="block text-xs font-medium text-stone-600 mb-1.5">이메일</label>
        <input type="email" required value={email} onChange={e=>setEmail(e.target.value)}
          className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-stone-400"
          placeholder="you@example.com" />
        <button disabled={sending} className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-medium disabled:opacity-50">
          {sending ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} 로그인 링크 받기
        </button>
        {message && <p className="mt-3 text-xs text-stone-500">{message}</p>}
      </form>
    </main>
  );
}
