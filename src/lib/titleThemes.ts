import { ShopItem, TitleTheme } from '../types';

export const TITLE_THEME_OPTIONS: Array<{ id: TitleTheme; label: string; className: string }> = [
  { id: 'classic', label: 'Laranja clássico', className: 'title-theme-classic' },
  { id: 'gold', label: 'Dourado', className: 'title-theme-gold' },
  { id: 'gold-glow', label: 'Dourado brilhante', className: 'title-theme-gold-glow' },
  { id: 'crimson-glow', label: 'Vermelho e preto brilhante', className: 'title-theme-crimson-glow' },
  { id: 'blue-glow', label: 'Azul brilhante', className: 'title-theme-blue-glow' },
  { id: 'green-glow', label: 'Verde brilhante', className: 'title-theme-green-glow' },
  { id: 'pink-glow-royal', label: 'Rosa brilhante real', className: 'title-theme-pink-glow-royal' },
  { id: 'black-red', label: 'Preto e vermelho', className: 'title-theme-black-red' },
  { id: 'white-red', label: 'Branco e vermelho', className: 'title-theme-white-red' },
  { id: 'blue', label: 'Azul', className: 'title-theme-blue' },
  { id: 'cyan-glow', label: 'Azul-ciano brilhante', className: 'title-theme-cyan-glow' },
  { id: 'emerald', label: 'Verde esmeralda', className: 'title-theme-emerald' },
  { id: 'purple-glow', label: 'Roxo brilhante', className: 'title-theme-purple-glow' },
  { id: 'rainbow-glow', label: 'Arco-íris brilhante', className: 'title-theme-rainbow-glow' },
  { id: 'black-gold', label: 'Preto e dourado', className: 'title-theme-black-gold' },
  { id: 'silver', label: 'Prata metálica', className: 'title-theme-silver' },
  { id: 'crimson', label: 'Carmesim', className: 'title-theme-crimson' },
  { id: 'orange-flame', label: 'Chama laranja', className: 'title-theme-orange-flame' },
  { id: 'pink-glow', label: 'Rosa brilhante', className: 'title-theme-pink-glow' },
  { id: 'ice', label: 'Gelo azul', className: 'title-theme-ice' },
  { id: 'lava', label: 'Lava animada', className: 'title-theme-lava' },
  { id: 'shadow', label: 'Sombra', className: 'title-theme-shadow' },
  { id: 'leaf', label: 'Folha', className: 'title-theme-leaf' },
  { id: 'white-gold', label: 'Branco e dourado', className: 'title-theme-white-gold' },
];

export function getTitleThemeClass(theme?: TitleTheme | string): string {
  return TITLE_THEME_OPTIONS.find(option => option.id === theme)?.className || 'title-theme-classic';
}

export function findTitleItem(items: ShopItem[], title?: string): ShopItem | undefined {
  if (!title) return undefined;
  return items.find(item =>
    item.category === 'title' && (item.name === title || item.titleAliases?.includes(title)),
  );
}

export function getCanonicalTitleName(title: string, items: ShopItem[]): string {
  return findTitleItem(items, title)?.name || title;
}

export function isTitleUnlocked(unlockedTitles: string[], item: ShopItem): boolean {
  return unlockedTitles.includes(item.name) ||
    (item.titleAliases || []).some(alias => unlockedTitles.includes(alias));
}
