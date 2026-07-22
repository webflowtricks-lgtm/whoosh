/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PngFrameItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string; // PNG image URL (or base64)
  badge?: string;
  isCustomUploaded?: boolean;
}

const STORAGE_KEY = 'naruto_png_frames';

export const DEFAULT_PNG_FRAMES: PngFrameItem[] = [
  {
    id: 'frame-guerra-png',
    name: 'Moldura Guerra Shinobi (PNG)',
    description: 'Moldura dourada com selos ninjas dourados e brilho de batalha.',
    imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=300&auto=format&fit=crop&q=80',
    badge: 'GUERRA'
  },
  {
    id: 'frame-akatsuki-png',
    name: 'Moldura Nuvens da Akatsuki (PNG)',
    description: 'Borda com nuvens vermelhas estilizadas da Akatsuki.',
    imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=300&auto=format&fit=crop&q=80',
    badge: 'AKATSUKI'
  },
  {
    id: 'frame-folha-png',
    name: 'Moldura Símbolo da Folha (PNG)',
    description: 'Moldura folhada verde com o símbolo da Vila Oculta da Folha.',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
    badge: 'KONOHA'
  }
];

export function getPngFrames(): PngFrameItem[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Error parsing PNG frames from localStorage:', e);
    }
  }
  return DEFAULT_PNG_FRAMES;
}

export function savePngFrames(frames: PngFrameItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(frames));
}

export function addPngFrame(frame: PngFrameItem): PngFrameItem[] {
  const frames = getPngFrames();
  const existingIndex = frames.findIndex(f => f.id === frame.id);
  let updated: PngFrameItem[];
  if (existingIndex >= 0) {
    updated = [...frames];
    updated[existingIndex] = frame;
  } else {
    updated = [...frames, frame];
  }
  savePngFrames(updated);
  return updated;
}

export function deletePngFrame(frameId: string): PngFrameItem[] {
  const frames = getPngFrames();
  const updated = frames.filter(f => f.id !== frameId);
  savePngFrames(updated);
  return updated;
}

export function resetToDefaultPngFrames(): PngFrameItem[] {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PNG_FRAMES));
  return DEFAULT_PNG_FRAMES;
}
