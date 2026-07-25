/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomBannerItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string; // HD Banner image URL or base64
  badge?: string;
  isCustomUploaded?: boolean;
}

const STORAGE_KEY = 'naruto_custom_banners';

export const DEFAULT_CUSTOM_BANNERS: CustomBannerItem[] = [
  {
    id: 'banner-fogo-vontade',
    name: 'Fogo da Vontade',
    description: 'Chamas ardentes da vontade de fogo de Konoha.',
    imageUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1200&auto=format&fit=crop',
    badge: 'DESBLOQUEADO'
  },
  {
    id: 'banner-nevoa-sangrenta',
    name: 'Névoa Sangrenta',
    description: 'Névoa mística e densa da Vila Oculta da Névoa.',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop',
    badge: 'MISSÃO'
  },
  {
    id: 'banner-noite-akatsuki',
    name: 'Noite Akatsuki',
    description: 'Céu estrelado noturno com atmosfera dos Renegados.',
    imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1200&auto=format&fit=crop',
    badge: 'LENDÁRIO'
  },
  {
    id: 'banner-vale-fim',
    name: 'Vale do Fim',
    description: 'Cenário épico do confronto lendário no Vale do Fim.',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop',
    badge: 'ÉPICO'
  }
];

export function getCustomBanners(): CustomBannerItem[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Error parsing custom banners from localStorage:', e);
    }
  }
  return DEFAULT_CUSTOM_BANNERS;
}

export async function fetchCustomBannersFromServer(): Promise<CustomBannerItem[]> {
  try {
    const res = await fetch('/api/banners');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.banners) && data.banners.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.banners));
        } catch (e) {
          console.warn("Failed to save banners to localStorage:", e);
        }
        return data.banners;
      }
    }
  } catch (e) {
    console.error("Failed to fetch banners from server:", e);
  }
  return getCustomBanners();
}

export function saveCustomBanners(banners: CustomBannerItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(banners));
  } catch (e) {
    console.warn("Failed to save custom banners in localStorage:", e);
  }
  fetch('/api/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ banners }),
  }).catch(err => console.error('Failed to sync banners to server:', err));
}

export function addCustomBanner(banner: CustomBannerItem): CustomBannerItem[] {
  const banners = getCustomBanners();
  const existingIndex = banners.findIndex(b => b.id === banner.id);
  let updated: CustomBannerItem[];
  if (existingIndex >= 0) {
    updated = [...banners];
    updated[existingIndex] = banner;
  } else {
    updated = [...banners, banner];
  }
  saveCustomBanners(updated);
  return updated;
}

export function deleteCustomBanner(bannerId: string): CustomBannerItem[] {
  const banners = getCustomBanners();
  const updated = banners.filter(b => b.id !== bannerId);
  saveCustomBanners(updated);
  return updated;
}

export function resetToDefaultCustomBanners(): CustomBannerItem[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CUSTOM_BANNERS));
  } catch (e) {
    console.warn("Failed to reset custom banners in localStorage:", e);
  }
  fetch('/api/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ banners: DEFAULT_CUSTOM_BANNERS }),
  }).catch(err => console.error('Failed to reset banners on server:', err));
  return DEFAULT_CUSTOM_BANNERS;
}
