import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Coins, History, Shirt, Sparkles, Volume2, X } from 'lucide-react';
import type { Character, NinjaCard, UserProfile } from '../types';
import type { CustomBannerItem } from '../lib/bannerStorage';
import { fetchCustomBannersFromServer } from '../lib/bannerStorage';
import {
  buildRewardRoulettePool,
  REWARD_ROULETTE_LEGENDARY_INTERVAL,
  REWARD_ROULETTE_LEGENDARY_SKIN_ID,
  REWARD_ROULETTE_COST,
  REWARD_ROULETTE_HISTORY_LIMIT,
  REWARD_ROULETTE_MAX_SPINS,
  type RewardRouletteDraw,
  type RewardRouletteHistoryEntry,
  type RewardRoulettePrize,
  type RewardRouletteRarity,
  isRewardRouletteHistoryEntry,
} from '../lib/rewardRoulette';
import { fetchCardsFromServer, getCards } from '../lib/cardStorage';
import { matchFetch } from '../lib/matchFetch';
import { useLanguage } from '../lib/i18n';
import RouletteShurikenIcon from './RouletteShurikenIcon';
import SkinMedia from './SkinMedia';

const RARITY_META: Record<RewardRouletteRarity, { labelPt: string; labelEn: string; className: string }> = {
  comum: { labelPt: 'Comum', labelEn: 'Common', className: 'roulette-prize-common' },
  rara: { labelPt: 'Raro', labelEn: 'Rare', className: 'roulette-prize-rare' },
  epica: { labelPt: 'Épico', labelEn: 'Epic', className: 'roulette-prize-epic' },
  lendaria: { labelPt: 'Lendário', labelEn: 'Legendary', className: 'roulette-prize-legendary' },
  mitica: { labelPt: 'Mítico', labelEn: 'Mythic', className: 'roulette-prize-mythic' },
};

const RING_POSITIONS = [
  [1, 1, 3], [1, 4, 1], [1, 5, 1],
  [2, 1], [2, 5],
  [3, 1], [3, 5],
  [4, 1], [4, 5],
  [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
] as const;

interface RewardRoulettePageProps {
  user: UserProfile;
  characters: Character[];
  onClose: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
  playRouletteTickSound: () => void;
  playWinSound: () => void;
  playCorrectSound: () => void;
}

interface RouletteSpinParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  deltaX: number;
  deltaY: number;
}

interface RouletteSpinText {
  id: number;
  x: number;
  y: number;
  theme: 'single' | 'bundle';
  rotationStart: string;
  rotationMid: string;
  rotationEnd: string;
}

function cardImage(card: NinjaCard): string {
  return card.imageUrl ||
    `https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/${card.slug}/icon.jpg`;
}

