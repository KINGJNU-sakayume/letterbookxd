import { useState, type FormEvent } from 'react';
import { StarRating } from '../ui/StarRating';
import { LikeButton } from '../ui/LikeButton';
import { ProgressBar } from '../ui/ProgressBar';
import { useConfirm } from '../ui/confirm';
import { useLogStore } from '../../store/logStore';
import type { Volume } from '../../types';
import { progressPercent } from '../../utils/format';
import { READING_STATE_LABEL, type ReadingState } from '../../utils/readingState';

interface VolumeRowProps {
  volume: Volume;
  /** 권 표시 ('상', '1' …). 한 권짜리는 비워 둔다 */
  volumeMark?: string;
  label?: string;
  workId: string;
  editionSetId: string;
  isSingleVolume?: boolean;
  totalPages?: number;
  /** 로그인한 사람만 기록을 바꿀 수 있다 */
  canEdit?: boolean;
}

const STATE_STYLE: Record<ReadingState, string> = {
  unread: 'bg-paper-raised text-ink shadow-[0_0_0_1px_rgb(29_27_23/0.1)]',
  reading: 'bg-reading text-paper-raised',
  completed: 'bg-completed text-paper-raised',
};

export function VolumeRow({
  volume, volumeMark, label, workId, editionSetId, isSingleVolume = false, totalPages, canEdit = true,
}: VolumeRowProps) {
  const { getVolumeLog, upsertVolumeLog } = useLogStore();
  const confirm = useConfirm();
  const log = getVolumeLog(volume.id);

  const readingState: ReadingState = log?.readingState ?? 'unread';
  const liked = log?.liked ?? false;
  const rating = log?.rating ?? null;
  const currentPage = log?.currentPage ?? null;

  const isReading = readingState === 'reading';
  const isCompleted = readingState === 'completed';

  async function setReadingState(next: ReadingState) {
    if (next === readingState) return;
    if (readingState === 'completed' && next === 'unread') {
      const ok = await confirm({
        title: '완독 표시를 지울까요?',
        description: '이 권에 남긴 별점과 인생책 표시도 함께 지워집니다.',
        confirmLabel: '지우기',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await upsertVolumeLog({
      volumeId: volume.id,
      editionSetId,
      workId,
      logType: 'volume',
      readingState: next,
      currentPage: next === 'unread' ? null : (log?.currentPage ?? null),
      liked: next === 'unread' ? false : liked,
      rating: next === 'unread' ? null : rating,
    });
  }

  function handleRating(newRating: number | null) {
    if (!isCompleted) return;
    void upsertVolumeLog({
      volumeId: volume.id,
      editionSetId,
      workId,
      logType: 'volume',
      readingState,
      currentPage: log?.currentPage ?? null,
      liked,
      rating: newRating,
    });
  }

  function handleLiked() {
    if (!isCompleted) return;
    void upsertVolumeLog({
      volumeId: volume.id,
      editionSetId,
      workId,
      logType: 'volume',
      readingState,
      currentPage: log?.currentPage ?? null,
      liked: !liked,
      rating,
    });
  }

  const progress = progressPercent(currentPage, totalPages);

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3.5">
          {!isSingleVolume && (
            <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-paper px-1.5 font-serif text-[15px] font-bold text-ink-soft">
              {volumeMark || volume.volumeNumber}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">{label ?? volume.title}</p>
            {totalPages ? <p className="tnum text-[12.5px] text-ink-muted">{totalPages.toLocaleString()}쪽</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {isReading && (
            <div className="flex w-36 items-center gap-2" title={currentPage ? `${currentPage}쪽까지 읽음` : undefined}>
              {progress !== null ? (
                <>
                  <ProgressBar value={progress} className="flex-1" label={`${label ?? volume.title} 읽은 비율`} />
                  <span className="tnum w-9 text-right text-[12.5px] font-semibold text-reading">{progress}%</span>
                </>
              ) : (
                <span className="text-[12.5px] text-ink-muted">쪽수 미입력</span>
              )}
            </div>
          )}
          {isCompleted && (
            <div className="flex items-center gap-1">
              <StarRating rating={rating} onChange={canEdit ? handleRating : undefined} readonly={!canEdit} size="sm" label={`${label ?? volume.title} 별점`} />
              <LikeButton liked={liked} onToggle={canEdit ? handleLiked : undefined} compact />
            </div>
          )}

          {canEdit ? (
            <div role="group" aria-label="읽기 상태" className="flex items-center gap-0.5 rounded-[6px] bg-paper-sunken p-[3px]">
              {(['unread', 'reading', 'completed'] as ReadingState[]).map((state) => {
                const active = readingState === state;
                return (
                  <button
                    key={state}
                    type="button"
                    onClick={() => void setReadingState(state)}
                    aria-pressed={active}
                    className={`h-7 rounded-[4px] px-2.5 text-[12.5px] font-medium transition-colors ${
                      active ? STATE_STYLE[state] : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {READING_STATE_LABEL[state]}
                  </button>
                );
              })}
            </div>
          ) : (
            readingState !== 'unread' && (
              <span className={`text-[12.5px] font-medium ${isReading ? 'text-reading' : 'text-completed-dark'}`}>
                {READING_STATE_LABEL[readingState]}
              </span>
            )
          )}
        </div>
      </div>

      {isReading && canEdit && (
        <PageForm key={currentPage ?? 'none'} volumeId={volume.id} workId={workId} editionSetId={editionSetId} initialPage={currentPage} totalPages={totalPages} />
      )}
    </li>
  );
}

function PageForm({
  volumeId, workId, editionSetId, initialPage, totalPages,
}: {
  volumeId: string;
  workId: string;
  editionSetId: string;
  initialPage: number | null;
  totalPages?: number;
}) {
  const { getVolumeLog, upsertVolumeLog, updateReadingProgress } = useLogStore();
  const [value, setValue] = useState(initialPage?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const invalid = value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0 || (!!totalPages && Number(value) > totalPages));

  async function save(e: FormEvent) {
    e.preventDefault();
    const page = parseInt(value, 10);
    if (isNaN(page) || page < 0 || invalid) return;
    setSaving(true);
    if (getVolumeLog(volumeId)) {
      await updateReadingProgress(volumeId, page);
    } else {
      await upsertVolumeLog({
        volumeId,
        editionSetId,
        workId,
        logType: 'volume',
        readingState: 'reading',
        currentPage: page,
        liked: false,
        rating: null,
      });
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={save}
      className="animate-fade-in mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[5px] border border-reading-border/70 bg-reading-light/60 px-3 py-2.5"
    >
      <label htmlFor={`page-${volumeId}`} className="text-[13px] font-medium text-reading-dark">
        지금 읽는 쪽
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`page-${volumeId}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={totalPages}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid}
          className={`field tnum h-8 w-24 py-0 text-[14px] ${invalid ? 'border-seal focus:border-seal focus:ring-seal' : ''}`}
        />
        <span className="tnum text-[13px] text-ink-muted">{totalPages ? `/ ${totalPages}쪽` : '쪽'}</span>
      </div>
      {invalid && <span className="text-[12.5px] text-seal">{totalPages ? `0~${totalPages} 사이로 적어 주세요` : '0 이상으로 적어 주세요'}</span>}
      <button type="submit" disabled={saving || value === '' || invalid} className="btn btn-sm ml-auto bg-reading text-paper-raised hover:bg-reading-dark">
        {saving ? '저장 중' : '기록'}
      </button>
    </form>
  );
}
