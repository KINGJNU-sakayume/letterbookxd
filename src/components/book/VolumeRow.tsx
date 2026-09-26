import { useState } from 'react';
import { Heart } from 'lucide-react';
import { StarRating } from '../ui/StarRating';
import { useLogStore } from '../../store/logStore';
import type { Volume } from '../../types';

interface VolumeRowProps {
  volume: Volume;
  label?: string;
  workId: string;
  editionSetId: string;
  isSingleVolume?: boolean;
  totalPages?: number;
}

type ReadingState = 'unread' | 'reading' | 'completed';

export function VolumeRow({
  volume, label, workId, editionSetId, isSingleVolume = false, totalPages
}: VolumeRowProps) {
  const { getVolumeLog, upsertVolumeLog, updateReadingProgress } = useLogStore();
  const log = getVolumeLog(volume.id);

  const readingState: ReadingState = log?.readingState ?? 'unread';
  const liked = log?.liked ?? false;
  const rating = log?.rating ?? null;
  const currentPage = log?.currentPage ?? null;

  const [pageInput, setPageInput] = useState<string>(currentPage?.toString() ?? '');
  const [isSavingPage, setIsSavingPage] = useState(false);

  const isReading = readingState === 'reading';
  const isCompleted = readingState === 'completed';

  function changeReadingState(next: ReadingState) {
    if (next === readingState) return;
    if (
      next === 'unread' &&
      readingState === 'completed' &&
      (liked || rating !== null) &&
      !confirm('완독 상태를 해제하면 별점과 인생책 표시가 함께 초기화됩니다. 계속할까요?')
    ) {
      return;
    }

    upsertVolumeLog({
      volumeId: volume.id,
      editionSetId,
      workId,
      logType: 'volume',
      readingState: next,
      currentPage: next === 'unread' ? null : (log?.currentPage ?? null),
      liked: next === 'unread' ? false : liked,
      rating: next === 'unread' ? null : rating,
    });

    if (next === 'reading') {
      setPageInput(currentPage?.toString() ?? '');
    } else if (next === 'unread') {
      setPageInput('');
    }
  }

  function handleRating(newRating: number | null) {
    if (!isCompleted) return;
    upsertVolumeLog({
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
    upsertVolumeLog({
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

  async function handleSavePage() {
    const page = parseInt(pageInput, 10);
    if (isNaN(page) || page < 0) return;
    setIsSavingPage(true);
    if (log) {
      await updateReadingProgress(volume.id, page);
    } else {
      await upsertVolumeLog({
        volumeId: volume.id,
        editionSetId,
        workId,
        logType: 'volume',
        readingState: 'reading',
        currentPage: page,
        liked: false,
        rating: null,
      });
    }
    setIsSavingPage(false);
  }

  const progressPercent = totalPages && currentPage
    ? Math.min(100, Math.round((currentPage / totalPages) * 100))
    : null;

  return (
    <div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {!isSingleVolume && (
          <span className="w-6 h-6 rounded-full bg-stone-200 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">
            {volume.volumeNumber}
          </span>
        )}
        <span className="flex-1 text-sm font-medium text-stone-800 truncate">{label ?? volume.title}</span>

        <div className="flex items-center gap-2 shrink-0">
          {isReading ? (
            // Reading state: progress bar + %
            <div className="flex items-center gap-2">
              {progressPercent !== null ? (
                <>
                  <div className="w-20 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progressPercent}%`, backgroundColor: '#378ADD' }}
                    />
                  </div>
                  <span className="text-xs tabular-nums" style={{ color: '#378ADD' }}>{progressPercent}%</span>
                </>
              ) : (
                <span className="text-xs text-stone-400">읽는 중</span>
              )}
            </div>
          ) : (
            // Unread / Completed: star rating + heart
            <>
              <StarRating
                rating={rating}
                onChange={isCompleted ? handleRating : undefined}
                size="sm"
                readonly={!isCompleted}
              />
              {isCompleted && (
                <button
                  onClick={handleLiked}
                  title="인생책"
                  className="p-1.5 rounded-md transition-colors"
                  style={liked
                    ? { color: '#e11d48', backgroundColor: '#fff1f2' }
                    : { color: '#a8a29e' }
                  }
                >
                  <Heart size={16} className={liked ? 'fill-rose-500' : ''} />
                </button>
              )}
            </>
          )}

          <select
            value={readingState}
            onChange={(event) => changeReadingState(event.target.value as ReadingState)}
            aria-label="독서 상태"
            className={`text-xs font-medium rounded-md border px-2 py-1.5 outline-none transition-colors ${
              readingState === 'completed'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : readingState === 'reading'
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-stone-200 text-stone-500'
            }`}
          >
            <option value="unread">안 읽음</option>
            <option value="reading">읽는 중</option>
            <option value="completed">완독</option>
          </select>
        </div>
      </div>

      {/* Reading accordion */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: isReading ? '72px' : '0px' }}
      >
        <div
          className="mx-3 mb-2 px-3 py-2.5 rounded-lg flex items-center gap-2 text-sm"
          style={{ backgroundColor: '#E6F1FB', border: '1px solid #B5D4F4' }}
        >
          <span className="text-stone-500 shrink-0">p.</span>
          <input
            type="number"
            min={0}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSavePage(); }}
            className="w-16 bg-white border rounded px-2 py-0.5 text-sm text-stone-800 outline-none focus:ring-1"
            style={{ borderColor: '#B5D4F4' }}
            placeholder="127"
          />
          {totalPages ? (
            <span className="text-stone-500 shrink-0">/ {totalPages}p</span>
          ) : (
            <span className="text-stone-400 shrink-0">p</span>
          )}
          <button
            onClick={handleSavePage}
            disabled={isSavingPage}
            className="ml-auto px-3 py-0.5 rounded text-xs font-medium text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#378ADD' }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