export default function RewardRoulettePage({
  user,
  characters,
  onClose,
  onUpdateUser,
  playClickSound,
  playRouletteTickSound,
  playWinSound,
  playCorrectSound,
}: RewardRoulettePageProps) {
  const { t } = useLanguage();
  const [cards, setCards] = useState<NinjaCard[]>(() => getCards());
  const [profileBanners, setProfileBanners] = useState<CustomBannerItem[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [spinningButton, setSpinningButton] = useState<1 | 10 | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [spinParticles, setSpinParticles] = useState<RouletteSpinParticle[]>([]);
  const [spinTextAnimation, setSpinTextAnimation] = useState<RouletteSpinText | null>(null);
  const [spinsUntilLegendary, setSpinsUntilLegendary] = useState(() => {
    const spinCount = Number.isSafeInteger(user.rewardRouletteSpinCount) &&
      Number(user.rewardRouletteSpinCount) >= 0 &&
      Number(user.rewardRouletteSpinCount) < REWARD_ROULETTE_LEGENDARY_INTERVAL
      ? Number(user.rewardRouletteSpinCount)
      : 0;
    return REWARD_ROULETTE_LEGENDARY_INTERVAL - spinCount;
  });
  const [draws, setDraws] = useState<RewardRouletteDraw[]>([]);
  const [activeDraw, setActiveDraw] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showRewardHistory, setShowRewardHistory] = useState(false);
  const [rewardHistory, setRewardHistory] = useState<RewardRouletteHistoryEntry[]>(
    () => (user.rewardRouletteHistory || []).filter(isRewardRouletteHistoryEntry),
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedPrizeSlots, setSelectedPrizeSlots] = useState<Array<{
    index: number;
    prize: RewardRoulettePrize;
  }>>([]);
  const [bannerPreview, setBannerPreview] = useState<{ name: string; image: string } | null>(null);
  const [activePrizeIndex, setActivePrizeIndex] = useState<number | null>(null);
  const [landingPrize, setLandingPrize] = useState<RewardRoulettePrize | null>(null);
  const [landingIndex, setLandingIndex] = useState<number | null>(null);
  const [landingRevealed, setLandingRevealed] = useState(false);
  const activePrizeIndexRef = useRef<number | null>(null);
  const spinEffectIdRef = useRef(0);
  const animationTimerRef = useRef<number | null>(null);
  const lastResultSoundRef = useRef('');

  useEffect(() => {
    let active = true;
    fetchCardsFromServer()
      .then(loaded => {
        if (active) setCards(loaded);
      })
      .catch(error => {
        console.error('Falha ao carregar as figurinhas da roleta:', error);
        if (active) setErrorMessage(t('Não foi possível carregar as figurinhas.', 'Could not load collectible cards.'));
      });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    let active = true;
    fetchCustomBannersFromServer()
      .then(loaded => {
        if (active) setProfileBanners(loaded);
      })
      .catch(error => {
        console.error('Falha ao carregar os banners de perfil da roleta:', error);
        if (active) setErrorMessage(t('Não foi possível carregar os banners de perfil.', 'Could not load profile banners.'));
      });
    return () => { active = false; };
  }, [t]);

  useEffect(() => () => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!bannerPreview && !showRewardHistory) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBannerPreview(null);
        setShowRewardHistory(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [bannerPreview, showRewardHistory]);

  const prizes = useMemo(
    () => buildRewardRoulettePool(characters, cards, profileBanners),
    [characters, cards, profileBanners],
  );
  const featuredPrize = prizes.find(prize => prize.skinId === REWARD_ROULETTE_LEGENDARY_SKIN_ID) ||
    prizes.find(prize => prize.rarity === 'lendaria') || prizes[0];
  const ringPrizes = useMemo(() => {
    const remaining = prizes.filter(prize => prize.id !== featuredPrize?.id);
    const used = new Set<string>();
    return RING_POSITIONS.map((_, index) => {
      const desiredRarity = ([
        'epica', 'comum', 'rara', 'rara', 'epica', 'comum', 'lendaria',
        'epica', 'rara', 'comum', 'rara', 'comum', 'epica', 'comum',
      ] as const)[index];
      const guaranteedLegendary = index === 6
        ? remaining.find(prize => prize.kind === 'voice' && prize.rarity === 'lendaria' && !used.has(prize.id))
        : index === 11
          ? remaining.find(prize => prize.id === 'ryos-300-legendary' && !used.has(prize.id))
          : undefined;
      const preferred = index === 6
        ? remaining.find(prize => prize.kind === 'voice' && !used.has(prize.id))
        : undefined;
      const candidate = (index === 0
        ? remaining.find(prize => prize.kind === 'banner' && prize.rarity === 'epica' && !used.has(prize.id))
        : undefined) ||
        guaranteedLegendary || preferred ||
        remaining.find(prize => prize.rarity === desiredRarity && !used.has(prize.id)) ||
        remaining.find(prize => !used.has(prize.id)) ||
        remaining[0] ||
        featuredPrize;
      if (candidate) used.add(candidate.id);
      return candidate;
    }).filter((prize): prize is RewardRoulettePrize => !!prize);
  }, [featuredPrize, prizes]);

  const currentDraw = draws[activeDraw];

  useEffect(() => {
    if (!showResult || !currentDraw) return;
    const soundKey = `${spinEffectIdRef.current}:${activeDraw}:${currentDraw.prize.id}`;
    if (lastResultSoundRef.current === soundKey) return;
    lastResultSoundRef.current = soundKey;
    if (currentDraw.prize.rarity === 'lendaria') playWinSound();
    else playCorrectSound();
  }, [activeDraw, currentDraw, playCorrectSound, playWinSound, showResult]);

  const animateToPrize = async (prize: RewardRoulettePrize, spinCount: 1 | 10) => {
    if (ringPrizes.length === 0) return null;
    const matchingIndex = ringPrizes.findIndex(candidate => candidate.id === prize.id);
    const hashedIndex = [...prize.id].reduce((hash, character) => hash + character.charCodeAt(0), 0);
    const targetIndex = matchingIndex >= 0 ? matchingIndex : hashedIndex % ringPrizes.length;
    const startIndex = activePrizeIndexRef.current ?? -1;
    const firstStep = (startIndex + 1) % ringPrizes.length;
    const stepsToTarget = (targetIndex - firstStep + ringPrizes.length) % ringPrizes.length;
    const totalSteps = spinCount === 1
      ? ringPrizes.length * 2 + Math.ceil(ringPrizes.length / 2) + stepsToTarget + 1
      : Math.max(8, stepsToTarget + 1);

    setLandingPrize(prize);
    setLandingIndex(targetIndex);
    setLandingRevealed(false);

    for (let step = 0; step < totalSteps; step++) {
      const index = (firstStep + step) % ringPrizes.length;
      activePrizeIndexRef.current = index;
      setActivePrizeIndex(index);
      if (step === totalSteps - 1) {
        setLandingRevealed(true);
        break;
      }
      playRouletteTickSound();
      const progress = (step + 1) / totalSteps;
      const delay = spinCount === 1
        ? 55 + Math.round(60 * progress ** 3)
        : 12 + Math.round(18 * progress ** 3);
      await new Promise<void>(resolve => {
        animationTimerRef.current = window.setTimeout(() => {
          animationTimerRef.current = null;
          resolve();
        }, delay);
      });
    }
    return targetIndex;
  };

  const animateSpinButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    count: 1 | 10,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    const id = ++spinEffectIdRef.current;
    const colors = count === 1
      ? ['#38bdf8', '#ffffff', '#94a3b8', '#0284c7']
      : ['#fbbf24', '#f59e0b', '#ef4444', '#ffffff'];

    setSpinTextAnimation({
      id,
      x,
      y,
      theme: count === 1 ? 'single' : 'bundle',
      rotationStart: `${(Math.random() * 12 - 6).toFixed(1)}deg`,
      rotationMid: `${(Math.random() * 6 - 3).toFixed(1)}deg`,
      rotationEnd: `${(Math.random() * 10 - 5).toFixed(1)}deg`,
    });
    setSpinParticles(Array.from({ length: 16 }, (_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 70 + 20;
      return {
        id: id * 16 + index,
        x,
        y: rect.top + rect.height / 2,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        deltaX: Math.cos(angle) * distance,
        deltaY: Math.sin(angle) * distance,
      };
    }));
  };

  const spin = async (count: 1 | 10) => {
    if (spinning) return;
    playClickSound();
    setSpinning(true);
    setSpinningButton(count);
    setErrorMessage('');
    try {
      const request = matchFetch('/api/reward-roulette/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, spins: count }),
      });
      const response = await request;
      const result = await response.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        cost?: number;
        draws?: RewardRouletteDraw[];
        user?: UserProfile;
      };
      if (!response.ok || !result.success || !result.user ||
          !Array.isArray(result.draws) || result.draws.length !== count) {
        throw new Error(result.error || `Não foi possível girar a roleta (HTTP ${response.status}).`);
      }

      const lastDraw = result.draws[result.draws.length - 1];
      const serverSpinCount = result.user.rewardRouletteSpinCount;
      const confirmedSpinsUntilLegendary = Number.isSafeInteger(lastDraw.spinsUntilLegendary)
        ? lastDraw.spinsUntilLegendary
        : Number.isSafeInteger(serverSpinCount)
          ? REWARD_ROULETTE_LEGENDARY_INTERVAL - Number(serverSpinCount)
          : null;
      if (
        confirmedSpinsUntilLegendary === null ||
        confirmedSpinsUntilLegendary < 1 ||
        confirmedSpinsUntilLegendary > REWARD_ROULETTE_LEGENDARY_INTERVAL
      ) {
        throw new Error(t(
          'O servidor não retornou o progresso da garantia do prêmio lendário. Atualize a página e tente novamente.',
          'The server did not return legendary guarantee progress. Refresh the page and try again.',
        ));
      }

      const drawProgress = result.draws.map((draw, index) => {
        const spinsRemaining = draw.spinsUntilLegendary;
        if (
          Number.isSafeInteger(spinsRemaining) &&
          Number(spinsRemaining) >= 1 &&
          Number(spinsRemaining) <= REWARD_ROULETTE_LEGENDARY_INTERVAL
        ) {
          return Number(spinsRemaining);
        }
        return index === result.draws!.length - 1 ? confirmedSpinsUntilLegendary : null;
      });
      if (drawProgress.some(progress => progress === null)) {
        throw new Error(t(
          'O servidor não retornou o progresso de cada giro. Atualize a página e tente novamente.',
          'The server did not return progress for every spin. Refresh the page and try again.',
        ));
      }

      setSpinsUntilLegendary(drawProgress[0]!);
      const serverHistory = Array.isArray(result.user.rewardRouletteHistory)
        ? result.user.rewardRouletteHistory.filter(isRewardRouletteHistoryEntry)
        : [];
      const receivedAt = new Date().toISOString();
      const localBatchId = `${Date.now()}-${spinEffectIdRef.current}`;
      const localDrawHistory = result.draws.map((draw, index) => {
          const { imageUrl: _imageUrl, ...compactPrize } = draw.prize;
          return {
            id: `roulette-local-${localBatchId}-${index + 1}`,
            createdAt: receivedAt,
            draw: { ...draw, prize: compactPrize },
          };
        });
      const cachedHistory = (user.rewardRouletteHistory || []).filter(isRewardRouletteHistoryEntry);
      const visibleHistory = (serverHistory.length > 0
        ? serverHistory
        : [...localDrawHistory, ...cachedHistory])
        .slice(0, REWARD_ROULETTE_HISTORY_LIMIT);
      onUpdateUser({ ...user, ...result.user, rewardRouletteHistory: visibleHistory });
      setRewardHistory(visibleHistory);
      setDraws(result.draws);
      setActiveDraw(0);
      setShowResult(false);
      setSelectedPrizeSlots([]);
      activePrizeIndexRef.current = null;
      for (let index = 0; index < result.draws.length; index++) {
        const spinsRemaining = drawProgress[index];
        if (spinsRemaining !== null) setSpinsUntilLegendary(spinsRemaining);
        const landingIndex = await animateToPrize(result.draws[index].prize, count);
        if (landingIndex !== null) {
          setSelectedPrizeSlots(current => [
            ...current.filter(slot => slot.index !== landingIndex),
            { index: landingIndex, prize: result.draws![index].prize },
          ]);
        }
      }
      setSpinning(false);
      setSpinningButton(null);
      setShowResult(true);
    } catch (error) {
      console.error('Falha ao girar a roleta de recompensas:', error);
      setErrorMessage(error instanceof Error ? error.message : t('Não foi possível girar a roleta.', 'Could not spin the roulette.'));
      setSpinning(false);
      setSpinningButton(null);
    }
  };

  const playKakashiVoice = () => {
    const audio = new Audio('/static/audio/kakashi/kakashi_jutsucopiado.mp3');
    void audio.play().catch(error => {
      console.warn('Não foi possível reproduzir a prévia da voz do Kakashi:', error);
      setErrorMessage(t('Não foi possível reproduzir a voz.', 'Could not play the voice.'));
    });
  };

  const prizeImage = (prize: RewardRoulettePrize): string | null => {
    if (prize.kind === 'banner') {
      if (prize.imageUrl) return prize.imageUrl;
      const catalogBanner = profileBanners.find(banner => banner.id === prize.bannerId);
      if (catalogBanner) return catalogBanner.imageUrl;
      const unlockedBannerIndex = user.unlockedBanners?.indexOf(prize.bannerId || '') ?? -1;
      return unlockedBannerIndex >= 0 ? user.unlockedBannerUrls?.[unlockedBannerIndex] || null : null;
    }
    if (prize.kind === 'skin') {
      return characters
        .flatMap(character => character.skins || [])
        .find(skin => skin.id === prize.skinId)?.image || null;
    }
    if (prize.kind === 'card') {
      const card = cards.find(candidate => candidate.id === prize.cardId);
      return card ? cardImage(card) : null;
    }
    return null;
  };

  const renderPrize = (prize: RewardRoulettePrize, featured = false) => {
    const rarity = RARITY_META[prize.rarity];
    const image = prizeImage(prize);
    return (
      <>
        <span className={`roulette-prize-rarity ${rarity.className}`}>
          {t(rarity.labelPt, rarity.labelEn)}
        </span>
        {prize.kind === 'banner' && image ? (
          <button
            type="button"
            className="roulette-prize-banner-art"
            onClick={event => {
              event.stopPropagation();
              setBannerPreview({ name: prize.name, image });
            }}
            aria-label={t(`Ampliar banner ${prize.name}`, `Enlarge banner ${prize.name}`)}
            title={t('Clique para ampliar', 'Click to enlarge')}
          >
            <img src={image} alt="" draggable={false} />
          </button>
        ) : (
          <div className="roulette-prize-art">
            {image ? (
            <SkinMedia src={image} alt="" className="roulette-prize-image" autoPlay />
            ) : prize.kind === 'voice' ? (
              <Volume2 aria-hidden="true" />
            ) : prize.kind === 'ryos' ? (
              <Coins aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
          </div>
        )}
        <strong>{prize.name}</strong>
        {prize.kind === 'skin' && prize.characterName && (
          <span className="roulette-prize-subtitle">{prize.characterName}</span>
        )}
        {prize.kind === 'voice' && (
          <button
            type="button"
            className="roulette-voice-preview"
            onClick={event => {
              event.stopPropagation();
              playKakashiVoice();
            }}
            aria-label={t('Ouvir voz do Kakashi', 'Play Kakashi voice')}
            title={t('Ouvir prévia', 'Play preview')}
          >
            <Volume2 aria-hidden="true" />
          </button>
        )}
        {featured && <span className="roulette-featured-label">{t('PRÊMIO PRINCIPAL', 'TOP PRIZE')}</span>}
      </>
    );
  };

  const nextDraw = async () => {
    playClickSound();
    if (activeDraw + 1 < draws.length) {
      setActiveDraw(activeDraw + 1);
      return;
    }
    setDraws([]);
    setShowResult(false);
    setLandingPrize(null);
    setLandingIndex(null);
    setLandingRevealed(false);
    setActivePrizeIndex(null);
    activePrizeIndexRef.current = null;
  };
  const revealedImage = currentDraw ? prizeImage(currentDraw.prize) : null;
  const openRewardHistory = async () => {
    if (spinning) return;
    playClickSound();
    setShowRewardHistory(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const readJson = async (response: Response) => {
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        if (!contentType.includes('application/json')) return null;
        try {
          return JSON.parse(text) as {
            success?: boolean;
            error?: string;
            history?: RewardRouletteHistoryEntry[];
            user?: UserProfile;
          };
        } catch {
          return null;
        }
      };
      const historyResponse = await matchFetch(
        `/api/reward-roulette/history?username=${encodeURIComponent(user.username)}`,
      );
      const historyResult = await readJson(historyResponse);
      const endpointHistory = Array.isArray(historyResult?.history)
        ? historyResult.history.filter(isRewardRouletteHistoryEntry)
        : [];
      if (historyResponse.ok && historyResult?.success && endpointHistory.length > 0) {
        setRewardHistory(endpointHistory);
        return;
      }

      const profileResponse = await matchFetch(
        `/api/user/profile?username=${encodeURIComponent(user.username)}`,
      );
      const profileResult = await readJson(profileResponse);
      if (profileResponse.ok && profileResult?.success && profileResult.user) {
        const serverHistory = profileResult.user.rewardRouletteHistory;
        const cachedHistory = rewardHistory.length > 0
          ? rewardHistory
          : (user.rewardRouletteHistory || []).filter(isRewardRouletteHistoryEntry);
        setRewardHistory(Array.isArray(serverHistory) && serverHistory.length > 0
          ? serverHistory.filter(isRewardRouletteHistoryEntry)
          : cachedHistory);
        return;
      }

      const response = historyResult?.error ? historyResponse : profileResponse;
      const result = historyResult?.error ? historyResult : profileResult;
      throw new Error(result?.error ||
        `Não foi possível carregar o histórico (HTTP ${response.status}, ${response.headers.get('content-type') || 'resposta inválida'}). Reinicie o servidor local e tente novamente.`);
    } catch (error) {
      console.error('Falha ao carregar o histórico da roleta:', error);
      setHistoryError(error instanceof Error
        ? error.message
        : t('Não foi possível carregar o histórico.', 'Could not load reward history.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <main className="reward-roulette-page" role="dialog" aria-modal="true" aria-labelledby="reward-roulette-title">
      <button
        type="button"
        className="reward-roulette-close"
        onClick={() => { playClickSound(); onClose(); }}
        aria-label={t('Fechar roleta', 'Close roulette')}
      >
        <X aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`reward-roulette-history-button${spinning ? ' is-disabled' : ''}`}
        onClick={() => { void openRewardHistory(); }}
        disabled={spinning}
        aria-label={t('Abrir histórico de recompensas', 'Open reward history')}
      >
        <History aria-hidden="true" />
        <span>{t('Histórico de recompensas', 'Reward history')}</span>
        <strong>{rewardHistory.length}</strong>
      </button>

      <div className="reward-roulette-wallet" aria-label={t('Seu saldo', 'Your balance')}>
        <span aria-label={`${user.gems ?? 120} ${t('Ryo', 'Ryo')}`}>
          <img src="/static/img/icon/ryo.webp" alt="" />
          {(user.gems ?? 120).toLocaleString()}
        </span>
        <span aria-label={`${user.ryos ?? 1500} ${t('Gold', 'Gold')}`}>
          <img src="/static/img/icon/gold.webp" alt="" />
          {(user.ryos ?? 1500).toLocaleString()}
        </span>
      </div>

      <header className="reward-roulette-heading">
        <h1 id="reward-roulette-title">
          {t('Roleta de', 'Reward')}
          <br />
          {t('Recompensas', 'Roulette')}
        </h1>
      </header>

      <section className={`reward-roulette-board${spinning ? ' is-spinning' : ''}`} aria-label={t('Prêmios disponíveis', 'Available prizes')}>
        <div className="reward-roulette-grid">
          {ringPrizes.map((prize, index) => {
            const [row, column, columnSpan = 1] = RING_POSITIONS[index];
            const isLandingTile = landingRevealed && landingIndex === index && landingPrize;
            const selectedPrize = selectedPrizeSlots.find(slot => slot.index === index)?.prize;
            const displayedPrize = isLandingTile ? landingPrize : selectedPrize || prize;
            return (
              <article
                key={`${displayedPrize.id}:${index}`}
                className={`roulette-prize-tile ${RARITY_META[displayedPrize.rarity].className}${displayedPrize.kind === 'banner' ? ' roulette-prize-banner-tile' : ''}${activePrizeIndex === index ? ' is-roulette-active' : ''}${isLandingTile || selectedPrize ? ' is-roulette-winner' : ''}`}
                style={{ gridRow: row, gridColumn: `${column} / span ${columnSpan}` }}
              >
                {renderPrize(displayedPrize)}
              </article>
            );
          })}
          {featuredPrize && (
            <article
              className={`roulette-prize-tile roulette-featured-prize ${RARITY_META[featuredPrize.rarity].className}`}
              style={{ gridRow: '2 / span 3', gridColumn: '2 / span 3' }}
            >
              {renderPrize(featuredPrize, true)}
            </article>
          )}
        </div>
      </section>

      <p className="reward-roulette-pity" role="status" aria-live="polite">
        {t('Faltam', 'Only')} <strong>{spinsUntilLegendary}</strong>{' '}
        {t('giros para receber o prêmio lendário', 'spins until a guaranteed legendary reward')}
      </p>
      {errorMessage && <p className="reward-roulette-error" role="alert">{errorMessage}</p>}

      <div className="reward-roulette-actions">
        <button
          type="button"
          className={`roulette-spin-button roulette-spin-button-single${spinTextAnimation?.theme === 'single' ? ' is-spin-clicked' : ''}${spinningButton === 1 ? ' is-spinning' : ''}`}
          onClick={event => {
            animateSpinButtonClick(event, 1);
            void spin(1);
          }}
          disabled={spinning}
        >
          <svg className="roulette-spin-art" viewBox="0 0 390 98" aria-hidden="true">
            <defs>
              <linearGradient id="roulette-silver-frame" x1="0" y1="0" x2="0" y2="98" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fff" /><stop offset=".5" stopColor="#708294" /><stop offset="1" stopColor="#19222b" />
              </linearGradient>
              <linearGradient id="roulette-blue-wood" x1="0" y1="0" x2="0" y2="98" gradientUnits="userSpaceOnUse">
                <stop stopColor="#3b5d7c" /><stop offset=".5" stopColor="#2d4861" /><stop offset="1" stopColor="#1c3042" />
              </linearGradient>
              <pattern id="roulette-blue-grain" width="100" height="24" patternUnits="userSpaceOnUse">
                <path d="M0 6Q25 1 50 6T100 6M0 18Q25 23 50 18T100 18" fill="none" stroke="#9bc5e8" strokeOpacity=".2" />
              </pattern>
            </defs>
            <rect x="2" y="4" width="386" height="92" rx="22" fill="#000" opacity=".4" />
            <rect x="2" y="2" width="386" height="92" rx="20" fill="url(#roulette-silver-frame)" stroke="#111822" strokeWidth="2.5" />
            <rect x="7" y="7" width="376" height="82" rx="15" fill="url(#roulette-blue-wood)" />
            <rect x="8" y="8" width="374" height="80" rx="14" fill="url(#roulette-blue-grain)" />
            <circle cx="55" cy="49" r="36" fill="#0c141d" />
            <circle cx="55" cy="49" r="33" fill="none" stroke="url(#roulette-silver-frame)" strokeWidth="4" />
            <circle cx="55" cy="49" r="28" fill="#1b2836" />
            <RouletteShurikenIcon idPrefix="roulette-silver" tone="silver" />
          </svg>
          <span className="roulette-spin-copy">
            <strong>{spinning ? t('Girando...', 'Spinning...') : t('1 GIRO', '1 SPIN')}</strong>
            <small><img src="/static/img/icon/gold.webp" alt="" />{REWARD_ROULETTE_COST} Ryos</small>
          </span>
        </button>
        <button
          type="button"
          className={`roulette-spin-button roulette-spin-button-bundle${spinTextAnimation?.theme === 'bundle' ? ' is-spin-clicked' : ''}${spinningButton === 10 ? ' is-spinning' : ''}`}
          onClick={event => {
            animateSpinButtonClick(event, REWARD_ROULETTE_MAX_SPINS);
            void spin(REWARD_ROULETTE_MAX_SPINS);
          }}
          disabled={spinning}
        >
          <svg className="roulette-spin-art" viewBox="0 0 390 98" aria-hidden="true">
            <defs>
              <linearGradient id="roulette-gold-frame" x1="0" y1="0" x2="0" y2="98" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fffbeb" /><stop offset=".4" stopColor="#ca8a04" /><stop offset="1" stopColor="#3b1a03" />
              </linearGradient>
              <linearGradient id="roulette-red-wood" x1="0" y1="0" x2="0" y2="98" gradientUnits="userSpaceOnUse">
                <stop stopColor="#a83c31" /><stop offset=".5" stopColor="#7f2927" /><stop offset="1" stopColor="#501a20" />
              </linearGradient>
              <pattern id="roulette-red-grain" width="100" height="24" patternUnits="userSpaceOnUse">
                <path d="M0 6Q25 1 50 6T100 6M0 18Q25 23 50 18T100 18" fill="none" stroke="#fecaca" strokeOpacity=".18" />
              </pattern>
            </defs>
            <rect x="2" y="4" width="386" height="92" rx="22" fill="#000" opacity=".4" />
            <rect x="2" y="2" width="386" height="92" rx="20" fill="url(#roulette-gold-frame)" stroke="#451a03" strokeWidth="2.5" />
            <rect x="7" y="7" width="376" height="82" rx="15" fill="url(#roulette-red-wood)" />
            <rect x="8" y="8" width="374" height="80" rx="14" fill="url(#roulette-red-grain)" />
            <circle cx="55" cy="49" r="36" fill="#300705" />
            <circle cx="55" cy="49" r="33" fill="none" stroke="url(#roulette-gold-frame)" strokeWidth="4" />
            <circle cx="55" cy="49" r="28" fill="#5c1108" />
            <RouletteShurikenIcon idPrefix="roulette-gold" tone="gold" />
          </svg>
          <span className="roulette-spin-copy">
            <strong>{spinning ? t('Girando...', 'Spinning...') : t('10 GIROS', '10 SPINS')}</strong>
            <small><img src="/static/img/icon/gold.webp" alt="" />{REWARD_ROULETTE_COST * REWARD_ROULETTE_MAX_SPINS} Ryos</small>
          </span>
        </button>
      </div>
      {spinParticles.map(particle => (
        <span
          key={particle.id}
          className="roulette-spin-particle"
          style={{
            left: `${particle.x}px`,
            top: `${particle.y}px`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            '--roulette-spin-dx': `${particle.deltaX}px`,
            '--roulette-spin-dy': `${particle.deltaY}px`,
          } as React.CSSProperties}
          aria-hidden="true"
          onAnimationEnd={() => setSpinParticles(current => current.filter(item => item.id !== particle.id))}
        />
      ))}
      {spinTextAnimation && (
        <div
          className={`roulette-spin-floating-text roulette-spin-floating-text-${spinTextAnimation.theme}`}
          style={{
            left: `${spinTextAnimation.x}px`,
            top: `${spinTextAnimation.y}px`,
            '--roulette-spin-rotate-start': spinTextAnimation.rotationStart,
            '--roulette-spin-rotate-mid': spinTextAnimation.rotationMid,
            '--roulette-spin-rotate-end': spinTextAnimation.rotationEnd,
          } as React.CSSProperties}
          aria-hidden="true"
          onAnimationEnd={() => {
            setSpinTextAnimation(current => current?.id === spinTextAnimation.id ? null : current);
          }}
        >
          {spinTextAnimation.theme === 'single' ? (
            <>
              <span className="roulette-spin-floating-single-title">
                {t('+1 GIRO!', '+1 SPIN!')}
              </span>
              <span className="roulette-spin-floating-single-badge">SINGLE PULL</span>
            </>
          ) : (
            <>
              <span className="roulette-spin-floating-bundle-badge">⚡ MEGA PULL ⚡</span>
              <span className="roulette-spin-floating-bundle-title">
                {t('★ 10 GIROS! ★', '★ 10 SPINS! ★')}
              </span>
            </>
          )}
        </div>
      )}
      {currentDraw && showResult && (
        <div className="reward-roulette-result-backdrop" role="presentation">
          <section className={`reward-roulette-result ${RARITY_META[currentDraw.prize.rarity].className}`} role="dialog" aria-modal="true" aria-labelledby="reward-roulette-result-title">
            <span className={`roulette-prize-rarity ${RARITY_META[currentDraw.prize.rarity].className}`}>
              {t(RARITY_META[currentDraw.prize.rarity].labelPt, RARITY_META[currentDraw.prize.rarity].labelEn)}
            </span>
            {currentDraw.guaranteedLegendary && (
              <span className="reward-roulette-guaranteed">
                {t('LENDÁRIO GARANTIDO', 'GUARANTEED LEGENDARY')}
              </span>
            )}
            <div className="reward-roulette-result-art">
              {currentDraw.prize.kind === 'banner' && revealedImage ? (
                <button
                  type="button"
                  className="reward-roulette-result-banner-preview"
                  onClick={() => setBannerPreview({ name: currentDraw.prize.name, image: revealedImage })}
                  aria-label={t(`Ampliar banner ${currentDraw.prize.name}`, `Enlarge banner ${currentDraw.prize.name}`)}
                  title={t('Clique para ampliar', 'Click to enlarge')}
                >
                  <img src={revealedImage} alt="" className="reward-roulette-result-banner" />
                </button>
              ) : revealedImage ? (
                <SkinMedia src={revealedImage} alt="" className="roulette-prize-image" autoPlay />
              ) : currentDraw.prize.kind === 'voice' ? (
                <Volume2 aria-hidden="true" />
              ) : currentDraw.prize.kind === 'ryos' ? (
                <Coins aria-hidden="true" />
              ) : currentDraw.prize.kind === 'skin' ? (
                <Shirt aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
            </div>
            <h2 id="reward-roulette-result-title">{currentDraw.prize.name}</h2>
            {currentDraw.prize.characterName && <p>{currentDraw.prize.characterName}</p>}
            {currentDraw.duplicate && <p>{t('Recompensa repetida convertida em Ryos.', 'Duplicate reward converted to Ryos.')}</p>}
            {currentDraw.prize.kind === 'voice' && (
              <button type="button" className="reward-roulette-play-voice" onClick={playKakashiVoice}>
                <Volume2 aria-hidden="true" />{t('Ouvir voz', 'Play voice')}
              </button>
            )}
            {draws.length > 1 && (
              <p className="reward-roulette-result-progress" aria-live="polite">
                {t(`Recompensa ${activeDraw + 1}/${draws.length}`, `Reward ${activeDraw + 1}/${draws.length}`)}
              </p>
            )}
            <button type="button" className="reward-roulette-continue" onClick={nextDraw}>
              {activeDraw + 1 < draws.length ? (
                <>
                  <span>{t('Próxima recompensa', 'Next reward')}</span>
                  <ChevronRight aria-hidden="true" />
                </>
              ) : (
                <>
                  <span>{t('Continuar', 'Continue')}</span>
                  <Check aria-hidden="true" />
                </>
              )}
            </button>
          </section>
          <p className="reward-roulette-pity reward-roulette-result-pity" role="status" aria-live="polite">
            {t('Faltam', 'Only')} <strong>{spinsUntilLegendary}</strong>{' '}
            {t('giros para receber o prêmio lendário', 'spins until a guaranteed legendary reward')}
          </p>
        </div>
      )}
      {showRewardHistory && (
        <div
          className="reward-roulette-history-backdrop"
          role="presentation"
          onClick={() => setShowRewardHistory(false)}
        >
          <section
            className="reward-roulette-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-roulette-history-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="reward-roulette-history-inner">
              <header className="reward-roulette-history-header">
                <div>
                  <History aria-hidden="true" />
                  <h2 id="reward-roulette-history-title">
                    {t('Histórico de recompensas', 'Reward history')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRewardHistory(false)}
                  aria-label={t('Fechar histórico', 'Close history')}
                  title={t('Fechar', 'Close')}
                >
                  <X aria-hidden="true" />
                </button>
              </header>
              {rewardHistory.length > 0 ? (
                <ol className="reward-roulette-history-list">
                  {rewardHistory.map((entry: RewardRouletteHistoryEntry) => {
                    const prize = entry.draw.prize;
                    const image = prizeImage(prize);
                    const date = new Date(entry.createdAt);
                    return (
                      <li key={entry.id} className="reward-roulette-history-item">
                        {image ? (
                          <img src={image} alt="" className="reward-roulette-history-image" />
                        ) : (
                          <span className="reward-roulette-history-image is-icon">
                            {prize.kind === 'ryos' ? <Coins aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                          </span>
                        )}
                        <div className="reward-roulette-history-details">
                          <div className="reward-roulette-history-prize">
                            <strong>{prize.name}</strong>
                            <span className={`roulette-prize-rarity ${RARITY_META[prize.rarity].className}`}>
                              {t(RARITY_META[prize.rarity].labelPt, RARITY_META[prize.rarity].labelEn)}
                            </span>
                          </div>
                          {prize.characterName && prize.characterName !== prize.name && (
                            <span>{prize.characterName}</span>
                          )}
                          <span className="reward-roulette-history-description">
                            {entry.draw.duplicate
                              ? t('Recompensa duplicada convertida em Ryos.', 'Duplicate reward converted to Ryos.')
                              : t('Recompensa recebida com sucesso.', 'Reward received successfully.')}
                          </span>
                          {entry.draw.guaranteedLegendary && (
                            <span className="reward-roulette-history-guaranteed">
                              {t('Lendário garantido', 'Guaranteed legendary')}
                            </span>
                          )}
                          <time dateTime={entry.createdAt}>
                            {t(date.toLocaleString('pt-BR'), date.toLocaleString('en-US'))}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : historyLoading ? (
                <p className="reward-roulette-history-empty">
                  {t('Carregando histórico...', 'Loading reward history...')}
                </p>
              ) : (
                <p className="reward-roulette-history-empty">
                  {historyError || t('Suas recompensas obtidas aparecerão aqui.', 'Your earned rewards will appear here.')}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {bannerPreview && (
        <div
          className="reward-roulette-banner-lightbox"
          role="presentation"
          onClick={() => setBannerPreview(null)}
        >
          <section
            className="reward-roulette-banner-lightbox-content"
            role="dialog"
            aria-modal="true"
            aria-label={t(`Banner ${bannerPreview.name}`, `Banner ${bannerPreview.name}`)}
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="reward-roulette-banner-lightbox-close"
              onClick={() => setBannerPreview(null)}
              aria-label={t('Fechar imagem ampliada', 'Close enlarged image')}
              title={t('Fechar', 'Close')}
            >
              <X aria-hidden="true" />
            </button>
            <img
              src={bannerPreview.image}
              alt={bannerPreview.name}
              className="reward-roulette-banner-lightbox-image"
            />
            <strong>{bannerPreview.name}</strong>
          </section>
        </div>
      )}
    </main>
  );
}
