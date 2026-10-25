/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Gift, CheckCircle, Clock, Sparkles, Target, ArrowUpRight } from 'lucide-react';
import { UserProfile, NinjaEvent } from '../types';
import { getEvents, fetchEventsFromServer } from '../lib/eventStorage';
import { playGlobalSound } from '../lib/soundUtils';
import { configFetch } from '../lib/api';
import { getEventTimeRemaining, UCHIHA_EVENT_ID } from '../lib/uchihaEvent';
import { getDefaultEventTheme, getEventTheme, getEventThemeStyle } from '../lib/eventThemes';

interface EventsModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
  initialEventId?: string;
}

export default function EventsModal({
  user,
  onClose,
  onUpdateUser,
  playClickSound,
  initialEventId,
}: EventsModalProps) {
  const [events, setEvents] = useState<NinjaEvent[]>(() => getEvents());
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    const loaded = getEvents();
    return initialEventId || loaded[0]?.id || '';
  });
  const [claimToast, setClaimToast] = useState<string | null>(null);
  const [claimingObjectiveId, setClaimingObjectiveId] = useState<string | null>(null);
  const [eventClock, setEventClock] = useState(() => Date.now());
  const [bannerAspectRatios, setBannerAspectRatios] = useState<Record<string, number>>({});
  const bannerLoads = useRef(new Set<string>());

  useEffect(() => {
    fetchEventsFromServer().then(loaded => {
      setEvents(loaded);
      setSelectedEventId(current =>
        initialEventId && loaded.some(event => event.id === initialEventId)
          ? initialEventId
          : current && loaded.some(event => event.id === current)
            ? current
            : loaded[0]?.id || '',
      );
    });
  }, [initialEventId]);

  useEffect(() => {
    let active = true;
    events.forEach(event => {
      if (!event.bannerUrl || bannerLoads.current.has(event.bannerUrl)) return;
      bannerLoads.current.add(event.bannerUrl);
      const image = new Image();
      image.onload = () => {
        if (!active || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
        setBannerAspectRatios(current => ({
          ...current,
          [event.bannerUrl]: image.naturalWidth / image.naturalHeight,
        }));
      };
      image.onerror = () => console.error(`Não foi possível carregar a imagem do evento "${event.title}".`);
      image.src = event.bannerUrl;
    });
    return () => { active = false; };
  }, [events]);

  useEffect(() => {
    const timer = window.setInterval(() => setEventClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const claimedIds = user.claimedEventRewardIds || [];
  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0] || getEvents()[0];
  const eventCountdown = selectedEvent ? getEventTimeRemaining(selectedEvent, eventClock) : null;

  const getObjectiveProgress = (event: NinjaEvent, objectiveId: string, fallback: number) =>
    event.id === UCHIHA_EVENT_ID
      ? Math.max(0, Number(user.eventProgress?.[event.id]?.[objectiveId]) || 0)
      : fallback;

  const selectedCompletedCount = selectedEvent?.objectives.filter(objective =>
    getObjectiveProgress(selectedEvent, objective.id, objective.current) >= objective.target,
  ).length || 0;
  const selectedObjectiveCount = selectedEvent?.objectives.length || 0;
  const selectedCompletion = selectedObjectiveCount
    ? Math.round((selectedCompletedCount / selectedObjectiveCount) * 100)
    : 0;
  const selectedTheme = getEventTheme(
    selectedEvent ? selectedEvent.theme || getDefaultEventTheme(selectedEvent) : 'naruto-orange',
  );

  const handleClaimReward = async (event: NinjaEvent, objId: string) => {
    const obj = event.objectives.find(o => o.id === objId);
    if (!obj || getObjectiveProgress(event, objId, obj.current) < obj.target) return;
    if (claimedIds.includes(objId)) return;

    if (event.id === UCHIHA_EVENT_ID) {
      if (claimingObjectiveId) return;
      setClaimingObjectiveId(objId);
      try {
        const response = await configFetch('/api/events/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.username, objectiveId: objId }),
        });
        const result = await response.json().catch(() => null) as {
          success?: boolean;
          error?: string;
          user?: UserProfile;
          reward?: { label?: string };
        } | null;
        if (!response.ok || !result?.success || !result.user) {
          throw new Error(result?.error || 'Não foi possível resgatar o prêmio.');
        }
        playGlobalSound('claim-2');
        onUpdateUser(result.user);
        setClaimToast(`Prêmio surpresa: ${result.reward?.label || 'resgatado!'}`);
        setTimeout(() => setClaimToast(null), 3000);
      } catch (error) {
        setClaimToast(error instanceof Error ? error.message : 'Não foi possível resgatar o prêmio.');
        setTimeout(() => setClaimToast(null), 4000);
      } finally {
        setClaimingObjectiveId(null);
      }
      return;
    }

    playGlobalSound('claim-2');

    let newRyos = user.ryos || 1000;
    let newGems = user.gems || 100;
    let newTitles = [...(user.unlockedTitles || ['Estudante'])];
    let newFrames = [...(user.unlockedFrames || ['Padrão'])];
    let newFrameUrls = [...(user.unlockedFrameUrls || [])];
    let newSkins = [...(user.unlockedSkins || [])];
    let newSkillSkins = [...(user.unlockedSkillSkins || [])];

    if (obj.rewardType === 'ryos' && typeof obj.rewardValue === 'number') {
      newRyos += Number(obj.rewardValue);
    } else if (obj.rewardType === 'gems' && typeof obj.rewardValue === 'number') {
      newGems += Number(obj.rewardValue);
    } else if (obj.rewardType === 'title' && typeof obj.rewardValue === 'string') {
      if (!newTitles.includes(obj.rewardValue)) {
        newTitles.push(obj.rewardValue);
      }
    } else if (obj.rewardType === 'frame') {
      const frameName = String(obj.rewardValue);
      if (!newFrames.includes(frameName)) {
        newFrames.push(frameName);
      }
      if (obj.rewardFrameImageUrl && !newFrameUrls.includes(obj.rewardFrameImageUrl)) {
        newFrameUrls.push(obj.rewardFrameImageUrl);
      }
    } else if (obj.rewardType === 'skin' && typeof obj.rewardValue === 'string') {
      if (!newSkins.includes(obj.rewardValue)) {
        newSkins.push(obj.rewardValue);
      }
    } else if (obj.rewardType === 'skill_skin' && typeof obj.rewardValue === 'string') {
      if (!newSkillSkins.includes(obj.rewardValue)) {
        newSkillSkins.push(obj.rewardValue);
      }
    }

    const updatedUser: UserProfile = {
      ...user,
      ryos: newRyos,
      gems: newGems,
      unlockedTitles: newTitles,
      unlockedFrames: newFrames,
      unlockedFrameUrls: newFrameUrls,
      unlockedSkins: newSkins,
      unlockedSkillSkins: newSkillSkins,
      claimedEventRewardIds: [...claimedIds, objId]
    };

    onUpdateUser(updatedUser);
    setClaimToast('Recompensa resgatada!');
    setTimeout(() => setClaimToast(null), 3000);
  };

  return (
    <div className="events-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none gpu-accelerated">
      <motion.div
        initial={false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="events-modal-panel relative flex h-[92dvh] max-h-[900px] w-full max-w-6xl flex-col overflow-hidden text-slate-100"
        style={getEventThemeStyle(selectedTheme)}
        data-event-theme-light={selectedTheme.light}
      >
        <AnimatePresence>
          {claimToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="events-modal-toast absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span>{claimToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="events-modal-layout flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="events-modal-list w-full flex-shrink-0 overflow-x-auto overflow-y-hidden p-3 md:w-72 md:overflow-x-hidden md:overflow-y-auto md:p-4">
            <div className="events-modal-event-grid flex gap-2 md:flex-col">
              {events.map(ev => {
                const isSelected = ev.id === selectedEventId;
                const eventTheme = getEventTheme(ev.theme || getDefaultEventTheme(ev));
                const completedCount = ev.objectives.filter(objective =>
                  getObjectiveProgress(ev, objective.id, objective.current) >= objective.target,
                ).length;
                const totalObjectives = ev.objectives.length;
                const unclaimedCount = ev.objectives.filter(objective =>
                  getObjectiveProgress(ev, objective.id, objective.current) >= objective.target &&
                  !claimedIds.includes(objective.id),
                ).length;

                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setSelectedEventId(ev.id);
                    }}
                    data-sound="Scroll"
                    aria-current={isSelected ? 'true' : undefined}
                    className={`events-modal-event-card group relative w-[min(75vw,250px)] flex-shrink-0 text-left md:w-full ${
                      isSelected ? 'is-selected' : ''
                    }`}
                    style={isSelected ? getEventThemeStyle(eventTheme) : undefined}
                    data-event-theme-light={isSelected && eventTheme.light ? true : undefined}
                  >
                    <span className="events-modal-card-art" aria-hidden="true">
                      {ev.bannerUrl && <img src={ev.bannerUrl} alt="" draggable={false} />}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="events-modal-event-badge truncate text-[9px] font-black uppercase tracking-[.14em]">
                        {ev.badge || 'EVENTO'}
                      </span>
                      {unclaimedCount > 0 && <span className="events-modal-ready">{unclaimedCount} PRONTO</span>}
                    </div>
                    <strong className="mt-1 block truncate text-xs text-slate-100">{ev.title}</strong>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[9px] font-mono text-slate-400">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <Clock className="events-modal-event-clock h-3 w-3 flex-none" />
                        {ev.timeLeft || 'Ativo'}
                      </span>
                      <span className="flex-none">{completedCount}/{totalObjectives} metas</span>
                    </div>
                    <div className="events-modal-card-progress">
                      <span style={{ width: `${totalObjectives ? completedCount / totalObjectives * 100 : 0}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedEvent ? (
            <main className="events-modal-detail min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-2 sm:px-6 sm:pb-7 md:pt-5">
              <div
                className="events-modal-banner-shell mx-auto mb-5 w-full"
                style={{ aspectRatio: bannerAspectRatios[selectedEvent.bannerUrl] || 1800 / 770 }}
              >
                <div className="lobby-event-banner is-artwork events-modal-banner">
                  {selectedEvent.bannerUrl && (
                    <img src={selectedEvent.bannerUrl} alt="" draggable={false} />
                  )}
                  <span className="lobby-event-copy">
                    <small>{selectedEvent.badge || 'EVENTO'}</small>
                    <strong>{selectedEvent.title || 'Evento Ninja'}</strong>
                    <span>
                      {eventCountdown ? (
                        <>
                          {selectedEvent.timeLeft} •{' '}
                          <span className="lobby-event-time-remaining">
                            <Clock aria-hidden="true" />
                            {eventCountdown.expired
                              ? 'Evento encerrado'
                              : `${eventCountdown.days} dias e ${eventCountdown.hours} horas restantes`}
                          </span>
                        </>
                      ) : selectedEvent.timeLeft || 'Evento ativo'}
                    </span>
                  </span>
                  <span className="lobby-event-cta">
                    <img src="/static/img/banners/btn_banner.webp" alt="" draggable={false} />
                    <span>Evento ativo</span>
                  </span>
                </div>
              </div>

              <section className="events-modal-intro mb-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="events-modal-kicker">
                      <span className="events-modal-kicker-star" aria-hidden="true" />
                      {selectedEvent.subtitle || 'DESAFIO ESPECIAL'}
                    </span>
                    <h3 className="mt-1 text-lg font-black leading-tight text-white sm:text-xl">{selectedEvent.title}</h3>
                  </div>
                  <div className="events-modal-summary" aria-label={`${selectedCompletion}% das metas completas`}>
                    <span
                      className="events-modal-summary-ring"
                      style={{
                        background: `conic-gradient(${selectedTheme.accent} ${selectedCompletion}%, rgba(148, 163, 184, .18) ${selectedCompletion}% 100%)`,
                      }}
                    >
                      <span>{selectedCompletedCount}</span>
                    </span>
                    <span className="events-modal-summary-label">
                      <small>METAS</small>
                      <strong>/{selectedObjectiveCount}</strong>
                      <small>COMPLETAS</small>
                    </span>
                  </div>
                </div>
                {selectedEvent.description && (
                  <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-300 sm:text-sm">
                    {selectedEvent.description}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <div className="events-modal-section-heading">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-orange-300" />
                    <h3>Metas e recompensas</h3>
                  </div>
                  <span>Seu progresso</span>
                </div>

                <div className="grid gap-3">
                  {(selectedEvent.objectives || []).map((objective, index) => {
                    const currentProgress = getObjectiveProgress(selectedEvent, objective.id, objective.current);
                    const isCompleted = currentProgress >= objective.target;
                    const isClaimed = claimedIds.includes(objective.id);
                    const progressPct = Math.min(100, Math.round((currentProgress / Math.max(1, objective.target)) * 100));

                    return (
                      <article
                        key={objective.id}
                        className={`events-modal-objective ${isClaimed ? 'is-claimed' : ''} ${isCompleted ? 'is-complete' : ''}`}
                        style={{ animationDelay: `${Math.min(index * 55, 385)}ms` }}
                      >
                        <div className="events-modal-objective-index">{isCompleted ? <CheckCircle className="h-4 w-4" /> : String(index + 1).padStart(2, '0')}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <h4 className="text-xs font-bold leading-snug text-slate-100 sm:text-sm">{objective.description}</h4>
                            <span className="whitespace-nowrap text-[10px] font-mono font-bold text-slate-300">
                              {currentProgress.toLocaleString()} <span className="text-slate-500">/ {objective.target.toLocaleString()}</span>
                            </span>
                          </div>
                          <div className="events-modal-progress-track mt-2">
                            <span className={isCompleted ? 'is-complete' : ''} style={{ width: `${progressPct}%` }} />
                          </div>
                          <div className="events-modal-reward-line flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-slate-400">
                            <Gift className="h-3.5 w-3.5 text-amber-300" />
                            <span>Recompensa:</span>
                            {objective.rewardOptions?.length ? (
                              <strong className="font-bold text-amber-200">Prêmio surpresa</strong>
                            ) : objective.rewardType === 'ryos' ? (
                              <>
                                <img src="/static/img/icon/gold.webp" alt="Moedas" className="h-4 w-4 object-contain" />
                                <strong className="font-bold text-amber-200">{Number(objective.rewardValue).toLocaleString()} Moedas</strong>
                              </>
                            ) : objective.rewardType === 'gems' ? (
                              <>
                                <img src="/static/img/icon/ryo.webp" alt="Gems" className="h-4 w-4 object-contain" />
                                <strong className="font-bold text-amber-200">{Number(objective.rewardValue).toLocaleString()} Gems</strong>
                              </>
                            ) : (
                              <strong className="font-bold text-amber-200">{objective.rewardLabel}</strong>
                            )}
                          </div>
                        </div>
                        <div className="events-modal-objective-action">
                          {isClaimed ? (
                            <span className="events-modal-claimed"><CheckCircle className="h-3.5 w-3.5" /> Resgatado</span>
                          ) : isCompleted ? (
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                void handleClaimReward(selectedEvent, objective.id);
                              }}
                              disabled={claimingObjectiveId === objective.id}
                              className="events-modal-claim"
                            >
                              <Gift className="h-3.5 w-3.5" />
                              {claimingObjectiveId === objective.id ? 'Resgatando…' : 'Resgatar'}
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="events-modal-in-progress">Em andamento</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </main>
          ) : (
            <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-400">
              <Calendar className="h-10 w-10 text-slate-600" />
              <p className="text-sm">Nenhum evento selecionado ou disponível no momento.</p>
            </main>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            playClickSound();
            onClose();
          }}
          aria-label="Fechar eventos"
          className="events-modal-close events-modal-close-fixed"
        >
          <X className="h-5 w-5" />
        </button>
      </motion.div>
    </div>
  );
}
