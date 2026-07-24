/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Shield, Plus, Trash2, Edit3, Save, 
  Database, RefreshCw, AlertTriangle, CheckCircle, Sparkles, User, HelpCircle, Shirt,
  Lock, Unlock, Search, Trophy, Award, X
} from 'lucide-react';
import { Character, Skill, ChakraType, CharacterSkin, Quest } from '../types';
import { getCharacters, saveCharacters, resetToDefaultCharacters } from '../lib/characterStorage';
import { RankConfig, getRanks, saveRanks, fetchRanksFromServer } from '../lib/rankStorage';
import { motion, AnimatePresence } from 'motion/react';
import QuestAdmin from './QuestAdmin';
import ShopAdmin from './ShopAdmin';
import EventAdmin from './EventAdmin';

const TARGET_OPTIONS = [
  { value: 'Target', label: 'Alvo Principal' },
  { value: 'Self', label: 'Conjurador (Mim)' },
  { value: 'Both', label: 'Ambos (Mim e Alvo)' },
  { value: 'Ally', label: 'Aliado (Outra Pessoa)' },
  { value: 'AllAllies', label: 'Toda Minha Equipe' },
  { value: 'AllEnemies', label: 'Todos os Inimigos' },
  { value: 'AllLiving', label: 'Todos os Personagens Vivos' },
  { value: 'AllNonInvulnerable', label: 'Todos os Personagens NÃO Invulneráveis' },
  { value: 'AllInvulnerable', label: 'Todos os Personagens Invulneráveis' },
  { value: 'OneInvulnerable', label: 'Um Personagem Invulnerável' },
  { value: 'OneInvulnerableAlly', label: 'Um Aliado Invulnerável' },
  { value: 'SelfAndAllEnemies', label: 'Mim e Todos os Inimigos' },
];

interface AdminDashboardProps {
  onBack: () => void;
  playClickSound: () => void;
}

