import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2, LockKeyhole, LogIn, LogOut, RefreshCw } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

type AuthFailure = { code?: string; message?: string };

function authFailureMessage(error: AuthFailure) {
  const code = error.code?.toLowerCase() ?? '';
  const detail = error.message?.toLowerCase() ?? '';

  if (code === 'email_not_confirmed' || detail.includes('email not confirmed')) {
    return '이메일 인증이 완료되지 않았습니다. 받은편지함의 인증 메일을 확인한 뒤 다시 로그인해 주세요.';
  }
  if (
    code === 'invalid_credentials' ||
    code === 'invalid_login_credentials' ||
    detail.includes('invalid login credentials')
  ) {
    return '이메일 또는 비밀번호가 올바르지 않습니다. 입력 내용을 다시 확인해 주세요.';
  }
  if (code === 'over_request_rate_limit' || detail.includes('rate limit')) {
    return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  return '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
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
    if (error) setMessage('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    setSigningOut(false);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSigningIn(true);
    setMessage('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setMessage(authFailureMessage(error));
    } else {
      setSession(data.session);
      setPassword('');
    }
    setSigningIn(false);
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
  if (isAdmin) {
    return (
      <div className="relative">
        <button
          disabled={signingOut}
          onClick={() => void signOut()}
          className="fixed right-4 top-16 z-40 flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-50 disabled:opacity-50"
        >
          {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
          로그아웃
        </button>
        {message && <p role="alert" className="fixed right-4 top-28 z-40 max-w-xs rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">{message}</p>}
        {children}
      </div>
    );
  }

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
      <form onSubmit={signIn} className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mb-4"><LockKeyhole size={20} /></div>
        <h1 className="text-xl font-bold text-stone-900">관리자 로그인</h1>
        <p className="text-sm text-stone-500 mt-1 mb-5">관리자 권한이 설정된 Supabase Auth 계정으로 로그인합니다.</p>
        <label className="block text-xs font-medium text-stone-600 mb-1.5">이메일</label>
        <input type="email" required value={email} onChange={e=>setEmail(e.target.value)}
          autoComplete="username"
          className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-stone-400"
          placeholder="you@example.com" />
        <label className="mt-4 block text-xs font-medium text-stone-600 mb-1.5">비밀번호</label>
        <input type="password" required value={password} onChange={e=>setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-stone-400"
          placeholder="관리자 비밀번호" />
        <button disabled={signingIn} className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-medium disabled:opacity-50">
          {signingIn ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} 로그인
        </button>
        {message && <p role="alert" className="mt-3 text-xs text-red-600">{message}</p>}
      </form>
    </main>
  );
}
