import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarDays,
  CircleHelp,
  Coins,
  Gem,
  Images,
  LockKeyhole,
  LogOut,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Character, NinjaEvent, Quest, UserProfile } from '../types';
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
    return [...characters].sort((a, b) => {
      const aUnlocked = isCharacterUnlocked(a, user, quests);
      const bUnlocked = isCharacterUnlocked(b, user, quests);
      return Number(bUnlocked) - Number(aUnlocked) || a.name.localeCompare(b.name);
    });
  }, [characters, quests, user]);

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
    { label: t('Shinobi', 'Shinobi'), icon: Users, action: () => { playClickSound(); setModal('characters'); } },
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
                <h2 id="lobby-roster-title">{t('Shinobis', 'Shinobi')}</h2>
                <p>{t('Personagens desbloqueados primeiro', 'Unlocked characters first')}</p>
              </div>
              <button type="button" onClick={() => setModal(null)} aria-label={t('Fechar', 'Close')}><X /></button>
            </header>
            <div className="lobby-roster-grid">
              {orderedCharacters.map(character => {
                const unlocked = isCharacterUnlocked(character, user, quests);
                return (
                  <article className={`lobby-roster-character${unlocked ? '' : ' is-locked'}`} key={character.id} title={!unlocked ? t('Bloqueado por missão', 'Locked by a mission') : character.name}>
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
                  </article>
                );
              })}
            </div>
          </section>
        </div>
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
