import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Clock,
  CircleHelp,
  Diamond,
  Filter,
  Mail,
  LogOut,
  Settings,
  Search,
  Shield,
  ShoppingBag,
  Swords,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Character, ChakraType, NinjaCard, NinjaEvent, Quest, QuestMaintenanceMail, QuestReward, Skill, UserProfile } from '../types';
import { fetchCharactersFromServer, getCharacters } from '../lib/characterStorage';
import { fetchEventsFromServer, getEvents } from '../lib/eventStorage';
import { safeFetchJson } from '../lib/api';
import { matchFetch } from '../lib/matchFetch';
import { playGlobalSound } from '../lib/soundUtils';
import { getCurrentVillageId } from '../lib/villages';
import { getRanks } from '../lib/rankStorage';
import { getRankProgress } from '../lib/xpSystem';
import { isCharacterUnlocked } from '../lib/characterUnlocks';
import { fetchCardsFromServer, getCards, getNewCardIds, markCardAsViewed, markNewCardIds } from '../lib/cardStorage';
import { cardPackRewardQuantity } from '../lib/cardRoulette';
import {
  calculateRecurringPoints,
  getCurrentRecurringQuests,
  getRecurringChestClaimId,
  getRecurringChestTiers,
  isRecurringChestUnlocked,
} from '../lib/recurringQuests';
import { getEventTimeRemaining } from '../lib/uchihaEvent';
import { useLanguage } from '../lib/i18n';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import ProfileCardModal from './ProfileCardModal';
import CardGalleryModal from './CardGalleryModal';
import GameManualModal from './GameManualModal';
import CardPackRouletteModal from './CardPackRouletteModal';
import RecurringQuestsModal from './RecurringQuestsModal';

interface LobbyScreenProps {
  onStartGame: () => void;
  onBattle: () => void;
  onOpenQuests: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  playWinSound: () => void;
  playUahSound: () => void;
  onOpenAdmin: () => void;
  user: UserProfile | null;
  onLogout: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  audioSettings: { master: number; effects: number; music: number };
  onUpdateAudioSetting: (key: 'master' | 'effects' | 'music', value: number) => void;
}

type LobbyModal = 'characters' | 'clan' | 'shop' | 'events' | 'profile' | 'cards' | 'audio' | 'help' | 'mail' | 'recurring-quests' | null;

