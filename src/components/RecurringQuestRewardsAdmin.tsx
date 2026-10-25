import { useEffect, useState } from 'react';
import { Box, CheckCircle, Clock3, Gem, PackageOpen, Plus, Save, Trash2, Trophy } from 'lucide-react';
import type { NinjaCard, QuestReward, RecurringQuestSettings, ShopItem } from '../types';
import { getCards, fetchCardsFromServer } from '../lib/cardStorage';
import { safeFetchJson, saveGlobalConfig } from '../lib/api';
import { useLanguage } from '../lib/i18n';
import { fetchShopItemsFromServer, getShopItems } from '../lib/shopStorage';
import {
  getCurrentRecurringQuests,
  getDefaultRecurringQuestSettings,
  getRecurringChestTiers,
  isValidRecurringQuestRewards,
} from '../lib/recurringQuests';

type RewardsView = 'daily-missions' | 'weekly-missions' | 'daily-chests' | 'weekly-chests';

const rewardTypes: Array<{ value: QuestReward['type']; label: string }> = [
  { value: 'ryos', label: 'Moedas' },
  { value: 'gems', label: 'Gems' },
  { value: 'card_pack', label: 'Pacote Ninja Card' },
  { value: 'title', label: 'Título' },
  { value: 'unlock_character', label: 'Desbloquear personagem' },
  { value: 'card', label: 'Figura colecionável' },
  { value: 'skill_skin', label: 'Skin de habilidade' },
  { value: 'frame', label: 'Moldura' },
  { value: 'banner', label: 'Banner' },
];

function newReward(type: QuestReward['type']): QuestReward {
  if (type === 'ryos' || type === 'gems') return { type, value: '500' };
  if (type === 'card_pack') return { type, value: '1' };
  if (type === 'card' || type === 'skill_skin') return { type, value: '' };
  return { type, value: type === 'title' ? 'Novo título' : '' };
}

interface RewardEditorProps {
  rewards: QuestReward[];
  cards: NinjaCard[];
  skillSkinItems: ShopItem[];
  onChange: (rewards: QuestReward[]) => void;
}

