/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShopItem } from '../types';

const STORAGE_KEY = 'naruto_shop_items';

export const DEFAULT_SHOP_ITEMS: ShopItem[] = [
  // Títulos Shinobi (Titles)
  {
    id: 'title-sabio-sannin',
    name: 'Lenda dos Sannin',
    category: 'title',
    description: 'Título exclusivo de prestígio reconhecido por todos os países ninjas.',
    currency: 'ryos',
    price: 1500,
    badge: 'TÍTULO'
  },
  {
    id: 'title-akatsuki-renegado',
    name: 'Akatsuki Renegado',
    category: 'title',
    description: 'Título para aqueles que trilham o caminho da névoa e das sombras.',
    currency: 'gems',
    price: 60,
    badge: 'TÍTULO'
  },
  {
    id: 'title-mestre-taijutsu',
    name: 'Mestre dos Oito Portões',
    category: 'title',
    description: 'Título honroso concedido a guerreiros que dominam a força do Taijutsu.',
    currency: 'ryos',
    price: 900,
    badge: 'TÍTULO'
  },
  {
    id: 'title-deus-shinobi',
    name: 'Deus dos Shinobis',
    category: 'title',
    description: 'O mais alto título do mundo ninja, gravado nos monumentos da arena.',
    currency: 'gems',
    price: 120,
    badge: 'MÍTICO'
  },

  // Skins de Personagem (Skins)
  {
    id: 'skin-naruto-sage',
    name: 'Naruto Modo Sábio',
    category: 'skin',
    characterName: 'Naruto Uzumaki',
    description: 'Visual lendário de Naruto vestindo a capa vermelha do Modo Sábio de Senjutsu.',
    currency: 'gems',
    price: 150,
    skinImageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    badge: 'LENDÁRIO'
  },
  {
    id: 'skin-sasuke-hebi',
    name: 'Sasuke Traje Hebi',
    category: 'skin',
    characterName: 'Sasuke Uchiha',
    description: 'Visual de Sasuke durante a formação do esquadrão Hebi na caça a Itachi.',
    currency: 'ryos',
    price: 2500,
    skinImageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
    badge: 'RARO'
  },
  {
    id: 'skin-kakashi-anbu',
    name: 'Kakashi Capitão ANBU',
    category: 'skin',
    characterName: 'Kakashi Hatake',
    description: 'Traje operacional sombrio das Forças Especiais ANBU de Konoha.',
    currency: 'gems',
    price: 100,
    skinImageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80',
    badge: 'ANBU'
  },

  // Molduras de Perfil (Profile Frames)
  {
    id: 'frame-chama-vontade',
    name: 'Fogo da Vontade',
    category: 'frame',
    description: 'Moldura reluzente inspirada no fogo e determinação dos ninjas de Konoha.',
    currency: 'ryos',
    price: 800,
    frameStyle: 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] bg-gradient-to-tr from-amber-500 to-red-500',
    badge: 'POPULAR'
  },
  {
    id: 'frame-sharingan-crimson',
    name: 'Sharingan Carmesim',
    category: 'frame',
    description: 'Moldura com áurea rubra misteriosa inspirada no lendário Dōjutsu do Clã Uchiha.',
    currency: 'gems',
    price: 50,
    frameStyle: 'border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.7)] bg-gradient-to-tr from-red-600 to-rose-950',
    badge: 'LENDÁRIO'
  },
  {
    id: 'frame-anbu-operativo',
    name: 'Operativo ANBU',
    category: 'frame',
    description: 'Moldura prateada elegante reservada para ninjas das forças especiais de esquadrão.',
    currency: 'ryos',
    price: 1200,
    frameStyle: 'border-slate-300 shadow-[0_0_15px_rgba(203,213,225,0.5)] bg-gradient-to-tr from-slate-200 to-slate-500',
    badge: 'ANBU'
  },

  // Pacotes e Vouchers (Bundles)
  {
    id: 'bundle-ryos-p',
    name: 'Bolsa de Ryos',
    category: 'bundle',
    description: 'Bolsa contendo 1.000 Ryos para desbloqueios e compras na loja.',
    currency: 'gems',
    price: 20,
    bundleGrant: { type: 'ryos', amount: 1000 },
    badge: 'PACOTE'
  },
  {
    id: 'bundle-ryos-g',
    name: 'Baú do Tesouro Ninja',
    category: 'bundle',
    description: 'Grande baú com 3.000 Ryos para expansão rápida do seu império ninja.',
    currency: 'gems',
    price: 50,
    bundleGrant: { type: 'ryos', amount: 3000 },
    badge: 'OFERTA'
  }
];

export function getShopItems(): ShopItem[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse shop items from localStorage:', e);
    }
  }
  return DEFAULT_SHOP_ITEMS;
}

export async function fetchShopItemsFromServer(): Promise<ShopItem[]> {
  try {
    const res = await fetch('/api/shop');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.items) && data.items.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.items));
        } catch (e) {
          console.warn("Failed to save shop items to localStorage:", e);
        }
        return data.items;
      }
    }
  } catch (e) {
    console.error("Failed to fetch shop items from server:", e);
  }
  return getShopItems();
}

export function saveShopItems(items: ShopItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("Failed to save shop items in localStorage:", e);
  }
  fetch('/api/shop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  }).catch(err => console.error('Failed to sync shop items to server:', err));
}

export function resetToDefaultShopItems(): ShopItem[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SHOP_ITEMS));
  } catch (e) {
    console.warn("Failed to reset shop items in localStorage:", e);
  }
  fetch('/api/shop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: DEFAULT_SHOP_ITEMS }),
  }).catch(err => console.error('Failed to reset shop items on server:', err));
  return DEFAULT_SHOP_ITEMS;
}