export default function LobbyScreen({
  onStartGame,
  onBattle,
  onOpenQuests,
  isMuted,
  onToggleMute,
  playClickSound,
  playScrollSound,
  playWinSound,
  playUahSound,
  onOpenAdmin,
  user,
  onLogout,
  onUpdateUser,
  audioSettings,
  onUpdateAudioSetting,
}: LobbyScreenProps) {
  const { t } = useLanguage();
  const [modal, setModal] = useState<LobbyModal>(null);
  const [shopInitialTab, setShopInitialTab] = useState<'all' | 'bundle'>('all');
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [characters, setCharacters] = useState<Character[]>(() => getCharacters());
  const [quests, setQuests] = useState<Quest[]>([]);
  const [events, setEvents] = useState<NinjaEvent[]>(() => getEvents());
  const [clanMessage, setClanMessage] = useState(false);
  const [showRosterFilters, setShowRosterFilters] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterTag, setRosterTag] = useState('');
  const [detailsCharacter, setDetailsCharacter] = useState<Character | null>(null);
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const [eventClock, setEventClock] = useState(() => Date.now());
  const [eventBannerAspectRatios, setEventBannerAspectRatios] = useState<Record<string, number>>({});
  const [eventsModalInitialEventId, setEventsModalInitialEventId] = useState<string | undefined>();
  const [maintenanceMessages, setMaintenanceMessages] = useState<QuestMaintenanceMail[]>([]);
  const [claimingMailId, setClaimingMailId] = useState<string | null>(null);
  const [maintenanceMailError, setMaintenanceMailError] = useState('');
  const [rouletteReveal, setRouletteReveal] = useState<{ cards: NinjaCard[]; catalog: NinjaCard[] } | null>(null);
  const [newCardIds, setNewCardIds] = useState<string[]>(() => user ? getNewCardIds(user.username) : []);
  const eventSwipeStartX = useRef<number | null>(null);
  const suppressEventClick = useRef(false);

  useEffect(() => {
    setNewCardIds(user ? getNewCardIds(user.username) : []);
  }, [user?.username]);

  useEffect(() => {
    let active = true;
    fetchCharactersFromServer({ required: true })
      .then(loaded => {
        if (active) setCharacters(loaded);
      })
      .catch(error => console.error('Failed to load characters for the lobby:', error));
    safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests')
      .then(data => {
        if (!active) return;
        if (data?.success && Array.isArray(data.quests)) {
          setQuests(data.quests);
        } else {
          console.error('Failed to load quests for lobby character unlocks.');
        }
      })
      .catch(error => console.error('Failed to load quests for lobby character unlocks:', error));
    fetchEventsFromServer()
      .then(loaded => {
        if (active) setEvents(loaded);
      })
      .catch(error => console.error('Failed to load lobby events:', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user?.username) {
      setMaintenanceMessages([]);
      return;
    }
    let active = true;
    const loadInbox = async () => {
      try {
        const response = await matchFetch(
          `/api/quests/maintenance-inbox?username=${encodeURIComponent(user.username)}`,
        );
        const result = await response.json().catch(() => ({})) as {
          success?: boolean;
          messages?: QuestMaintenanceMail[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error || `Falha ao carregar mensagens (HTTP ${response.status}).`);
        }
        if (!result.success || !Array.isArray(result.messages)) {
          throw new Error(result.error || 'O servidor retornou um formato inválido para a caixa de entrada.');
        }
        if (active) setMaintenanceMessages(result.messages);
      } catch (error) {
        if (active) console.error('Falha ao carregar a caixa de entrada de manutenção:', error);
      }
    };
    void loadInbox();
    const interval = window.setInterval(() => { void loadInbox(); }, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user?.username]);

  const ranks = getRanks();
  const rank = getRankProgress(user?.xp || 0, ranks).currentRank;
  const carouselEvents = useMemo(
    () => [...events].sort((a, b) => Number(b.featured) - Number(a.featured)),
    [events],
  );
  const featuredEvent = carouselEvents[activeEventIndex];
  const isArtworkEvent = !!featuredEvent;
  const eventCountdown = featuredEvent ? getEventTimeRemaining(featuredEvent, eventClock) : null;
  useEffect(() => {
    if (activeEventIndex >= carouselEvents.length) setActiveEventIndex(0);
  }, [activeEventIndex, carouselEvents.length]);
  useEffect(() => {
    let active = true;
    carouselEvents.forEach(event => {
      if (!event.bannerUrl || eventBannerAspectRatios[event.bannerUrl]) return;
      const image = new Image();
      image.onload = () => {
        if (!active || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
        const ratio = image.naturalWidth / image.naturalHeight;
        setEventBannerAspectRatios(current => ({ ...current, [event.bannerUrl]: ratio }));
      };
      image.onerror = () => {
        console.error(`Não foi possível carregar a imagem do evento "${event.title}".`);
      };
      image.src = event.bannerUrl;
    });
    return () => { active = false; };
  }, [carouselEvents, eventBannerAspectRatios]);
  useEffect(() => {
    const timer = window.setInterval(() => setEventClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (carouselEvents.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveEventIndex(index => (index + 1) % carouselEvents.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [carouselEvents.length]);
  const showEvent = (offset: number) => {
    setActiveEventIndex(index => (index + offset + carouselEvents.length) % carouselEvents.length);
  };
  const orderedCharacters = useMemo(() => {
    return [...characters].sort((a, b) =>
      Number(isCharacterUnlocked(b, user, quests)) - Number(isCharacterUnlocked(a, user, quests)),
    );
  }, [characters, quests, user]);
  const rosterTags = useMemo(
    () => Array.from(new Set(characters.flatMap(character => character.tags || []))).sort((a, b) => a.localeCompare(b)),
    [characters],
  );
  const filteredCharacters = useMemo(() => {
    const query = rosterSearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return orderedCharacters.filter(character => {
      const matchesQuery = !query || [
        character.name,
        character.folder,
        character.description,
        ...(character.tags || []),
      ].some(value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query));
      const matchesTag = !rosterTag || (character.tags || []).includes(rosterTag);
      return matchesQuery && matchesTag;
    });
  }, [orderedCharacters, rosterSearch, rosterTag]);
  const chakraLabels: Record<ChakraType, string> = {
    Tai: t('Taijutsu', 'Taijutsu'),
    Nin: t('Ninjutsu', 'Ninjutsu'),
    Gen: t('Genjutsu', 'Genjutsu'),
    Blood: t('Kekkei Genkai', 'Kekkei Genkai'),
    Rand: t('Aleatório', 'Random'),
  };
  const targetLabels: Record<string, string> = {
    Enemy: t('Inimigo Único', 'Single Enemy'),
    Target: t('Alvo Principal', 'Main Target'),
    Ally: t('Aliado', 'Ally'),
    Self: t('Conjurador (Mim)', 'Caster (Me)'),
    SelfAndAlly: t('Mim e um Aliado', 'Me and One Ally'),
    AllEnemies: t('Todos os Inimigos', 'All Enemies'),
    AllAllies: t('Todos os Aliados', 'All Allies'),
    AnyLiving: t('Qualquer Personagem Vivo', 'Any Living Character'),
    AllLiving: t('Todos os Personagens Vivos', 'All Living Characters'),
    Both: t('Mim e Alvo', 'Me and Target'),
  };
  const getSkillEffects = (skill: Skill) => {
    const effects: { label: string; value: string; target: string }[] = [];
    const duration = (turns?: number) => !turns || turns >= 99999
      ? '∞'
      : `${turns} ${turns === 1 ? t('turno', 'turn') : t('turnos', 'turns')}`;
    const addEffect = (label: string, value: string, target = 'Target') => {
      effects.push({ label, value, target: targetLabels[target] || target });
    };

    if (skill.damage && skill.damage > 0) {
      addEffect(t('Dano', 'Damage'), `${skill.damage} ${t('de dano', 'damage')}`, skill.damageTarget);
    }
    if (skill.directDamage && skill.directDamage > 0) {
      addEffect(t('Dano Direto', 'Direct Damage'), `${skill.directDamage} ${t('de dano direto', 'direct damage')}`, skill.directDamageTarget);
    }
    skill.damageRules?.forEach(rule => {
      if (rule.damageBoost > 0) {
        const kind = rule.damageType === 'direct_damage'
          ? t('de dano direto', 'direct damage')
          : t('de dano', 'damage');
        addEffect(
          `${t('Dano Condicional', 'Conditional Damage')} (${rule.activeSkillName})`,
          `+${rule.damageBoost} ${kind} ${t('quando', 'when')} [${rule.activeSkillName}] ${t('estiver ativo', 'is active')}`,
          skill.damageTarget,
        );
      }
    });
    if (skill.delayedDamage && skill.delayedDamage > 0) {
      addEffect(t('Dano Atrasado', 'Delayed Damage'), `${skill.delayedDamage} ${t('de dano em', 'damage in')} ${duration(skill.delayedDamageTurns)}`, skill.damageTarget);
    }
    if (skill.delayedDirectDamage && skill.delayedDirectDamage > 0) {
      addEffect(t('Dano Direto Atrasado', 'Delayed Direct Damage'), `${skill.delayedDirectDamage} ${t('de dano direto em', 'direct damage in')} ${duration(skill.delayedDirectDamageTurns)}`, skill.directDamageTarget);
    }
    if (skill.heal && skill.heal > 0) {
      addEffect(
        skill.healDuration && skill.healDuration > 1 ? t('Cura Contínua', 'Healing over Time') : t('Cura', 'Heal'),
        skill.healDuration && skill.healDuration > 1
          ? `${skill.heal} ${t('de cura por turno durante', 'healing per turn for')} ${duration(skill.healDuration)}`
          : `${skill.heal} ${t('de cura', 'healing')}`,
        skill.healTarget,
      );
    }
    if (skill.shieldVal && skill.shieldVal > 0) {
      addEffect(t('Escudo', 'Shield'), `+${skill.shieldVal} ${t('de escudo por', 'shield for')} ${duration(skill.shieldDuration)}`, skill.shieldTarget || 'Self');
    }
    if (skill.stunTurns && skill.stunTurns > 0) {
      addEffect(t('Atordoamento', 'Stun'), `${t('Bloqueia habilidades por', 'Blocks skills for')} ${duration(skill.stunTurns)}`, skill.stunTarget);
    }
    if (skill.dotVal && skill.dotVal > 0) {
      addEffect(t('Queimadura', 'Burn'), `${skill.dotVal} ${t('de dano por turno durante', 'damage per turn for')} ${duration(skill.dotDuration)}`, skill.dotTarget);
    }
    if (skill.bleedingVal && skill.bleedingVal > 0) {
      addEffect(t('Sangramento', 'Bleeding'), `${skill.bleedingVal} ${t('de dano por turno durante', 'damage per turn for')} ${duration(skill.bleedingDuration)}`, skill.bleedingTarget);
    }
    if (skill.afflictionVal && skill.afflictionVal > 0) {
      addEffect(t('Aflição', 'Affliction'), `${skill.afflictionVal} ${t('de dano por turno durante', 'damage per turn for')} ${duration(skill.afflictionDuration)}`, skill.afflictionTarget);
    }
    if (skill.damageBuffVal && skill.damageBuffVal > 0) {
      addEffect(t('Aumento de Dano', 'Damage Boost'), `+${skill.damageBuffVal} ${t('de dano causado durante', 'damage dealt for')} ${duration(skill.damageBuffDuration)}`, skill.damageBuffTarget || 'Self');
    }
    if (skill.damageReductionVal && skill.damageReductionVal > 0) {
      addEffect(t('Redução de Dano', 'Damage Reduction'), `-${skill.damageReductionVal} ${t('de dano recebido durante', 'damage received for')} ${duration(skill.damageReductionDuration)}`, 'Self');
    }
    if (skill.damageDebuffVal && skill.damageDebuffVal > 0) {
      addEffect(t('Dano Condicional', 'Conditional Damage'), `-${skill.damageDebuffVal} ${t('de dano causado durante', 'damage dealt for')} ${duration(skill.damageDebuffDuration)}`, skill.damageDebuffTarget);
    }
    if (skill.damageVulnerabilityVal && skill.damageVulnerabilityVal > 0) {
      addEffect(t('Vulnerabilidade', 'Vulnerability'), `+${skill.damageVulnerabilityVal} ${t('de dano recebido durante', 'damage received for')} ${duration(skill.damageVulnerabilityDuration)}`, skill.damageVulnerabilityTarget);
    }
    if (skill.gainChakra && skill.gainChakra > 0) {
      addEffect(t('Ganho de Chakra', 'Chakra Gain'), `+${skill.gainChakra} ${t('chakra', 'chakra')}`, skill.gainChakraTarget || 'Self');
    }
    if (skill.drainChakra && skill.drainChakra > 0) {
      addEffect(t('Dreno de Chakra', 'Chakra Drain'), `-${skill.drainChakra} ${t('chakra', 'chakra')}`, skill.drainChakraTarget);
    }
    if (skill.stealChakra && skill.stealChakra > 0) {
      addEffect(t('Roubo de Chakra', 'Chakra Steal'), `${skill.stealChakra} ${t('chakra', 'chakra')}`, skill.stealChakraTarget);
    }
    return effects;
  };

  const openAuthenticated = (next: LobbyModal) => {
    playClickSound();
    if (!user) {
      onStartGame();
      return;
    }
    if (next === 'shop') setShopInitialTab('all');
    setModal(next);
  };

  const openQuests = () => {
    playClickSound();
    if (!user) {
      onStartGame();
      return;
    }
    onOpenQuests();
  };

  const handleBattle = () => {
    playClickSound();
    onBattle();
  };

  const updateUser = (updated: UserProfile) => {
    if (user) {
      const previouslyOwned = new Set(user.collectedCardIds || []);
      const newlyOwned = [...new Set(updated.collectedCardIds || [])]
        .filter(cardId => !previouslyOwned.has(cardId));
      if (newlyOwned.length > 0) {
        setNewCardIds(markNewCardIds(updated.username, newlyOwned));
      }
    }
    onUpdateUser(updated);
  };
  const pendingMaintenanceCount = maintenanceMessages.filter(message => !message.claimedAt).length;
  const claimMaintenanceMessage = async (message: QuestMaintenanceMail) => {
    if (!user || message.claimedAt || claimingMailId) return;
    setClaimingMailId(message.id);
    setMaintenanceMailError('');
    try {
      const response = await matchFetch('/api/quests/maintenance-inbox/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, mailId: message.id }),
      });
      const result = await response.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        user?: UserProfile;
        rouletteCards?: NinjaCard[];
      };
      if (!response.ok) {
        throw new Error(result.error || `Falha ao resgatar mensagem (HTTP ${response.status}).`);
      }
      if (!result.success || !result.user) {
        throw new Error(result.error || 'O servidor retornou um formato inválido ao resgatar a mensagem.');
      }
      if (message.rewards.length > 0) playGlobalSound('claim-2');
      updateUser({ ...user, ...result.user });
      setMaintenanceMessages(result.user.questMaintenanceInbox || []);
      if (result.rouletteCards?.length) {
        const catalog = await fetchCardsFromServer();
        setModal(null);
        setRouletteReveal({ cards: result.rouletteCards, catalog: catalog.length ? catalog : getCards() });
      }
    } catch (error) {
      console.error('Falha ao resgatar mensagem de manutenção:', error);
      setMaintenanceMailError(error instanceof Error ? error.message : t('Não foi possível resgatar a mensagem.', 'Could not claim this message.'));
    } finally {
      setClaimingMailId(null);
    }
  };
  const maintenanceRewardLabel = (reward: QuestReward) => {
    if (reward.type === 'ryos') return `${reward.value} ${t('Moedas', 'Coins')}`;
    if (reward.type === 'gems') return `${reward.value} ${t('Ryos', 'Ryos')}`;
    if (reward.type === 'unlock_character') return `${t('Personagem', 'Character')}: ${reward.value}`;
    if (reward.type === 'title') return `${t('Título', 'Title')}: ${reward.value}`;
    if (reward.type === 'frame') return `${t('Moldura', 'Frame')}: ${reward.value}`;
    if (reward.type === 'banner') return `${t('Banner', 'Banner')}: ${reward.value}`;
    if (reward.type === 'card_pack') return `${t('Pacotes Ninja Card', 'Ninja Card packs')}: ${reward.value}`;
    return `${t('Figura', 'Card')}: ${reward.value}`;
  };
  const claimedEventRewardIds = user?.claimedEventRewardIds || [];
  const availableEventRewardCount = events.reduce(
    (total, event) => total + event.objectives.filter(objective =>
      objective.current >= objective.target && !claimedEventRewardIds.includes(objective.id),
    ).length,
    0,
  );
  const missionNotificationCount = quests.filter(quest => {
    const completedQuestIds = user?.completedQuestIds || [];
    const isCompleted = completedQuestIds.includes(quest.id) || quest.completed;
    if (isCompleted || !quest.goals?.length) return false;

    const questRank = ranks.find(rank => rank.name.toLowerCase() === (quest.minRank || '').toLowerCase());
    if (questRank && (user?.xp || 0) < questRank.requiredXp) return false;
    if (!(quest.requiredQuestIds || []).every(id => completedQuestIds.includes(id))) return false;

    const progressByGoal = new Map(
      (user?.questProgress?.[quest.id] || []).map(progress => [progress.id, progress.currentValue]),
    );
    return quest.goals.every(goal =>
      (progressByGoal.get(goal.id) || 0) >= goal.targetValue,
    );
  }).length;
  const recurringQuests = getCurrentRecurringQuests();
  const dailyRecurringQuests = recurringQuests.filter(quest => quest.period === 'daily');
  const dailyRecurringPoints = calculateRecurringPoints('daily', dailyRecurringQuests, user?.questProgress || {});
  const claimedRecurringChestIds = user?.claimedRecurringChestIds || [];
  const dailyRecurringClaimableCount = user
    ? dailyRecurringQuests.filter(quest =>
      !(user.completedQuestIds || []).includes(quest.id) &&
      quest.goals.length > 0 &&
      quest.goals.every(goal =>
        Number((user.questProgress?.[quest.id] || []).find(progress => progress.id === goal.id)?.currentValue) >= goal.targetValue,
      ),
    ).length + getRecurringChestTiers('daily').filter(chest =>
      !claimedRecurringChestIds.includes(getRecurringChestClaimId('daily', chest.tier)) &&
      isRecurringChestUnlocked('daily', chest.tier, dailyRecurringPoints, claimedRecurringChestIds),
    ).length
    : 0;
  const footerItems = [
    { label: t('Loja', 'Shop'), icon: ShoppingBag, action: () => openAuthenticated('shop') },
    { label: t('Shinobis', 'Shinobis'), icon: Users, action: () => { playClickSound(); setModal('characters'); } },
    { label: t('Batalha', 'Battle'), icon: Swords, action: handleBattle, primary: true },
    { label: t('Clã', 'Clan'), icon: Shield, action: () => { playClickSound(); setClanMessage(true); } },
    { label: t('Eventos', 'Events'), icon: CalendarDays, action: () => openAuthenticated('events') },
  ];

  return (
    <main className="lobby-screen">
      <img className="lobby-background" src="/static/img/ui/game-intro.webp" alt="" />
      <div className="lobby-shade" />

      <header className="lobby-topbar">
        <div className="lobby-bandana" aria-label={`${t('Rank atual', 'Current rank')}: ${rank.name}`}>
          {rank.id === 'rank_estudante' || rank.id === 'rank_genin' ? (
            <img src={`/static/img/ui/${rank.id}.webp`} alt={rank.name} />
          ) : (
            <span className="lobby-bandana-cloth">
              <span className="lobby-bandana-plate">
                {rank.iconUrl ? <img src={rank.iconUrl} alt="" /> : null}
                <b>{rank.name}</b>
              </span>
            </span>
          )}
        </div>
        <div className="lobby-currencies" aria-label={t('Moedas', 'Currencies')}>
          <span><img className="lobby-currency-icon" src="/static/img/icon/ryo.webp" alt="" />{(user?.gems ?? 120).toLocaleString()}</span>
          <span><img className="lobby-currency-icon" src="/static/img/icon/gold.webp" alt="" />{(user?.ryos ?? 1500).toLocaleString()}</span>
        </div>
      </header>

      <section className="lobby-profile-wrap">
        <button
          type="button"
          className="lobby-profile-card"
          onClick={() => openAuthenticated('profile')}
          aria-label={t('Abrir card do perfil', 'Open profile card')}
        >
          {user?.equippedBannerUrl && (
            <img
              className="lobby-profile-background"
              src={user.equippedBannerUrl}
              alt=""
              style={{
                objectPosition: `${user.equippedBannerPositionX ?? 50}% ${user.equippedBannerPositionY ?? 50}%`,
              }}
            />
          )}
          <span className="lobby-profile-overlay" />
          <span className="lobby-profile-avatar-wrap">
            {user?.photoUrl && <img className="lobby-profile-avatar" src={user.photoUrl} alt="" />}
            {user?.equippedFrameUrl && <img className="lobby-profile-frame" src={user.equippedFrameUrl} alt="" />}
          </span>
          <span className="lobby-profile-copy">
            <strong>{user?.name || t('Entre na Arena', 'Enter the Arena')}</strong>
            <small>{user?.title || rank.name}</small>
          </span>
        </button>
      </section>

      <aside className="lobby-missions" aria-label={t('Missões', 'Missions')}>
        <button
          type="button"
          onClick={openQuests}
          className="lobby-mission-button"
          aria-label={t('Missões de novato', 'Novice missions')}
        >
          <img className="lobby-mission-icon" src="/static/img/icon/novato.webp" alt="" />
        </button>
        <button
          type="button"
          onClick={openQuests}
          className={`lobby-mission-button${missionNotificationCount > 0 ? ' has-notification' : ''}`}
          aria-label={t('Missões', 'Missions')}
        >
          {missionNotificationCount > 0 && (
            <span
              className="lobby-events-mission-count !left-auto !right-[-0.25rem]"
              aria-label={t(`${missionNotificationCount} missões prontas para resgatar`, `${missionNotificationCount} quests ready to claim`)}
            >
              <span className="new-card-diamond text-2xl leading-none text-sky-400" aria-hidden="true">
                !
              </span>
            </span>
          )}
          <img className="lobby-mission-icon" src="/static/img/icon/missao.webp" alt="" />
        </button>
        {user && (
          <button
            type="button"
            onClick={() => { playClickSound(); setModal('cards'); }}
            className={`lobby-mission-button${newCardIds.length > 0 ? ' has-notification' : ''}`}
            aria-label={t('Abrir álbum de figurinhas', 'Open sticker album')}
          >
            <img className="lobby-mission-icon" src="/static/img/icon/album.webp" alt="" />
            {newCardIds.length > 0 && (
              <span
                aria-label={t('Nova Ninja Card', 'New Ninja Card')}
                className="new-card-diamond absolute -right-1 -top-1 z-20 text-2xl leading-none text-sky-400"
              >
                !
              </span>
            )}
          </button>
        )}
      </aside>

      {featuredEvent && (
        <section
          className="lobby-event-carousel is-artwork"
          style={{ aspectRatio: eventBannerAspectRatios[featuredEvent.bannerUrl] || 1800 / 770 }}
          aria-label={t('Eventos em destaque', 'Featured events')}
          onPointerDown={event => {
            eventSwipeStartX.current = event.clientX;
            suppressEventClick.current = false;
          }}
          onPointerUp={event => {
            if (eventSwipeStartX.current === null || carouselEvents.length < 2) return;
            const delta = event.clientX - eventSwipeStartX.current;
            eventSwipeStartX.current = null;
            if (Math.abs(delta) < 40) return;
            suppressEventClick.current = true;
            showEvent(delta < 0 ? 1 : -1);
            window.setTimeout(() => { suppressEventClick.current = false; }, 0);
          }}
          onPointerCancel={() => { eventSwipeStartX.current = null; }}
        >
          <button
            type="button"
            className="lobby-event-banner is-artwork"
            onClick={() => {
              if (suppressEventClick.current) return;
              setEventsModalInitialEventId(featuredEvent.id);
              openAuthenticated('events');
            }}
            aria-label={`${featuredEvent.title} — ${t('Ver evento', 'View event')}`}
          >
            <img
              src={featuredEvent.bannerUrl}
              alt=""
              draggable={false}
              onLoad={event => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) {
                  setEventBannerAspectRatios(current => ({
                    ...current,
                    [featuredEvent.bannerUrl]: naturalWidth / naturalHeight,
                  }));
                }
              }}
            />
            <span className="lobby-event-copy">
              <small>{featuredEvent.badge || t('EVENTO', 'EVENT')}</small>
              <strong>{featuredEvent.title}</strong>
              <span>
                {eventCountdown ? (
                  <>
                    {featuredEvent.timeLeft} •{' '}
                    <span className="lobby-event-time-remaining">
                      <Clock aria-hidden="true" />
                      {eventCountdown.expired
                        ? t('Evento encerrado', 'Event ended')
                        : t(
                          `${eventCountdown.days} dias e ${eventCountdown.hours} horas restantes`,
                          `${eventCountdown.days} days and ${eventCountdown.hours} hours left`,
                        )}
                    </span>
                  </>
                ) : featuredEvent.timeLeft}
              </span>
            </span>
            <span className="lobby-event-cta">
              {isArtworkEvent && <img src="/static/img/banners/btn_banner.webp" alt="" draggable={false} />}
              <span>{t('Ver evento', 'View event')}</span>
            </span>
          </button>
          {carouselEvents.length > 1 && (
            <div className="lobby-event-controls">
              <div className="lobby-event-dots" aria-label={`${activeEventIndex + 1} / ${carouselEvents.length}`}>
                {carouselEvents.map((event, index) => (
                  <button
                    type="button"
                    key={event.id}
                    className={index === activeEventIndex ? 'is-active' : ''}
                    onClick={() => setActiveEventIndex(index)}
                    aria-label={t(`Ver evento ${index + 1}: ${event.title}`, `View event ${index + 1}: ${event.title}`)}
                    aria-current={index === activeEventIndex ? 'true' : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <nav className="lobby-footer" aria-label={t('Navegação principal', 'Main navigation')}>
        {footerItems.map(({ label, icon: Icon, action, primary }) => (
          <button
            type="button"
            key={label}
            onClick={action}
            className={`lobby-nav-item${primary ? ' lobby-nav-primary' : ''}${label === t('Eventos', 'Events') ? ' lobby-nav-events' : ''}`}
          >
            {label === t('Eventos', 'Events') && availableEventRewardCount > 0 && (
              <span
                className="lobby-events-mission-count"
                aria-label={t(`${availableEventRewardCount} recompensas de evento para resgatar`, `${availableEventRewardCount} event rewards to claim`)}
              >
                <span className="lobby-events-mission-diamond" aria-hidden="true">
                  !
                </span>
              </span>
            )}
            {label === t('Shinobis', 'Shinobis') ? (
              <span className="lobby-footer-icon-stretch">
                <img className="lobby-footer-icon" src="/static/img/icon/ninjas-icon-convertido-de-png.webp" alt="" />
              </span>
            ) : label === t('Clã', 'Clan') ? (
              <span className="lobby-footer-icon-stretch">
                <img className="lobby-footer-icon" src="/static/img/icon/guild.webp" alt="" />
              </span>
            ) : label === t('Loja', 'Shop') ? (
              <span className="lobby-footer-icon-stretch">
                <img className="lobby-footer-icon" src="/static/img/icon/shop.webp" alt="" />
              </span>
            ) : label === t('Eventos', 'Events') ? (
              <span className="lobby-footer-icon-stretch">
                <img className="lobby-footer-icon" src="/static/img/icon/event.webp" alt="" />
              </span>
            ) : primary ? (
              <span className="lobby-footer-icon-stretch">
                <img className="lobby-footer-icon" src="/static/img/icon/kunai-icon.webp" alt="" />
              </span>
            ) : (
              <span className="lobby-footer-icon-stretch">
                <Icon className="lobby-footer-icon" aria-hidden="true" />
              </span>
            )}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="lobby-quick-actions">
        <button
          type="button"
          className="lobby-quick-actions-toggle"
          onClick={() => { playClickSound(); setQuickActionsOpen(open => !open); }}
          aria-label={t('Abrir atalhos', 'Open shortcuts')}
          aria-expanded={quickActionsOpen}
          aria-controls="lobby-quick-actions-menu"
        >
          <Settings />
        </button>
        {user && (
          <button
            type="button"
            className={`lobby-mission-button lobby-inbox-quick-action${pendingMaintenanceCount > 0 ? ' has-notification' : ''}`}
            onClick={() => { playClickSound(); setQuickActionsOpen(false); setMaintenanceMailError(''); setModal('mail'); }}
            aria-label={t(`Caixa de entrada${pendingMaintenanceCount ? `, ${pendingMaintenanceCount} mensagens não resgatadas` : ''}`, `Inbox${pendingMaintenanceCount ? `, ${pendingMaintenanceCount} unclaimed messages` : ''}`)}
          >
            <img className="lobby-mission-icon lobby-mail-icon" src="/static/img/icon/message.webp" alt="" />
            {pendingMaintenanceCount > 0 && (
              <span className="lobby-mail-count" aria-hidden="true">
                {pendingMaintenanceCount > 99 ? '99+' : pendingMaintenanceCount}
              </span>
            )}
          </button>
        )}
        {user && (
          <button
            type="button"
            className={`lobby-quick-recurring-button${dailyRecurringClaimableCount > 0 ? ' has-notification' : ''}`}
            onClick={() => { playClickSound(); setQuickActionsOpen(false); setModal('recurring-quests'); }}
            aria-label={t('Missões diárias e semanais', 'Daily and weekly missions')}
            title={t('Missões diárias e semanais', 'Daily and weekly missions')}
          >
            {dailyRecurringClaimableCount > 0 && (
              <span
                className="lobby-events-mission-count lobby-recurring-notification"
                aria-label={t(`${dailyRecurringClaimableCount} recompensas diárias para resgatar`, `${dailyRecurringClaimableCount} daily rewards to claim`)}
              >
                <span className="new-card-diamond" aria-hidden="true">!</span>
              </span>
            )}
            <img
              className="lobby-quick-recurring-icon"
              src="/static/img/icon/daily_mission.webp"
              alt=""
              aria-hidden="true"
            />
          </button>
        )}
        {quickActionsOpen && (
          <div id="lobby-quick-actions-menu" className="lobby-quick-actions-menu">
            {user?.username.trim().toLowerCase() === '2' && (
              <button type="button" onClick={() => { setQuickActionsOpen(false); onOpenAdmin(); }} aria-label={t('Painel administrativo', 'Admin panel')}><Award /></button>
            )}
            <button type="button" onClick={() => { playClickSound(); setQuickActionsOpen(false); setModal('help'); }} aria-label={t('Como jogar', 'How to play')}><CircleHelp /></button>
            <button type="button" onClick={() => { playClickSound(); onToggleMute(); }} aria-label={isMuted ? t('Ativar som', 'Unmute') : t('Silenciar', 'Mute')}>
              {isMuted ? <VolumeX /> : <Volume2 />}
            </button>
            <button type="button" onClick={() => { playClickSound(); setQuickActionsOpen(false); setModal('audio'); }} aria-label={t('Configurações de áudio', 'Audio settings')}><Volume2 /></button>
            {user && <button type="button" onClick={() => { setQuickActionsOpen(false); onLogout(); }} aria-label={t('Sair da conta', 'Log out')}><LogOut /></button>}
          </div>
        )}
      </div>

      {modal === 'characters' && (
        <div className="lobby-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <section className="lobby-roster-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-roster-title" onClick={event => event.stopPropagation()}>
            <header>
              <div>
                <h2 id="lobby-roster-title">{t('Shinobis', 'Shinobis')}</h2>
                <p>{t('Personagens desbloqueados primeiro', 'Unlocked characters first')}</p>
              </div>
              <button
                type="button"
                className="lobby-roster-filter-toggle"
                aria-expanded={showRosterFilters}
                aria-controls="lobby-roster-filters"
                onClick={() => setShowRosterFilters(open => !open)}
              >
                <Filter aria-hidden="true" />
                <span>{t('Filtrar', 'Filter')}</span>
                <ChevronDown className={showRosterFilters ? 'is-expanded' : ''} aria-hidden="true" />
              </button>
            </header>
            {showRosterFilters && (
              <div className="lobby-roster-filters" id="lobby-roster-filters">
                <label className="lobby-roster-search">
                  <Search aria-hidden="true" />
                  <input
                    type="search"
                    value={rosterSearch}
                    onChange={event => setRosterSearch(event.target.value)}
                    placeholder={t('Nome, vila ou categoria...', 'Name, village or category...')}
                    aria-label={t('Buscar por nome, vila ou categoria', 'Search by name, village or category')}
                  />
                </label>
                <label className="lobby-roster-tag-select">
                  <span>{t('Vila / categoria', 'Village / category')}</span>
                  <select value={rosterTag} onChange={event => setRosterTag(event.target.value)}>
                    <option value="">{t('Todas', 'All')}</option>
                    {rosterTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </label>
              </div>
            )}
            <div className="lobby-roster-grid">
              {filteredCharacters.map(character => {
                const unlocked = isCharacterUnlocked(character, user, quests);
                return (
                  <button
                    type="button"
                    className={`lobby-roster-character${unlocked ? '' : ' is-locked'}`}
                    key={character.id}
                    title={!unlocked ? t('Bloqueado por missão', 'Locked by a mission') : character.name}
                    aria-label={t(`Ver habilidades e detalhes de ${character.name}`, `View ${character.name} skills and details`)}
                    onClick={() => {
                      playClickSound();
                      setDetailsCharacter(character);
                    }}
                  >
                    <img
                      src={character.portrait || `/static/img/ninja/${character.folder}/icon.jpg`}
                      alt=""
                      loading="lazy"
                      onError={event => {
                        const image = event.currentTarget;
                        if (!image.dataset.fallback) {
                          image.dataset.fallback = 'true';
                          image.src = `/static/img/ninja/${character.folder}/icon.jpg`;
                        } else {
                          image.style.visibility = 'hidden';
                        }
                      }}
                    />
                    {!unlocked && (
                      <span className="lobby-lock-overlay">
                        <img src="/static/img/icon/selo.svg" alt={t('Bloqueado', 'Locked')} />
                      </span>
                    )}
                    <span>{character.name}</span>
                  </button>
                );
              })}
              {filteredCharacters.length === 0 && (
                <p className="lobby-roster-empty">{t('Nenhum shinobi encontrado.', 'No shinobi found.')}</p>
              )}
            </div>
          </section>
        </div>
      )}
      {detailsCharacter && (
        <div
          className="lobby-modal-backdrop lobby-character-details-backdrop"
          role="presentation"
          onClick={() => setDetailsCharacter(null)}
        >
          <section
            className="lobby-character-details"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lobby-character-details-title"
            onClick={event => event.stopPropagation()}
          >
            <header className="lobby-character-details-header">
              <img
                src={detailsCharacter.portrait || `/static/img/ninja/${detailsCharacter.folder}/icon.jpg`}
                alt=""
                onError={event => {
                  const image = event.currentTarget;
                  if (!image.dataset.fallback) {
                    image.dataset.fallback = 'true';
                    image.src = `/static/img/ninja/${detailsCharacter.folder}/icon.jpg`;
                  } else {
                    image.style.visibility = 'hidden';
                  }
                }}
              />
              <div>
                <h2 id="lobby-character-details-title">{detailsCharacter.name}</h2>
                <p>{detailsCharacter.description || t('Sem descrição cadastrada.', 'No description available.')}</p>
              </div>
            </header>
            {!!detailsCharacter.tags?.length && (
              <div className="lobby-character-detail-tags" aria-label={t('Características', 'Attributes')}>
                {detailsCharacter.tags.map(tag => <span key={tag}>{tag}</span>)}
              </div>
            )}
            <h3>{t('Habilidades', 'Skills')}</h3>
            <div className="lobby-character-skills">
              {(detailsCharacter.skills || []).map((skill, index) => {
                const effects = getSkillEffects(skill);
                return (
                  <article className="lobby-character-skill" key={`${skill.name}-${index}`}>
                    <header className="lobby-character-skill-header">
                      <h4>{skill.name}</h4>
                      <div className="lobby-character-skill-cost" aria-label={t('Custo de chakra', 'Chakra cost')}>
                        {(skill.cost || []).map((type, costIndex) => (
                          <span
                            className={`lobby-chakra-orb lobby-chakra-${type.toLowerCase()}`}
                            key={`${type}-${costIndex}`}
                            title={chakraLabels[type]}
                          />
                        ))}
                      </div>
                    </header>
                    <div className="lobby-character-skill-body">
                      {skill.icon && (
                        <img
                          className="lobby-character-skill-icon"
                          src={skill.icon}
                          alt=""
                          onError={event => { event.currentTarget.style.visibility = 'hidden'; }}
                        />
                      )}
                      <div className="lobby-character-skill-effects">
                        {effects.map((effect, effectIndex) => (
                          <article className="lobby-character-skill-effect" key={`${effect.label}-${effectIndex}`}>
                            <strong>{effect.label}</strong>
                            <p>{effect.value}</p>
                            <span className="lobby-character-skill-effect-target">
                              <span aria-hidden="true">🎯</span> {effect.target}
                            </span>
                          </article>
                        ))}
                        {effects.length === 0 && (
                          <article className="lobby-character-skill-effect">
                            <strong>{t('Habilidade', 'Skill')}</strong>
                            <p>{skill.desc || t('Sem efeitos especificados.', 'No effects specified.')}</p>
                            <span className="lobby-character-skill-effect-target">
                              {targetLabels[skill.targetType] || skill.targetType}
                            </span>
                          </article>
                        )}
                      </div>
                    </div>
                    <p className="lobby-character-skill-target">
                      <b>{t('Alvo', 'Target')}:</b> {targetLabels[skill.targetType] || skill.targetType}
                    </p>
                  </article>
                );
              })}
              {!(detailsCharacter.skills || []).length && (
                <p className="lobby-roster-empty">{t('Nenhuma habilidade cadastrada.', 'No skills available.')}</p>
              )}
            </div>
          </section>
        </div>
      )}
      {detailsCharacter && (
        <button
          type="button"
          className="lobby-character-details-back"
          onClick={() => setDetailsCharacter(null)}
          aria-label={t('Voltar para shinobis', 'Back to shinobi')}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
      )}
      {modal === 'characters' && (
        <button
          type="button"
          className="lobby-roster-close"
          onClick={() => setModal(null)}
          aria-label={t('Fechar shinobis', 'Close shinobi')}
        >
          <X aria-hidden="true" />
        </button>
      )}

      {clanMessage && (
        <div className="lobby-modal-backdrop" role="presentation" onClick={() => setClanMessage(false)}>
          <section className="lobby-simple-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <button type="button" className="lobby-modal-close" onClick={() => setClanMessage(false)} aria-label={t('Fechar', 'Close')}><X /></button>
            <Shield aria-hidden="true" />
            <h2>{t('Clãs', 'Clans')}</h2>
            <p>{t('A área de clãs estará disponível em breve.', 'The clan area will be available soon.')}</p>
          </section>
        </div>
      )}

      {modal === 'mail' && (
        <div className="lobby-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <section className="lobby-mail-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-mail-title" onClick={event => event.stopPropagation()}>
            <header>
              <div className="lobby-mail-heading">
                <Mail aria-hidden="true" />
                <div>
                  <h2 id="lobby-mail-title">{t('Caixa de entrada', 'Inbox')}</h2>
                  <p>{t('Recompensas e avisos da sua conta', 'Rewards and account notices')}</p>
                </div>
              </div>
              <button type="button" className="lobby-modal-close" onClick={() => setModal(null)} aria-label={t('Fechar', 'Close')}><X /></button>
            </header>
            {maintenanceMailError && <p className="lobby-mail-error" role="alert">{maintenanceMailError}</p>}
            <div className="lobby-mail-list">
              {maintenanceMessages.length === 0 ? (
                <p className="lobby-mail-empty">{t('Sua caixa de entrada está vazia.', 'Your inbox is empty.')}</p>
              ) : [...maintenanceMessages].sort((left, right) =>
                Number(!!left.claimedAt) - Number(!!right.claimedAt) ||
                right.createdAt.localeCompare(left.createdAt),
              ).map(message => (
                <article className={`lobby-mail-message${message.claimedAt ? ' is-claimed' : ''}`} key={message.id}>
                  <div className="lobby-mail-message-header">
                    <strong>{message.subject}</strong>
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <p>{message.message}</p>
                  <ul>
                    {message.rewards.map((reward, index) => (
                      <li key={`${reward.type}:${reward.value}:${index}`}>
                        {reward.type === 'card_pack' && (
                          <span className="lobby-mail-pack-icons" aria-hidden="true">
                            {Array.from({ length: cardPackRewardQuantity(reward.value) || 0 }, (_, packIndex) => (
                              <img key={packIndex} src="/static/img/pacote.webp" alt="" />
                            ))}
                          </span>
                        )}
                        {(reward.type === 'ryos' || reward.type === 'gems') && (
                          <img
                            src={reward.type === 'ryos' ? '/static/img/icon/gold.webp' : '/static/img/icon/ryo.webp'}
                            alt=""
                          />
                        )}
                        <span>{maintenanceRewardLabel(reward)}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="lobby-mail-claim"
                    disabled={!!message.claimedAt || !!claimingMailId}
                    onClick={() => { void claimMaintenanceMessage(message); }}
                  >
                    {message.claimedAt
                      ? message.rewards.length
                        ? t('Resgatada', 'Claimed')
                        : t('Lida', 'Read')
                      : claimingMailId === message.id
                        ? t('Resgatando...', 'Claiming...')
                        : message.rewards.length
                          ? t('Resgatar recompensa', 'Claim reward')
                          : t('Marcar como lida', 'Mark as read')}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {user && modal === 'recurring-quests' && (
        <RecurringQuestsModal
          user={user}
          onUpdateUser={updateUser}
          onClose={() => setModal(null)}
          playClickSound={playClickSound}
          playWinSound={playWinSound}
        />
      )}

      {modal === 'audio' && (
        <div className="lobby-modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <section className="lobby-simple-modal lobby-audio-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <button type="button" className="lobby-modal-close" onClick={() => setModal(null)} aria-label={t('Fechar', 'Close')}><X /></button>
            <h2>{t('Configurações de volume', 'Volume settings')}</h2>
            {([
              ['master', t('Volume geral', 'Master volume')],
              ['effects', t('Efeitos sonoros', 'Sound effects')],
              ['music', t('Música', 'Music')],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <span>{label}<b>{Math.round(audioSettings[key] * 100)}%</b></span>
                <input type="range" min="0" max="1" step="0.01" value={audioSettings[key]} onChange={event => onUpdateAudioSetting(key, Number(event.target.value))} />
              </label>
            ))}
          </section>
        </div>
      )}

      <GameManualModal isOpen={modal === 'help'} onClose={() => setModal(null)} playClickSound={playClickSound} />
      {user && modal === 'shop' && <ShopModal user={user} initialTab={shopInitialTab} onClose={() => { setShopInitialTab('all'); setModal(null); }} onUpdateUser={updateUser} playClickSound={playClickSound} playScrollSound={playScrollSound} playWinSound={playWinSound} />}
      {user && modal === 'events' && (
        <EventsModal
          user={user}
          onClose={() => {
            setModal(null);
            setEventsModalInitialEventId(undefined);
          }}
          onUpdateUser={updateUser}
          playClickSound={playClickSound}
          initialEventId={eventsModalInitialEventId}
        />
      )}
      {user && modal === 'profile' && (
        <ProfileCardModal
          profile={{
            name: user.name,
            username: user.username,
            photoUrl: user.photoUrl,
            title: user.title,
            equippedFrame: user.equippedFrame,
            equippedFrameUrl: user.equippedFrameUrl,
            equippedBannerUrl: user.equippedBannerUrl,
            equippedBannerPositionY: user.equippedBannerPositionY,
            equippedBannerPositionX: user.equippedBannerPositionX,
            equippedShowcaseSkinUrl: user.equippedShowcaseSkinUrl,
            xp: user.xp || 0,
            rank: rank.name,
            wins: user.wins || 0,
            losses: user.losses || 0,
            village: getCurrentVillageId(user.village),
            collectedCardIds: user.collectedCardIds || [],
          }}
          isSelf
          onClose={() => { setProfileEditorOpen(false); setModal(null); }}
          playClickSound={playClickSound}
          playScrollSound={playScrollSound}
          onOpenEditModal={() => setProfileEditorOpen(true)}
        />
      )}
      {user && profileEditorOpen && (
        <ProfileModal user={user} onClose={() => setProfileEditorOpen(false)} onUpdateUser={updateUser} playClickSound={playClickSound} playUahSound={playUahSound} playScrollSound={playScrollSound} />
      )}
      {user && modal === 'cards' && (
        <CardGalleryModal
          user={user}
          newCardIds={newCardIds}
          onCardViewed={cardId => setNewCardIds(markCardAsViewed(user.username, cardId))}
          onClose={() => setModal(null)}
          playClickSound={playClickSound}
          onOpenShopPacks={() => {
            setShopInitialTab('bundle');
            setModal('shop');
          }}
        />
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
    </main>
  );
}
