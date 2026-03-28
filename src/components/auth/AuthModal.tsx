import { useState } from 'react';
import { X, BookMarked, Loader2, Mail } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // [L-4] 회원가입 완료 후 이메일 인증 안내 상태
  const [signupDone, setSignupDone] = useState(false);
  const { signIn, signUp } = useAuthStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const errMsg = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);

    setIsSubmitting(false);

    if (errMsg) {
      setError(errMsg);
    } else if (mode === 'signup') {
      // [L-4] 가입 성공 후 이메일 인증 안내 화면으로 전환
      setSignupDone(true);
    } else {
      onClose();
    }
  }

  // [L-4] 회원가입 완료 안내 화면
  if (signupDone) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <Mail size={22} className="text-stone-700" />
          </div>
          <h2 className="text-lg font-semibold text-stone-900 mb-2">이메일을 확인해 주세요</h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-6">
            <strong>{email}</strong>로 인증 링크를 보냈습니다.<br />
            링크를 클릭한 후 로그인해 주세요.
          </p>
          <button
            onClick={() => { setSignupDone(false); setMode('login'); setEmail(''); setPassword(''); }}
            className="w-full py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-700 transition-colors"
          >
            로그인 하러 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 transition-colors">
          <X size={20} />
        </button>
        <div className="flex items-center gap-2 mb-6">
          <BookMarked size={22} className="text-stone-800" />
          <span className="font-serif text-xl font-semibold text-stone-900">책장</span>
        </div>
        <h2 className="text-lg font-semibold text-stone-900 mb-1">
          {mode === 'login' ? '로그인' : '회원가입'}
        </h2>
        <p className="text-sm text-stone-500 mb-6">
          {mode === 'login' ? '내 독서 기록을 이어가세요' : '지금 시작하고 독서를 기록하세요'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">이메일</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">비밀번호</label>
            <input
              type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              className="w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit" disabled={isSubmitting}
            className="mt-1 w-full py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 size={15} className="animate-spin" />}
            {mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>
        <p className="text-center text-sm text-stone-500 mt-5">
          {mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}
          {' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
            className="text-stone-800 font-medium underline underline-offset-2"
          >
            {mode === 'login' ? '회원가입' : '로그인'}
          </button>
        </p>
      </div>
    </div>
  );
}
