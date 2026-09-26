import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { Page } from '../layout/Page';
import { PageLoader, Spinner } from '../ui/States';
import { LoginForm } from './LoginForm';

function GateCard({ children }: { children: ReactNode }) {
  return (
    <Page className="flex justify-center">
      <section className="w-full max-w-sm pt-[6vh]">{children}</section>
    </Page>
  );
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');
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

  if (checking) {
    return <PageLoader label="로그인 상태를 확인하는 중" />;
  }
  if (sessionError) {
    return (
      <GateCard>
        <h1 className="font-serif text-[28px] font-bold text-ink">세션을 확인하지 못했습니다</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">잠시 후 다시 시도해 주세요.</p>
        <p className="mt-3 break-words rounded-[5px] bg-paper-sunken px-3 py-2 text-[12.5px] text-ink-muted">{sessionError}</p>
        <button onClick={() => void checkSession()} className="btn btn-primary mt-6 w-full">
          다시 시도
        </button>
      </GateCard>
    );
  }

  const isAdmin = session?.user.app_metadata?.role === 'admin';
  if (isAdmin) {
    return <>{children}</>;
  }

  if (session) {
    return (
      <GateCard>
        <h1 className="font-serif text-[28px] font-bold text-ink">관리 권한이 없는 계정입니다</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
          지금 로그인한 계정{session.user.email ? `(${session.user.email})` : ''}으로는 서가 데이터를 고칠 수 없습니다. 다른 계정으로 로그인하려면 먼저 로그아웃해 주세요.
        </p>
        <button disabled={signingOut} onClick={() => void signOut()} className="btn btn-secondary mt-6 w-full">
          {signingOut && <Spinner />}
          로그아웃
        </button>
        {message && <p role="alert" className="mt-3 text-[13px] text-seal">{message}</p>}
      </GateCard>
    );
  }

  return (
    <GateCard>
      <LoginForm
        title="관리자 로그인"
        description="관리자 권한이 있는 계정으로 로그인하면 작품, 판본, 작가, 시리즈를 고칠 수 있습니다."
        onSuccess={(nextSession) => setSession(nextSession)}
      />
    </GateCard>
  );
}
