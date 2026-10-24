import { useEffect, useState } from 'react';
import { Check, Gift, LoaderCircle, PackageOpen, X } from 'lucide-react';
import type { NinjaCard, Quest, RecurringQuestSettings, UserProfile } from '../types';
import { safeFetchJson } from '../lib/api';
import { matchFetch } from '../lib/matchFetch';
import { playGlobalSound } from '../lib/soundUtils';
import CardPackRouletteModal from './CardPackRouletteModal';
import { fetchCardsFromServer, getCards } from '../lib/cardStorage';
import {
  calculateRecurringPoints,
  getDefaultRecurringQuestSettings,
  getCurrentRecurringQuests,
  getRecurringChestClaimId,
  getRecurringChestTiers,
  isRecurringChestUnlocked,
} from '../lib/recurringQuests';
import { useLanguage } from '../lib/i18n';

interface RecurringQuestsModalProps {
  user: UserProfile;
  onUpdateUser: (updatedUser: UserProfile) => void;
  onClose: () => void;
  playClickSound: () => void;
  playWinSound: () => void;
}

export default function RecurringQuestsModal({
  user,
  onUpdateUser,
  onClose,
  playClickSound,
  playWinSound,
}: RecurringQuestsModalProps) {
  const { t } = useLanguage();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [settings, setSettings] = useState<RecurringQuestSettings>(getDefaultRecurringQuestSettings);
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly'>('daily');
  const [loading, setLoading] = useState(true);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [claimingChestTier, setClaimingChestTier] = useState<number | null>(null);
  const [selectedChestTier, setSelectedChestTier] = useState<number | null>(null);
  const [chestRevealStage, setChestRevealStage] = useState<'closed' | 'open' | null>(null);
  const [rouletteReveal, setRouletteReveal] = useState<{ cards: NinjaCard[]; catalog: NinjaCard[] } | null>(null);
  const [error, setError] = useState('');
  const isGuest = user.username.trim().toLowerCase() === 'convidado';

  useEffect(() => {
    let active = true;
    void Promise.all([
      safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests?includeRecurring=true'),
      safeFetchJson<{ success?: boolean; settings?: RecurringQuestSettings }>('/api/recurring-quest-settings'),
    ]).then(([data, settingsResult]) => {
        if (!active) return;
        if (!data?.success || !Array.isArray(data.quests)) {
          setError(t('Não foi possível carregar as missões.', 'Could not load missions.'));
          return;
        }
        const recurringSettings = settingsResult?.success && settingsResult.settings
          ? settingsResult.settings
          : getDefaultRecurringQuestSettings();
        const completed = new Set(user.completedQuestIds || []);
        const currentQuests = getCurrentRecurringQuests(new Date(), recurringSettings).map(quest => {
          const savedGoals = new Map((user.questProgress?.[quest.id] || []).map(goal => [goal.id, goal]));
          return {
            ...quest,
            completed: completed.has(quest.id),
            goals: quest.goals.map(goal => ({
              ...goal,
              currentValue: savedGoals.get(goal.id)?.currentValue ?? goal.currentValue,
              currentStreak: savedGoals.get(goal.id)?.currentStreak ?? goal.currentStreak,
            })),
          };
        });
        setQuests(currentQuests);
        setSettings(recurringSettings);
      })
      .catch(() => {
        if (active) setError(t('Não foi possível carregar as missões.', 'Could not load missions.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user.username]);

  const claimReward = async (quest: Quest) => {
    if (isGuest || claimingQuestId || quest.completed ||
        !quest.goals.every(goal => goal.currentValue >= goal.targetValue)) return;
    playGlobalSound('correct-sound');
    setClaimingQuestId(quest.id);
    setError('');
    try {
      const response = await matchFetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, questId: quest.id }),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        user?: UserProfile;
        rouletteCards?: NinjaCard[];
      };
      if (!response.ok || !result.user) {
        throw new Error(result.error || t('Não foi possível resgatar a recompensa.', 'Could not claim the reward.'));
      }
      onUpdateUser({ ...user, ...result.user });
      setQuests(current => current.map(item => item.id === quest.id ? { ...item, completed: true } : item));
      if (result.rouletteCards?.length) {
        const catalog = await fetchCardsFromServer();
        setRouletteReveal({ cards: result.rouletteCards, catalog: catalog.length ? catalog : getCards() });
      }
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : t('Não foi possível resgatar a recompensa.', 'Could not claim the reward.'));
    } finally {
      setClaimingQuestId(null);
    }
  };

  const claimChest = async (tier: number) => {
    if (isGuest || claimingChestTier !== null) return;
    const claimId = getRecurringChestClaimId(activePeriod, tier);
    if ((user.claimedRecurringChestIds || []).includes(claimId)) return;
    playGlobalSound('correct-sound');
    setClaimingChestTier(tier);
    setError('');
    try {
      const response = await matchFetch('/api/quests/recurring-chest/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, period: activePeriod, tier }),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        user?: UserProfile;
        rouletteCards?: NinjaCard[];
      };
      if (!response.ok || !result.user) {
        throw new Error(result.error || t('Não foi possível abrir este baú.', 'Could not open this chest.'));
      }
      onUpdateUser({ ...user, ...result.user });
      setSelectedChestTier(null);
      if (result.rouletteCards?.length) {
        const catalog = await fetchCardsFromServer();
        setRouletteReveal({ cards: result.rouletteCards, catalog: catalog.length ? catalog : getCards() });
      }
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : t('Não foi possível abrir este baú.', 'Could not open this chest.'));
    } finally {
      setClaimingChestTier(null);
    }
  };

  const handleChestRevealTap = () => {
    if (chestRevealStage === 'closed') {
      playClickSound();
      setChestRevealStage('open');
      return;
    }
    setChestRevealStage(null);
    setSelectedChestTier(null);
  };

  const currencyReward = (value: string) => Number(value).toLocaleString('pt-BR');
  const rewardLabel = (reward: Quest['rewards'][number]) => {
    if (reward.type === 'ryos') return `${currencyReward(reward.value)} ${t('Moedas', 'Coins')}`;
    if (reward.type === 'gems') return `${currencyReward(reward.value)} Gems`;
    if (reward.type === 'card_pack') return `${reward.value} ${t('Pacote Ninja Card', 'Ninja Card pack')}${reward.value === '1' ? '' : 's'}`;
    if (reward.type === 'title') return `${t('Título', 'Title')}: ${reward.value}`;
    if (reward.type === 'unlock_character') return `${t('Personagem', 'Character')}: ${reward.value}`;
    if (reward.type === 'card') return `${t('Figura', 'Card')}: ${reward.value}`;
    if (reward.type === 'frame') return `${t('Moldura', 'Frame')}: ${reward.value}`;
    return `${t('Banner', 'Banner')}: ${reward.value}`;
  };
  const visibleQuests = quests.filter(quest => quest.period === activePeriod);
  const getClaimableRewardsCount = (period: 'daily' | 'weekly') => {
    const periodQuests = quests.filter(quest => quest.period === period);
    const claimableQuests = periodQuests.filter(quest =>
      !quest.completed &&
      quest.goals.length > 0 &&
      quest.goals.every(goal => goal.currentValue >= goal.targetValue),
    ).length;
    const periodPoints = calculateRecurringPoints(period, quests, user.questProgress || {});
    const claimedChestIds = user.claimedRecurringChestIds || [];
    const claimableChests = getRecurringChestTiers(period, settings).filter(chest =>
      !claimedChestIds.includes(getRecurringChestClaimId(period, chest.tier)) &&
      isRecurringChestUnlocked(period, chest.tier, periodPoints, claimedChestIds),
    ).length;

    return claimableQuests + claimableChests;
  };
  const dailyClaimableRewards = getClaimableRewardsCount('daily');
  const weeklyClaimableRewards = getClaimableRewardsCount('weekly');
  const chestTiers = getRecurringChestTiers(activePeriod, settings);
  const points = calculateRecurringPoints(activePeriod, quests, user.questProgress || {});
  const maxPoints = chestTiers[chestTiers.length - 1]?.points || 0;
  const selectedChest = chestTiers.find(chest => chest.tier === selectedChestTier);
  const selectedChestClaimId = selectedChest ? getRecurringChestClaimId(activePeriod, selectedChest.tier) : '';
  const selectedChestClaimed = !!selectedChest && (user.claimedRecurringChestIds || []).includes(selectedChestClaimId);
  const selectedChestUnlocked = !!selectedChest && isRecurringChestUnlocked(
    activePeriod,
    selectedChest.tier,
    points,
    user.claimedRecurringChestIds || [],
  );

  return (
    <div className="lobby-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="lobby-mail-modal lobby-recurring-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('Missões diárias e semanais', 'Daily and weekly missions')}
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          className="lobby-modal-close lobby-recurring-close"
          onClick={onClose}
          aria-label={t('Fechar', 'Close')}
        >
          <X />
        </button>
        <div className="lobby-recurring-tabs" role="tablist" aria-label={t('Período das missões', 'Mission period')}>
          <button
            type="button"
            role="tab"
            aria-selected={activePeriod === 'daily'}
            className={activePeriod === 'daily' ? 'is-active' : ''}
            onClick={() => { playClickSound(); setSelectedChestTier(null); setChestRevealStage(null); setActivePeriod('daily'); }}
          >
            {t('Missões Diárias', 'Daily Missions')}
            {dailyClaimableRewards > 0 && <span>{dailyClaimableRewards}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePeriod === 'weekly'}
            className={activePeriod === 'weekly' ? 'is-active' : ''}
            onClick={() => { playClickSound(); setSelectedChestTier(null); setChestRevealStage(null); setActivePeriod('weekly'); }}
          >
            {t('Missões Semanais', 'Weekly Missions')}
            {weeklyClaimableRewards > 0 && <span>{weeklyClaimableRewards}</span>}
          </button>
        </div>
        {error && <p className="lobby-recurring-error" role="alert">{error}</p>}
        <section className="lobby-chest-track" aria-label={activePeriod === 'daily' ? t('Baús diários', 'Daily chests') : t('Baús semanais', 'Weekly chests')}>
          <div className={`lobby-chest-grid ${activePeriod === 'weekly' ? 'is-weekly' : 'is-daily'}`}>
            {chestTiers.map(chest => {
              const claimId = getRecurringChestClaimId(activePeriod, chest.tier);
              const claimed = (user.claimedRecurringChestIds || []).includes(claimId);
              const available = !claimed && isRecurringChestUnlocked(
                activePeriod,
                chest.tier,
                points,
                user.claimedRecurringChestIds || [],
              );
              return (
                <article className={`lobby-chest-item${claimed ? ' is-claimed' : available ? ' is-available' : ''}`} key={chest.tier}>
                  <button
                    type="button"
                    className="lobby-chest-trigger"
                    disabled={!available && !claimed}
                    aria-label={`${t('Baú', 'Chest')} ${chest.tier}, ${chest.points} pts${available ? ` — ${t('recompensa disponível', 'reward available')}` : claimed ? ` — ${t('ver recompensa resgatada', 'view claimed reward')}` : ''}`}
                    aria-pressed={selectedChestTier === chest.tier}
                    onClick={() => {
                      if (!available && !claimed) return;
                      playClickSound();
                      setSelectedChestTier(chest.tier);
                      setChestRevealStage(claimed ? 'open' : 'closed');
                    }}
                  >
                    <img
                      src={claimed ? '/static/img/icon/bauaberto.webp' : '/static/img/icon/baufechado.webp'}
                      alt=""
                    />
                  </button>
                  <span
                    className={`lobby-chest-timeline-marker${claimed ? ' is-claimed' : available ? ' is-available' : ''}`}
                    aria-label={claimed ? t('Recompensa resgatada', 'Reward claimed') : t('Recompensa não resgatada', 'Reward not claimed')}
                  />
                  <span className="lobby-chest-threshold">{chest.points} pts</span>
                </article>
              );
            })}
          </div>
        </section>
        <div className="lobby-recurring-content" role="tabpanel">
          <div className="lobby-recurring-list">
          {loading ? (
            <p className="lobby-mail-empty"><LoaderCircle className="inline h-4 w-4 animate-spin" /> {t('Carregando missões...', 'Loading missions...')}</p>
          ) : visibleQuests.length === 0 ? (
            <p className="lobby-mail-empty">{t('Nenhuma missão disponível agora.', 'No missions available right now.')}</p>
          ) : visibleQuests.map(quest => {
            const completed = quest.completed || (user.completedQuestIds || []).includes(quest.id);
            const allGoalsMet = quest.goals.every(goal => goal.currentValue >= goal.targetValue);
            return (
              <article className="lobby-recurring-card" key={quest.id}>
                <div className="lobby-recurring-title-row">
                  <span className={quest.period === 'daily' ? 'is-daily' : 'is-weekly'}>
                    {quest.period === 'daily' ? t('DIÁRIA', 'DAILY') : t('SEMANAL', 'WEEKLY')}
                  </span>
                  {completed && <Check className="lobby-recurring-completed" aria-label={t('Resgatada', 'Claimed')} />}
                </div>
                <h3>{quest.title}</h3>
                <p>{quest.desc}</p>
                {quest.goals.map(goal => (
                  <div className="lobby-recurring-goal" key={goal.id}>
                    <div className="lobby-recurring-goal-label">
                      <span>{goal.distinctCharacters
                        ? t(`Habilidades com personagens diferentes`, 'Skills with different characters')
                        : goal.type === 'win_battles_with_chars'
                          ? t('Vitórias', 'Victories')
                          : goal.type === 'use_skill'
                            ? t('Habilidades usadas', 'Skills used')
                            : t('Dano causado', 'Damage dealt')}</span>
                      <strong>{goal.currentValue} / {goal.targetValue}</strong>
                    </div>
                    <div className="lobby-recurring-progress" role="progressbar" aria-valuenow={goal.currentValue} aria-valuemin={0} aria-valuemax={goal.targetValue}>
                      <span style={{ width: `${Math.min(100, goal.currentValue / goal.targetValue * 100)}%` }} />
                    </div>
                  </div>
                ))}
                <div className="lobby-recurring-rewards" aria-label={t('Recompensa', 'Reward')}>
                  <span className="lobby-recurring-point-reward"><Gift aria-hidden="true" /> +{quest.recurringPoints || 0} pts</span>
                  {quest.rewards.map((reward, index) => (
                    <span key={`${reward.type}-${index}`}>
                      {reward.type === 'ryos' ? <img src="/static/img/icon/gold.webp" alt="" />
                        : reward.type === 'gems' ? <img src="/static/img/icon/ryo.webp" alt="" />
                          : reward.type === 'card_pack' ? <PackageOpen aria-hidden="true" /> : <Gift aria-hidden="true" />}
                      {rewardLabel(reward)}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="lobby-recurring-claim"
                  data-sound="correct-sound"
                  disabled={isGuest || completed || !allGoalsMet || !!claimingQuestId}
                  onClick={() => { void claimReward(quest); }}
                >
                  {completed ? t('Resgatada', 'Claimed')
                    : isGuest ? t('Entre na conta para resgatar', 'Log in to claim')
                      : claimingQuestId === quest.id ? t('Resgatando...', 'Claiming...')
                        : allGoalsMet ? t('Resgatar recompensa', 'Claim reward')
                          : t('Em andamento', 'In progress')}
                </button>
              </article>
            );
          })}
          </div>
        </div>
      </section>
      {selectedChest && chestRevealStage && (
        <div
          className="lobby-chest-opening"
          role="presentation"
          onClick={event => {
            event.stopPropagation();
            handleChestRevealTap();
          }}
        >
          <section
            className={`lobby-chest-reveal${chestRevealStage === 'open' ? ' is-open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={t('Recompensa do baú', 'Chest reward')}
            onClick={event => {
              event.stopPropagation();
              handleChestRevealTap();
            }}
          >
            <button
              type="button"
              className="lobby-chest-reveal-close"
              onClick={event => {
                event.stopPropagation();
                setChestRevealStage(null);
                setSelectedChestTier(null);
              }}
              aria-label={t('Fechar', 'Close')}
            >
              <X aria-hidden="true" />
            </button>
            {chestRevealStage === 'closed' ? (
              <>
                <img className="lobby-chest-reveal-image is-closed" src="/static/img/icon/baufechado.webp" alt="" />
                <p className="lobby-chest-reveal-prompt">{t('Toque para abrir', 'Tap to open')}</p>
              </>
            ) : (
              <>
                <h2>{t('Recompensas do baú', 'Chest rewards')}</h2>
                <div className="lobby-chest-reveal-rewards">
                  {selectedChest.rewards.map((reward, index) => (
                    <div className="lobby-chest-reveal-reward" key={`${reward.type}-${index}`}>
                      <span className="lobby-chest-reveal-reward-icon">
                        {reward.type === 'ryos' ? <img src="/static/img/icon/gold.webp" alt="" />
                          : reward.type === 'gems' ? <img src="/static/img/icon/ryo.webp" alt="" />
                            : reward.type === 'card_pack' ? <PackageOpen aria-hidden="true" />
                              : <Gift aria-hidden="true" />}
                      </span>
                      <strong>{rewardLabel(reward)}</strong>
                    </div>
                  ))}
                </div>
                <img className="lobby-chest-reveal-image is-open" src="/static/img/icon/bauaberto.webp" alt="" />
                <p className="lobby-chest-reveal-prompt">
                  {selectedChestClaimed
                    ? t('Este baú já foi aberto.', 'This chest has already been opened.')
                    : selectedChestUnlocked
                      ? t('Recompensa disponível para resgate.', 'Reward ready to claim.')
                      : t(`Progresso: ${points} / ${selectedChest.points} pontos. Abra os baús anteriores em ordem.`, `Progress: ${points} / ${selectedChest.points} points. Open previous chests in order.`)}
                </p>
                <button
                  type="button"
                  className="lobby-chest-reveal-claim"
                  data-sound="correct-sound"
                  disabled={!selectedChestUnlocked || selectedChestClaimed || isGuest || claimingChestTier !== null}
                  onClick={event => {
                    event.stopPropagation();
                    void claimChest(selectedChest.tier);
                  }}
                >
                  <span>
                    {selectedChestClaimed ? t('Baú aberto', 'Chest opened')
                      : isGuest ? t('Entre na conta para resgatar', 'Log in to claim')
                        : claimingChestTier === selectedChest.tier ? t('Abrindo...', 'Opening...')
                          : t('Resgatar recompensa', 'Claim reward')}
                  </span>
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {rouletteReveal && (
        <CardPackRouletteModal
          cards={rouletteReveal.cards}
          catalog={rouletteReveal.catalog}
          onClose={() => setRouletteReveal(null)}
          playClickSound={playClickSound}
          playWinSound={playWinSound}
        />
      )}
    </div>
  );
}