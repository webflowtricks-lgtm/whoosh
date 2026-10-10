import React from 'react';
import { isWebmSkinSource } from '../lib/skinMedia';

interface SkinMediaProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  autoPlay?: boolean;
  onImageError?: React.ReactEventHandler<HTMLImageElement>;
}

export default function SkinMedia({ src, alt, className = '', autoPlay = false, onImageError }: SkinMediaProps) {
  if (!src) return null;

  if (isWebmSkinSource(src)) {
    return (
      <video
        src={src}
        autoPlay={autoPlay}
        loop
        muted
        playsInline
        preload={autoPlay ? 'auto' : 'metadata'}
        aria-label={alt}
        role="img"
        className={className}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onError={onImageError}
    />
  );
}
