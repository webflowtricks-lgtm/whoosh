import { safeFetchJson, saveGlobalConfig } from './api';

export type ShopTabId = 'title' | 'skin' | 'frame' | 'bundle' | 'roulette';

export const DEFAULT_SHOP_TAB_ORDER: ShopTabId[] = [
  'title',
  'skin',
  'frame',
  'bundle',
  'roulette',
];

const STORAGE_KEY = 'naruto_shop_tab_order';

export function normalizeShopTabOrder(value: unknown): ShopTabId[] {
  const validTabs = Array.isArray(value)
    ? value.filter((tab): tab is ShopTabId =>
        typeof tab === 'string' && DEFAULT_SHOP_TAB_ORDER.includes(tab as ShopTabId),
      )
    : [];
  return [
    ...new Set(validTabs),
    ...DEFAULT_SHOP_TAB_ORDER.filter(tab => !validTabs.includes(tab)),
  ];
}

export function isValidShopTabOrder(value: unknown): value is ShopTabId[] {
  return Array.isArray(value) &&
    value.length === DEFAULT_SHOP_TAB_ORDER.length &&
    value.every((tab): tab is ShopTabId =>
      typeof tab === 'string' && DEFAULT_SHOP_TAB_ORDER.includes(tab as ShopTabId),
    ) &&
    new Set(value).size === DEFAULT_SHOP_TAB_ORDER.length;
}

export async function fetchShopTabOrder(): Promise<ShopTabId[]> {
  const data = await safeFetchJson<{ success?: boolean; order?: unknown }>('/api/shop/tab-order');
  if (data?.success && isValidShopTabOrder(data.order)) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.order));
    } catch (error) {
      console.warn('Não foi possível salvar a ordem das abas da loja localmente:', error);
    }
    return data.order;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeShopTabOrder(JSON.parse(stored)) : DEFAULT_SHOP_TAB_ORDER;
  } catch (error) {
    console.error('Não foi possível carregar a ordem local das abas da loja:', error);
    return DEFAULT_SHOP_TAB_ORDER;
  }
}

export async function saveShopTabOrder(order: ShopTabId[]): Promise<void> {
  if (!isValidShopTabOrder(order)) {
    throw new Error('A ordem das abas da loja é inválida.');
  }
  await saveGlobalConfig('/api/shop/tab-order', { order });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch (error) {
    console.warn('Não foi possível salvar a ordem das abas da loja localmente:', error);
  }
}
