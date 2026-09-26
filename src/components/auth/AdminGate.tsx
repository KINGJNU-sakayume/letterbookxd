import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, LockKeyhole, LogIn } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export function AdminGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

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
  if (session) return <>{children}</>;

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50 flex items-center justify-center px-4">
      <form onSubmit={sendMagicLink} className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mb-4"><LockKeyhole size={20} /></div>
        <h1 className="text-xl font-bold text-stone-900">관리자 로그인</h1>
        <p className="text-sm text-stone-500 mt-1 mb-5">Supabase Auth에 등록된 관리자 이메일로 로그인합니다.</p>
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
