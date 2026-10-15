import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Coins,
  Gem,
  Filter,
  Images,
  LockKeyhole,
  LogOut,
  Settings,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Character, ChakraType, NinjaEvent, Quest, Skill, UserProfile } from '../types';
import { fetchCharactersFromServer, getCharacters } from '../lib/characterStorage';
import { fetchEventsFromServer, getEvents } from '../lib/eventStorage';
import { safeFetchJson } from '../lib/api';
import { getRanks } from '../lib/rankStorage';
import { getRankProgress } from '../lib/xpSystem';
import { isCharacterUnlocked } from '../lib/characterUnlocks';
import { useLanguage } from '../lib/i18n';
import EventsModal from './EventsModal';
import ShopModal from './ShopModal';
import ProfileModal from './ProfileModal';
import ProfileCardModal from './ProfileCardModal';
import CardGalleryModal from './CardGalleryModal';
import GameManualModal from './GameManualModal';

interface LobbyScreenProps {
  onStartGame: () => void;
  onBattle: () => void;
  onOpenQuests: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  playUahSound: () => void;
  onOpenAdmin: () => void;
  user: UserProfile | null;
  onLogout: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  audioSettings: { master: number; effects: number; music: number };
  onUpdateAudioSetting: (key: 'master' | 'effects' | 'music', value: number) => void;
}

type LobbyModal = 'characters' | 'clan' | 'shop' | 'events' | 'profile' | 'profile-edit' | 'cards' | 'audio' | 'help' | null;

export default function LobbyScreen({
  onStartGame,
  onBattle,
  onOpenQuests,
  isMuted,
  onToggleMute,
  playClickSound,
  playScrollSound,
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
  const [characters, setCharacters] = useState<Character[]>(() => getCharacters());
  const [quests, setQuests] = useState<Quest[]>([]);
  const [events, setEvents] = useState<NinjaEvent[]>(() => getEvents());
  const [clanMessage, setClanMessage] = useState(false);
  const [showRosterFilters, setShowRosterFilters] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterTag, setRosterTag] = useState('');
  const [detailsCharacter, setDetailsCharacter] = useState<Character | null>(null);

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

  const ranks = getRanks();
  const rank = getRankProgress(user?.xp || 0, ranks).currentRank;
  const featuredEvent = events.find(event => event.featured) || events[0];
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
    Blood: t('Linhagem', 'Bloodline'),
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

  const updateUser = (updated: UserProfile) => onUpdateUser(updated);
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
          <span><Gem aria-hidden="true" />{(user?.gems ?? 120).toLocaleString()}</span>
          <span><Coins aria-hidden="true" />{(user?.ryos ?? 1500).toLocaleString()}</span>
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
        <button type="button" onClick={openQuests} className="lobby-mission-button">
          <span className="lobby-mission-icon"><Sparkles aria-hidden="true" /></span>
          <span>{t('Missões de novato', 'Novice missions')}</span>
        </button>
        <button type="button" onClick={openQuests} className="lobby-mission-button">
          <span className="lobby-mission-icon"><LockKeyhole aria-hidden="true" /></span>
          <span>{t('Desbloquear personagens', 'Unlock characters')}</span>
        </button>
      </aside>

      <section className="lobby-center">
        <button type="button" className="lobby-battle-button" onClick={handleBattle}>
          <Swords aria-hidden="true" />
          <span>{t('BATALHAR!', 'BATTLE!')}</span>
          <Swords aria-hidden="true" />
        </button>
      </section>

      {featuredEvent && (
        <button type="button" className="lobby-event-banner" onClick={() => openAuthenticated('events')}>
          <img src={featuredEvent.bannerUrl} alt="" />
          <span className="lobby-event-overlay" />
          <span className="lobby-event-copy">
            <small>{featuredEvent.badge || t('EVENTO', 'EVENT')}</small>
            <strong>{featuredEvent.title}</strong>
            <span>{featuredEvent.timeLeft}</span>
          </span>
          <span className="lobby-event-cta">{t('Ver evento', 'View event')}</span>
        </button>
      )}

      <nav className="lobby-footer" aria-label={t('Navegação principal', 'Main navigation')}>
        {footerItems.map(({ label, icon: Icon, action, primary }) => (
          <button type="button" key={label} onClick={action} className={primary ? 'lobby-nav-item lobby-nav-primary' : 'lobby-nav-item'}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="lobby-quick-actions">
        {user?.username.trim().toLowerCase() === '2' && (
          <button type="button" onClick={onOpenAdmin} aria-label={t('Painel administrativo', 'Admin panel')}><Award /></button>
        )}
        <button type="button" onClick={() => { playClickSound(); setModal('help'); }} aria-label={t('Como jogar', 'How to play')}><CircleHelp /></button>
        <button type="button" onClick={() => { playClickSound(); onToggleMute(); }} aria-label={isMuted ? t('Ativar som', 'Unmute') : t('Silenciar', 'Mute')}>
          {isMuted ? <VolumeX /> : <Volume2 />}
        </button>
        <button type="button" onClick={() => { playClickSound(); setModal('cards'); }} aria-label={t('Galeria de cards', 'Card gallery')}><Images /></button>
        <button type="button" onClick={() => { playClickSound(); setModal('audio'); }} aria-label={t('Configurações', 'Settings')}><Settings /></button>
        {user && <button type="button" onClick={onLogout} aria-label={t('Sair da conta', 'Log out')}><LogOut /></button>}
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
            <h2>{t('Clãs shinobi', 'Shinobi clans')}</h2>
            <p>{t('A área de clãs estará disponível em breve.', 'The clan area will be available soon.')}</p>
          </section>
        </div>
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
      {user && modal === 'shop' && <ShopModal user={user} onClose={() => setModal(null)} onUpdateUser={updateUser} playClickSound={playClickSound} playScrollSound={playScrollSound} />}
      {user && modal === 'events' && <EventsModal user={user} onClose={() => setModal(null)} onUpdateUser={updateUser} playClickSound={playClickSound} />}
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
            village: t('Vila da Folha (Konoha)', 'Leaf Village (Konoha)'),
            collectedCardIds: user.collectedCardIds || [],
          }}
          isSelf
          onClose={() => setModal(null)}
          playClickSound={playClickSound}
          playScrollSound={playScrollSound}
          onOpenEditModal={() => { setModal('profile-edit'); playScrollSound(); }}
        />
      )}
      {user && modal === 'profile-edit' && (
        <ProfileModal user={user} onClose={() => setModal('profile')} onUpdateUser={updateUser} playClickSound={playClickSound} playUahSound={playUahSound} playScrollSound={playScrollSound} />
      )}
      {user && modal === 'cards' && (
        <CardGalleryModal user={user} onClose={() => setModal(null)} onUpdateUser={updateUser} playClickSound={playClickSound} />
      )}
    </main>
  );
}
