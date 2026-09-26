import { useState } from 'react';

interface BookCoverProps {
  src?: string | null;
  alt: string;
  /** 표지가 없을 때 천 장정 위에 찍을 제목·저자 */
  title?: string;
  author?: string;
  className?: string;
  aspectRatio?: 'portrait' | 'square';
  loading?: 'lazy' | 'eager';
}

// 표지가 없는 책은 제목에 따라 천 장정 색 하나를 고정으로 받는다
const CLOTH = ['#6e2b24', '#2f4a5e', '#3e5a3c', '#7a5a2c', '#4a4257', '#5b4f45', '#294a4b', '#6b3f2a'];

function clothColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CLOTH[h % CLOTH.length];
}

export function BookCover({
  src,
  alt,
  title,
  author,
  className = '',
  aspectRatio = 'portrait',
  loading = 'lazy',
}: BookCoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const aspectClass = aspectRatio === 'portrait' ? 'aspect-[2/3]' : 'aspect-square';
  const showImage = !!src && failedSrc !== src;
  const label = title ?? alt;

  return (
    <div className={`book-cover ${aspectClass} ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loadedSrc === src ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : (
        <div className="cover-fallback" style={{ backgroundColor: clothColor(label) }} role="img" aria-label={alt}>
          <span className="cover-fallback-title">{label}</span>
          <span className="cover-fallback-rule" aria-hidden />
          {author && <span className="cover-fallback-author">{author}</span>}
          <span className="cover-fallback-band" aria-hidden />
        </div>
      )}
    </div>
  );
}
