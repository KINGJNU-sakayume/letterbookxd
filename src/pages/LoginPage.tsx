import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Page } from '../components/layout/Page';
import { LoginForm } from '../components/auth/LoginForm';
import { PageLoader } from '../components/ui/States';
import { useAuthStore } from '../store/authStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function LoginPage() {
  useDocumentTitle('로그인');
  const location = useLocation();
  const navigate = useNavigate();
  const { session, ready } = useAuthStore();
  const from = (location.state as { from?: string } | null)?.from;
  const target = from && !from.startsWith('/login') ? from : '/bookshelf';

  if (!ready) return <PageLoader />;
  if (session) return <Navigate to={target} replace />;

  return (
    <Page className="flex justify-center">
      <div className="w-full max-w-sm pt-[6vh]">
        <LoginForm
          title="로그인"
          description="책장 주인 계정으로 로그인하면 읽는 중인 쪽수와 완독 기록, 별점을 남길 수 있습니다."
          onSuccess={() => navigate(target, { replace: true })}
        />
      </div>
    </Page>
  );
}
