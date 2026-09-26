import { useState } from 'react';

interface PortraitProps {
  src?: string | null;
  name: string;
  className?: string;
  shape?: 'rect' | 'circle';
}

/** 작가 사진. 사진이 없으면 이름 첫 글자를 찍는다. */
export function Portrait({ src, name, className = '', shape = 'rect' }: PortraitProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && failedSrc !== src;
  return (
    <div
      className={`relative overflow-hidden bg-paper-deep [container-type:inline-size] ${
        shape === 'circle' ? 'rounded-full' : 'rounded-[3px]'
      } ${className}`}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover grayscale-[.15] sepia-[.12]"
        />
      ) : (
        <div
          role="img"
          aria-label={name}
          className="flex h-full w-full items-center justify-center font-serif font-bold text-ink-faint"
          style={{ fontSize: 'clamp(13px, 36cqw, 88px)' }}
        >
          {name.trim().charAt(0)}
        </div>
      )}
    </div>
  );
}
