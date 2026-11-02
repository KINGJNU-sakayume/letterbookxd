import { useCallback, useEffect, useState } from 'react';
import { getCatalogStatus, subscribeCatalog, type CatalogStatus } from '../services/catalogSource';

/** 카탈로그 편집본 상태. 관리 화면에서 고칠 때마다 다시 읽는다. */
export function useCatalogStatus(): { status: CatalogStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const refresh = useCallback(() => {
    getCatalogStatus().then(setStatus).catch((err) => console.error('카탈로그 상태를 읽지 못했습니다:', err));
  }, []);
  useEffect(() => {
    refresh();
    return subscribeCatalog(refresh);
  }, [refresh]);
  return { status, refresh };
}
