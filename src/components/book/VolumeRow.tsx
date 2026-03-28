import { Eye, EyeOff, Heart } from 'lucide-react';
import { StarRating } from '../ui/StarRating';
import { useLogStore } from '../../store/logStore';
import type { Volume } from '../../types';

interface VolumeRowProps {
  volume: Volume;
  label?: string;
  workId: string;
  editionSetId: string;
  userId: string;
  isSingleVolume?: boolean;
}

export function VolumeRow({
  volume, label, workId, editionSetId, userId, isSingleVolume = false
}: VolumeRowProps) {
  const { getVolumeLog, upsertVolumeLog } = useLogStore();
  const log = getVolumeLog(volume.id);

  // [C-2] 단권용 중복 upsertVolumeLog(logType:'set') 호출 제거
  // upsertVolumeLog 내부 로직이 watched 상태 기반으로 set_completion을 자동 관리합니다.
  function updateLog(newData: { watched: boolean; liked: boolean; rating: number | null }) {
    if (!userId) return;
    upsertVolumeLog(
      { volumeId: volume.id, editionSetId, workId, logType: 'volume', ...newData },
      userId
    );
  }

  function toggle(field: 'watched' | 'liked') {
    updateLog({
      watched: field === 'watched' ? !(log?.watched ?? false) : (log?.watched ?? false),
      liked: field === 'liked' ? !(log?.liked ?? false) : (log?.liked ?? false),
      rating: log?.rating ?? null,
    });
  }

  function handleRating(rating: number | null) {
    updateLog({ watched: log?.watched ?? false, liked: log?.liked ?? false, rating });
  }

  const watched = log?.watched ?? false;
  const liked = log?.liked ?? false;
  const rating = log?.rating ?? null;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {!isSingleVolume && (
        <span className="w-6 h-6 rounded-full bg-stone-200 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">
          {volume.volumeNumber}
        </span>
      )}
      <span className="flex-1 text-sm font-medium text-stone-800 truncate">{label ?? volume.title}</span>
      <div className="flex items-center gap-2 shrink-0">
        <StarRating rating={rating} onChange={handleRating} size="sm" />
        <button
          onClick={() => toggle('liked')}
          title="좋아요"
          className={`p-1.5 rounded-md transition-colors ${
            liked ? 'text-rose-500 bg-rose-50 hover:bg-rose-100' : 'text-stone-400 hover:text-rose-400 hover:bg-rose-50'
          }`}
        >
          <Heart size={16} className={liked ? 'fill-rose-500' : ''} />
        </button>
        <button
          onClick={() => toggle('watched')}
          title="봤어요"
          className={`p-1.5 rounded-md transition-colors ${
            watched ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-stone-400 hover:text-emerald-500 hover:bg-emerald-50'
          }`}
        >
          {watched ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
    </div>
  );
}
