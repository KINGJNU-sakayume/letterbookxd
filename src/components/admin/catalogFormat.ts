import { getCatalog } from '../../services/catalogSource';
import { serializeCatalog } from '../../catalog/model';
import { downloadText } from '../../lib/download';

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 지금 카탈로그(편집본 포함)를 catalog.json으로 내려받는다. src/data/catalog.json에 덮어써 커밋한다. */
export async function exportCatalogFile(): Promise<void> {
  downloadText('catalog.json', serializeCatalog(await getCatalog()));
}
