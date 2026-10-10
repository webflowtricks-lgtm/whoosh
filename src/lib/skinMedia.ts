export const MAX_SKIN_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;

export function isWebmSkinSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return /^data:video\/webm(?:[;,]|$)/i.test(source.trim()) || /\.webm(?:[?#]|$)/i.test(source.trim());
}

export function getSkinUploadError(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const isWebm = file.type.toLowerCase() === 'video/webm' || /\.webm$/i.test(file.name);
  if (file.type.startsWith('video/') && !isWebm) {
    return 'Envie um vídeo no formato WebM.';
  }
  if (isWebm && file.size > MAX_SKIN_VIDEO_SIZE_BYTES) {
    return 'O vídeo WebM deve ter no máximo 20 MB.';
  }
  if (!isWebm && file.type && !file.type.startsWith('image/')) {
    return 'Envie uma imagem ou um vídeo no formato WebM.';
  }
  return null;
}
