import { useState } from 'react';
import { Download } from 'lucide-react';
import { discardCatalogEdits } from '../../services/catalogSource';
import { useCatalogStatus } from '../../hooks/useCatalogStatus';
import { useConfirm } from '../ui/confirm';
import { toast } from '../../store/toastStore';
import { useCatalogStore } from '../../store/catalogStore';
import { exportCatalogFile, formatDateTime } from './catalogFormat';

/** 관리·설정 화면 위에 붙는 편집본 상태 줄 */
export function CatalogEditBar({ compact = false }: { compact?: boolean }) {
  const { status } = useCatalogStatus();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    try {
      await exportCatalogFile();
      toast('catalog.json을 내려받았습니다. src/data/catalog.json에 덮어써 커밋하세요.');
    } catch (err) {
      console.error(err);
      toast('카탈로그를 내보내지 못했습니다.', 'error');
    }
  }

  async function handleDiscard() {
    const ok = await confirm({
      title: '이 기기의 카탈로그 편집본을 버릴까요?',
      description: '내보내지 않은 수정은 사라지고 배포된 catalog.json으로 돌아갑니다. 읽기 기록은 그대로입니다.',
      confirmLabel: '편집본 버리기',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await discardCatalogEdits();
      void useCatalogStore.getState().reload();
      toast('편집본을 버렸습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className={`rounded-control border border-line bg-paper-sunken px-4 py-3 text-[13.5px] text-ink-soft ${compact ? '' : 'mb-6'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1">
          {status.edited ? (
            <>
              <span className="font-semibold text-ink">로컬 편집본 사용 중</span>
              {status.updatedAt && <span className="text-ink-muted"> · 마지막 수정 {formatDateTime(status.updatedAt)}</span>}
              <span className="block text-[12.5px] text-ink-muted">
                내보낸 catalog.json을 src/data/catalog.json에 커밋해 배포하면 다른 기기에도 반영됩니다.
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">배포된 카탈로그 사용 중</span>
              <span className="text-ink-muted"> · 작품 {status.counts.works} · 판본 {status.counts.editions} · 작가 {status.counts.authors} · 시리즈 {status.counts.series}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void handleExport()} className="btn btn-secondary btn-sm">
            <Download size={14} aria-hidden />
            카탈로그 JSON 내보내기
          </button>
          {status.edited && (
            <button type="button" disabled={busy} onClick={() => void handleDiscard()} className="btn btn-ghost btn-sm">
              편집본 버리기
            </button>
          )}
        </div>
      </div>
      {status.stale && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          편집을 시작한 뒤 배포된 catalog.json이 바뀌었습니다. 이 편집본은 예전 카탈로그를 바탕으로 하므로, 내보내기 전에 바뀐 내용을 확인해 주세요.
        </p>
      )}
    </div>
  );
}
