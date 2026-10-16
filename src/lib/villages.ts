export type VillageId =
  | 'konoha'
  | 'akatsuki'
  | 'takumi'
  | 'hoshigakure'
  | 'amegakure'
  | 'otogakure'
  | 'tsukigakure'
  | 'iwagakure'
  | 'takigakure'
  | 'kusagakure'
  | 'sunagakure'
  | 'kirigakure'
  | 'kumogakure'
  | 'yugakure';

export const VILLAGES: Array<{
  id: VillageId;
  name: string;
  englishName: string;
  icon: string;
}> = [
  { id: 'konoha', name: 'Konoha', englishName: 'Hidden Leaf', icon: '/static/img/icon/vilas/Konohagakure_Symbol.webp' },
  { id: 'takumi', name: 'Takumi', englishName: 'Takumi', icon: '/static/img/icon/vilas/Takumi_Village_Symbol.webp' },
  { id: 'hoshigakure', name: 'Hoshigakure', englishName: 'Hidden Star', icon: '/static/img/icon/vilas/Hoshigakure_Symbol.webp' },
  { id: 'amegakure', name: 'Amegakure', englishName: 'Hidden Rain', icon: '/static/img/icon/vilas/Amegakure_Symbol.webp' },
  { id: 'otogakure', name: 'Otogakure', englishName: 'Hidden Sound', icon: '/static/img/icon/vilas/Otogakure_Symbol.webp' },
  { id: 'tsukigakure', name: 'Tsukigakure', englishName: 'Hidden Moon', icon: '/static/img/icon/vilas/Getsugakure_Symbol.webp' },
  { id: 'iwagakure', name: 'Iwagakure', englishName: 'Hidden Stone', icon: '/static/img/icon/vilas/Iwagakure_Symbol.webp' },
  { id: 'takigakure', name: 'Takigakure', englishName: 'Hidden Waterfall', icon: '/static/img/icon/vilas/Takigakure_Symbol.webp' },
  { id: 'kusagakure', name: 'Kusagakure', englishName: 'Hidden Grass', icon: '/static/img/icon/vilas/Kusagakure_Symbol.webp' },
  { id: 'sunagakure', name: 'Sunagakure', englishName: 'Hidden Sand', icon: '/static/img/icon/vilas/Sunagakure_Symbol.webp' },
  { id: 'kirigakure', name: 'Kirigakure', englishName: 'Hidden Mist', icon: '/static/img/icon/vilas/Kirigakure_Symbol.webp' },
  { id: 'kumogakure', name: 'Kumogakure', englishName: 'Hidden Cloud', icon: '/static/img/icon/vilas/Kumogakure_Symbol.webp' },
  { id: 'yugakure', name: 'Yugakure', englishName: 'Hidden Hot Water', icon: '/static/img/icon/vilas/Yugakure_Symbol.webp' },
];

export function getVillageById(id: string | undefined) {
  return VILLAGES.find(village => village.id === id);
}

export function isVillageId(id: unknown): id is VillageId {
  return typeof id === 'string' && VILLAGES.some(village => village.id === id);
}

export function getCurrentVillageId(profileVillage?: string): string {
  if (profileVillage) return profileVillage;
  try {
    return localStorage.getItem('naruto_ninja_affiliation') || 'konoha';
  } catch (error) {
    console.error('Failed to load selected ninja affiliation:', error);
    return 'konoha';
  }
}