export default function AdminDashboard({ onBack, playClickSound }: AdminDashboardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [activeTab, setActiveTab] = useState<'ninjas' | 'quests' | 'shop' | 'events' | 'ranks'>('ninjas');

  // Character list state loaded from storage
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [charSearch, setCharSearch] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [orderChanged, setOrderChanged] = useState(false);
  
  // Feedback messages
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Editing forms state
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  // Quest Autocomplete state for character lock requirements
  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [questSearchInput, setQuestSearchInput] = useState('');
  const [showQuestSuggestions, setShowQuestSuggestions] = useState(false);

  // Ranks Management state
  const [ranksList, setRanksList] = useState<RankConfig[]>([]);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const requestConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
    });
  };
  const getEffectNameSuggestions = (): string[] => {
    const names = new Set<string>();

    // Skills do personagem que está sendo editado agora (mesmo sem ter salvo ainda)
    if (editingChar) {
      editingChar.skills.forEach(sk => {
        names.add(sk.name);
        if (sk.shieldVal) names.add(`${sk.name} Shield`);
        if (sk.damageReductionVal) names.add(`${sk.name} Guard`);
        if (sk.damageBuffVal) names.add(`${sk.name} Power`);
        if (sk.dotVal) names.add(`${sk.name} Burn`);
      });
    }



    return Array.from(names).sort();
  };

  // Load characters, quests and ranks on mount
  useEffect(() => {
    const loaded = getCharacters();
    setCharacters(loaded);
    if (loaded.length > 0) {
      setSelectedCharacterId(loaded[0].id);
      // Clone for editing
      setEditingChar(JSON.parse(JSON.stringify(loaded[0])));
    }

    // Fetch quests for autocomplete
    fetch('/api/quests')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.quests)) {
          setAllQuests(data.quests);
        }
      })
      .catch(() => {});

    // Fetch ranks
    fetchRanksFromServer().then(r => setRanksList(r));
  }, []);

  // Update editing character when selected ID changes
  useEffect(() => {
    if (selectedCharacterId) {
      const char = characters.find(c => c.id === selectedCharacterId);
      if (char) {
        setEditingChar(JSON.parse(JSON.stringify(char)));
        setEditingSkillIndex(null);
        setEditingSkill(null);
      }
    }
  }, [selectedCharacterId, characters]);

  // Show temporary success feedback
  const triggerSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Show temporary error feedback
  const triggerError = (msg: string) => {
    playClickSound();
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 4000);
  };

  // Save changes to current character details (in local state)
  const handleUpdateCharDetails = (field: keyof Omit<Character, 'skills'>, value: any) => {
    if (!editingChar) return;
    setEditingChar({
      ...editingChar,
      [field]: value
    });
  };

  // Save the current character back to the characters list and local storage
  const handleSaveCharacter = () => {
    if (!editingChar) return;
    playClickSound();

    if (!editingChar.id.trim()) {
      triggerError('O ID do personagem não pode estar vazio.');
      return;
    }
    if (!editingChar.name.trim()) {
      triggerError('O Nome do personagem não pode estar vazio.');
      return;
    }

    // Check if we are creating a new character vs editing an existing one
    const exists = characters.some(c => c.id === editingChar.id);
    let updatedList: Character[];

    if (exists) {
      // Update
      updatedList = characters.map(c => c.id === editingChar.id ? editingChar : c);
    } else {
      // Create new
      updatedList = [...characters, editingChar];
    }

    setCharacters(updatedList);
    saveCharacters(updatedList);
    triggerSuccess(`Personagem "${editingChar.name}" salvo com sucesso!`);
  };

  // Add a new character from scratch
  const handleAddNewCharacter = () => {
    playClickSound();
    const newId = `novo-ninja-${Date.now().toString().slice(-4)}`;
    const newChar: Character = {
      id: newId,
      name: 'Novo Ninja',
      description: 'Escreva a biografia e estilo de luta do seu novo personagem aqui.',
      tags: ['Vila da Folha', 'Genin'],
      portrait: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg',
      folder: 'naruto-uzumaki',
      skills: [
        {
          name: 'Golpe Básico',
          desc: 'Causa 20 de dano físico a um inimigo.',
          icon: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/NarutoUzumakiBarrage.jpg',
          cost: ['Tai'],
          cooldown: 0,
          currentCooldown: 0,
          targetType: 'Enemy',
          classes: ['Físico', 'Corpo a Corpo']
        }
      ]
    };

    const updatedList = [...characters, newChar];
    setCharacters(updatedList);
    saveCharacters(updatedList);
    setSelectedCharacterId(newId);
    setEditingChar(newChar);
    triggerSuccess('Novo personagem criado! Agora você pode personalizá-lo.');
  };

  // Delete current character
  const handleDeleteCharacter = (charId: string) => {
    playClickSound();
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    requestConfirm(
      'Excluir Personagem',
      `Tem certeza de que deseja excluir o personagem "${char.name}" permanentemente?`,
      () => {
        const updatedList = characters.filter(c => c.id !== charId);
        setCharacters(updatedList);
        saveCharacters(updatedList);
        
        if (updatedList.length > 0) {
          setSelectedCharacterId(updatedList[0].id);
        } else {
          setSelectedCharacterId('');
          setEditingChar(null);
        }
        triggerSuccess(`Personagem "${char.name}" removido.`);
      }
    );
  };

  // Reset to default characters
  const handleResetDefaults = () => {
    playClickSound();
    requestConfirm(
      'Redefinir Personagens',
      'Atenção: Isso redefinirá todos os personagens e habilidades para as configurações padrão originais do jogo. Deseja continuar?',
      () => {
        const defaults = resetToDefaultCharacters();
        setCharacters(defaults);
        if (defaults.length > 0) {
          setSelectedCharacterId(defaults[0].id);
          setEditingChar(JSON.parse(JSON.stringify(defaults[0])));
        }
        setEditingSkillIndex(null);
        setEditingSkill(null);
        triggerSuccess('Personagens restaurados para os padrões com sucesso!');
      }
    );
  };

  // Helper to pre-populate legacy skill attributes based on description/name if they are not explicitly set
  const fillLegacySkillAttributes = (skill: Skill): Skill => {
    const s = { ...skill };
    
    // Check if any custom dynamic value is already set
    const hasCustomValue = 
      s.damage !== undefined ||
      s.directDamage !== undefined ||
      s.heal !== undefined ||
      s.stunTurns !== undefined ||
      s.removeShield !== undefined ||
      s.removeShieldDuration !== undefined ||
      s.gainChakra !== undefined ||
      s.gainChakraDuration !== undefined ||
      s.drainChakra !== undefined ||
      s.drainChakraDuration !== undefined ||
      s.shieldVal !== undefined ||
      s.damageReductionVal !== undefined ||
      s.damageBuffVal !== undefined ||
      s.dotVal !== undefined ||
      s.invulnerableDuration !== undefined ||
      s.invisible !== undefined ||
      s.invisibleDuration !== undefined;

    if (s.name === 'Rasengan') {
      s.damage = 45;
      s.stunTurns = 1;
      s.stunType = ['physical', 'mental', 'affliction', 'chakra'];
      return s;
    }

    if (s.stunTurns && (!s.stunType || s.stunType.length === 0)) {
      s.stunType = ['physical', 'mental', 'affliction', 'chakra'];
    }

    if (hasCustomValue) {
      return s;
    }

    // Map default/legacy skills based on their original game rules
    switch (s.name) {
      case 'Uzumaki Barrage':
        s.damage = 20;
        break;
      case 'Rasengan':
        s.damage = 45;
        s.stunTurns = 1;
        s.stunType = ['physical', 'mental', 'affliction', 'chakra'];
        break;
      case 'Shadow Clones':
        s.damageReductionVal = 15;
        s.damageReductionDuration = 4;
        break;
      case 'Sexy Technique':
        s.invulnerableDuration = 1;
        break;

      case 'Lions Barrage':
        s.damage = 30;
        break;
      case 'Chidori':
        s.damage = 40;
        break;
      case 'Sharingan':
        s.damageBuffVal = 10;
        s.damageBuffDuration = 4;
        break;
      case 'Orochimaru Block':
        s.invulnerableDuration = 1;
        break;

      case 'KO Punch':
        s.damage = 20;
        s.stunTurns = 1;
        s.stunType = ['physical'];
        break;
      case 'Healing Technique':
        s.heal = 25;
        break;
      case 'Inner Sakura':
        s.damageReductionVal = 15;
        s.damageReductionDuration = 4;
        break;
      case 'Substitution':
        s.invulnerableDuration = 1;
        break;

      case 'Lightning Blade':
        s.damage = 40;
        break;
      case 'Copied Sharingan':
        s.damageReductionVal = 10;
        s.damageReductionDuration = 3;
        break;
      case 'Ninja Hounds':
        s.damage = 15;
        s.stunTurns = 1;
        s.stunType = ['affliction'];
        break;
      case 'Underground Hide':
        s.invulnerableDuration = 1;
        break;

      case 'Sand Coffin':
        s.damage = 15;
        break;
      case 'Sand Burial':
        s.damage = 35;
        break;
      case 'Sand Armor':
        s.shieldVal = 30;
        s.shieldDuration = 99;
        break;
      case 'Sand Shield':
        s.invulnerableDuration = 1;
        break;

      case 'Ferocious Fist':
        s.damage = 25;
        break;
      case 'Primary Lotus':
        s.damage = 35;
        break;
      case 'Fifth Gate Opening':
        s.damageBuffVal = 15;
        s.damageBuffDuration = 3;
        break;
      case 'Lee Guard':
        s.invulnerableDuration = 1;
        break;

      case 'Amaterasu':
        s.dotVal = 15;
        s.dotDuration = 3;
        break;
      case 'Tsukuyomi':
        s.damage = 30;
        s.stunTurns = 1;
        s.stunType = ['mental'];
        break;
      case 'Crow Clone Escape':
        s.invulnerableDuration = 1;
        break;

      case 'Gentle Fist':
        s.damage = 20;
        s.drainChakra = 1;
        break;
      case 'Sixty-Four Palms':
        s.damage = 40;
        s.stunTurns = 1;
        s.stunType = ['chakra'];
        break;
      case 'Byakugan Sight':
        s.damageReductionVal = 15;
        s.damageReductionDuration = 3;
        break;
      case 'Eight Trigrams Rotation':
        s.invulnerableDuration = 1;
        break;

      case 'Human Boulder':
        s.damage = 25;
        break;
      case 'Partial Expansion':
        s.damage = 30;
        break;
      case 'Three Colored Pills':
        s.heal = 25;
        s.damageBuffVal = 15;
        s.damageBuffDuration = 3;
        break;
      case 'Choji Block':
        s.invulnerableDuration = 1;
        break;
    }

    return s;
  };

  // Select a skill for editing
  const handleSelectSkill = (idx: number) => {
    playClickSound();
    if (!editingChar) return;
    setEditingSkillIndex(idx);
    const originalSkill = JSON.parse(JSON.stringify(editingChar.skills[idx]));
    setEditingSkill(fillLegacySkillAttributes(originalSkill));
  };

  // Add a new skill to current character
  const handleAddNewSkill = () => {
    playClickSound();
    if (!editingChar) return;
    
    const newSkill: Skill = {
      name: 'Nova Habilidade',
      desc: 'Causa 30 de dano de chakra a um inimigo.',
      icon: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg',
      cost: ['Nin'],
      cooldown: 1,
      currentCooldown: 0,
      targetType: 'Enemy',
      classes: ['Chakra', 'À Distância']
    };

    const updatedSkills = [...editingChar.skills, newSkill];
    const updatedChar = { ...editingChar, skills: updatedSkills };
    setEditingChar(updatedChar);
    
    // Select this newly added skill for editing
    setEditingSkillIndex(updatedSkills.length - 1);
    setEditingSkill(newSkill);
    triggerSuccess('Nova habilidade adicionada! Personalize-a abaixo.');
  };

  // Delete a skill from current character
  const handleDeleteSkill = (idx: number) => {
    playClickSound();
    if (!editingChar) return;

    if (editingChar.skills.length <= 1) {
      triggerError('Um personagem deve ter pelo menos 1 habilidade ativa!');
      return;
    }

    const skillName = editingChar.skills[idx].name;
    requestConfirm(
      'Excluir Habilidade',
      `Tem certeza de que deseja remover a habilidade "${skillName}"?`,
      () => {
        const updatedSkills = editingChar.skills.filter((_, i) => i !== idx);
        setEditingChar({
          ...editingChar,
          skills: updatedSkills
        });
        setEditingSkillIndex(null);
        setEditingSkill(null);
        triggerSuccess(`Habilidade "${skillName}" removida.`);
      }
    );
  };

  // Update a field inside the selected skill
  const handleUpdateSkillField = (field: keyof Skill, value: any) => {
    if (!editingSkill) return;
    setEditingSkill({
      ...editingSkill,
      [field]: value
    });
  };

  // Toggle chakra cost types in the selected skill
  const handleToggleChakraCost = (type: ChakraType) => {
    if (!editingSkill) return;
    let newCost = [...editingSkill.cost];
    
    // Check occurrences: we can allow simple toggling or adding duplicates
    // For ease of administration, let's treat it as a list where you can click to add or click to remove.
    // If it is in the list, remove one occurrence. If not, add it.
    const idx = newCost.indexOf(type);
    if (idx > -1) {
      newCost.splice(idx, 1);
    } else {
      newCost.push(type);
    }
    
    // Limit to maximum 4 chakra costs for UI safety
    if (newCost.length > 4) {
      triggerError('O custo máximo é de 4 chakras por habilidade.');
      return;
    }

    setEditingSkill({
      ...editingSkill,
      cost: newCost
    });
  };

  // Save the edited skill back to the editing character
  const handleSaveSkill = () => {
    if (!editingChar || editingSkillIndex === null || !editingSkill) return;
    playClickSound();

    if (!editingSkill.name.trim()) {
      triggerError('O Nome da habilidade não pode estar vazio.');
      return;
    }

    const updatedSkills = [...editingChar.skills];
    updatedSkills[editingSkillIndex] = editingSkill;

    setEditingChar({
      ...editingChar,
      skills: updatedSkills
    });

    triggerSuccess(`Habilidade "${editingSkill.name}" atualizada na lista temporária. Lembre-se de salvar o personagem!`);
  };

  // Render a visual tag for chakra costs
  const renderChakraButton = (type: ChakraType, isActive: boolean) => {
    const bgColors: Record<ChakraType, string> = {
      Tai: 'bg-red-500/20 border-red-500 text-red-400',
      Nin: 'bg-blue-500/20 border-blue-500 text-blue-400',
      Gen: 'bg-emerald-500/20 border-emerald-500 text-emerald-400',
      Blood: 'bg-purple-500/20 border-purple-500 text-purple-400',
      Rand: 'bg-slate-600/20 border-slate-500 text-slate-300'
    };

    return (
      <button
        key={type}
        type="button"
        onClick={() => handleToggleChakraCost(type)}
        className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
          isActive 
            ? bgColors[type] + ' ring-2 ring-offset-2 ring-offset-slate-950 ring-orange-500 scale-105' 
            : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${
          type === 'Tai' ? 'bg-red-500' :
          type === 'Nin' ? 'bg-blue-500' :
          type === 'Gen' ? 'bg-emerald-500' :
          type === 'Blood' ? 'bg-purple-500' : 'bg-slate-400'
        }`} />
        {type}
      </button>
    );
  };

  // Dashboard layout
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-orange-600 selection:text-white">
      {/* Top persistent action bar */}
      <header className="bg-slate-900 border-b border-slate-800/80 px-6 py-4 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
              title="Voltar ao Menu Principal"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-400" />
                <h1 className="text-lg font-black uppercase tracking-tight text-white">Central do Desenvolvedor</h1>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Customize habilidades, regras e crie novos ninjas</p>
            </div>
          </div>

          {/* TAB SWITCH */}
          <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl gap-1 overflow-x-auto">
            <button
              onClick={() => { playClickSound(); setActiveTab('ninjas'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ninjas'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 font-bold'
              }`}
            >
              Ninjas
            </button>
            <button
              onClick={() => { playClickSound(); setActiveTab('quests'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'quests'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 font-bold'
              }`}
            >
              Missões
            </button>
            <button
              onClick={() => { playClickSound(); setActiveTab('shop'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'shop'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 font-bold'
              }`}
            >
              Loja
            </button>
            <button
              onClick={() => { playClickSound(); setActiveTab('events'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'events'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 font-bold'
              }`}
            >
              Eventos
            </button>
            <button
              onClick={() => { playClickSound(); setActiveTab('ranks'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ranks'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 font-bold'
              }`}
            >
              Ranks & XP
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetDefaults}
              className="px-3.5 py-2 rounded-lg border border-red-950/80 bg-red-950/20 text-red-400 hover:bg-red-950/40 hover:border-red-500/40 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
              title="Apagar customizações e voltar ao padrão do jogo"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Resetar Padrões
            </button>

            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-300 font-bold rounded-lg text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Sair do Painel
            </button>
          </div>
        </div>
      </header>

      {/* Main dashboard work area */}
      {activeTab === 'quests' ? (
        <QuestAdmin onBack={onBack} playClickSound={playClickSound} />
      ) : activeTab === 'shop' ? (
        <ShopAdmin playClickSound={playClickSound} />
      ) : activeTab === 'events' ? (
        <EventAdmin playClickSound={playClickSound} />
      ) : activeTab === 'ranks' ? (
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 z-10 space-y-6">
          {/* Header Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold uppercase tracking-wider text-white font-mono">Gerenciamento de Ranks & XP</h2>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Crie, edite a quantidade de missões/XP necessárias, renomeie ou remova ranks do jogo.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  playClickSound();
                  const newRank: RankConfig = {
                    id: 'rank_' + Date.now(),
                    name: 'Novo Rank Ninja',
                    requiredXp: (ranksList.length > 0 ? Math.max(...ranksList.map(r => r.requiredXp)) + 1 : 0),
                    color: 'from-amber-600 to-yellow-500 border-amber-500/30 text-amber-400'
                  };
                  setRanksList([...ranksList, newRank]);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/10"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                Adicionar Rank
              </button>

              <button
                onClick={() => {
                  playClickSound();
                  saveRanks(ranksList);
                  setSuccessMessage('Ranks e requisitos de XP salvos com sucesso!');
                  setTimeout(() => setSuccessMessage(''), 3000);
                }}
                className="px-5 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:brightness-110 text-slate-950 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-orange-600/20"
              >
                <Save className="w-4 h-4 stroke-[3]" />
                Salvar Ranks
              </button>
            </div>
          </div>

          {/* Toast Feedbacks */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 font-mono text-xs max-w-md"
              >
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Ranks List */}
          <div className="space-y-4">
            {ranksList.map((rank, index) => (
              <div
                key={rank.id}
                className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between transition-all hover:border-slate-700"
              >
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className={`relative px-3 py-1.5 rounded-xl border bg-gradient-to-r font-black text-xs uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0 overflow-hidden ${rank.color}`}>
                    {rank.imageUrl && (
                      <img src={rank.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                    )}
                    <Award className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">{rank.name || 'Sem Nome'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-auto flex-1 max-w-2xl">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Nome do Rank</label>
                    <input
                      type="text"
                      value={rank.name}
                      onChange={(e) => {
                        const updated = [...ranksList];
                        updated[index] = { ...updated[index], name: e.target.value };
                        setRanksList(updated);
                      }}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white outline-none font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">XP / Missões Necessárias</label>
                    <input
                      type="number"
                      min={0}
                      value={rank.requiredXp}
                      onChange={(e) => {
                        const updated = [...ranksList];
                        updated[index] = { ...updated[index], requiredXp: Math.max(0, parseInt(e.target.value) || 0) };
                        setRanksList(updated);
                      }}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white outline-none font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Estilo de Cor</label>
                    <select
                      value={rank.color}
                      onChange={(e) => {
                        const updated = [...ranksList];
                        updated[index] = { ...updated[index], color: e.target.value };
                        setRanksList(updated);
                      }}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-200 outline-none font-mono"
                    >
                      <option value="from-slate-500 to-slate-400 border-slate-500/30 text-slate-300">Cinza (Estudante)</option>
                      <option value="from-emerald-600 to-teal-500 border-emerald-500/30 text-emerald-400">Verde (Genin)</option>
                      <option value="from-blue-600 to-cyan-500 border-blue-500/30 text-blue-400">Azul (Chunin)</option>
                      <option value="from-indigo-600 to-purple-500 border-indigo-500/30 text-indigo-400">Roxo (Jonin)</option>
                      <option value="from-red-600 to-pink-500 border-red-500/30 text-red-400">Vermelho (ANBU)</option>
                      <option value="from-orange-600 to-amber-500 border-orange-500/30 text-orange-400">Laranja/Dourado (Hokage)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Imagem de Fundo (URL)</label>
                    <input
                      type="text"
                      value={rank.imageUrl || ''}
                      onChange={(e) => {
                        const updated = [...ranksList];
                        updated[index] = { ...updated[index], imageUrl: e.target.value || undefined };
                        setRanksList(updated);
                      }}
                      placeholder="https://exemplo.com/imagem.jpg"
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    const updated = ranksList.filter((_, i) => i !== index);
                    setRanksList(updated);
                  }}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800/80 rounded-xl transition-all cursor-pointer flex-shrink-0"
                  title="Remover Rank"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {ranksList.length === 0 && (
              <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl">
                <p className="text-slate-500 font-mono text-sm">Nenhum rank configurado. Clique em "Adicionar Rank" para criar um novo.</p>
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10">
        
        {/* Toast Feedbacks */}
        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 font-mono text-xs max-w-md"
            >
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </motion.div>
          )}

          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-red-500/15 border border-red-500/40 text-red-400 px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 font-mono text-xs max-w-md"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Column 1: Character List & Actions (4 cols) */}
        <section className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 overflow-hidden h-fit">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">Ninjas Ativos</h3>
            </div>
            <button
              onClick={handleAddNewCharacter}
              className="p-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-slate-950 font-bold transition-all flex items-center gap-1 cursor-pointer text-[10px] uppercase tracking-wider"
              title="Adicionar Novo Personagem"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              Novo
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar ninja..."
              value={charSearch}
              onChange={(e) => setCharSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-orange-500/50 transition-all font-mono"
            />
          </div>

          {orderChanged && (
            <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              <span className="text-[10px] text-amber-400 font-mono">Ordem alterada</span>
              <button
                onClick={() => {
                  setOrderChanged(false);
                  saveCharacters(characters);
                  triggerSuccess('Ordem dos ninjas salva com sucesso!');
                }}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
              >
                Salvar Ordem
              </button>
            </div>
          )}

          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1 scrollbar-thin">
            {characters.filter(char =>
              char.name.toLowerCase().includes(charSearch.toLowerCase()) ||
              char.tags?.some(t => t.toLowerCase().includes(charSearch.toLowerCase()))
            ).map((char, idx) => {
              const isSelected = char.id === selectedCharacterId;
              const realIdx = characters.indexOf(char);
              return (
                <div
                  key={char.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIndex(realIdx); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex === null || dragIndex === realIdx) return;
                    const updated = [...characters];
                    const [moved] = updated.splice(dragIndex, 1);
                    const dropIdx = updated.findIndex(c => c.id === char.id);
                    if (dropIdx === -1) return;
                    updated.splice(dropIdx, 0, moved);
                    setCharacters(updated);
                    setDragIndex(null);
                    setOrderChanged(true);
                  }}
                  onClick={() => setSelectedCharacterId(char.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-slate-950 border-orange-500/60 shadow shadow-orange-500/10'
                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                  } ${dragIndex === realIdx ? 'opacity-40 border-dashed border-orange-400' : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex flex-col items-center gap-0.5 text-slate-600 cursor-grab active:cursor-grabbing">
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                    </div>
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex-shrink-0">
                      <img 
                        src={char.portrait} 
                        alt={char.name} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-slate-200 truncate group-hover:text-white transition-all">{char.name}</p>
                      <p className="text-[9px] text-slate-500 font-mono truncate">{char.id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCharacter(char.id);
                      }}
                      className="p-1 text-slate-500 hover:text-red-400 transition-all rounded hover:bg-slate-800/60"
                      title="Excluir Personagem"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {characters.filter(char =>
              char.name.toLowerCase().includes(charSearch.toLowerCase()) ||
              char.tags?.some(t => t.toLowerCase().includes(charSearch.toLowerCase()))
            ).length === 0 && (
              <div className="text-center py-8 text-slate-500 text-xs font-mono">
                {charSearch ? 'Nenhum ninja encontrado para esta busca.' : 'Nenhum personagem cadastrado. Clique em "+ Novo" para começar.'}
              </div>
            )}
          </div>
        </section>

        {/* Column 2: Selected Character Form (8 cols) */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          {editingChar ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-6">
              
              {/* Form Title */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-orange-400 font-bold uppercase">
                    <User className="w-3.5 h-3.5" />
                    Editando Informações
                  </div>
                  <h2 className="text-xl font-black text-white">{editingChar.name || 'Sem nome'}</h2>
                </div>

                <button
                  type="button"
                  onClick={handleSaveCharacter}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/15"
                >
                  <Save className="w-4 h-4" />
                  Salvar Personagem
                </button>
              </div>

              {/* Character properties inputs */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">ID Único (Fidelidade do Sistema)</label>
                  <input
                    type="text"
                    disabled // Lock ID to avoid messing up active battles / reference
                    value={editingChar.id}
                    placeholder="E.g. naruto"
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800/80 text-slate-500 rounded-xl outline-none font-mono text-xs cursor-not-allowed"
                    title="O ID de um personagem existente não pode ser alterado para manter a integridade."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Nome de Exibição</label>
                  <input
                    type="text"
                    value={editingChar.name}
                    onChange={(e) => handleUpdateCharDetails('name', e.target.value)}
                    placeholder="E.g. Naruto Uzumaki"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Pasta de Imagens</label>
                  <input
                    type="text"
                    value={editingChar.folder}
                    onChange={(e) => handleUpdateCharDetails('folder', e.target.value)}
                    placeholder="E.g. naruto-uzumaki"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Caminho do Retrato (Ícone)</label>
                  <input
                    type="text"
                    value={editingChar.portrait}
                    onChange={(e) => handleUpdateCharDetails('portrait', e.target.value)}
                    placeholder="E.g. https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Tags / Afiliações (Separadas por vírgula)</label>
                  <input
                    type="text"
                    value={editingChar.tags.join(', ')}
                    onChange={(e) => {
                      const list = e.target.value.split(',').map(s => s.trim()).filter(s => s !== '');
                      handleUpdateCharDetails('tags', list);
                    }}
                    placeholder="E.g. Vila da Folha, Time 7, Jinchuriki"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Biografia / Descrição Curta</label>
                  <textarea
                    rows={2}
                    value={editingChar.description}
                    onChange={(e) => handleUpdateCharDetails('description', e.target.value)}
                    placeholder="Escreva sobre o histórico do ninja..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all leading-normal"
                  />
                </div>

                {/* Character Lock & Required Quests with Autocomplete */}
                <div className="md:col-span-2 bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-3 mt-1">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-red-400 font-mono flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-red-400" />
                        Bloqueio de Personagem & Missões Necessárias
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Para ter este personagem liberado na tela de seleção, o jogador precisa ter concluído as missões vinculadas.
                      </p>
                    </div>
                  </div>

                  {/* Active Required Quests Tags */}
                  <div className="flex flex-wrap gap-2 items-center">
                    {(editingChar.requiredQuestIds || []).map((req, idx) => {
                      const questObj = allQuests.find(q => q.id === req || q.title.toLowerCase() === req.toLowerCase());
                      const label = questObj ? questObj.title : req;
                      return (
                        <span
                          key={idx}
                          className="bg-red-950/50 border border-red-500/40 text-red-300 px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 shadow-md"
                        >
                          <Lock className="w-3 h-3 text-red-400" />
                          <span className="font-semibold">{label}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (editingChar.requiredQuestIds || []).filter((_, i) => i !== idx);
                              handleUpdateCharDetails('requiredQuestIds', updated);
                            }}
                            className="hover:text-red-100 text-red-400 p-0.5 cursor-pointer rounded"
                            title="Remover requisito"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}

                    {(!editingChar.requiredQuestIds || editingChar.requiredQuestIds.length === 0) && (
                      <span className="text-xs font-mono text-emerald-400/80 bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5" />
                        Livre por Padrão (Sem Bloqueio de Missão)
                      </span>
                    )}
                  </div>

                  {/* Autocomplete Input */}
                  <div className="relative mt-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                      <input
                        type="text"
                        value={questSearchInput}
                        onChange={(e) => {
                          setQuestSearchInput(e.target.value);
                          setShowQuestSuggestions(true);
                        }}
                        onFocus={() => setShowQuestSuggestions(true)}
                        placeholder="Digite o nome da missão para buscar e bloquear (ex: Caminho do Shinobi)..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-red-500 transition-all font-mono text-white"
                      />
                    </div>

                    {/* Autocomplete Suggestions Dropdown */}
                    {showQuestSuggestions && questSearchInput.trim() !== '' && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-800/80">
                        {allQuests
                          .filter(q => q.title.toLowerCase().includes(questSearchInput.toLowerCase()) || q.id.toLowerCase().includes(questSearchInput.toLowerCase()))
                          .map(q => {
                            const isAlreadyAdded = (editingChar.requiredQuestIds || []).includes(q.id) || (editingChar.requiredQuestIds || []).includes(q.title);
                            return (
                              <div
                                key={q.id}
                                onClick={() => {
                                  if (!isAlreadyAdded) {
                                    const currentReqs = editingChar.requiredQuestIds || [];
                                    handleUpdateCharDetails('requiredQuestIds', [...currentReqs, q.title]);
                                  }
                                  setQuestSearchInput('');
                                  setShowQuestSuggestions(false);
                                }}
                                className={`p-2.5 hover:bg-slate-800 cursor-pointer flex justify-between items-center transition-all ${isAlreadyAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div>
                                  <div className="text-xs font-bold text-slate-200">{q.title}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">Rank necessário: {q.minRank}</div>
                                </div>
                                {isAlreadyAdded ? (
                                  <span className="text-[10px] text-slate-500 font-mono">Já Vinculado</span>
                                ) : (
                                  <span className="text-xs font-mono text-red-400 font-bold flex items-center gap-1">
                                    <Plus className="w-3.5 h-3.5" /> Adicionar Requisito
                                  </span>
                                )}
                              </div>
                            );
                          })}

                        {allQuests.filter(q => q.title.toLowerCase().includes(questSearchInput.toLowerCase()) || q.id.toLowerCase().includes(questSearchInput.toLowerCase())).length === 0 && (
                          <div className="p-3 text-xs text-slate-500 font-mono text-center">
                            Nenhuma missão encontrada com esse termo.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Character Skins Gallery Management */}
                <div className="md:col-span-2 bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-3 mt-2">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1.5">
                        <Shirt className="w-4 h-4 text-amber-400" />
                        Galeria de Skins do Personagem
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Adicione, edite ou remova artes e skins em formato PNG sem fundo para este ninja.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const currentSkins = editingChar.skins || [];
                        const newSkin: CharacterSkin = {
                          id: 'skin-' + Date.now(),
                          name: 'Nova Skin',
                          image: ''
                        };
                        handleUpdateCharDetails('skins', [...currentSkins, newSkin]);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 text-amber-400 font-bold transition-all flex items-center gap-1 cursor-pointer text-[10px] uppercase tracking-wider"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Skin
                    </button>
                  </div>

                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {(editingChar.skins || []).map((skin, skinIdx) => (
                      <div key={skin.id || skinIdx} className="flex gap-3 items-center bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                        <div className="w-12 h-12 rounded border border-slate-800 bg-slate-950 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {skin.image ? (
                            <img src={skin.image} alt={skin.name} className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[8px] text-slate-600 font-mono text-center">Sem Imagem</span>
                          )}
                        </div>

                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[8px] font-mono text-slate-400 uppercase">Nome da Skin</label>
                            <input
                              type="text"
                              value={skin.name}
                              onChange={(e) => {
                                const updatedSkins = [...(editingChar.skins || [])];
                                updatedSkins[skinIdx] = { ...updatedSkins[skinIdx], name: e.target.value };
                                handleUpdateCharDetails('skins', updatedSkins);
                              }}
                              placeholder="Ex: Sasuke Hebi"
                              className="w-full px-2 py-1 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded text-xs text-white outline-none font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[8px] font-mono text-slate-400 uppercase">URL Imagem (PNG sem fundo)</label>
                            <input
                              type="text"
                              value={skin.image}
                              onChange={(e) => {
                                const updatedSkins = [...(editingChar.skins || [])];
                                updatedSkins[skinIdx] = { ...updatedSkins[skinIdx], image: e.target.value };
                                handleUpdateCharDetails('skins', updatedSkins);
                              }}
                              placeholder="Ex: https://.../sasuke_skin.png"
                              className="w-full px-2 py-1 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded text-xs text-white outline-none font-mono"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const updatedSkins = (editingChar.skins || []).filter((_, idx) => idx !== skinIdx);
                            handleUpdateCharDetails('skins', updatedSkins);
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-all flex-shrink-0 cursor-pointer"
                          title="Remover Skin"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {(!editingChar.skins || editingChar.skins.length === 0) && (
                      <div className="text-center py-4 text-xs font-mono text-slate-500 italic">
                        Nenhuma skin cadastrada para este personagem. Clique em "Adicionar Skin" acima.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Skills Area (nested lists) */}
              <div className="border-t border-slate-800/80 pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 font-mono">Habilidades Ativas</h3>
                    <p className="text-[10px] text-slate-500 font-mono">Selecione uma habilidade abaixo para editar seus efeitos e custos</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddNewSkill}
                    className="px-2.5 py-1.5 rounded-lg border border-orange-500/40 hover:bg-orange-600/10 text-orange-400 font-semibold transition-all flex items-center gap-1 cursor-pointer text-[10px] uppercase tracking-wider"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova Habilidade
                  </button>
                </div>

                {/* Skills Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {editingChar.skills.map((skill, sIdx) => {
                    const isSkillSelected = editingSkillIndex === sIdx;
                    return (
                      <div
                        key={sIdx}
                        onClick={() => handleSelectSkill(sIdx)}
                        className={`p-2 rounded-xl border cursor-pointer relative flex flex-col items-center justify-center text-center transition-all bg-slate-950 select-none group ${
                          isSkillSelected
                            ? 'border-orange-500 ring-1 ring-orange-500 bg-orange-600/5'
                            : 'border-slate-800/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 mb-1.5 flex-shrink-0">
                          <img 
                            src={skill.icon} 
                            alt={skill.name} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.currentTarget; img.onerror = null; img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                            }}
                          />
                        </div>
                        <p className="font-bold text-[10px] text-slate-200 line-clamp-1 truncate px-1">{skill.name}</p>
                        
                        <div className="flex gap-0.5 mt-1">
                          {skill.cost.slice(0, 3).map((cost, cIdx) => (
                            <span 
                              key={cIdx} 
                              className={`w-1.5 h-1.5 rounded-full ${
                                cost === 'Tai' ? 'bg-red-500' :
                                cost === 'Nin' ? 'bg-blue-500' :
                                cost === 'Gen' ? 'bg-emerald-500' :
                                cost === 'Blood' ? 'bg-purple-500' : 'bg-slate-400'
                              }`} 
                              title={cost}
                            />
                          ))}
                        </div>

                        {/* Cooldown overlay */}
                        {skill.cooldown > 0 && (
                          <div className="absolute top-1 right-1 px-1 bg-slate-900 border border-slate-800 rounded text-[8px] font-mono font-bold text-slate-400">
                            C{skill.cooldown}
                          </div>
                        )}

                        {/* Delete Skill tiny button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSkill(sIdx);
                          }}
                          className="absolute top-1 left-1 p-0.5 bg-slate-900/80 rounded border border-slate-800/60 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all hover:bg-slate-800"
                          title="Remover Habilidade"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Skill details editor */}
                {editingSkill !== null && editingSkillIndex !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4 relative mt-3"
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-orange-400 uppercase">
                        <Edit3 className="w-3.5 h-3.5" />
                        Ajustando Habilidade #{editingSkillIndex + 1}
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveSkill}
                        className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-slate-950 font-bold rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Salvar Habilidade
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Nome da Habilidade</label>
                        <input
                          type="text"
                          value={editingSkill.name}
                          onChange={(e) => handleUpdateSkillField('name', e.target.value)}
                          placeholder="E.g. Rasengan"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Caminho da Imagem (Ícone)</label>
                        <input
                          type="text"
                          value={editingSkill.icon}
                          onChange={(e) => handleUpdateSkillField('icon', e.target.value)}
                          placeholder="E.g. https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Efeito Requerido para Ativar (Opcional)</label>
                        <input
  type="text"
  list="requireEffect-suggestions"
  value={editingSkill.requireEffect || ''}
  onChange={(e) => handleUpdateSkillField('requireEffect', e.target.value || undefined)}
  placeholder="E.g. Shadow Clones"
  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
  title="Insira o nome exato de um efeito buff ativo no ninja para poder usar esta habilidade (ex: 'Shadow Clones'). Deixe em branco se for de uso livre."
/>
<datalist id="requireEffect-suggestions">
  {getEffectNameSuggestions().map(name => (
    <option key={name} value={name} />
  ))}
</datalist>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Recarga (Cooldown)</label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={editingSkill.cooldown}
                            onChange={(e) => handleUpdateSkillField('cooldown', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Tipo de Alvo</label>
                          <select
                            value={editingSkill.targetType}
                            onChange={(e) => handleUpdateSkillField('targetType', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                          >
                            <option value="Enemy">Inimigo Único</option>
                            <option value="Ally">Aliado Único</option>
                            <option value="Self">Próprio (Self)</option>
                            <option value="AllEnemies">Todos os Inimigos</option>
                            <option value="AllAllies">Todos os Aliados</option>
                          </select>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-[10px]">
  <input type="checkbox" checked={editingSkill.cannotBeCountered || false}
    onChange={(e) => handleUpdateSkillField('cannotBeCountered', e.target.checked)} />
  Esta habilidade não pode ser anulada por contra-ataque
</label>
<label className="flex items-center gap-2 text-[10px]">
  <input type="checkbox" checked={editingSkill.cannotBeReflected || false}
    onChange={(e) => handleUpdateSkillField('cannotBeReflected', e.target.checked)} />
  Esta habilidade não pode ser refletida
</label>

                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Classes / Propriedades (Separadas por vírgula)</label>
                        <input
                          type="text"
                          value={editingSkill.classes.join(', ')}
                          onChange={(e) => {
                            const list = e.target.value.split(',').map(s => s.trim()).filter(s => s !== '');
                            handleUpdateSkillField('classes', list);
                          }}
                          placeholder="E.g. Chakra, Corpo a Corpo, Físico"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono">Custo de Chakra Elemental (Clique para adicionar/remover - Máx 4)</label>
                        <div className="flex flex-wrap gap-2">
                          {['Tai', 'Nin', 'Gen', 'Blood', 'Rand'].map((type) => {
                            // Check count in active cost
                            const count = editingSkill.cost.filter(c => c === type).length;
                            return renderChakraButton(type as ChakraType, count > 0);
                          })}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-1.5 flex items-center gap-1">
                          <HelpCircle className="w-3 h-3 text-slate-600" />
                          <span>Custo Selecionado atualmente: </span>
                          {editingSkill.cost.length > 0 ? (
                            <span className="text-orange-400 font-semibold">{editingSkill.cost.join(' + ')}</span>
                          ) : (
                            <span className="text-slate-600">Sem custo (Habilidade Grátis)</span>
                          )}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Descrição do Efeito / Detalhes</label>
                        <textarea
                          rows={2}
                          value={editingSkill.desc}
                          onChange={(e) => handleUpdateSkillField('desc', e.target.value)}
                          placeholder="Descreva o que acontece ao usar a habilidade..."
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all leading-normal"
                        />
                      </div>

                      {/* Visual Attributes Configurator (NEW) */}
                      <div className="md:col-span-2 border-t border-slate-800/85 pt-4">
                        <h4 className="text-xs font-mono uppercase tracking-wider text-orange-400 font-bold mb-3 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-orange-500" />
                          Efeitos e Atributos de Combate da Habilidade (Configuração Simplificada)
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                          
                          {/* 1. Dano Normal */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Dano Normal</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.damage || 0}
                                  onChange={(e) => handleUpdateSkillField('damage', parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded text-white font-mono text-xs text-center font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.damageDuration || 1}
                                  onChange={(e) => handleUpdateSkillField('damageDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.damageTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('damageTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-slate-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.damageRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('damageRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 2. Dano Direto (Perfurante) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono">Dano Direto (Perfura Defesa)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.directDamage || 0}
                                  onChange={(e) => handleUpdateSkillField('directDamage', parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-red-900/60 focus:border-red-500 rounded text-red-400 font-mono text-xs text-center font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.directDamageDuration || 1}
                                  onChange={(e) => handleUpdateSkillField('directDamageDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-red-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.directDamageTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('directDamageTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 focus:border-red-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.directDamageIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('directDamageIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.directDamageRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('directDamageRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 2. counter attack */}
                          <div className="space-y-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div className="space-y-2.5">
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono">Contra-ataque (Anular)</label>
                              <label className="flex items-center gap-2 text-[10px] cursor-pointer select-none text-slate-300 font-mono">
                                <input
                                  type="checkbox"
                                  checked={editingSkill.counterAttack || false}
                                  onChange={(e) => handleUpdateSkillField('counterAttack', e.target.checked)}
                                  className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                Ativar Contra-ataque / Anulação
                              </label>

                              {editingSkill.counterAttack && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-2 pt-1"
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      value={editingSkill.counterAttackDuration || 1}
                                      onChange={(e) => handleUpdateSkillField('counterAttackDuration', parseInt(e.target.value) || 1)}
                                      className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                    />
                                    <span className="text-[9px] text-slate-500 font-mono">Turnos ativo</span>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">Tipo de Anulação:</span>
                                    <select
                                      value={editingSkill.counterAttackType || 'defender'}
                                      onChange={(e) => handleUpdateSkillField('counterAttackType', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 outline-none w-full"
                                    >
                                      <option value="attacker">Anular o próximo ataque do inimigo alvo</option>
                                      <option value="defender">Anular o primeiro ataque recebido pelo aliado alvo</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">🎯 Aplicar em:</span>
                                    <select
                                      value={editingSkill.counterAttackTarget || 'Target'}
                                      onChange={(e) => handleUpdateSkillField('counterAttackTarget', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 outline-none w-full"
                                    >
                                      {TARGET_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-800/50 space-y-3">
                              <div className="grid grid-cols-1 gap-2">
                                <label className="text-[10px] text-slate-300 font-mono flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.counterAttackIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('counterAttackIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3.5 h-3.5"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <label className="text-[10px] text-slate-300 font-mono flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.counterAttackCannotBeCountered || false}
                                    onChange={(e) => handleUpdateSkillField('counterAttackCannotBeCountered', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3.5 h-3.5"
                                  />
                                  🚫 Não pode ser contra-atacado
                                </label>
                                <label className="text-[10px] text-slate-300 font-mono flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.counterAttackCannotBeReflected || false}
                                    onChange={(e) => handleUpdateSkillField('counterAttackCannotBeReflected', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3.5 h-3.5"
                                  />
                                  🛡️ Não pode ser refletido
                                </label>
                              </div>
                              <div className="flex items-center justify-between border-t border-slate-800/30 pt-2 gap-2">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">Limpar:</span>
                                <select
                                  value={editingSkill.counterAttackRemoveType || 'none'}
                                  onChange={(e) => handleUpdateSkillField('counterAttackRemoveType', e.target.value)}
                                  className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600 min-w-[100px]"
                                >
                                  <option value="none">Nenhum</option>
                                  <option value="all">Todos</option>
                                  <option value="buff">Buffs</option>
                                  <option value="debuff">Debuffs</option>
                                  <option value="stun">Stuns</option>
                                  <option value="dot">DoTs</option>
                                  <option value="bleeding">Sangra</option>
                                  <option value="affliction">Aflição</option>
                                  <option value="shield">Escudo</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* 2b. Reflect */}
                          <div className="space-y-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div className="space-y-2.5">
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">Refletir</label>
                              <label className="flex items-center gap-2 text-[10px] cursor-pointer select-none text-slate-300 font-mono">
                                <input
                                  type="checkbox"
                                  checked={editingSkill.reflect || false}
                                  onChange={(e) => handleUpdateSkillField('reflect', e.target.checked)}
                                  className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                Ativar Reflect nesta habilidade
                              </label>
                              {editingSkill.reflect && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-3 pt-1 border-t border-slate-800/40 mt-2"
                                >
                                  {/* Reflect Type Select */}
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold block">Tipo de Habilidade:</span>
                                    <select
                                      value={editingSkill.reflectType || 'active'}
                                      onChange={(e) => {
                                        handleUpdateSkillField('reflectType', e.target.value as 'active' | 'passive');
                                        if (e.target.value === 'passive' && editingSkill.reflectCharges === undefined) {
                                          handleUpdateSkillField('reflectCharges', 1);
                                        }
                                      }}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-cyan-300 outline-none w-full"
                                    >
                                      <option value="active">Refletir Ativo (Dura todo o tempo)</option>
                                      <option value="passive">Refletir Passivo (Consome por ativações)</option>
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      value={editingSkill.reflectDuration || 1}
                                      onChange={(e) => handleUpdateSkillField('reflectDuration', parseInt(e.target.value) || 1)}
                                      className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                    />
                                    <span className="text-[9px] text-slate-500 font-mono">Turnos ativo</span>
                                  </div>

                                  {/* Passive Charges Input (Only visible for passive type) */}
                                  {editingSkill.reflectType === 'passive' && (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={editingSkill.reflectCharges !== undefined ? editingSkill.reflectCharges : 1}
                                        onChange={(e) => handleUpdateSkillField('reflectCharges', parseInt(e.target.value) || 1)}
                                        className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                      />
                                      <span className="text-[9px] text-slate-500 font-mono">Qtd. de Ativações (Cargas)</span>
                                    </div>
                                  )}

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold block">Destino do Reflexo:</span>
                                    <select
                                      value={editingSkill.reflectMode || 'Caster'}
                                      onChange={(e) => handleUpdateSkillField('reflectMode', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-cyan-300 outline-none w-full"
                                    >
                                      <option value="Caster">Atacante (quem tentou atacar)</option>
                                      <option value="RandomAlly">Aliado do atacante (aleatório)</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold block">🎯 Aplicar em:</span>
                                    <select
                                      value={editingSkill.reflectTarget || 'Target'}
                                      onChange={(e) => handleUpdateSkillField('reflectTarget', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-cyan-300 outline-none w-full"
                                    >
                                      {TARGET_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                                    </select>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-800/50 space-y-2">
                              <div className="grid grid-cols-1 gap-2">
                                <label className="flex items-center gap-2 text-[10px] text-slate-300 font-mono cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.reflectIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('reflectIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <label className="flex items-center gap-2 text-[10px] text-slate-300 font-mono cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.reflectCannotBeCountered || false}
                                    onChange={(e) => handleUpdateSkillField('reflectCannotBeCountered', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                                  />
                                  🚫 Não pode ser contra-atacado
                                </label>
                                <label className="flex items-center gap-2 text-[10px] text-slate-300 font-mono cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.reflectCannotBeReflected || false}
                                    onChange={(e) => handleUpdateSkillField('reflectCannotBeReflected', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                                  />
                                  🛡️ Não pode ser refletido
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* 3. Cura */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">Cura de Vida</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.heal || 0}
                                  onChange={(e) => handleUpdateSkillField('heal', parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-emerald-900/60 focus:border-emerald-500 rounded text-emerald-400 font-mono text-xs text-center font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.healDuration || 1}
                                  onChange={(e) => handleUpdateSkillField('healDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-emerald-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.healTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('healTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-emerald-300 focus:border-emerald-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.healIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('healIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.healRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('healRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 4. Atordoamento (Stun) */}
                          <div className="space-y-2 border border-purple-900/40 bg-purple-950/10 p-3 rounded-xl flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">Atordoamento (Stun)</label>
                                {(editingSkill.stunTurns || 0) > 0 ? (
                                  <span className="text-[9px] bg-purple-500/20 border border-purple-500/50 text-purple-300 px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">
                                    ⚡ ATIVO
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-slate-800 border border-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                                    Inativo
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  value={editingSkill.stunTurns || 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    handleUpdateSkillField('stunTurns', val);
                                    if (val > 0 && (!editingSkill.stunType || editingSkill.stunType.length === 0)) {
                                      handleUpdateSkillField('stunType', ['physical', 'mental', 'affliction', 'chakra']);
                                    }
                                  }}
                                  className="w-20 px-2 py-1.5 bg-slate-900 border border-purple-900/60 focus:border-purple-500 rounded-lg text-purple-400 font-mono text-xs text-center font-bold"
                                />
                                <span className="text-[10px] text-slate-400 font-mono">Duração em turnos</span>
                              </div>

                              <div className="flex items-center gap-1.5 pt-1.5 border-t border-purple-900/20 mt-2">
                                <span className="text-[9px] text-purple-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.stunTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('stunTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-purple-900/50 rounded text-[10px] font-mono text-purple-300 focus:border-purple-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>

                              {(editingSkill.stunTurns || 0) > 0 && (
                                <div className="space-y-2 pt-1 border-t border-purple-900/20 mt-2">
                                  <div className="flex items-center justify-between">
                                    <span className="block text-[9px] text-slate-400 font-mono uppercase font-bold">Tipo de Atordoamento:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const allTypes: ('physical' | 'mental' | 'affliction' | 'chakra')[] = ['physical', 'mental', 'affliction', 'chakra'];
                                        const isAllSelected = (editingSkill.stunType || []).length >= 4;
                                        handleUpdateSkillField('stunType', isAllSelected ? ['physical'] : allTypes);
                                      }}
                                      className="text-[9px] px-2 py-0.5 rounded bg-purple-900/50 hover:bg-purple-800 text-purple-300 font-mono font-bold border border-purple-700/60 transition-all cursor-pointer select-none"
                                    >
                                      {(editingSkill.stunType || []).length >= 4 ? '❌ Desmarcar Todos' : '⚡ Stun Completo (Todos)'}
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                      { value: 'physical', label: '⚔️ Stun Físico', desc: 'Impacto marcial / corporal' },
                                      { value: 'mental', label: '🧠 Stun Mental', desc: 'Genjutsu / efeito de ilusão' },
                                      { value: 'affliction', label: '🩸 Stun Aflição', desc: 'Hemorragia / venenos / dor' },
                                      { value: 'chakra', label: '🌀 Stun Chakra', desc: 'Selamento / corte de fluxo' },
                                    ].map((opt) => {
                                      const currentTypes = editingSkill.stunType || [];
                                      const isSelected = currentTypes.includes(opt.value as any);
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() => {
                                            const updated = isSelected
                                              ? currentTypes.filter(t => t !== opt.value)
                                              : [...currentTypes, opt.value];
                                            handleUpdateSkillField('stunType', updated);
                                          }}
                                          className={`p-1.5 text-left rounded-lg border transition-all ${
                                            isSelected
                                              ? 'bg-purple-950 border-purple-500 text-purple-200 font-bold shadow-md shadow-purple-950/60'
                                              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                                          }`}
                                        >
                                          <div className="text-[10px] font-mono">{opt.label}</div>
                                          <div className="text-[8px] text-slate-500 font-mono leading-tight mt-0.5">{opt.desc}</div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="text-[9px] text-slate-400 font-mono leading-normal bg-purple-950/20 border border-purple-900/30 p-2 rounded-lg mt-1">
                                    🎯 <span className="font-bold text-purple-300">Resumo:</span> Ao usar esta habilidade, o alvo receberá <span className="text-purple-400 font-bold font-mono">{editingSkill.stunTurns} {editingSkill.stunTurns === 1 ? 'turno' : 'turnos'}</span> de <span className="text-pink-400 font-bold font-mono uppercase">{(editingSkill.stunType && editingSkill.stunType.length > 0) ? editingSkill.stunType.map(t => t === 'physical' ? 'Físico' : t === 'mental' ? 'Mental' : t === 'affliction' ? 'Aflição' : 'Chakra').join(' + ') : 'Stun'}</span>.
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.stunIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('stunIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.stunRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('stunRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 5. Destruir Escudo / Defesa */}
                          <div className="space-y-1 bg-slate-950/20 border border-slate-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-500 font-mono mb-1">Destruir Defesa</label>
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.removeShield || false}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      handleUpdateSkillField('removeShield', checked);
                                      if (checked && !editingSkill.removeShieldDuration) {
                                        handleUpdateSkillField('removeShieldDuration', 1);
                                      }
                                    }}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-slate-950 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 border border-slate-800"></div>
                                  <span className="ml-2 text-xs font-semibold font-mono text-slate-400 peer-checked:text-amber-500">
                                    {editingSkill.removeShield ? 'DESTRÓI ESCUDO' : 'Inativo'}
                                  </span>
                                </label>
                                {editingSkill.removeShield && (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      value={editingSkill.removeShieldDuration || 1}
                                      onChange={(e) => handleUpdateSkillField('removeShieldDuration', parseInt(e.target.value) || 1)}
                                      className="w-14 px-1.5 py-1 bg-slate-900 border border-amber-900/60 focus:border-amber-500 rounded text-center text-xs font-mono text-amber-400 font-bold"
                                    />
                                    <span className="text-[9px] text-slate-500 font-mono">Turnos</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.removeShieldIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('removeShieldIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.removeShieldRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('removeShieldRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 6. Ganho de Chakra */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-400 font-mono">Gerar Chakra</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.gainChakra || 0}
                                  onChange={(e) => handleUpdateSkillField('gainChakra', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.gainChakraDuration || 1}
                                  onChange={(e) => handleUpdateSkillField('gainChakraDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-800/60">
                                <span className="text-[9px] text-blue-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.gainChakraTarget || 'Self'}
                                  onChange={(e) => handleUpdateSkillField('gainChakraTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-slate-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.gainChakraIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('gainChakraIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-blue-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.gainChakraRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('gainChakraRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 7. Dreno de Chakra */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-400 font-mono">Drenar Chakra</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.drainChakra || 0}
                                  onChange={(e) => handleUpdateSkillField('drainChakra', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.drainChakraDuration || 1}
                                  onChange={(e) => handleUpdateSkillField('drainChakraDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-800/60">
                                <span className="text-[9px] text-teal-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.drainChakraTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('drainChakraTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-slate-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.drainChakraIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('drainChakraIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-teal-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.drainChakraRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('drainChakraRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 8. Escudo (Shield) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Adicionar Escudo (Shield)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.shieldVal || 0}
                                  onChange={(e) => handleUpdateSkillField('shieldVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={editingSkill.shieldDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('shieldDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                  title="Turnos de duração. Deixe em branco para infinito."
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-800/60">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">🎯 Aplicar Buffs/Escudos em:</span>
                                <select
                                  value={editingSkill.shieldTarget || 'Self'}
                                  onChange={(e) => handleUpdateSkillField('shieldTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-slate-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.shieldIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('shieldIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-slate-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.shieldRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('shieldRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 9. Redução de Dano (Guard) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Redução de Dano (Guard)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.damageReductionVal || 0}
                                  onChange={(e) => handleUpdateSkillField('damageReductionVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.damageReductionDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('damageReductionDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <p className="text-[8px] text-slate-500 font-mono">Usa o mesmo alvo configurado em "Adicionar Escudo"</p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageReductionIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageReductionIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-slate-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.damageReductionRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('damageReductionRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 10. Bônus de Dano (Buff) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Bônus de Dano (Buff)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.damageBuffVal || 0}
                                  onChange={(e) => handleUpdateSkillField('damageBuffVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.damageBuffDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('damageBuffDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <p className="text-[8px] text-slate-500 font-mono">Usa o mesmo alvo configurado em "Adicionar Escudo"</p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageBuffIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageBuffIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-slate-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.damageBuffRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('damageBuffRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 11. Dano por Turno (DoT) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-orange-400 font-mono">Dano por Turno (DoT)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={editingSkill.dotVal || 0}
                                  onChange={(e) => handleUpdateSkillField('dotVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.dotDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('dotDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-orange-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.dotTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('dotTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-slate-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.dotIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('dotIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.dotRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('dotRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 12. Invulnerabilidade */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">Invulnerabilidade (Desvio)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={3}
                                  value={editingSkill.invulnerableDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('invulnerableDuration', parseInt(e.target.value) || 0)}
                                  className="w-20 px-2 py-1.5 bg-slate-900 border border-cyan-900/60 focus:border-cyan-500 rounded-lg text-cyan-400 font-mono text-xs text-center font-bold"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <p className="text-[8px] text-slate-500 font-mono">Usa o mesmo alvo configurado em "Adicionar Escudo"</p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.invulnerableIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('invulnerableIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.invulnerableRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('invulnerableRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 13. Sangramento (Bleeding) */}
                          <div className="space-y-1 bg-red-950/10 border border-red-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono">🩸 Sangramento (Bleeding)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.bleedingVal || 0}
                                  onChange={(e) => handleUpdateSkillField('bleedingVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-red-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.bleedingDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('bleedingDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-red-900/60 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-red-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.bleedingTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('bleedingTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-red-900/50 rounded text-[10px] font-mono text-red-300 focus:border-red-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.bleedingIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('bleedingIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.bleedingRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('bleedingRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 14. Aflição (Affliction) */}
                          <div className="space-y-1 bg-purple-950/10 border border-purple-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">💜 Aflição (Affliction)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.afflictionVal || 0}
                                  onChange={(e) => handleUpdateSkillField('afflictionVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-purple-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.afflictionDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('afflictionDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-purple-900/60 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-purple-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.afflictionTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('afflictionTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-purple-900/50 rounded text-[10px] font-mono text-purple-300 focus:border-purple-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.afflictionIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('afflictionIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.afflictionRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('afflictionRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 15. Paralisar Cooldown */}
                          <div className="space-y-1 bg-amber-950/10 border border-amber-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-500 font-mono">⏳ Paralisar Cooldown</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  value={editingSkill.paralyzeCooldownDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('paralyzeCooldownDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-amber-500 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.paralyzeCooldownTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('paralyzeCooldownTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-amber-900/50 rounded text-[10px] font-mono text-amber-300 focus:border-amber-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.paralyzeCooldownIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('paralyzeCooldownIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.paralyzeCooldownRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('paralyzeCooldownRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 16. Invisível para o Oponente */}
                          <div className="space-y-1 bg-slate-950/20 border border-slate-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-pink-400 font-mono mb-1">Invisível ao Oponente</label>
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.invisible || false}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      handleUpdateSkillField('invisible', checked);
                                      if (checked && !editingSkill.invisibleDuration) {
                                        handleUpdateSkillField('invisibleDuration', 1);
                                      }
                                    }}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-900 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-slate-950 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-500 border border-slate-800"></div>
                                  <span className="ml-2 text-xs font-semibold font-mono text-slate-400 peer-checked:text-pink-500">
                                    {editingSkill.invisible ? 'INVISÍVEL' : 'Visível'}
                                  </span>
                                </label>
                                {editingSkill.invisible && (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      value={editingSkill.invisibleDuration || 1}
                                      onChange={(e) => handleUpdateSkillField('invisibleDuration', parseInt(e.target.value) || 1)}
                                      className="w-14 px-1.5 py-1 bg-slate-900 border border-pink-900/60 focus:border-pink-500 rounded text-center text-xs font-mono text-pink-400 font-bold"
                                    />
                                    <span className="text-[9px] text-slate-500 font-mono">Turnos</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.invisibleIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('invisibleIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-pink-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.invisibleRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('invisibleRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600"
                                  >
                                    <option value="none">Nenhum</option>
                                    <option value="all">Todos</option>
                                    <option value="buff">Buffs</option>
                                    <option value="debuff">Debuffs</option>
                                    <option value="stun">Stuns</option>
                                    <option value="dot">DoTs</option>
                                    <option value="bleeding">Sangra</option>
                                    <option value="affliction">Aflição</option>
                                    <option value="shield">Escudo</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-sm font-mono flex flex-col items-center justify-center min-h-[400px]">
              <Database className="w-12 h-12 text-slate-700 mb-3" />
              Selecione um personagem na barra lateral ou clique em "+ Novo" para criar um novo combatente lendário.
            </div>
          )}
        </section>
      </main>
      )}

      {/* Footnote */}
      <footer className="bg-slate-950 border-t border-slate-900 px-6 py-4 text-center text-[10px] text-slate-500 font-mono z-10">
        Desenvolvido com o Unison Engine. As customizações são salvas no servidor em tempo real e sincronizadas com todos os dispositivos!
      </footer>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                playClickSound();
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
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
                      {confirmModal.title}
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-800 font-bold leading-relaxed max-w-xs mx-auto">
                    {confirmModal.message}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-1">
                  <button
                    onClick={() => {
                      playClickSound();
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#d3ad75]/90 hover:bg-[#c49a5d] text-stone-950 font-black text-xs uppercase tracking-wider border-2 border-[#7a4e25] shadow-md transition cursor-pointer active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      playClickSound();
                      confirmModal.onConfirm();
                    }}
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