function RewardEditor({ rewards, cards, skillSkinItems, onChange }: RewardEditorProps) {
  const { t } = useLanguage();
  const updateReward = (index: number, update: Partial<QuestReward>) => {
    onChange(rewards.map((reward, itemIndex) => itemIndex === index ? { ...reward, ...update } : reward));
  };

  return (
    <div className="space-y-2">
      {rewards.map((reward, index) => (
        <div className="grid gap-2 rounded-lg border border-slate-700 bg-slate-950/70 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end" key={`${reward.type}-${index}`}>
          <label className="grid gap-1 text-[10px] font-bold uppercase text-slate-400">
            {t('Tipo de recompensa', 'Reward type')}
            <select
              className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-white"
              value={reward.type}
              onChange={event => {
                const nextType = event.target.value as QuestReward['type'];
                updateReward(index, newReward(nextType));
              }}
            >
              {rewardTypes.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          {reward.type === 'skill_skin' ? (
            <label className="grid gap-1 text-[10px] font-bold uppercase text-slate-400">
              {t('Skin de habilidade', 'Ability skin')}
              <select
                className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-white"
                value={reward.value}
                onChange={event => updateReward(index, { value: event.target.value })}
              >
                <option value="">{t('Selecione uma skin', 'Select a skin')}</option>
                {reward.value && !skillSkinItems.some(item => item.id === reward.value) && (
                  <option value={reward.value}>{reward.value} (ID salvo)</option>
                )}
                {skillSkinItems.map(item => (
                  <option value={item.id} key={item.id}>
                    {item.name} — {item.skillCharacterId}/{item.skillName}
                  </option>
                ))}
              </select>
            </label>
          ) : reward.type === 'card' && cards.length > 0 ? (
            <label className="grid gap-1 text-[10px] font-bold uppercase text-slate-400">
              {t('Figura', 'Card')}
              <select className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-white" value={reward.value} onChange={event => updateReward(index, { value: event.target.value })}>
                <option value="">{t('Selecione uma figura', 'Select a card')}</option>
                {cards.map(card => <option value={card.id} key={card.id}>{card.characterName} — {card.title}</option>)}
              </select>
            </label>
          ) : (
            <label className="grid gap-1 text-[10px] font-bold uppercase text-slate-400">
              {reward.type === 'ryos' || reward.type === 'gems' || reward.type === 'card_pack'
                ? t('Quantidade', 'Quantity')
                : t('Nome ou ID da recompensa', 'Reward name or ID')}
              <input
                type={reward.type === 'ryos' || reward.type === 'gems' || reward.type === 'card_pack' ? 'number' : 'text'}
                min={reward.type === 'ryos' || reward.type === 'gems' || reward.type === 'card_pack' ? 1 : undefined}
                max={reward.type === 'card_pack' ? 50 : undefined}
                step="1"
                className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-white"
                value={reward.value}
                onChange={event => updateReward(index, { value: event.target.value })}
                placeholder={reward.type === 'card' ? t('ID da figura', 'Card ID') : ''}
              />
            </label>
          )}
          {(reward.type === 'frame' || reward.type === 'banner') && (
            <label className="grid gap-1 text-[10px] font-bold uppercase text-slate-400 sm:col-span-2">
              URL da imagem
              <input className="min-h-10 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-white" value={reward.imageUrl || ''} onChange={event => updateReward(index, { imageUrl: event.target.value })} />
            </label>
          )}
          <button type="button" className="grid h-10 w-10 place-items-center rounded-md border border-red-900/70 text-red-300 hover:bg-red-950/50" onClick={() => onChange(rewards.filter((_, itemIndex) => itemIndex !== index))} aria-label={t('Remover recompensa', 'Remove reward')}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-700 px-3 text-xs font-bold text-amber-300 hover:border-amber-400" onClick={() => onChange([...rewards, newReward('ryos')])}>
        <Plus className="h-3.5 w-3.5" /> {t('Adicionar recompensa', 'Add reward')}
      </button>
    </div>
  );
}

export default function RecurringQuestRewardsAdmin() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<RecurringQuestSettings>(getDefaultRecurringQuestSettings);
  const [cards, setCards] = useState<NinjaCard[]>(() => getCards());
  const [skillSkinItems, setSkillSkinItems] = useState<ShopItem[]>(() =>
    getShopItems().filter(item => item.category === 'skill_skin'),
  );
  const [view, setView] = useState<RewardsView>('daily-missions');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      safeFetchJson<{ success?: boolean; settings?: RecurringQuestSettings }>('/api/recurring-quest-settings'),
      fetchCardsFromServer(),
      fetchShopItemsFromServer(),
    ]).then(([result, loadedCards, loadedShopItems]) => {
      if (!active) return;
      if (result?.success && result.settings) setSettings(result.settings);
      setCards(loadedCards.length ? loadedCards : getCards());
      setSkillSkinItems(loadedShopItems.filter(item => item.category === 'skill_skin'));
    }).catch(() => {
      if (active) setError(t('Não foi possível carregar as recompensas.', 'Could not load rewards.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [t]);

  const save = async () => {
    if (saving) return;
    if (Object.values(settings.missionRewards).some(rewards => !isValidRecurringQuestRewards(rewards)) ||
        Object.values(settings.chestRewards).some(chests => chests.some(rewards => !isValidRecurringQuestRewards(rewards)))) {
      setError(t('Cada missão e baú precisa de pelo menos uma recompensa válida.', 'Each mission and chest needs at least one valid reward.'));
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await saveGlobalConfig('/api/recurring-quest-settings', { settings });
      setSuccess(t('Recompensas recorrentes salvas.', 'Recurring rewards saved.'));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('Falha ao salvar as recompensas.', 'Could not save rewards.'));
    } finally {
      setSaving(false);
    }
  };

  const updateMissionRewards = (key: string, rewards: QuestReward[]) => {
    setSettings(current => ({
      ...current,
      missionRewards: { ...current.missionRewards, [key]: rewards },
    }));
  };

  const updateChestRewards = (period: 'daily' | 'weekly', index: number, rewards: QuestReward[]) => {
    setSettings(current => ({
      ...current,
      chestRewards: {
        ...current.chestRewards,
        [period]: current.chestRewards[period].map((item, itemIndex) => itemIndex === index ? rewards : item),
      },
    }));
  };

  const daily = view.startsWith('daily');
  const period = daily ? 'daily' : 'weekly';
  const missionsView = view.endsWith('missions');
  const quests = getCurrentRecurringQuests(new Date(), settings).filter(quest => quest.period === period);
  const chests = getRecurringChestTiers(period, settings);
  const views: Array<{ id: RewardsView; label: string }> = [
    { id: 'daily-missions', label: t('Missões diárias', 'Daily missions') },
    { id: 'weekly-missions', label: t('Missões semanais', 'Weekly missions') },
    { id: 'daily-chests', label: t('Baús diários', 'Daily chests') },
    { id: 'weekly-chests', label: t('Baús semanais', 'Weekly chests') },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-left sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black uppercase text-white"><Trophy className="h-5 w-5 text-amber-400" /> {t('Recompensas recorrentes', 'Recurring rewards')}</h2>
          <p className="mt-1 text-xs text-slate-400">{t('Configure a recompensa de cada missão e de cada baú.', 'Configure each mission and chest reward.')}</p>
        </div>
        <button type="button" disabled={saving || loading} onClick={() => { void save(); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-500 px-4 text-xs font-black uppercase text-slate-950 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? t('Salvando...', 'Saving...') : t('Salvar configuração', 'Save settings')}
        </button>
      </header>

      {error && <p className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200" role="alert">{error}</p>}
      {success && <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-200"><CheckCircle className="h-4 w-4" />{success}</p>}

      <nav className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label={t('Categoria de recompensas', 'Reward category')}>
        {views.map(item => (
          <button key={item.id} type="button" onClick={() => setView(item.id)} className={`min-h-11 rounded-lg border px-2 text-xs font-bold uppercase ${view === item.id ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}>
            {item.label}
          </button>
        ))}
      </nav>

      {loading ? <p className="py-10 text-center text-sm text-slate-400">{t('Carregando configuração...', 'Loading settings...')}</p> : missionsView ? (
        <section className="space-y-3">
          {quests.map(quest => (
            <article key={quest.recurringKey} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white">{quest.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{quest.desc}</p>
                </div>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-xs font-bold text-emerald-200">+{quest.recurringPoints} pts</span>
              </header>
              <RewardEditor rewards={settings.missionRewards[quest.recurringKey!] || quest.rewards} cards={cards} skillSkinItems={skillSkinItems} onChange={rewards => updateMissionRewards(quest.recurringKey!, rewards)} />
            </article>
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          {chests.map((chest, index) => (
            <article key={chest.tier} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-bold text-white"><PackageOpen className="h-4 w-4 text-amber-400" /> {t('Baú', 'Chest')} {chest.tier}</h3>
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-xs font-bold text-amber-200"><Clock3 className="h-3.5 w-3.5" />{chest.points} pts</span>
              </header>
              <RewardEditor rewards={settings.chestRewards[period][index] || chest.rewards} cards={cards} skillSkinItems={skillSkinItems} onChange={rewards => updateChestRewards(period, index, rewards)} />
            </article>
          ))}
        </section>
      )}
      <p className="text-[11px] text-slate-500">{t('Pacotes são abertos ao resgatar; títulos, personagens e figuras são validados pelo servidor.', 'Packs open on claim; titles, characters, and cards are validated by the server.')}</p>
    </main>
  );
}