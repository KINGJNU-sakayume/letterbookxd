import { Link } from 'react-router-dom';
import { Page } from '../components/layout/Page';
import { EmptyState } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('페이지 없음');
  return (
    <Page>
      <EmptyState
        className="mt-6"
        title="찾는 페이지가 없습니다"
        description="주소가 바뀌었거나 지워진 페이지입니다."
        action={
          <Link to="/" className="btn btn-primary">
            둘러보기로 가기
          </Link>
        }
      />
    </Page>
  );
}
