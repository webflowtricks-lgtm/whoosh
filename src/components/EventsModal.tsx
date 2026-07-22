/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Gift, Trophy, CheckCircle, Clock, Zap, Star, ShieldAlert, Sparkles, Award } from 'lucide-react';
import { UserProfile, NinjaEvent } from '../types';
import { getEvents } from '../lib/eventStorage';

interface EventsModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updatedUser: UserProfile) => void;
  playClickSound: () => void;
}

export default function EventsModal({ user, onClose, onUpdateUser, playClickSound }: EventsModalProps) {
  const [events, setEvents] = useState<NinjaEvent[]>(() => getEvents());
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    const loaded = getEvents();
    return loaded.length > 0 ? loaded[0].id : '';
  });
  const [claimToast, setClaimToast] = useState<string | null>(null);

  useEffect(() => {
    const loaded = getEvents();
    setEvents(loaded);
    if (loaded.length > 0 && !selectedEventId) {
      setSelectedEventId(loaded[0].id);
    }
  }, [selectedEventId]);

  const claimedIds = user.claimedEventRewardIds || [];
  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0] || getEvents()[0];

  const handleClaimReward = (event: NinjaEvent, objId: string) => {
    playClickSound();

    const obj = event.objectives.find(o => o.id === objId);
    if (!obj || obj.current < obj.target) return;
    if (claimedIds.includes(objId)) return;

    let newRyos = user.ryos || 1000;
    let newGems = user.gems || 100;
    let newTitles = [...(user.unlockedTitles || ['Estudante'])];
    let newFrames = [...(user.unlockedFrames || ['Padrão'])];
    let newFrameUrls = [...(user.unlockedFrameUrls || [])];
    let newSkins = [...(user.unlockedSkins || [])];

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
    }

    const updatedUser: UserProfile = {
      ...user,
      ryos: newRyos,
      gems: newGems,
      unlockedTitles: newTitles,
      unlockedFrames: newFrames,
      unlockedFrameUrls: newFrameUrls,
      unlockedSkins: newSkins,
      claimedEventRewardIds: [...claimedIds, objId]
    };

    onUpdateUser(updatedUser);
    setClaimToast(`Recompensa Resgatada: ${obj.rewardLabel}!`);
    setTimeout(() => setClaimToast(null), 3000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center backdrop-blur-md p-3 sm:p-6 select-none gpu-accelerated">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-5xl h-[88vh] max-h-[800px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Top Bar Header */}
        <div className="p-4 sm:p-5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold font-display uppercase tracking-wider text-slate-100 flex items-center gap-2">
                Eventos do Mundo Ninja
                <span className="text-[10px] font-mono bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold">
                  ATIVOS
                </span>
              </h2>
              <p className="text-xs text-slate-400">Participe dos eventos temporários e ganhe títulos, molduras e moedas!</p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Claim Toast Notification */}
        <AnimatePresence>
          {claimToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xl border border-emerald-400/40 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              <span>{claimToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-950/40">
          {/* Left Event List Tabs */}
          <div className="w-full md:w-80 bg-slate-900/60 border-b md:border-b-0 md:border-r border-slate-800/80 p-3 overflow-y-auto space-y-2.5 flex-shrink-0">
            <h3 className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-400 px-2 py-1">
              Eventos Disponíveis
            </h3>

            {events.map(ev => {
              const isSelected = ev.id === selectedEventId;
              const completedCount = ev.objectives.filter(o => o.current >= o.target).length;
              const totalObj = ev.objectives.length;
              const unclaimedCount = ev.objectives.filter(o => o.current >= o.target && !claimedIds.includes(o.id)).length;

              return (
                <button
                  key={ev.id}
                  onClick={() => {
                    playClickSound();
                    setSelectedEventId(ev.id);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${
                    isSelected
                      ? 'bg-gradient-to-r from-orange-950/60 to-slate-900 border-orange-500/80 shadow-lg shadow-orange-950/20'
                      : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                      ev.featured ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {ev.badge}
                    </span>
                    {unclaimedCount > 0 && (
                      <span className="bg-red-600 text-white font-mono font-bold text-[10px] px-1.5 py-0.2 rounded-full animate-pulse shadow-md shadow-red-600/40">
                        {unclaimedCount} Pronto
                      </span>
                    )}
                  </div>

                  <h4 className={`text-sm font-bold tracking-tight mb-1 line-clamp-1 ${isSelected ? 'text-orange-400' : 'text-slate-200'}`}>
                    {ev.title}
                  </h4>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-orange-400/80" />
                      {ev.timeLeft}
                    </span>
                    <span className="font-semibold text-slate-300">
                      {completedCount}/{totalObj}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Event Detail View */}
          {selectedEvent ? (
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
              {/* Banner Hero */}
              <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 min-h-[160px] sm:min-h-[200px] flex flex-col justify-end p-5 sm:p-6 shadow-xl">
                {selectedEvent.bannerUrl && (
                  <img
                    src={selectedEvent.bannerUrl}
                    alt={selectedEvent.title || 'Banner de Evento'}
                    className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity filter blur-[1px]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />

                <div className="relative z-10 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-orange-600/30 text-orange-400 border border-orange-500/40 text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                      {selectedEvent.badge || 'EVENTO'}
                    </span>
                    <span className="text-xs font-mono text-slate-300 flex items-center gap-1 bg-slate-950/60 px-2.5 py-0.5 rounded-full border border-slate-800">
                      <Clock className="w-3.5 h-3.5 text-orange-400" />
                      Tempo restante: <strong className="text-orange-300">{selectedEvent.timeLeft || 'Ativo'}</strong>
                    </span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white font-display">
                    {selectedEvent.title || 'Evento Ninja'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                    {selectedEvent.description || 'Participe dos desafios e resgate prêmios exclusivos!'}
                  </p>
                </div>
              </div>

              {/* Objectives Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-mono uppercase tracking-wider font-extrabold text-orange-400 flex items-center gap-2">
                    <Trophy className="w-4 h-4" /> Objetivos do Evento
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Progresso das Recompensas
                  </span>
                </div>

                <div className="grid gap-3">
                  {(selectedEvent.objectives || []).map(obj => {
                  const isCompleted = obj.current >= obj.target;
                  const isClaimed = claimedIds.includes(obj.id);
                  const progressPct = Math.min(100, Math.round((obj.current / obj.target) * 100));

                  return (
                    <div
                      key={obj.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
                        isClaimed
                          ? 'bg-slate-900/40 border-slate-800/60 opacity-75'
                          : isCompleted
                          ? 'bg-gradient-to-r from-emerald-950/30 to-slate-900 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                          : 'bg-slate-900/80 border-slate-800/90'
                      }`}
                    >
                      <div className="flex-1 space-y-2 w-full">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-100 flex items-center gap-2">
                            {isCompleted && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                            {obj.description}
                          </p>
                          <span className="text-xs font-mono font-bold text-orange-400">
                            {obj.current} / {obj.target}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isCompleted
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : 'bg-gradient-to-r from-orange-600 to-amber-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Gift className="w-3.5 h-3.5 text-amber-400" />
                          <span>Recompensa: <strong className="text-amber-300 font-semibold">{obj.rewardLabel}</strong></span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 w-full sm:w-auto">
                        {isClaimed ? (
                          <button
                            disabled
                            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-not-allowed"
                          >
                            <CheckCircle className="w-4 h-4 text-slate-600" />
                            Resgatado
                          </button>
                        ) : isCompleted ? (
                          <button
                            onClick={() => handleClaimReward(selectedEvent, obj.id)}
                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-mono font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 border border-emerald-400 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2 animate-bounce"
                          >
                            <Gift className="w-4 h-4" />
                            Resgatar
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-800/80 text-slate-500 text-xs font-mono font-bold uppercase tracking-wider cursor-not-allowed text-center"
                          >
                            Em Progresso
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          ) : (
            <div className="flex-1 p-8 flex flex-col items-center justify-center text-slate-400 font-mono text-sm">
              <Calendar className="w-12 h-12 text-slate-600 mb-3" />
              <p>Nenhum evento selecionado ou disponível no momento.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
