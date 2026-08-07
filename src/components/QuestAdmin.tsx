/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Plus, Trash2, Edit3, Save, Sparkles, CheckCircle, AlertTriangle, 
  Search, Shield, Image, Trophy, Heart, ShieldAlert, Zap, Swords, UserPlus
} from 'lucide-react';
import { Quest, QuestGoal, QuestReward, Character } from '../types';
import { getCharacters } from '../lib/characterStorage';
import { getGoalDescription } from '../lib/questUtils';
import { safeFetchJson } from '../lib/api';
import { RankConfig, getRanks, fetchRanksFromServer } from '../lib/rankStorage';

interface QuestAdminProps {
  onBack: () => void;
  playClickSound: () => void;
}

export default function QuestAdmin({ onBack, playClickSound }: QuestAdminProps) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedQuestId, setSelectedQuestId] = useState<string>('');
  const [ranksList, setRanksList] = useState<RankConfig[]>(getRanks());
  
  // Feedback
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Editing form states
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [dragGoalIndex, setDragGoalIndex] = useState<number | null>(null);

  // Autocomplete dynamic databases
  const [allCharNames, setAllCharNames] = useState<string[]>([]);
  const [allSkillNames, setAllSkillNames] = useState<string[]>([]); // formato: "SkillName (CharacterName)"
  const [allTagsList, setAllTagsList] = useState<string[]>([]);

  // Derived map: skill name -> first character owner
  const skillOwnerMap = useMemo(() => {
    const map = new Map<string, string>();
    characters.forEach(c => {
      c.skills.forEach(sk => {
        if (!map.has(sk.name)) {
          map.set(sk.name, c.name);
        }
      });
    });
    return map;
  }, [characters]);

  // Individual Autocomplete UI state for characters inside goals
  const [goalCharInput, setGoalCharInput] = useState<{ [goalId: string]: string }>({});
  const [showGoalCharSuggestions, setShowGoalCharSuggestions] = useState<{ [goalId: string]: boolean }>({});

  // Individual Autocomplete UI state for skill inside goals
  const [goalSkillInput, setGoalSkillInput] = useState<{ [goalId: string]: string }>({});
  const [showGoalSkillSuggestions, setShowGoalSkillSuggestions] = useState<{ [goalId: string]: boolean }>({});

  // Individual Autocomplete UI state for tags inside goals
  const [goalTagInput, setGoalTagInput] = useState<{ [goalId: string]: string }>({});
  const [showGoalTagSuggestions, setShowGoalTagSuggestions] = useState<{ [goalId: string]: boolean }>({});

  // Reward char autocomplete
  const [rewardCharInput, setRewardCharInput] = useState('');
  const [showRewardCharSuggestions, setShowRewardCharSuggestions] = useState(false);

  // Fetch quests, ranks and characters on mount
  useEffect(() => {
    fetchQuests();
    fetchRanksFromServer().then(r => setRanksList(r));
    const loadedChars = getCharacters();
    setCharacters(loadedChars);
    
    // Setup autocomplete lists
    const charNames = loadedChars.map(c => c.name);
    setAllCharNames(charNames);

    const skills = new Set<string>();
    const tagsSet = new Set<string>();
    loadedChars.forEach(c => {
      c.skills.forEach(sk => {
        skills.add(`${sk.name} (${c.name})`);
      });
      if (c.tags) {
        c.tags.forEach(t => tagsSet.add(t));
      }
    });
    setAllSkillNames(Array.from(skills).sort());
    setAllTagsList(Array.from(tagsSet).sort());
  }, []);

  const fetchQuests = async () => {
    try {
      const data = await safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests');
      if (data && data.success && Array.isArray(data.quests)) {
        setQuests(data.quests);
        if (data.quests.length > 0 && !selectedQuestId) {
          setSelectedQuestId(data.quests[0].id);
          setEditingQuest(JSON.parse(JSON.stringify(data.quests[0])));
        }
      }
    } catch (err) {
      console.error('Failed to fetch quests:', err);
    }
  };

  const handleSaveQuests = async (updatedQuests: Quest[]) => {
    try {
      const data = await safeFetchJson<{ success?: boolean }>('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quests: updatedQuests }),
      });
      if (data && data.success) {
        setQuests(updatedQuests);
        triggerSuccess('Missões salvas e sincronizadas com sucesso!');
      } else {
        triggerError('Erro ao salvar as missões no servidor.');
      }
    } catch (err) {
      console.error('Save quests error:', err);
      triggerError('Falha na comunicação de rede com o servidor.');
    }
  };

  const triggerSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3500);
  };

  const triggerError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(''), 4500);
  };

  // Change currently selected quest for editing
  const handleSelectQuest = (id: string) => {
    playClickSound();
    setSelectedQuestId(id);
    const q = quests.find(item => item.id === id);
    if (q) {
      setEditingQuest(JSON.parse(JSON.stringify(q)));
    } else {
      setEditingQuest(null);
    }
  };

  // Create a new quest
  const handleCreateNewQuest = () => {
    playClickSound();
    const newId = 'quest_' + Date.now();
    const newQuest: Quest = {
      id: newId,
      title: 'Nova Missão Lendária',
      desc: 'Descreva os objetivos épicos desta missão para os shinobis.',
      coverUrl: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/portrait.jpg',
      minRank: (ranksList[0]?.name || 'Estudante de Academia') as any,
      requiredQuestIds: [],
      goals: [
        {
          id: 'goal_' + Date.now() + '_1',
          type: 'win_battles_with_chars',
          targetCharacters: ['Uzumaki Naruto'],
          targetValue: 5,
          currentValue: 0
        }
      ],
      rewards: [
        { type: 'title', value: 'Guerreiro do Amanhecer' }
      ],
      completed: false
    };

    const updated = [...quests, newQuest];
    handleSaveQuests(updated);
    setSelectedQuestId(newId);
    setEditingQuest(JSON.parse(JSON.stringify(newQuest)));
    triggerSuccess('Nova missão criada!');
  };

  // Confirm delete quest state
  const [confirmDeleteQuestId, setConfirmDeleteQuestId] = useState<string | null>(null);

  // Remove a quest completely
  const handleDeleteQuest = (id: string) => {
    setConfirmDeleteQuestId(id);
  };

  const confirmDeleteQuest = () => {
    if (!confirmDeleteQuestId) return;
    playClickSound();
    const id = confirmDeleteQuestId;
    setConfirmDeleteQuestId(null);

    const updated = quests.filter(q => q.id !== id);
    handleSaveQuests(updated);
    if (updated.length > 0) {
      setSelectedQuestId(updated[0].id);
      setEditingQuest(JSON.parse(JSON.stringify(updated[0])));
    } else {
      setSelectedQuestId('');
      setEditingQuest(null);
    }
    triggerSuccess('Missão removida com sucesso!');
  };

  // Save changes of currently edited quest to local list and server
  const handleSaveChanges = () => {
    if (!editingQuest) return;
    playClickSound();

    if (!editingQuest.title.trim()) {
      triggerError('O título da missão não pode ficar em branco.');
      return;
    }

    // Strip character name from targetSkill (e.g. "Rasengan (Naruto)" -> "Rasengan")
    const cleaned = {
      ...editingQuest,
      goals: editingQuest.goals.map(g => ({
        ...g,
        targetSkill: g.targetSkill ? g.targetSkill.replace(/\s*\(.*?\)\s*$/, '').trim() : g.targetSkill,
      }))
    };

    const updated = quests.map(q => q.id === editingQuest.id ? cleaned : q);
    handleSaveQuests(updated);
  };

  // Update field of current quest
  const updateQuestField = (field: keyof Quest, value: any) => {
    if (!editingQuest) return;
    setEditingQuest({
      ...editingQuest,
      [field]: value
    });
  };

  // Add a goal to current editing quest
  const handleAddGoal = () => {
    if (!editingQuest) return;
    playClickSound();
    const newGoal: QuestGoal = {
      id: 'goal_' + Date.now() + '_' + (editingQuest.goals.length + 1),
      type: 'win_battles_with_chars',
      targetCharacters: [],
      targetSkill: '',
      targetValue: 5,
      currentValue: 0,
      singleMatch: false
    };

    setEditingQuest({
      ...editingQuest,
      goals: [...editingQuest.goals, newGoal]
    });
  };

  // Remove a goal
  const handleRemoveGoal = (goalId: string) => {
    if (!editingQuest) return;
    playClickSound();
    setEditingQuest({
      ...editingQuest,
      goals: editingQuest.goals.filter(g => g.id !== goalId)
    });
  };

  // Update individual goal field
  const updateGoalField = (goalId: string, field: keyof QuestGoal, value: any) => {
    if (!editingQuest) return;
    setEditingQuest({
      ...editingQuest,
      goals: editingQuest.goals.map(g => {
        if (g.id !== goalId) return g;
        
        // Reset specific fields when changing goal type to prevent invalid structures
        if (field === 'type') {
          return {
            ...g,
            type: value,
            targetCharacters: value.includes('win_') ? [] : undefined,
            targetSkill: value === 'use_skill' || value === 'kill_with_skill' ? '' : undefined,
            consecutive: value === 'win_consecutive_battles_with_chars' ? true : undefined,
            currentStreak: value === 'win_consecutive_battles_with_chars' ? 0 : undefined
          };
        }
        return { ...g, [field]: value };
      })
    });
  };

  // Add character to goal requirement
  const handleAddCharToGoal = (goalId: string, charName: string) => {
    if (!editingQuest || !charName) return;
    playClickSound();
    
    setEditingQuest({
      ...editingQuest,
      goals: editingQuest.goals.map(g => {
        if (g.id !== goalId) return g;
        const currentChars = g.targetCharacters || [];
        if (currentChars.includes(charName)) return g;
        return {
          ...g,
          targetCharacters: [...currentChars, charName]
        };
      })
    });

    // Clear input
    setGoalCharInput(prev => ({ ...prev, [goalId]: '' }));
    setShowGoalCharSuggestions(prev => ({ ...prev, [goalId]: false }));
  };

  // Remove character from goal requirement
  const handleRemoveCharFromGoal = (goalId: string, charName: string) => {
    if (!editingQuest) return;
    playClickSound();
    setEditingQuest({
      ...editingQuest,
      goals: editingQuest.goals.map(g => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          targetCharacters: (g.targetCharacters || []).filter(name => name !== charName)
        };
      })
    });
  };

  // Add tag to goal requirement
  const handleAddTagToGoal = (goalId: string, tagName: string) => {
    if (!editingQuest || !tagName) return;
    playClickSound();
    
    setEditingQuest({
      ...editingQuest,
      goals: editingQuest.goals.map(g => {
        if (g.id !== goalId) return g;
        const currentTags = g.targetTags || [];
        if (currentTags.includes(tagName)) return g;
        return {
          ...g,
          targetTags: [...currentTags, tagName]
        };
      })
    });

    setGoalTagInput(prev => ({ ...prev, [goalId]: '' }));
    setShowGoalTagSuggestions(prev => ({ ...prev, [goalId]: false }));
  };

  // Remove tag from goal requirement
  const handleRemoveTagFromGoal = (goalId: string, tagName: string) => {
    if (!editingQuest) return;
    playClickSound();
    setEditingQuest({
      ...editingQuest,
      goals: editingQuest.goals.map(g => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          targetTags: (g.targetTags || []).filter(t => t !== tagName)
        };
      })
    });
  };

  // Toggle required quest pre-requisites
  const handleToggleRequiredQuest = (questId: string) => {
    if (!editingQuest) return;
    playClickSound();
    const currentReqs = editingQuest.requiredQuestIds || [];
    let nextReqs: string[];
    if (currentReqs.includes(questId)) {
      nextReqs = currentReqs.filter(id => id !== questId);
    } else {
      nextReqs = [...currentReqs, questId];
    }
    updateQuestField('requiredQuestIds', nextReqs);
  };

  // Add reward
  const handleAddReward = () => {
    if (!editingQuest) return;
    playClickSound();
    const newReward: QuestReward = {
      type: 'title',
      value: 'Novo Título'
    };
    updateQuestField('rewards', [...editingQuest.rewards, newReward]);
  };

  // Remove reward
  const handleRemoveReward = (index: number) => {
    if (!editingQuest) return;
    playClickSound();
    updateQuestField('rewards', editingQuest.rewards.filter((_, idx) => idx !== index));
  };

  // Update reward fields
  const updateRewardField = (index: number, field: keyof QuestReward, value: any) => {
    if (!editingQuest) return;
    const updatedRewards = editingQuest.rewards.map((r, idx) => {
      if (idx !== index) return r;
      return { ...r, [field]: value };
    });
    updateQuestField('rewards', updatedRewards);
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col md:flex-row gap-6 p-4">
      {/* LEFT SIDEBAR: Quest list */}
      <div className="w-full md:w-80 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <h2 className="text-sm font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
            <Swords className="w-4 h-4" /> Painel de Missões
          </h2>
          <button
            onClick={handleCreateNewQuest}
            className="p-1 px-2.5 rounded bg-orange-600 hover:bg-orange-500 text-slate-950 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Criar
          </button>
        </div>

        {/* Quests scrollable selection list */}
        <div className="flex-1 overflow-y-auto space-y-2 max-h-[350px] md:max-h-[600px] pr-1">
          {quests.map(q => {
            const isSelected = q.id === selectedQuestId;
            return (
              <div
                key={q.id}
                onClick={() => handleSelectQuest(q.id)}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                  isSelected 
                    ? 'bg-slate-950 border-orange-500/80 text-white shadow-md shadow-orange-500/10' 
                    : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700/60 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img 
                    src={q.coverUrl || null} 
                    alt={q.title} 
                    className="w-10 h-10 rounded object-cover border border-slate-700/40 shadow"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">{q.title}</p>
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{q.minRank}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {quests.length === 0 && (
            <p className="text-center text-slate-500 text-xs py-8 font-mono">Nenhuma missão cadastrada.</p>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Editing Section */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5 text-left relative overflow-hidden">
        {/* Banner effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex justify-between items-center pb-3 border-b border-slate-800 z-10">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" /> 
              {editingQuest ? `Editando: ${editingQuest.title}` : 'Selecione uma missão'}
            </h2>
            <p className="text-xs text-slate-400">Gerencie todos os aspectos e objetivos da missão de forma precisa.</p>
          </div>
          {editingQuest && (
            <div className="flex gap-2">
              <button
                onClick={handleSaveChanges}
                className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:brightness-110 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <Save className="w-4 h-4" /> Salvar Missão
              </button>
              <button
                onClick={() => handleDeleteQuest(editingQuest.id)}
                className="p-2 bg-red-950/30 border border-red-500/30 hover:bg-red-950/50 hover:border-red-500/60 text-red-400 rounded-lg text-xs transition cursor-pointer"
                title="Deletar Missão"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Feedback indicators */}
        {success && (
          <div className="flex items-center gap-2 text-xs bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 p-3 rounded-lg animate-fade-in">
            <CheckCircle className="w-4 h-4 shrink-0" /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-xs bg-red-950/40 border border-red-500/30 text-red-400 p-3 rounded-lg animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {editingQuest ? (
          <div className="space-y-6 overflow-y-auto max-h-[600px] pr-2 z-10">
            {/* 1. BASIC INFORMATION */}
            <div className="bg-slate-950/50 p-4 border border-slate-800/80 rounded-xl space-y-4">
              <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Image className="w-3.5 h-3.5 text-orange-500" /> Informações Básicas
              </h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Título da Missão</label>
                  <input
                    type="text"
                    value={editingQuest.title}
                    onChange={(e) => updateQuestField('title', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-orange-500/50 focus:outline-none text-white font-sans"
                    placeholder="Título chamativo e temático..."
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Capa / Foto URL</label>
                  <input
                    type="text"
                    value={editingQuest.coverUrl}
                    onChange={(e) => updateQuestField('coverUrl', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-orange-500/50 focus:outline-none text-white font-mono"
                    placeholder="Cole um link de imagem ou use presets..."
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Descrição da Missão</label>
                <textarea
                  value={editingQuest.desc}
                  onChange={(e) => updateQuestField('desc', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-orange-500/50 focus:outline-none text-white font-sans h-20 resize-none leading-relaxed"
                  placeholder="Conte a história, os desafios e detalhes do combate..."
                />
              </div>

              {/* Requirements: Rank and previous quests dependency */}
              <div className="grid md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Rank Shinobi Requerido</label>
                  <select
                    value={editingQuest.minRank}
                    onChange={(e) => updateQuestField('minRank', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:border-orange-500/50 focus:outline-none text-white font-mono"
                  >
                    {ranksList.map(rankObj => (
                      <option key={rankObj.id || rankObj.name} value={rankObj.name}>
                        {rankObj.name} (Requer {rankObj.requiredXp} XP)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pré-requisitos de Missão</label>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-2">
                    {quests
                      .filter(q => q.id !== editingQuest.id)
                      .map(q => {
                        const isReq = (editingQuest.requiredQuestIds || []).includes(q.id);
                        return (
                          <label key={q.id} className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer hover:text-white select-none">
                            <input
                              type="checkbox"
                              checked={isReq}
                              onChange={() => handleToggleRequiredQuest(q.id)}
                              className="accent-orange-500"
                            />
                            <span>{q.title}</span>
                          </label>
                        );
                      })}
                    {quests.filter(q => q.id !== editingQuest.id).length === 0 && (
                      <p className="text-[10px] text-slate-500 font-mono italic">Sem outras missões disponíveis para definir como requisito.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. QUEST GOALS (METAS) */}
            <div className="bg-slate-950/50 p-4 border border-slate-800/80 rounded-xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-orange-500" /> Objetivos & Metas (Goals)
                </h3>
                <button
                  type="button"
                  onClick={handleAddGoal}
                  className="p-1 px-2.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer text-orange-400"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Meta
                </button>
              </div>

              <div className="space-y-4">
                {editingQuest.goals.map((g, goalIdx) => {
                  return (
                    <div
                      key={g.id}
                      draggable
                      onDragStart={() => setDragGoalIndex(goalIdx)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={() => {
                        if (dragGoalIndex === null || dragGoalIndex === goalIdx) return;
                        const updated = [...editingQuest.goals];
                        const [moved] = updated.splice(dragGoalIndex, 1);
                        const dropIdx = dragGoalIndex < goalIdx ? goalIdx - 1 : goalIdx;
                        updated.splice(dropIdx, 0, moved);
                        setEditingQuest({ ...editingQuest, goals: updated });
                        setDragGoalIndex(null);
                      }}
                      onDragEnd={() => setDragGoalIndex(null)}
                      className={`bg-slate-900 p-4 border border-slate-800 rounded-lg space-y-3 relative transition-all ${
                        dragGoalIndex === goalIdx ? 'opacity-40 border-dashed border-orange-400' : dragGoalIndex !== null ? 'border-slate-600/60 border-dashed' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 absolute top-3 left-3 text-slate-600 cursor-grab active:cursor-grabbing">
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="3" r="1.5"/>
                          <circle cx="8" cy="8" r="1.5"/>
                          <circle cx="8" cy="13" r="1.5"/>
                        </svg>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveGoal(g.id)}
                        className="absolute top-3 right-3 p-1.5 bg-slate-950 hover:bg-red-950/20 text-slate-500 hover:text-red-400 rounded transition cursor-pointer"
                        title="Remover Meta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-2 pl-10 rounded-lg border border-slate-800">
                        <span className="text-[10px] font-mono text-orange-500 font-bold uppercase tracking-wider">Meta #{goalIdx + 1}</span>
                        <div className="text-xs text-amber-300 font-medium bg-amber-950/40 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                          ⚡ {getGoalDescription(g)}
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de Objetivo</label>
                          <select
                            value={g.type}
                            onChange={(e) => updateGoalField(g.id, 'type', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="win_battles_with_chars">Ganhar batalhas com personagem(ns)</option>
                            <option value="win_consecutive_battles_with_chars">Ganhar batalhas em sequência com personagem(ns)</option>
                            <option value="win_battles_with_tag">Ganhar batalhas com time de 3 ninjas da mesma Tag (Ex: Time Guy)</option>
                            <option value="use_skill">Usar Habilidade específica N vezes</option>
                            <option value="heal">Curar pontos de vida (HP) / Curar aliado</option>
                            <option value="kill_with_skill">Derrotar / Matar inimigo</option>
                            <option value="shield">Gerar pontos de escudo</option>
                            <option value="damage_dealt">Infligir dano total / com habilidade ou personagem</option>
                            <option value="damage_received">Receber dano total</option>
                            <option value="stun_enemy">Atordoar (Stun) inimigos</option>
                            <option value="counter_cancel_skill">Contra-atacar / Anular / Refletir habilidades</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantidade / Valor Alvo</label>
                          <input
                            type="number"
                            value={g.targetValue}
                            onChange={(e) => updateGoalField(g.id, 'targetValue', parseInt(e.target.value, 10) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                        </div>
                      </div>

                      {/* 1. Character Filter (Autocomplete) */}
                      <div className="space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Requisito de Personagem (Opcional)
                          </label>
                          <span className="text-[9px] text-slate-500 font-mono">
                            Deixe vazio para qualquer personagem
                          </span>
                        </div>
                        
                        {/* Selected Characters Pills */}
                        <div className="flex flex-wrap gap-1.5">
                          {(g.targetCharacters || []).map(name => (
                            <span key={name} className="inline-flex items-center gap-1 bg-orange-950/40 border border-orange-500/30 text-orange-400 font-bold px-2 py-0.5 rounded text-[11px]">
                              {name}
                              <button type="button" onClick={() => handleRemoveCharFromGoal(g.id, name)} className="hover:text-red-400 cursor-pointer ml-1">×</button>
                            </span>
                          ))}
                        </div>

                        {/* Explicit notice when > 1 character is required */}
                        {(g.targetCharacters || []).length > 1 && (
                          <div className="p-2 rounded bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 font-semibold flex items-center gap-1.5">
                            <span>⚡ Os {g.targetCharacters?.length} personagens selecionados DEVEM estar no MESMO TIME na batalha para validar a meta!</span>
                          </div>
                        )}

                        {/* Autocomplete Input for Character */}
                        <div className="relative">
                          <input
                            type="text"
                            value={goalCharInput[g.id] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGoalCharInput(prev => ({ ...prev, [g.id]: val }));
                              setShowGoalCharSuggestions(prev => ({ ...prev, [g.id]: true }));
                            }}
                            onFocus={() => setShowGoalCharSuggestions(prev => ({ ...prev, [g.id]: true }))}
                            placeholder="Buscar e adicionar personagem..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-orange-500/50 outline-none"
                          />
                          {showGoalCharSuggestions[g.id] && (goalCharInput[g.id] || '') !== '' && (
                            <div className="absolute left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg z-30 shadow-2xl">
                              {allCharNames
                                .filter(name => name.toLowerCase().includes((goalCharInput[g.id] || '').toLowerCase()) && !(g.targetCharacters || []).includes(name))
                                .slice(0, 6)
                                .map(name => (
                                  <div
                                    key={name}
                                    onClick={() => handleAddCharToGoal(g.id, name)}
                                    className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-850 hover:text-white cursor-pointer border-b border-slate-900/60 flex justify-between items-center"
                                  >
                                    <span>{name}</span>
                                    <span className="text-[10px] text-orange-400 font-mono">+ Adicionar</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Skill Filter (Autocomplete) */}
                      <div className="space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Requisito de Habilidade (Opcional)
                          </label>
                          {g.targetSkill && (
                            <button
                              type="button"
                              onClick={() => { updateGoalField(g.id, 'targetSkill', ''); setGoalSkillInput(prev => ({ ...prev, [g.id]: '' })); }}
                              className="text-[10px] text-red-400 hover:underline cursor-pointer"
                            >
                              Limpar habilidade
                            </button>
                          )}
                        </div>

                        <div className="relative">
                          <input
                            type="text"
                            value={goalSkillInput[g.id] !== undefined ? goalSkillInput[g.id] : (g.targetSkill && skillOwnerMap.has(g.targetSkill) ? `${g.targetSkill} (${skillOwnerMap.get(g.targetSkill)})` : g.targetSkill || '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGoalSkillInput(prev => ({ ...prev, [g.id]: val }));
                              // Extract just skill name for the actual field
                              const cleanName = val.replace(/\s*\(.*?\)\s*$/, '').trim();
                              updateGoalField(g.id, 'targetSkill', cleanName);
                              setShowGoalSkillSuggestions(prev => ({ ...prev, [g.id]: true }));
                            }}
                            onFocus={() => setShowGoalSkillSuggestions(prev => ({ ...prev, [g.id]: true }))}
                            placeholder="Digite ou escolha a habilidade exata..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-orange-500/50 outline-none"
                          />
                          {showGoalSkillSuggestions[g.id] && (
                            <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg z-30 shadow-2xl">
                              {/* If character is selected, show character skills first */}
                              {(() => {
                                let availableSkills = allSkillNames;
                                if ((g.targetCharacters || []).length > 0) {
                                  const charSkills = new Set<string>();
                                  characters
                                    .filter(c => g.targetCharacters?.includes(c.name))
                                    .forEach(c => c.skills.forEach(sk => charSkills.add(`${sk.name} (${c.name})`)));
                                  const filtered = Array.from(charSkills);
                                  if (filtered.length > 0) {
                                    availableSkills = filtered;
                                  }
                                }
                                const search = (goalSkillInput[g.id] || g.targetSkill || '').toLowerCase();
                                const matches = availableSkills.filter(s => s.toLowerCase().includes(search));
                                if (matches.length === 0) {
                                  return <div className="px-3 py-2 text-xs text-slate-500 italic">Nenhuma habilidade encontrada</div>;
                                }
                                return matches.slice(0, 8).map(skName => {
                                  // Extract just the skill name from "SkillName (Character)"
                                  const justSkill = skName.replace(/\s*\(.*?\)\s*$/, '').trim();
                                  return (
                                    <div
                                      key={skName}
                                      onClick={() => {
                                        updateGoalField(g.id, 'targetSkill', justSkill);
                                        setGoalSkillInput(prev => ({ ...prev, [g.id]: skName }));
                                        setShowGoalSkillSuggestions(prev => ({ ...prev, [g.id]: false }));
                                      }}
                                      className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-850 hover:text-white cursor-pointer border-b border-slate-900/60 flex justify-between items-center"
                                    >
                                      <span>⚡ {skName}</span>
                                      <span className="text-[10px] text-amber-400 font-mono">Selecionar</span>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 3. Tag Filter (Autocomplete) */}
                      <div className="space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Requisito de Tags do Ninja / Equipe (Opcional)
                          </label>
                          <span className="text-[9px] text-slate-500 font-mono">
                            Ex: Time Guy, Akatsuki, Uchiha, Konoha
                          </span>
                        </div>

                        {/* Selected Tag Pills */}
                        <div className="flex flex-wrap gap-1.5">
                          {(g.targetTags || []).map(tagName => (
                            <span key={tagName} className="inline-flex items-center gap-1 bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-bold px-2 py-0.5 rounded text-[11px]">
                              🏷️ {tagName}
                              <button type="button" onClick={() => handleRemoveTagFromGoal(g.id, tagName)} className="hover:text-red-400 cursor-pointer ml-1">×</button>
                            </span>
                          ))}
                        </div>

                        {/* Autocomplete Input for Tags */}
                        <div className="relative">
                          <input
                            type="text"
                            value={goalTagInput[g.id] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGoalTagInput(prev => ({ ...prev, [g.id]: val }));
                              setShowGoalTagSuggestions(prev => ({ ...prev, [g.id]: true }));
                            }}
                            onFocus={() => setShowGoalTagSuggestions(prev => ({ ...prev, [g.id]: true }))}
                            placeholder="Buscar ou digitar Tag (Ex: Time Guy)..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500/50 outline-none"
                          />
                          {showGoalTagSuggestions[g.id] && (goalTagInput[g.id] || '') !== '' && (
                            <div className="absolute left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg z-30 shadow-2xl">
                              {allTagsList
                                .filter(t => t.toLowerCase().includes((goalTagInput[g.id] || '').toLowerCase()) && !(g.targetTags || []).includes(t))
                                .slice(0, 6)
                                .map(t => (
                                  <div
                                    key={t}
                                    onClick={() => handleAddTagToGoal(g.id, t)}
                                    className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-850 hover:text-white cursor-pointer border-b border-slate-900/60 flex justify-between items-center"
                                  >
                                    <span>🏷️ {t}</span>
                                    <span className="text-[10px] text-cyan-400 font-mono">+ Adicionar</span>
                                  </div>
                                ))}
                              {/* Option to add custom tag string if not in list */}
                              {!allTagsList.some(t => t.toLowerCase() === (goalTagInput[g.id] || '').toLowerCase()) && (
                                <div
                                  onClick={() => handleAddTagToGoal(g.id, goalTagInput[g.id])}
                                  className="px-3 py-2 text-xs text-cyan-400 hover:bg-slate-850 cursor-pointer font-bold border-b border-slate-900/60"
                                >
                                  + Usar nova Tag "{goalTagInput[g.id]}"
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 4. Single Match Toggle (Requer em uma única partida - não acumulativo) */}
                      {g.type !== 'win_consecutive_battles_with_chars' && (
                        <div className="pt-1 flex items-center gap-2">
                          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none font-semibold">
                            <input
                              type="checkbox"
                              checked={!!g.singleMatch}
                              onChange={(e) => updateGoalField(g.id, 'singleMatch', e.target.checked)}
                              className="accent-orange-500 w-4 h-4 rounded cursor-pointer"
                            />
                            <span>Requer em uma única partida (não acumulativo)</span>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}

                {editingQuest.goals.length === 0 && (
                  <p className="text-center text-slate-500 text-xs py-4 italic font-mono">Adicione metas para que esta missão tenha objetivos.</p>
                )}
              </div>
            </div>

            {/* 3. QUEST REWARDS (RECOMPENSAS) */}
            <div className="bg-slate-950/50 p-4 border border-slate-800/80 rounded-xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-orange-500" /> Recompensas ao Concluir
                </h3>
                <button
                  type="button"
                  onClick={handleAddReward}
                  className="p-1 px-2.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer text-orange-400"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Recompensa
                </button>
              </div>

              <div className="space-y-3">
                {editingQuest.rewards.map((r, rIdx) => {
                  return (
                    <div key={rIdx} className="bg-slate-900 p-3.5 border border-slate-800 rounded-lg flex items-center gap-4 relative">
                      <div className="grid md:grid-cols-2 gap-4 flex-1">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de Recompensa</label>
                          <select
                            value={r.type}
                            onChange={(e) => {
                              const newType = e.target.value as any;
                              updateRewardField(rIdx, 'type', newType);
                              if (newType === 'banner' && !r.imageUrl) {
                                updateRewardField(rIdx, 'value', r.value || 'Banner Épico de Missão');
                                updateRewardField(rIdx, 'imageUrl', 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1200&auto=format&fit=crop');
                              } else if (newType === 'frame' && !r.imageUrl) {
                                updateRewardField(rIdx, 'value', r.value || 'Moldura Shinobi de Missão');
                                updateRewardField(rIdx, 'imageUrl', 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg');
                              }
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                          >
                            <option value="title">Título Shinobi</option>
                            <option value="unlock_character">Desbloquear Personagem</option>
                            <option value="banner">🖼️ Banner do Perfil (Fundo do Card)</option>
                            <option value="frame">🖼️ Moldura (Frame da Foto)</option>
                          </select>
                        </div>

                        <div className="space-y-2 relative md:col-span-1">
                          {r.type === 'unlock_character' ? (
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Personagem Recompensa</label>
                              <input
                                type="text"
                                value={r.value}
                                onChange={(e) => {
                                  updateRewardField(rIdx, 'value', e.target.value);
                                  setShowRewardCharSuggestions(true);
                                }}
                                placeholder="Nome do personagem para desbloquear..."
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-sans"
                              />
                              {showRewardCharSuggestions && (
                                <div className="absolute left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg z-20 shadow-2xl">
                                  {allCharNames
                                    .filter(name => name.toLowerCase().includes((r.value || '').toLowerCase()))
                                    .slice(0, 5)
                                    .map(name => (
                                      <div
                                        key={name}
                                        onClick={() => {
                                          updateRewardField(rIdx, 'value', name);
                                          setShowRewardCharSuggestions(false);
                                        }}
                                        className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-850 hover:text-white cursor-pointer border-b border-slate-900/60"
                                      >
                                        {name}
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          ) : r.type === 'banner' || r.type === 'frame' ? (
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                  Nome da {r.type === 'banner' ? 'Imagem de Banner' : 'Moldura'}
                                </label>
                                <input
                                  type="text"
                                  value={r.value}
                                  onChange={(e) => updateRewardField(rIdx, 'value', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-sans"
                                  placeholder={r.type === 'banner' ? 'Ex: Banner Fogo da Vontade' : 'Ex: Moldura Sharingan Carmesim'}
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1 flex items-center justify-between">
                                  <span>URL da Imagem ({r.type === 'banner' ? 'Banner HD' : 'Moldura PNG'})</span>
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={r.imageUrl || ''}
                                    onChange={(e) => updateRewardField(rIdx, 'imageUrl', e.target.value)}
                                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-mono"
                                    placeholder="https://...link-da-imagem.png"
                                  />
                                  <label className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 cursor-pointer flex-shrink-0">
                                    <Image className="w-3.5 h-3.5" />
                                    <span>Arquivo</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onloadend = () => {
                                            if (typeof reader.result === 'string') {
                                              updateRewardField(rIdx, 'imageUrl', reader.result);
                                            }
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                      className="hidden"
                                    />
                                  </label>
                                </div>
                              </div>

                              {/* Quick Presets for Admin */}
                              <div className="flex items-center gap-1.5 pt-1">
                                <span className="text-[9px] font-mono text-slate-500 uppercase">Atalhos:</span>
                                {r.type === 'banner' ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateRewardField(rIdx, 'value', 'Banner Fogo da Vontade');
                                        updateRewardField(rIdx, 'imageUrl', 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1200&auto=format&fit=crop');
                                      }}
                                      className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-[9px] text-amber-400 rounded border border-slate-800 font-mono"
                                    >
                                      Fogo
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateRewardField(rIdx, 'value', 'Banner Névoa Sangrenta');
                                        updateRewardField(rIdx, 'imageUrl', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop');
                                      }}
                                      className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-[9px] text-rose-400 rounded border border-slate-800 font-mono"
                                    >
                                      Névoa
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateRewardField(rIdx, 'value', 'Banner Noite Akatsuki');
                                        updateRewardField(rIdx, 'imageUrl', 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1200&auto=format&fit=crop');
                                      }}
                                      className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-[9px] text-red-400 rounded border border-slate-800 font-mono"
                                    >
                                      Akatsuki
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateRewardField(rIdx, 'value', 'Moldura Fogo da Vontade');
                                        updateRewardField(rIdx, 'imageUrl', 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg');
                                      }}
                                      className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-[9px] text-amber-400 rounded border border-slate-800 font-mono"
                                    >
                                      Naruto
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        updateRewardField(rIdx, 'value', 'Moldura Sharingan');
                                        updateRewardField(rIdx, 'imageUrl', 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/sasuke-uchiha-(s)/icon.jpg');
                                      }}
                                      className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-[9px] text-rose-400 rounded border border-slate-800 font-mono"
                                    >
                                      Sasuke
                                    </button>
                                  </>
                                )}
                              </div>

                              {/* Live Mini Preview */}
                              {r.imageUrl && (
                                <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center gap-3">
                                  <div className="w-12 h-10 rounded overflow-hidden relative bg-slate-900 border border-amber-500/30 flex-shrink-0">
                                    <img src={r.imageUrl || null} alt="Preview" className="w-full h-full object-cover" />
                                  </div>
                                  <div className="text-[10px] text-slate-300 truncate font-mono">
                                    <span className="text-amber-400 font-bold block truncate">{r.value || 'Sem título'}</span>
                                    <span>{r.type === 'banner' ? 'Banner do Card' : 'Moldura PNG'}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Título Recompensa</label>
                              <input
                                type="text"
                                value={r.value}
                                onChange={(e) => updateRewardField(rIdx, 'value', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-sans"
                                placeholder="Digite o título (Ex: Prodígio Uchiha)"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveReward(rIdx)}
                        className="p-1.5 bg-slate-950 hover:bg-red-950/20 text-slate-500 hover:text-red-400 rounded transition cursor-pointer"
                        title="Remover Recompensa"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  );
                })}

                {editingQuest.rewards.length === 0 && (
                  <p className="text-center text-slate-500 text-xs py-3 italic font-mono">Nenhuma recompensa cadastrada para esta missão.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Shield className="w-16 h-16 text-slate-800 mb-4" />
            <h3 className="text-slate-300 font-bold text-sm">Nenhuma Missão Ativa</h3>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed mt-1">Crie uma nova missão utilizando o botão no topo esquerdo do painel para começar a desenhar metas táticas.</p>
          </div>
        )}
      </div>

      {/* Delete Quest Confirmation Pergaminho Modal */}
      <AnimatePresence>
        {confirmDeleteQuestId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                playClickSound();
                setConfirmDeleteQuestId(null);
              }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative rounded-3xl overflow-hidden shadow-2xl max-w-md w-full min-h-[250px] flex flex-col justify-between p-8 sm:p-10 z-10"
            >
              {/* Background Pergaminho Image */}
              <img
                src="/static/img/ui/pergaminho.webp"
                alt="Pergaminho Shinobi"
                className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none filter drop-shadow-xl"
              />

              <div className="relative z-10 flex flex-col items-center justify-between text-center space-y-6 h-full">
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-red-800 shrink-0" />
                    <h3 className="text-xl font-black uppercase tracking-tight text-stone-950 font-sans">
                      Remover Missão?
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                    Tem certeza de que deseja remover esta missão? Essa ação é irreversível.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-1">
                  <button
                    onClick={() => {
                      playClickSound();
                      setConfirmDeleteQuestId(null);
                    }}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#d3ad75]/90 hover:bg-[#c49a5d] text-stone-950 font-black text-xs uppercase tracking-wider border-2 border-[#7a4e25] shadow-md transition cursor-pointer active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDeleteQuest}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-800 to-rose-900 hover:from-red-700 hover:to-rose-800 text-amber-100 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-red-950/40 border border-red-600/50 transition cursor-pointer active:scale-95"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
  