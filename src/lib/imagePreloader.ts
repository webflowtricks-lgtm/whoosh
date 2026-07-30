/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Character } from '../types';

const preloadedUrls = new Set<string>();

/**
 * Preloads a single image URL into browser cache.
 */
export function preloadImage(url: string): Promise<void> {
  if (!url || preloadedUrls.has(url)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const img: HTMLImageElement = new Image();
    img.src = url;
    
    img.onload = () => {
      preloadedUrls.add(url);
      resolve();
    };
    img.onerror = () => {
      resolve();
    };

    if ('decode' in img && typeof img.decode === 'function') {
      img
        .decode()
        .then(() => {
          preloadedUrls.add(url);
          resolve();
        })
        .catch(() => {
          // Fallback handled by onload/onerror
        });
    }
  });
}

/**
 * Preloads a list of image URLs in parallel batches.
 */
export async function preloadImagesBatch(urls: string[], batchSize = 10): Promise<void> {
  const uniqueUrls = Array.from(new Set(urls.filter((u): u is string => Boolean(u) && !preloadedUrls.has(u))));
  
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(url => preloadImage(url)));
  }
}

/**
 * Extract and preload all image URLs for a set of characters
 * (portraits, skin images, skill icons).
 */
export function preloadCharacters(characters: Character[]): void {
  if (!Array.isArray(characters) || characters.length === 0) return;

  const urls: string[] = [];

  characters.forEach(char => {
    if (char.portrait) urls.push(char.portrait);
    
    if (Array.isArray(char.skins)) {
      char.skins.forEach(skin => {
        if (skin.image) urls.push(skin.image);
      });
    }

    if (Array.isArray(char.skills)) {
      char.skills.forEach(skill => {
        if (skill.icon) urls.push(skill.icon);
      });
    }
  });

  // Execute preloading in background idle time
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        preloadImagesBatch(urls, 12);
      });
    } else {
      setTimeout(() => {
        preloadImagesBatch(urls, 12);
      }, 100);
    }
  }
}

/**
 * Common UI static images to preload on app start
 */
export function preloadCommonUI(): void {
  const uiAssets = [
    '/static/img/ui/pergaminho.webp',
    'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg'
  ];
  preloadImagesBatch(uiAssets, 5);
}
