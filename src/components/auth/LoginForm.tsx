import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { authFailureMessage } from '../../lib/authMessages';
import { Spinner } from '../ui/States';

interface LoginFormProps {
  title: string;
  description: ReactNode;
  onSuccess?: (session: Session | null) => void;
}

export function LoginForm({ title, description, onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [message, setMessage] = useState('');
  const emailId = useId();
  const passwordId = useId();

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSigningIn(true);
    setMessage('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSigningIn(false);
    if (error) {
      setMessage(authFailureMessage(error));
      return;
    }
    setPassword('');
    onSuccess?.(data.session);
  }

  return (
    <form onSubmit={signIn} className="w-full">
      <span className="seal-mark mb-6 h-10 w-10 text-[20px]" aria-hidden>
        책
      </span>
      <h1 className="font-serif text-[30px] font-bold leading-tight text-ink">{title}</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">{description}</p>

      <div className="mt-8 space-y-4">
        <div>
          <label htmlFor={emailId} className="field-label">
            이메일
          </label>
          <input
            id={emailId}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className="field"
          />
        </div>
        <div>
          <label htmlFor={passwordId} className="field-label">
            비밀번호
          </label>
          <input
            id={passwordId}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="field"
          />
        </div>
      </div>

      {message && (
        <p role="alert" className="mt-4 rounded-[5px] border border-seal/25 bg-seal-soft px-3 py-2.5 text-[13.5px] leading-relaxed text-seal-dark">
          {message}
        </p>
      )}

      <button type="submit" disabled={signingIn} className="btn btn-primary btn-lg mt-6 w-full">
        {signingIn && <Spinner className="border-paper/40 border-t-paper-raised" />}
        로그인
      </button>
    </form>
  );
}
