import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { ProgressBar } from '../ui/ProgressBar';
import { useLogStore } from '../../store/logStore';
import { toast } from '../../store/toastStore';
import { ensureWorkLoaded } from '../../services/bookCache';
import { progressPercent } from '../../utils/format';
import { josa } from '../../lib/hangul';
import type { ReadingItem } from '../../hooks/useLibrary';

interface ProgressDialogProps {
  item: ReadingItem | null;
  onClose: () => void;
}

/** 책장에서 바로 쪽수를 적거나 완독으로 넘긴다 */
export function ProgressDialog({ item, onClose }: ProgressDialogProps) {
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={item ? `${item.work.title}${item.volume ? ` ${item.volume}` : ''}` : ''}
      description={item ? `${item.publisher} 판 · 지금 읽고 있는 쪽을 적어 두세요.` : undefined}
    >
      {item && <ProgressForm key={item.log.id} item={item} onClose={onClose} />}
    </Dialog>
  );
}

function ProgressForm({ item, onClose }: { item: ReadingItem; onClose: () => void }) {
  const { updateReadingProgress, upsertVolumeLog } = useLogStore();
  const total = item.edition?.page_count || null;
  const [value, setValue] = useState(item.log.currentPage?.toString() ?? '');
  const [busy, setBusy] = useState<'save' | 'complete' | null>(null);
  const inputId = useId();

  const page = value === '' ? null : Number(value);
  const invalid = page !== null && (Number.isNaN(page) || page < 0 || (total !== null && page > total));
  const pct = progressPercent(page, total);

  function adjust(delta: number) {
    const next = Math.max(0, (page ?? 0) + delta);
    setValue(String(total ? Math.min(total, next) : next));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (page === null || invalid) return;
    setBusy('save');
    await updateReadingProgress(item.log.volumeId, page);
    setBusy(null);
    if (useLogStore.getState().getVolumeLog(item.log.volumeId)?.currentPage === page) {
      toast(`${page}쪽까지 적었습니다.`);
      onClose();
    }
  }

  async function markComplete() {
    setBusy('complete');
    try {
      await ensureWorkLoaded(item.work.id);
      await upsertVolumeLog({
        volumeId: item.log.volumeId,
        editionSetId: item.log.editionSetId,
        workId: item.log.workId,
        logType: 'volume',
        readingState: 'completed',
        currentPage: total ?? item.log.currentPage,
        liked: item.log.liked,
        rating: item.log.rating,
      });
      if (useLogStore.getState().getVolumeLog(item.log.volumeId)?.readingState === 'completed') {
        toast(`${josa(`${item.work.title}${item.volume ? ` ${item.volume}` : ''}`, '을', '를')} 완독으로 옮겼습니다.`);
        onClose();
      }
    } catch (err) {
      console.error('완독 처리 실패:', err);
      toast('완독으로 옮기지 못했습니다.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save}>
      <label htmlFor={inputId} className="field-label">
        지금 읽는 쪽
      </label>
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          data-autofocus
          type="number"
          inputMode="numeric"
          min={0}
          max={total ?? undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid}
          className={`field tnum h-12 w-32 text-[20px] font-semibold ${invalid ? 'border-seal focus:border-seal focus:ring-seal' : ''}`}
        />
        <span className="tnum text-[15px] text-ink-muted">{total ? `/ ${total}쪽` : '쪽'}</span>
        <div className="ml-auto flex gap-1">
          {[10, 50].map((d) => (
            <button key={d} type="button" onClick={() => adjust(d)} className="btn btn-secondary btn-sm tnum">
              +{d}
            </button>
          ))}
        </div>
      </div>
      {invalid && (
        <p className="mt-2 text-[13px] text-seal">{total ? `0에서 ${total} 사이로 적어 주세요.` : '0 이상으로 적어 주세요.'}</p>
      )}
      {pct !== null && !invalid && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[12.5px] text-ink-muted">
            <span>진행</span>
            <span className="tnum font-semibold text-reading">{pct}%</span>
          </div>
          <ProgressBar value={pct} label="읽은 비율" />
        </div>
      )}

      <div className="-mx-6 -mb-4 mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft bg-paper px-6 py-3.5">
        <button type="button" onClick={() => void markComplete()} disabled={busy !== null} className="btn btn-ghost -ml-2 text-completed-dark hover:text-completed-dark">
          {busy === 'complete' ? '옮기는 중' : '다 읽었어요'}
        </button>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            취소
          </button>
          <button type="submit" disabled={busy !== null || page === null || invalid} className="btn btn-primary">
            {busy === 'save' ? '저장 중' : '저장'}
          </button>
        </div>
      </div>
    </form>
  );
}
