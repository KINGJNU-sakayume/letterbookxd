import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface BookCoverProps {
  src?: string;
  alt: string;
  className?: string;
  aspectRatio?: 'portrait' | 'square';
}

// [M-3] 이미지 로드 실패 시 빈 공간 대신 fallback UI 렌더링
export function BookCover({ src, alt, className = '', aspectRatio = 'portrait' }: BookCoverProps) {
  const [imgError, setImgError] = useState(false);
  const aspectClass = aspectRatio === 'portrait' ? 'aspect-[2/3]' : 'aspect-square';

  const showFallback = !src || imgError;

  if (showFallback) {
    return (
      <div className={`${aspectClass} bg-stone-200 flex items-center justify-center rounded ${className}`}>
        <BookOpen size={32} className="text-stone-400" />
      </div>
    );
  }

  return (
    <div className={`${aspectClass} overflow-hidden rounded ${className}`}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    </div>
  );
}
