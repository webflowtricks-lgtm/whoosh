import { useState } from 'react';

interface MangekyoLoaderProps {
  src: string | null;
  alt?: string;
  /** Classes para o contêiner (define o tamanho do quadrado) */
  className?: string;
  /** Classes para a <img> final */
  imgClassName?: string;
  /** URL de fallback caso a imagem falhe (além do placeholder) */
  fallbackSrc?: string;
  /** Velocidade da rotação do mangekyo em ms (padrão 900) */
  spinSpeed?: number;
  /** Tamanho do ícone mangekyo em relação ao contêiner (padrão 50%) */
  iconScale?: number;
  /** Desabilitar o placeholder (mostra a imagem direto) */
  noPlaceholder?: boolean;
  /** Atributo title da imagem */
  title?: string;
}

/**
 * <img> com placeholder de carregamento: fundo preto + mangekyo vermelho girando
 * enquanto a imagem não termina de carregar.
 */
export function MangekyoLoader({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  fallbackSrc,
  spinSpeed = 900,
  iconScale = 0.5,
  noPlaceholder = false,
  title,
}: MangekyoLoaderProps) {
  const [loaded, setLoaded] = useState(false);
  const [srcUrl, setSrcUrl] = useState<string | null>(src);

  if (noPlaceholder) {
    return (
      <img
        src={srcUrl || undefined}
        alt={alt}
        title={title}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        className={imgClassName}
        onError={() => {
          if (fallbackSrc && srcUrl !== fallbackSrc) {
            setSrcUrl(fallbackSrc);
          }
        }}
      />
    );
  }
  return (
    <div className={`relative overflow-hidden bg-black flex items-center justify-center ${className}`}>
      {!loaded && (
        <img
          src="/static/img/icon/mangeky.svg"
          alt=""
          aria-hidden
          className="animate-spin pointer-events-none object-contain select-none"
          style={{
            width: `${iconScale * 100}%`,
            height: `${iconScale * 100}%`,
            filter: 'hue-rotate(-25deg) saturate(2) brightness(1.1) drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))',
            animationDuration: `${spinSpeed}ms`,
            animationTimingFunction: 'linear',
          }}
        />
      )}
      <img
        src={srcUrl || undefined}
        alt={alt}
        title={title}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (fallbackSrc && srcUrl !== fallbackSrc) {
            setSrcUrl(fallbackSrc);
          } else {
            setLoaded(true);
          }
        }}
      />
    </div>
  );
}

export default MangekyoLoader;
