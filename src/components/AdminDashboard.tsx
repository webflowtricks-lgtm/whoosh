/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Shield, Plus, Trash2, Edit3, Save, 
  Database, RefreshCw, AlertTriangle, CheckCircle, Sparkles, User, HelpCircle, Shirt,
  Lock, Unlock, Search, Trophy, Award, X, Download, Upload, FolderArchive, FileText, Server, CheckCircle2,
  GripVertical, ArrowUp, ArrowDown, Image
} from 'lucide-react';
import { Character, Skill, ChakraType, CharacterSkin, Quest } from '../types';
import { getCharacters, saveCharacters, resetToDefaultCharacters, fetchCharactersFromServer } from '../lib/characterStorage';
import { RankConfig, getRanks, saveRanks, fetchRanksFromServer, RANK_GRADIENT_PRESETS } from '../lib/rankStorage';
import { safeFetchJson } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import QuestAdmin from './QuestAdmin';
import ShopAdmin from './ShopAdmin';
import EventAdmin from './EventAdmin';
import { useLanguage } from '../lib/i18n';

const TARGET_OPTIONS = [
  { value: 'Target', label: 'Alvo Principal' },
  { value: 'Self', label: 'Conjurador (Mim)' },
  { value: 'Both', label: 'Ambos (Mim e Alvo)' },
  { value: 'SelfAndAlly', label: 'Mim e um Aliado (à escolha)' },
  { value: 'Ally', label: 'Aliado (Outra Pessoa)' },
  { value: 'AllAllies', label: 'Toda Minha Equipe' },
  { value: 'AllEnemies', label: 'Todos os Inimigos' },
  { value: 'AnyLiving', label: 'Qualquer Personagem Vivo (à escolha)' },
  { value: 'AllLiving', label: 'Todos os Personagens Vivos' },
  { value: 'AllNonInvulnerable', label: 'Todos os Personagens NÃO Invulneráveis' },
  { value: 'AllInvulnerable', label: 'Todos os Personagens Invulneráveis' },
  { value: 'OneInvulnerable', label: 'Um Personagem Invulnerável' },
  { value: 'OneInvulnerableAlly', label: 'Um Aliado Invulnerável' },
  { value: 'SelfAndAllEnemies', label: 'Mim e Todos os Inimigos' },
  { value: 'RandomEnemy', label: 'Inimigo Aleatório' },
  { value: 'RandomAlly', label: 'Aliado Aleatório' },
  { value: 'AllEnemiesExceptTarget', label: 'Todos os Inimigos (menos o Alvo Principal)' },
  { value: 'AllAlliesExceptTarget', label: 'Todos os Aliados (menos o Alvo Aliado)' },
];

const DAMAGE_TYPE_OPTIONS = [
  { key: 'physical', label: 'Físico' },
  { key: 'chakra', label: 'Chakra' },
  { key: 'mental', label: 'Mental' },
  { key: 'affliction', label: 'Aflição' },
  { key: 'ranged', label: 'Alcance' },
  { key: 'friendly', label: 'Amigável' },
  { key: 'direct_damage', label: 'Perfuração' },
  { key: 'damage', label: 'Dano Normal' },
  { key: 'dot', label: 'Queimadura' },
  { key: 'bleeding', label: 'Sangramento' },
  { key: 'life_steal', label: 'Roubo de Vida' },
];

function DamageTypeToggles({ selected, onChange, title, activeClass, checkClass, hoverClass }: {
  selected: string[];
  onChange: (next: string[]) => void;
  title: string;
  activeClass: string;
  checkClass: string;
  hoverClass: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 w-full pt-1">
      <span className="text-[9px] text-slate-400 uppercase font-bold">{title}:</span>
      {DAMAGE_TYPE_OPTIONS.map(opt => (
        <label key={opt.key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer select-none border transition-all ${selected.includes(opt.key) ? activeClass : `bg-slate-900 border-slate-800 text-slate-400 ${hoverClass}`}`}>
          <input
            type="checkbox"
            checked={selected.includes(opt.key)}
            onChange={() => {
              const next = selected.includes(opt.key) ? selected.filter(c => c !== opt.key) : [...selected, opt.key];
              onChange(next.length > 0 ? next : undefined);
            }}
            className={`rounded bg-slate-950 focus:ring-0 w-3 h-3 ${checkClass}`}
          />
          <span className="text-[9px] font-mono">{opt.label}</span>
        </label>
      ))}
      <span className="text-[9px] text-slate-500 italic">(nenhuma marcada = todos os tipos)</span>
    </div>
  );
}

interface AdminDashboardProps {
  onBack: () => void;
  playClickSound: () => void;
}

export default function AdminDashboard({ onBack, playClickSound }: AdminDashboardProps) {
  const { t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [activeTab, setActiveTab] = useState<'ninjas' | 'quests' | 'shop' | 'events' | 'ranks' | 'backup'>('ninjas');

  // Character list state loaded from storage
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [charSearch, setCharSearch] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [orderChanged, setOrderChanged] = useState(false);
  
  // Backup & Multi-Environment Import state
  const [importedConfigData, setImportedConfigData] = useState<any | null>(null);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  
  // Feedback messages
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [invulnClassInput, setInvulnClassInput] = useState('');

  // Editing forms state
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [editingSkillIndex, setEditingSkillIndex] = useState<number | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  // Raw text draft for the tags field so typing commas/spaces is not disrupted
  const [tagsDraft, setTagsDraft] = useState('');
  useEffect(() => {
    setTagsDraft((editingChar?.tags || []).join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingChar?.id]);

  // Quest Autocomplete state for character lock requirements
  const [allQuests, setAllQuests] = useState<Quest[]>([]);
  const [questSearchInput, setQuestSearchInput] = useState('');
  const [showQuestSuggestions, setShowQuestSuggestions] = useState(false);

  // Ranks Management state
  const [ranksList, setRanksList] = useState<RankConfig[]>([]);
  const [presetModalIndex, setPresetModalIndex] = useState<number | null>(null);
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<string>('Todos');
  const [presetSearch, setPresetSearch] = useState<string>('');
  const [draggedRankIndex, setDraggedRankIndex] = useState<number | null>(null);
  const [dragOverRankIndex, setDragOverRankIndex] = useState<number | null>(null);

  const handleRankMove = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= ranksList.length) return;
    const updated = [...ranksList];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedItem);
    setRanksList(updated);
  };

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
      if (sk.damageReductionPierceVal) names.add(`${sk.name} AntiPerfuração`);
      if (sk.skillCopyDuration) names.add(`${sk.name} (Cópia de Habilidades)`);
      if (sk.damageBuffVal) names.add(`${sk.name} Power`);
      if (sk.dotVal) names.add(`${sk.name} Burn`);
      if (sk.bleedingVal) names.add(`${sk.name} Bleed`);
      if (sk.afflictionVal) names.add(`${sk.name} Affliction`);
      if (sk.blocksOffensiveSkills) names.add(`${sk.name} Impedimento Ofensivo`);
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
      setEditingChar(JSON.parse(JSON.stringify(loaded[0])));
    }

    fetchCharactersFromServer().then(serverLoaded => {
      if (serverLoaded && serverLoaded.length > 0) {
        setCharacters(serverLoaded);
        setSelectedCharacterId(prev => {
          const targetId = prev || serverLoaded[0].id;
          const found = serverLoaded.find(c => c.id === targetId) || serverLoaded[0];
          setEditingChar(JSON.parse(JSON.stringify(found)));
          return found.id;
        });
      }
    }).catch(() => {});

    // Fetch quests for autocomplete
    safeFetchJson<{ success?: boolean; quests?: Quest[] }>('/api/quests')
      .then(data => {
        if (data && data.success && Array.isArray(data.quests)) {
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

  // Backup & Import Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && typeof json === 'object') {
          setImportedConfigData(json);
          triggerSuccess(`Arquivo "${file.name}" carregado. Revise o resumo dos dados antes de sincronizar.`);
        } else {
          triggerError('O arquivo selecionado não contém uma estrutura de JSON válida.');
        }
      } catch (err) {
        triggerError('Erro ao interpretar o arquivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleExportConfig = async () => {
    playClickSound();
    try {
      const res = await fetch('/api/config/export');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `naruto-config-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        triggerSuccess('Backup das configurações exportado com sucesso!');
      } else {
        triggerError('Falha ao exportar arquivo de configuração do servidor.');
      }
    } catch (err) {
      triggerError('Erro de conexão ao exportar configurações.');
    }
  };

  const handleApplyImportedConfig = async () => {
    if (!importedConfigData) return;
    playClickSound();
    setIsImporting(true);

    try {
      const res = await fetch('/api/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importedConfigData)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        // Sync client-side local cache & states immediately
        if (Array.isArray(importedConfigData.characters)) {
          await saveCharacters(importedConfigData.characters);
          setCharacters(getCharacters());
        }
        if (Array.isArray(importedConfigData.ranks)) {
          saveRanks(importedConfigData.ranks);
          setRanksList(importedConfigData.ranks);
        }

        triggerSuccess(result.message || 'Configurações importadas e aplicadas neste ambiente com sucesso!');
        setImportedConfigData(null);
        setImportFileName('');
      } else {
        triggerError(result.error || 'Erro ao importar configurações no servidor.');
      }
    } catch (err) {
      triggerError('Erro de comunicação com o servidor ao importar dados.');
    } finally {
      setIsImporting(false);
    }
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
  const handleSaveCharacter = async () => {
    if (!editingChar) return;
    playClickSound();

    // Sync pending skill edit back to character before saving
    let charToSave = editingChar;
    if (editingSkillIndex !== null && editingSkill) {
      const updatedSkills = [...editingChar.skills];
      updatedSkills[editingSkillIndex] = editingSkill;
      charToSave = { ...editingChar, skills: updatedSkills };
    }

    const formattedId = charToSave.id.trim().toLowerCase().replace(/\s+/g, '-');
    if (!formattedId) {
      triggerError('O ID do personagem não pode estar vazio.');
      return;
    }
    if (!charToSave.name.trim()) {
      triggerError('O Nome do personagem não pode estar vazio.');
      return;
    }

    // Check if ID is already used by another character
    const isIdDuplicate = characters.some(c => c.id === formattedId && c.id !== selectedCharacterId);
    if (isIdDuplicate) {
      triggerError(`Já existe outro personagem cadastrado com o ID "${formattedId}". Escolha um ID único.`);
      return;
    }

    const updatedChar = { ...charToSave, id: formattedId };

    // Check if selected character exists in list
    const originalIndex = characters.findIndex(c => c.id === selectedCharacterId);
    let updatedList: Character[];

    if (originalIndex >= 0) {
      // Replace existing character at its position (even if ID changed)
      updatedList = [...characters];
      updatedList[originalIndex] = updatedChar;
    } else {
      // Append new character
      updatedList = [...characters, updatedChar];
    }

    setCharacters(updatedList);
    setSelectedCharacterId(formattedId);
    setEditingChar(updatedChar);
    await saveCharacters(updatedList);
    triggerSuccess(`Personagem "${updatedChar.name}" (${formattedId}) salvo com sucesso!`);
  };

  // Add a new character from scratch
  const handleAddNewCharacter = async () => {
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
    setSelectedCharacterId(newId);
    setEditingChar(newChar);
    await saveCharacters(updatedList);
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
      async () => {
        const updatedList = characters.filter(c => c.id !== charId);
        setCharacters(updatedList);
        
        if (updatedList.length > 0) {
          setSelectedCharacterId(updatedList[0].id);
        } else {
          setSelectedCharacterId('');
          setEditingChar(null);
        }
        await saveCharacters(updatedList);
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
      async () => {
        const defaults = await resetToDefaultCharacters();
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

  // Helper to pre-populate skill attributes (returns exact skill object)
  const fillLegacySkillAttributes = (skill: Skill): Skill => {
    return { ...skill };
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
  classes: ['Chakra', 'À Distância'],
  blocksOffensiveSkills: false,
  stackable: false,
  stackType: '',
  stackDuration: undefined,
  stackTarget: 'Target'
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
      [field]: value === undefined ? null : value
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

  // Render a visual tag for chakra costs (with +/- for multiple of same type)
  const renderChakraButton = (type: ChakraType, isActive: boolean) => {
    const bgColors: Record<ChakraType, string> = {
      Tai: 'bg-green-500/20 border-green-500 text-green-400',
      Nin: 'bg-blue-500/20 border-blue-500 text-blue-400',
      Gen: 'bg-white/10 border-white/40 text-white',
      Blood: 'bg-red-500/20 border-red-500 text-red-400',
      Rand: 'bg-slate-700/30 border-slate-600 text-slate-400'
    };
    const count = editingSkill.cost.filter(c => c === type).length;

    return (
      <div key={type} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-mono font-bold transition-all ${
        isActive ? bgColors[type] : 'bg-slate-900/60 border-slate-800 text-slate-500'
      }`}>
        <button
          type="button"
          onClick={() => {
            if (!editingSkill) return;
            const idx = editingSkill.cost.indexOf(type);
            if (idx > -1) {
              const newCost = [...editingSkill.cost];
              newCost.splice(idx, 1);
              handleUpdateSkillField('cost', newCost);
            }
          }}
          className="opacity-60 hover:opacity-100 text-[10px] w-4 h-4 flex items-center justify-center cursor-pointer disabled:opacity-20"
          disabled={!isActive}
        >
          -
        </button>
        <span className="flex items-center gap-1 min-w-[40px] justify-center">
          <span className={`w-2 h-2 rounded-full ${
            type === 'Tai' ? 'bg-green-500' :
            type === 'Nin' ? 'bg-blue-500' :
            type === 'Gen' ? 'bg-white' :
            type === 'Blood' ? 'bg-red-500' : 'bg-slate-600'
          }`} />
          <span>{type} {count > 1 ? `×${count}` : ''}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            if (!editingSkill) return;
            const newCost = [...editingSkill.cost];
            if (newCost.length >= 4) {
              triggerError('O custo máximo é de 4 chakras por habilidade.');
              return;
            }
            newCost.push(type);
            handleUpdateSkillField('cost', newCost);
          }}
          className="opacity-60 hover:opacity-100 text-[10px] w-4 h-4 flex items-center justify-center cursor-pointer disabled:opacity-20"
          disabled={count >= 4}
        >
          +
        </button>
      </div>
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
              title={t("Voltar ao Menu Principal", "Back to Main Menu")}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-400" />
                <h1 className="text-lg font-black uppercase tracking-tight text-white">{t("Central do Desenvolvedor", "Developer Dashboard")}</h1>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">{t("Customize habilidades, regras e crie novos ninjas", "Customize skills, rules and create new ninjas")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
                {t('Ninjas', 'Ninjas')}
              </button>
              <button
                onClick={() => { playClickSound(); setActiveTab('quests'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'quests'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-slate-200 font-bold'
                }`}
              >
                {t('Missões', 'Quests')}
              </button>
              <button
                onClick={() => { playClickSound(); setActiveTab('shop'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'shop'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-slate-200 font-bold'
                }`}
              >
                {t('Loja', 'Shop')}
              </button>
              <button
                onClick={() => { playClickSound(); setActiveTab('events'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'events'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-slate-200 font-bold'
                }`}
              >
                {t('Eventos', 'Events')}
              </button>
              <button
                onClick={() => { playClickSound(); setActiveTab('ranks'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'ranks'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-slate-200 font-bold'
                }`}
              >
                {t('Ranks & XP', 'Ranks & XP')}
              </button>
              <button
                onClick={() => { playClickSound(); setActiveTab('backup'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'backup'
                    ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-amber-400/90 hover:text-amber-300 font-bold bg-amber-950/30 border border-amber-500/20'
                }`}
              >
                <FolderArchive className="w-3.5 h-3.5" />
                {t('Backup & Ambientes', 'Backup & Environments')}
              </button>
            </div>
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
                key={rank.id || index}
                draggable
                onDragStart={(e) => {
                  setDraggedRankIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedRankIndex !== null && draggedRankIndex !== index) {
                    setDragOverRankIndex(index);
                  }
                }}
                onDragLeave={() => {
                  setDragOverRankIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedRankIndex !== null && draggedRankIndex !== index) {
                    handleRankMove(draggedRankIndex, index);
                  }
                  setDraggedRankIndex(null);
                  setDragOverRankIndex(null);
                }}
                onDragEnd={() => {
                  setDraggedRankIndex(null);
                  setDragOverRankIndex(null);
                }}
                className={`bg-slate-900/60 border rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between transition-all ${
                  dragOverRankIndex === index
                    ? 'border-amber-500/80 bg-amber-500/10 scale-[1.01] shadow-xl'
                    : draggedRankIndex === index
                    ? 'opacity-40 border-dashed border-amber-500/50'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 w-full md:w-auto">
                  {/* Drag Handle & Reorder Arrows */}
                  <div className="flex items-center gap-1">
                    <div
                      className="p-2 text-slate-500 hover:text-amber-400 cursor-grab active:cursor-grabbing hover:bg-slate-800/80 rounded-xl transition flex items-center justify-center"
                      title="Segure e arraste para reordenar este rank"
                    >
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          playClickSound();
                          handleRankMove(index, index - 1);
                        }}
                        className="p-1 text-slate-500 hover:text-amber-400 disabled:opacity-20 disabled:hover:text-slate-500 hover:bg-slate-800/80 rounded transition cursor-pointer"
                        title="Mover para cima"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === ranksList.length - 1}
                        onClick={() => {
                          playClickSound();
                          handleRankMove(index, index + 1);
                        }}
                        className="p-1 text-slate-500 hover:text-amber-400 disabled:opacity-20 disabled:hover:text-slate-500 hover:bg-slate-800/80 rounded transition cursor-pointer"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Rank Badge Preview & Order Indicator */}
                  <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
                    {(() => {
                      const isNone = !rank.color || rank.color === 'none';
                      const bgGradientClass = isNone
                        ? ''
                        : (rank.color.includes('bg-gradient') ? rank.color : `bg-gradient-to-r ${rank.color}`);
                      return (
                        <div
                          className={`relative px-3.5 py-2 rounded-xl border font-black text-xs uppercase tracking-wider flex items-center gap-2 flex-shrink-0 overflow-hidden shadow-lg ${bgGradientClass}`}
                          style={{
                            ...(rank.bgColor ? { backgroundColor: rank.bgColor } : {}),
                            color: rank.fontColor || '#ffffff'
                          }}
                        >
                          {rank.imageUrl && (
                            <img src={rank.imageUrl || null} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                          )}
                          {rank.iconUrl ? (
                            <img src={rank.iconUrl} alt="" className="w-4 h-4 object-contain relative z-10" />
                          ) : (
                            <Award className="w-4 h-4 relative z-10" />
                          )}
                          <span className="relative z-10">{rank.name || 'Sem Nome'}</span>
                        </div>
                      );
                    })()}
                    <span className="text-[10px] font-mono text-slate-500">#{index + 1} - Preview</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-auto flex-1 max-w-3xl">
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
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Estilo de Cor (Degradê)</label>
                    <select
                      value={rank.color || 'none'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = [...ranksList];
                        updated[index] = { 
                          ...updated[index], 
                          color: val, 
                          bgColor: val !== 'none' ? undefined : updated[index].bgColor 
                        };
                        setRanksList(updated);
                      }}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-slate-200 outline-none font-mono"
                    >
                      {Array.from(new Set(RANK_GRADIENT_PRESETS.map(p => p.category))).map(cat => (
                        <optgroup key={cat} label={`--- ${cat.toUpperCase()} ---`}>
                          {RANK_GRADIENT_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.value} value={p.value}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {rank.color && rank.color !== 'none' && !RANK_GRADIENT_PRESETS.some(p => p.value === rank.color) && (
                        <option value={rank.color}>Customizado: {rank.color}</option>
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        setPresetModalIndex(index);
                        setPresetSearch('');
                        setPresetCategoryFilter('Todos');
                      }}
                      className="mt-1.5 w-full py-1.5 px-2 bg-slate-800/80 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-slate-700 hover:border-amber-500/50 rounded-xl text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Galeria de Degradês ({RANK_GRADIENT_PRESETS.length} Opções)</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-amber-400 mb-1">Cor do Fundo (# Hex - Opcional)</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={rank.bgColor || '#0f172a'}
                        onChange={(e) => {
                          const updated = [...ranksList];
                          updated[index] = { ...updated[index], bgColor: e.target.value };
                          setRanksList(updated);
                        }}
                        className="w-9 h-9 p-0.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer"
                        title="Escolher cor sólida em Hex"
                      />
                      <input
                        type="text"
                        value={rank.bgColor || ''}
                        onChange={(e) => {
                          const updated = [...ranksList];
                          updated[index] = { ...updated[index], bgColor: e.target.value || undefined };
                          setRanksList(updated);
                        }}
                        placeholder="Sem cor (Usando degradê)"
                        className="flex-1 min-w-0 px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white outline-none font-mono"
                      />
                      {rank.bgColor && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...ranksList];
                            updated[index] = { ...updated[index], bgColor: undefined };
                            setRanksList(updated);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-950 border border-slate-800 hover:border-red-500/50 rounded-xl transition flex items-center gap-1 text-[10px] font-mono flex-shrink-0"
                          title="Remover cor hex e reativar degradê"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-amber-400 mb-1">Ícone do Rank (SVG, PNG, URL)</label>
                    <div className="flex gap-1.5 items-center">
                      <div className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 p-1 flex items-center justify-center flex-shrink-0">
                        {rank.iconUrl ? (
                          <img src={rank.iconUrl} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Award className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <input
                        type="text"
                        value={rank.iconUrl || ''}
                        onChange={(e) => {
                          const updated = [...ranksList];
                          updated[index] = { ...updated[index], iconUrl: e.target.value || undefined };
                          setRanksList(updated);
                        }}
                        placeholder="URL ou envie arquivo"
                        className="flex-1 min-w-0 px-2.5 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white outline-none font-mono"
                      />
                      <label className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-[10px] font-mono font-bold uppercase cursor-pointer transition flex items-center gap-1 flex-shrink-0">
                        <Upload className="w-3.5 h-3.5 text-amber-400" />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept=".svg,.png,.jpg,.jpeg,.webp,image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (uploadEvt) => {
                                const result = uploadEvt.target?.result as string;
                                if (result) {
                                  const updated = [...ranksList];
                                  updated[index] = { ...updated[index], iconUrl: result };
                                  setRanksList(updated);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      {rank.iconUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...ranksList];
                            updated[index] = { ...updated[index], iconUrl: undefined };
                            setRanksList(updated);
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-400 bg-slate-950 border border-slate-800 hover:border-red-500/50 rounded-xl transition"
                          title="Remover ícone personalizado (usar medalha)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Cor da Fonte (hex)</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={rank.fontColor || '#fbbf24'}
                        onChange={(e) => {
                          const updated = [...ranksList];
                          updated[index] = { ...updated[index], fontColor: e.target.value };
                          setRanksList(updated);
                        }}
                        className="w-9 h-9 p-0.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer"
                      />
                      <input
                        type="text"
                        value={rank.fontColor || '#fbbf24'}
                        onChange={(e) => {
                          const updated = [...ranksList];
                          updated[index] = { ...updated[index], fontColor: e.target.value || undefined };
                          setRanksList(updated);
                        }}
                        placeholder="#fbbf24"
                        className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white outline-none font-mono"
                      />
                    </div>
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

          {/* Rank Gradient Gallery Modal */}
          <AnimatePresence>
            {presetModalIndex !== null && ranksList[presetModalIndex] && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
                >
                  {/* Modal Header */}
                  <div className="p-4 md:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                        <Sparkles className="w-5 h-5" />
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-white uppercase font-mono tracking-wider">
                          Galeria de Degradês — {ranksList[presetModalIndex].name}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono">
                          Selecione entre as {RANK_GRADIENT_PRESETS.length} combinações de degradê do jogo.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPresetModalIndex(null)}
                      className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Filter Controls */}
                  <div className="p-4 border-b border-slate-800/80 bg-slate-900/90 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    {/* Search input */}
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Buscar degradê..."
                        value={presetSearch}
                        onChange={(e) => setPresetSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-xs text-white outline-none font-mono"
                      />
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                      {['Todos', 'Clássicos', 'Elementais & Natureza', 'Místicos & Lendários', 'Neon & Vibrantes', 'Metálicos & Especiais'].map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setPresetCategoryFilter(cat)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-mono font-bold whitespace-nowrap transition cursor-pointer ${
                            presetCategoryFilter === cat
                              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gallery Grid */}
                  <div className="p-4 md:p-6 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {RANK_GRADIENT_PRESETS.filter((p) => {
                      const matchesCat = presetCategoryFilter === 'Todos' || p.category === presetCategoryFilter;
                      const matchesSearch = p.name.toLowerCase().includes(presetSearch.toLowerCase()) || p.category.toLowerCase().includes(presetSearch.toLowerCase());
                      return matchesCat && matchesSearch;
                    }).map((preset) => {
                      const isSelected = ranksList[presetModalIndex].color === preset.value;
                      return (
                        <button
                          key={preset.name + preset.value}
                          onClick={() => {
                            playClickSound();
                            const updated = [...ranksList];
                            updated[presetModalIndex] = { 
                              ...updated[presetModalIndex], 
                              color: preset.value,
                              bgColor: preset.value !== 'none' ? undefined : updated[presetModalIndex].bgColor
                            };
                            setRanksList(updated);
                            setPresetModalIndex(null);
                          }}
                          className={`group p-3 rounded-2xl border text-left transition cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[96px] ${
                            isSelected
                              ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.25)] ring-2 ring-amber-400/50'
                              : 'border-slate-800 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-950'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono font-bold uppercase text-slate-400">
                              {preset.category}
                            </span>
                            {isSelected && (
                              <span className="text-[9px] font-mono font-extrabold text-amber-400 bg-amber-950 px-2 py-0.5 rounded-full border border-amber-500/40">
                                Selecionado
                              </span>
                            )}
                          </div>

                          {/* Badge Preview */}
                          {(() => {
                            const isPresetNone = preset.value === 'none';
                            const presetBgClass = isPresetNone
                              ? ''
                              : (preset.value.includes('bg-gradient') ? preset.value : `bg-gradient-to-r ${preset.value}`);
                            return (
                              <div
                                className={`px-3 py-1.5 rounded-xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md relative overflow-hidden ${presetBgClass}`}
                                style={{
                                  ...(isPresetNone && ranksList[presetModalIndex].bgColor ? { backgroundColor: ranksList[presetModalIndex].bgColor } : {}),
                                  color: ranksList[presetModalIndex].fontColor || '#ffffff'
                                }}
                              >
                                {ranksList[presetModalIndex].imageUrl && (
                                  <img src={ranksList[presetModalIndex].imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
                                )}
                                {ranksList[presetModalIndex].iconUrl ? (
                                  <img src={ranksList[presetModalIndex].iconUrl} alt="" className="w-4 h-4 object-contain flex-shrink-0 relative z-10" />
                                ) : (
                                  <Award className="w-4 h-4 flex-shrink-0 relative z-10" />
                                )}
                                <span className="truncate relative z-10">{ranksList[presetModalIndex].name || preset.name}</span>
                              </div>
                            );
                          })()}

                          <div className="mt-2 text-[10px] font-mono text-slate-400 group-hover:text-amber-300 truncate">
                            {preset.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Modal Footer */}
                  <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-between items-center">
                    <span className="text-xs font-mono text-slate-400">
                      Mostrando {RANK_GRADIENT_PRESETS.filter((p) => {
                        const matchesCat = presetCategoryFilter === 'Todos' || p.category === presetCategoryFilter;
                        const matchesSearch = p.name.toLowerCase().includes(presetSearch.toLowerCase()) || p.category.toLowerCase().includes(presetSearch.toLowerCase());
                        return matchesCat && matchesSearch;
                      }).length} opções de degradês
                    </span>
                    <button
                      onClick={() => setPresetModalIndex(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
                    >
                      Fechar Galeria
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>
      ) : activeTab === 'backup' ? (
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 z-10 space-y-6">
          {/* Header Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FolderArchive className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold uppercase tracking-wider text-white font-mono">Migração de Ambientes & Backup Global</h2>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Exporte todas as configurações deste ambiente (Ninjas, Habilidades, Missões, Loja, Eventos, Ranks) para um arquivo JSON e faça upload em qualquer outro servidor de testes ou produção.
              </p>
            </div>
            <button
              onClick={handleExportConfig}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10 whitespace-nowrap"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              Baixar Backup (.JSON)
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Card 1: Export Settings */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-400 mb-2 font-bold text-sm uppercase tracking-wider">
                  <Download className="w-4 h-4" />
                  1. Exportar Configurações
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Gera um arquivo <code className="text-amber-300 font-mono bg-slate-950 px-1.5 py-0.5 rounded">.json</code> completo com todas as suas personalizações atuais. Use este arquivo para salvar um ponto de restauração ou para migrar para outros servidores de backend.
                </p>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Conteúdo Incluído no Backup:</span>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">🥷</span> {characters.length} Personagens
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">🏆</span> {ranksList.length} Ranks & XP
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">📜</span> Missões e Desafios
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">🛍️</span> Catálogo da Loja
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">🎪</span> Eventos & Banners
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">🖼️</span> Molduras de Perfil
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleExportConfig}
                className="w-full py-3 bg-slate-950 border border-slate-700 hover:border-amber-500 hover:text-amber-400 text-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                <Download className="w-4 h-4" />
                Exportar Configuração Completa
              </button>
            </div>

            {/* Card 2: Import Settings */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-cyan-400 mb-2 font-bold text-sm uppercase tracking-wider">
                  <Upload className="w-4 h-4" />
                  2. Importar & Sincronizar (.JSON)
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Selecione um arquivo de backup para aplicar instantaneamente todas as missões, personagens, habilidades e ranks neste ambiente de testes sem precisar recriá-los do zero.
                </p>

                {/* Upload Input Area */}
                <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 bg-slate-950/40 hover:bg-slate-950/80 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
                  <Upload className="w-6 h-6 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-200">
                    {importFileName ? `Arquivo: ${importFileName}` : 'Clique para selecionar o arquivo .json'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Suporta backups gerados pelo Painel de Controle</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>

                {/* File Contents Preview */}
                {importedConfigData && (
                  <div className="mt-4 p-4 bg-cyan-950/30 border border-cyan-500/30 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-cyan-300">
                      <span>Resumo do Arquivo Carregado:</span>
                      <span className="text-[10px] font-mono text-cyan-400">{importedConfigData.exportDate ? new Date(importedConfigData.exportDate).toLocaleDateString() : 'Válido'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs font-mono text-slate-300 pt-1">
                      {importedConfigData.characters && <div>• {importedConfigData.characters.length} Personagens</div>}
                      {importedConfigData.quests && <div>• {importedConfigData.quests.length} Missões</div>}
                      {importedConfigData.shop && <div>• {importedConfigData.shop.length} Itens de Loja</div>}
                      {importedConfigData.events && <div>• {importedConfigData.events.length} Eventos</div>}
                      {importedConfigData.ranks && <div>• {importedConfigData.ranks.length} Ranks/XP</div>}
                    </div>
                  </div>
                )}
              </div>

              <button
                disabled={!importedConfigData || isImporting}
                onClick={handleApplyImportedConfig}
                className={`w-full py-3 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer mt-4 ${
                  importedConfigData && !isImporting
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/10'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                }`}
              >
                <Server className="w-4 h-4" />
                {isImporting ? 'Sincronizando com o Servidor...' : 'Sincronizar e Aplicar neste Ambiente'}
              </button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-start gap-3">
            <Server className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 space-y-1">
              <span className="font-bold text-white block">Dica para Múltiplos Ambientes de Teste:</span>
              <p className="text-slate-400 leading-relaxed">
                Ao implantar a aplicação em um novo servidor ou rodar uma nova instância backend, navegue até esta aba e importe seu arquivo de backup. Todas as tabelas de dados do servidor (<code className="text-amber-400 font-mono">custom_characters.json</code>, <code className="text-amber-400 font-mono">quests.json</code>, <code className="text-amber-400 font-mono">ranks.json</code>, etc.) serão sobrescritas e atualizadas instantaneamente.
              </p>
            </div>
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
                onClick={async () => {
                  setOrderChanged(false);
                  await saveCharacters(characters);
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
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (dragIndex === null || dragIndex === realIdx) return;
                    const updated = [...characters];
                    const [moved] = updated.splice(dragIndex, 1);
                    const dropIdx = updated.findIndex(c => c.id === char.id);
                    if (dropIdx === -1) return;
                    updated.splice(dropIdx, 0, moved);
                    setCharacters(updated);
                    setDragIndex(null);
                    await saveCharacters(updated);
                    triggerSuccess('Ordem salva no banco de exportação!');
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
                        src={char.portrait || null} 
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
                    value={editingChar.id}
                    onChange={(e) => handleUpdateCharDetails('id', e.target.value)}
                    placeholder="E.g. naruto-sennin"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-amber-300 outline-none font-mono text-xs transition-all font-bold"
                  />
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">Identificador único do ninja no sistema. Você pode alterar para personalizá-lo.</span>
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
                   <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Retrato do Personagem</label>
                   <div className="flex gap-1.5 items-center">
                     <div className="w-10 h-10 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center flex-shrink-0">
                       {editingChar?.portrait ? (
                         <img 
                           src={editingChar.portrait} 
                           alt={editingChar.name} 
                           className="w-full h-full object-cover" 
                           referrerPolicy="no-referrer"
                           onError={(e) => {
                             const img = e.currentTarget; 
                             img.onerror = null; 
                             img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                           }}
                         />
                       ) : (
                         <User className="w-5 h-5 text-slate-400" />
                       )}
                     </div>
                     <input
                       type="text"
                       value={editingChar.portrait || ''}
                       onChange={(e) => handleUpdateCharDetails('portrait', e.target.value)}
                       placeholder="URL ou envie arquivo"
                       className="flex-1 min-w-0 px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                     />
                     <label className="px-3 py-2 bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded-xl text-[10px] font-mono font-bold uppercase cursor-pointer transition flex items-center gap-1 flex-shrink-0">
                       <Upload className="w-4 h-4 text-orange-400" />
                       <span>Upload</span>
                       <input
                         type="file"
                         accept=".png,.jpg,.jpeg,.webp,image/*"
                         className="hidden"
                         onChange={(e) => {
                           const file = e.target.files?.[0];
                           if (file) {
                             const reader = new FileReader();
                             reader.onload = (uploadEvt) => {
                               const result = uploadEvt.target?.result as string;
                               if (result) {
                                 handleUpdateCharDetails('portrait', result);
                                 triggerSuccess('Retrato carregado com sucesso!');
                               }
                             };
                             reader.readAsDataURL(file);
                           }
                         }}
                       />
                     </label>
                     {editingChar.portrait && (
                       <button
                         type="button"
                         onClick={() => {
                           handleUpdateCharDetails('portrait', '');
                           triggerSuccess('Retrato personalizado removido.');
                         }}
                         className="p-2 text-slate-500 hover:text-red-400 bg-slate-950 border border-slate-800 hover:border-red-500/50 rounded-xl transition"
                         title="Remover retrato personalizado"
                       >
                         <X className="w-3.5 h-3.5" />
                       </button>
                     )}
                   </div>
                 </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 font-mono">Tags / Afiliações (Separadas por vírgula)</label>
                  <input
                    type="text"
                    value={tagsDraft}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTagsDraft(val);
                      const list = val.split(',').map(s => s.trim()).filter(s => s !== '');
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
                            <img src={skin.image || null} alt={skin.name} className="w-full h-full object-contain" />
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
                             <label className="block text-[8px] font-mono text-slate-400 uppercase">Imagem da Skin</label>
                             <div className="flex gap-1 items-center">
                               <div className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center flex-shrink-0">
                                 {skin.image ? (
                                   <img 
                                     src={skin.image} 
                                     alt={skin.name} 
                                     className="w-full h-full object-contain" 
                                     referrerPolicy="no-referrer"
                                     onError={(e) => {
                                       const img = e.currentTarget; 
                                       img.onerror = null; 
                                       img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg';
                                     }}
                                   />
                                 ) : (
                                   <Image className="w-4 h-4 text-slate-400" />
                                 )}
                               </div>
                               <input
                                 type="text"
                                 value={skin.image || ''}
                                 onChange={(e) => {
                                   const updatedSkins = [...(editingChar.skins || [])];
                                   updatedSkins[skinIdx] = { ...updatedSkins[skinIdx], image: e.target.value };
                                   handleUpdateCharDetails('skins', updatedSkins);
                                 }}
                                 placeholder="URL ou envie arquivo"
                                 className="flex-1 min-w-0 px-2 py-1 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded text-xs text-white outline-none font-mono"
                               />
                               <label className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[8px] font-mono font-bold uppercase cursor-pointer transition flex items-center gap-0.5 flex-shrink-0">
                                 <Upload className="w-3 h-3 text-amber-400" />
                                 <span>Upload</span>
                                 <input
                                   type="file"
                                   accept=".png,.jpg,.jpeg,.webp,image/*"
                                   className="hidden"
                                   onChange={(e) => {
                                     const file = e.target.files?.[0];
                                     if (file) {
                                       const reader = new FileReader();
                                       reader.onload = (uploadEvt) => {
                                         const result = uploadEvt.target?.result as string;
                                         if (result) {
                                           const updatedSkins = [...(editingChar.skins || [])];
                                           updatedSkins[skinIdx] = { ...updatedSkins[skinIdx], image: result };
                                           handleUpdateCharDetails('skins', updatedSkins);
                                         }
                                       };
                                       reader.readAsDataURL(file);
                                     }
                                   }}
                                 />
                               </label>
                               {skin.image && (
                                 <button
                                   type="button"
                                   onClick={() => {
                                     const updatedSkins = [...(editingChar.skins || [])];
                                     updatedSkins[skinIdx] = { ...updatedSkins[skinIdx], image: '' };
                                     handleUpdateCharDetails('skins', updatedSkins);
                                   }}
                                   className="p-1 text-slate-500 hover:text-red-400 bg-slate-950 border border-slate-800 hover:border-red-500/50 rounded transition"
                                   title="Remover imagem personalizada"
                                 >
                                   <X className="w-2 h-2" />
                                 </button>
                               )}
                             </div>
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

                {/* Skills Grid (Drag & Drop Reorder) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {editingChar.skills.map((skill, sIdx) => {
                    const isSkillSelected = editingSkillIndex === sIdx;
                    const isDragOver = dragIndex !== null && dragIndex !== sIdx;
                    return (
                      <div
                        key={sIdx}
                        draggable
                        onClick={() => handleSelectSkill(sIdx)}
                        onDragStart={() => setDragIndex(sIdx)}
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDragEnter={(e) => { e.preventDefault(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIndex === null || dragIndex === sIdx) return;
                          const updated = [...editingChar.skills];
                          const [moved] = updated.splice(dragIndex, 1);
                          const targetIdx = dragIndex < sIdx ? sIdx - 1 : sIdx;
                          updated.splice(targetIdx, 0, moved);
                          setEditingChar({ ...editingChar, skills: updated });
                          setDragIndex(null);
                          if (editingSkillIndex === dragIndex) {
                            setEditingSkillIndex(targetIdx);
                          } else if (editingSkillIndex === targetIdx || editingSkillIndex === sIdx) {
                            setEditingSkillIndex(dragIndex);
                          }
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        className={`p-2 rounded-xl border cursor-grab active:cursor-grabbing relative flex flex-col items-center justify-center text-center transition-all bg-slate-950 select-none group ${
                          isSkillSelected
                            ? 'border-orange-500 ring-1 ring-orange-500 bg-orange-600/5'
                            : dragIndex === sIdx
                            ? 'border-blue-500/60 opacity-50'
                            : dragIndex !== null
                            ? 'border-slate-600/60 border-dashed'
                            : 'border-slate-800/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 mb-1.5 flex-shrink-0">
                          <img 
                            src={skill.icon || null} 
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
                                cost === 'Tai' ? 'bg-green-500' :
                                cost === 'Nin' ? 'bg-blue-500' :
                                cost === 'Gen' ? 'bg-white' :
                                cost === 'Blood' ? 'bg-red-500' : 'bg-slate-600'
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
                         <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Ícone da Habilidade</label>
                         <div className="flex gap-1.5 items-center">
                           <div className="w-10 h-10 rounded-lg border border-slate-800 bg-slate-900 flex items-center justify-center flex-shrink-0">
                             {editingSkill?.icon ? (
                               <img 
                                 src={editingSkill.icon} 
                                 alt={editingSkill.name} 
                                 className="w-full h-full object-contain" 
                                 referrerPolicy="no-referrer"
                                 onError={(e) => {
                                   const img = e.currentTarget; 
                                   img.onerror = null; 
                                   img.src = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/Rasengan.jpg';
                                 }}
                               />
                             ) : (
                               <Award className="w-5 h-5 text-slate-400" />
                             )}
                           </div>
                           <input
                             type="text"
                             value={editingSkill.icon || ''}
                             onChange={(e) => handleUpdateSkillField('icon', e.target.value)}
                             placeholder="URL ou envie arquivo"
                             className="flex-1 min-w-0 px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                           />
                           <label className="px-3 py-2 bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded-xl text-[9px] font-mono font-bold uppercase cursor-pointer transition flex items-center gap-1 flex-shrink-0">
                             <Upload className="w-4 h-4 text-orange-400" />
                             <span>Upload</span>
                             <input
                               type="file"
                               accept=".png,.jpg,.jpeg,.webp,image/*"
                               className="hidden"
                               onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 if (file) {
                                   const reader = new FileReader();
                                   reader.onload = (uploadEvt) => {
                                     const result = uploadEvt.target?.result as string;
                                     if (result) {
                                       handleUpdateSkillField('icon', result);
                                       triggerSuccess('Ícone carregado com sucesso!');
                                     }
                                   };
                                   reader.readAsDataURL(file);
                                 }
                               }}
                             />
                           </label>
                           {editingSkill.icon && (
                             <button
                               type="button"
                               onClick={() => {
                                 handleUpdateSkillField('icon', '');
                                 triggerSuccess('Ícone personalizado removido.');
                               }}
                               className="p-2 text-slate-500 hover:text-red-400 bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-xl transition"
                               title="Remover ícone personalizado"
                             >
                               <X className="w-3.5 h-3.5" />
                             </button>
                           )}
                         </div>
                       </div>

                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 font-mono">Efeito Requerido para Ativar (Opcional)</label>
                        <input
  type="text"
  list="requireEffect-suggestions"
    value={editingSkill.requireEffect || ''}
    onChange={(e) => handleUpdateSkillField('requireEffect', e.target.value || null)}
    placeholder="Ex: Shadow Clones"
  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
/>
<datalist id="requireEffect-suggestions">
  {editingChar.skills.map(s => <option key={s.name} value={s.name} />)}
</datalist>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-cyan-400 mb-1 font-mono">Habilidade Anterior Requerida (Opcional)</label>
                        <input
                          type="text"
                          list="requirePrevSkill-suggestions"
                          value={editingSkill.requirePreviousSkill || ''}
                           onChange={(e) => handleUpdateSkillField('requirePreviousSkill', e.target.value || null)}
                          placeholder="Ex: Gentle Fist"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                        />
                        <datalist id="requirePrevSkill-suggestions">
                          {editingChar.skills.map(s => <option key={s.name} value={s.name} />)}
                        </datalist>
                        <p className="text-[8px] text-slate-500 font-mono mt-0.5">Esta skill só pode ser usada se a habilidade informada foi usada no turno anterior</p>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-amber-400 mb-1 font-mono">Efeito Requerido no Alvo (Opcional)</label>
                        <input
                          type="text"
                          list="requireTargetEffect-suggestions"
                          value={editingSkill.requireTargetEffect || ''}
                          onChange={(e) => handleUpdateSkillField('requireTargetEffect', e.target.value || null)}
                          placeholder="Ex: Chain Wrap"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                        />
                        <datalist id="requireTargetEffect-suggestions">
                          {editingChar.skills.flatMap(s => s.name).filter(Boolean).map(name => <option key={name} value={name} />)}
                        </datalist>
                        <p className="text-[8px] text-slate-500 font-mono mt-0.5">Esta skill só pode ser usada em inimigos que tenham este efeito ativo (ex: stun do Chain Wrap)</p>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-red-400 mb-1 font-mono">HP Máximo para Liberar (Opcional)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={editingSkill.requireHpBelow || ''}
                          onChange={(e) => handleUpdateSkillField('requireHpBelow', e.target.value ? parseInt(e.target.value) : undefined)}
                          placeholder="Ex: 50"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-red-500 rounded-xl text-white outline-none text-xs transition-all font-mono"
                        />
                        <p className="text-[8px] text-slate-500 font-mono mt-0.5">Só libera esta skill se o HP do personagem estiver ≤ este valor</p>
                      </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <label className="flex items-center gap-1.5 text-[9px] text-emerald-400 font-mono cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editingSkill.requireRevived || false}
                            onChange={(e) => handleUpdateSkillField('requireRevived', e.target.checked)}
                            className="rounded bg-slate-950 border-emerald-800 text-emerald-500 focus:ring-0 w-3 h-3"
                          />
                          🙏 Só pode ser usada se o personagem já ressuscitou nesta partida
                        </label>
                        <label className="flex items-center gap-1.5 text-[9px] text-red-400 font-mono cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editingSkill.blockIfRevived || false}
                            onChange={(e) => handleUpdateSkillField('blockIfRevived', e.target.checked)}
                            className="rounded bg-slate-950 border-red-800 text-red-500 focus:ring-0 w-3 h-3"
                          />
                          🚫 Bloqueada se o personagem já ressuscitou nesta partida
                        </label>
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
                            <option value="SelfAndAlly">Mim e um Aliado (à escolha)</option>
                            <option value="AllEnemies">Todos os Inimigos</option>
                            <option value="AllAllies">Todos os Aliados</option>
                            <option value="AnyLiving">Qualquer Personagem Vivo</option>
                          </select>
                        </div>
                      </div>

                      <div className="md:col-span-2 flex flex-col space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                        <label className="flex items-center gap-2 text-[10px] text-slate-300">
                          <input type="checkbox" checked={editingSkill.cannotBeCountered || false}
                            onChange={(e) => handleUpdateSkillField('cannotBeCountered', e.target.checked)}
                            className="rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0" />
                          Esta habilidade não pode ser anulada por contra-ataque
                        </label>
                        <label className="flex items-center gap-2 text-[10px] text-slate-300">
                          <input type="checkbox" checked={editingSkill.cannotBeReflected || false}
                            onChange={(e) => handleUpdateSkillField('cannotBeReflected', e.target.checked)}
                            className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0" />
                          Esta habilidade não pode ser refletida
                        </label>
                        <label className="flex items-center gap-2 text-[10px] text-amber-300 font-bold">
                          <input type="checkbox" checked={editingSkill.doNotApplyIfActive || false}
                            onChange={(e) => handleUpdateSkillField('doNotApplyIfActive', e.target.checked)}
                            className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0" />
                          🚫 Não aplicar se a habilidade já estiver ativa no alvo
                        </label>
                         <label className="flex items-center gap-2 text-[10px] text-cyan-300 font-bold">
                           <input type="checkbox" checked={editingSkill.permanent || false}
                             onChange={(e) => handleUpdateSkillField('permanent', e.target.checked)}
                             className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0" />
                           � ♾��️ Esta skill não pode ser removida (efeito permanente)
                         </label>

                         <label className="flex items-center gap-2 text-[10px] text-orange-400 font-bold">
                           <input type="checkbox" checked={editingSkill.blocksOffensiveSkills || false}
                             onChange={(e) => handleUpdateSkillField('blocksOffensiveSkills', e.target.checked)}
                             className="rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0" />
                           �� 🛑 Bloquear skills ofensivas do alvo quando ativo
                         </label>
                          <label className="flex items-center gap-2 text-[10px] text-cyan-400 font-bold">
                            <input type="checkbox" checked={editingSkill.ignoreInvulnerable || false}
                              onChange={(e) => handleUpdateSkillField('ignoreInvulnerable', e.target.checked)}
                              className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0" />
                            🧿 Ignorar Invulnerabilidade (pode mirar/atingir inimigos invulneráveis)
                          </label>
                          <label className="flex items-center gap-2 text-[10px] text-red-400 font-bold">
                            <input type="checkbox" checked={editingSkill.removedOnTargetSkillUse || false}
                              onChange={(e) => handleUpdateSkillField('removedOnTargetSkillUse', e.target.checked)}
                              className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0" />
                            🧹 Removida do alvo quando ele usar uma habilidade (mesmo que infinita)
                          </label>
                          <label className="flex items-center gap-2 text-[10px] text-red-400 font-bold">
                            <input type="checkbox" checked={editingSkill.removedOnCasterDeath || false}
                              onChange={(e) => handleUpdateSkillField('removedOnCasterDeath', e.target.checked)}
                              className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0" />
                            💀 Removida dos alvos se meu personagem morrer
                          </label>
                      </div>

                      <div className="md:col-span-2 space-y-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                        <div className="flex justify-between items-center">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-300 font-mono">
                            Classes / Propriedades da Habilidade
                          </label>
                          <span className="text-[9px] text-slate-500 font-mono">Clique para selecionar / desmarcar</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {[
                            { value: 'A distancia', label: '🎯 A distancia', color: 'border-cyan-500/60 text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/50' },
                            { value: 'Chakra', label: '🌀 Chakra', color: 'border-blue-500/60 text-blue-300 bg-blue-950/40 hover:bg-blue-900/50' },
                            { value: 'Mental', label: '🧠 Mental', color: 'border-pink-500/60 text-pink-300 bg-pink-950/40 hover:bg-pink-900/50' },
                            { value: 'Físico', label: '⚔️ Físico', color: 'border-orange-500/60 text-orange-300 bg-orange-950/40 hover:bg-orange-900/50' },
                            { value: 'Aflição', label: '🩸 Aflição', color: 'border-red-500/60 text-red-300 bg-red-950/40 hover:bg-red-900/50' },
                            { value: 'Amigável', label: '🤝 Amigável', color: 'border-emerald-500/60 text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50' },
                          ].map((item) => {
                            const currentClasses = editingSkill.classes || [];
                            const isSelected = currentClasses.some(c => 
                              c.toLowerCase() === item.value.toLowerCase() || 
                              (item.value === 'A distancia' && (c.toLowerCase().includes('distancia') || c.toLowerCase().includes('distância')))
                            );
                            return (
                              <button
                                key={item.value}
                                type="button"
                                onClick={() => {
                                  let updated: string[];
                                  if (isSelected) {
                                    updated = currentClasses.filter(c => 
                                      c.toLowerCase() !== item.value.toLowerCase() && 
                                      !(item.value === 'A distancia' && (c.toLowerCase().includes('distancia') || c.toLowerCase().includes('distância')))
                                    );
                                  } else {
                                    updated = [...currentClasses, item.value];
                                  }
                                  handleUpdateSkillField('classes', updated);
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all flex items-center justify-between cursor-pointer ${
                                  isSelected
                                    ? `${item.color} shadow-md`
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                }`}
                              >
                                <span>{item.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${isSelected ? 'bg-white/20 text-white' : 'text-slate-600'}`}>
                                  {isSelected ? '✓' : '+'}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="pt-1 border-t border-slate-800/60">
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1 font-mono">Outras classes / personalizadas (opcional):</label>
                          <input
                            type="text"
                            value={editingSkill.classes.filter(c => !['a distancia', 'à distância', 'chakra', 'mental', 'físico', 'fisico', 'aflição', 'aflicao', 'amigável', 'amigavel'].includes(c.toLowerCase())).join(', ')}
                            onChange={(e) => {
                              const customList = e.target.value.split(',').map(s => s.trim()).filter(s => s !== '');
                              const predefinedPresent = editingSkill.classes.filter(c => ['a distancia', 'à distância', 'chakra', 'mental', 'físico', 'fisico', 'aflição', 'aflicao', 'amigável', 'amigavel'].includes(c.toLowerCase()));
                              handleUpdateSkillField('classes', [...predefinedPresent, ...customList]);
                            }}
                            placeholder="Ex: Corpo a Corpo, Invocação (separadas por vírgula)"
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-lg text-white outline-none text-xs transition-all font-mono"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">Custo de Chakra Elemental (Clique para adicionar/remover - Máx 4)</label>
                          <label className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-bold cursor-pointer select-none bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/60">
                            <input
                              type="checkbox"
                              checked={editingSkill.noChakraCost || editingSkill.cost.length === 0}
                              onChange={(e) => {
                                const isFree = e.target.checked;
                                handleUpdateSkillField('noChakraCost', isFree);
                                if (isFree) {
                                  handleUpdateSkillField('cost', []);
                                } else {
                                  handleUpdateSkillField('cost', ['Tai']);
                                }
                              }}
                              className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                            />
                            🆓 Sem Custo de Chakra (Habilidade Grátis)
                          </label>
                        </div>
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
                          {(editingSkill.noChakraCost || editingSkill.cost.length === 0) ? (
                            <span className="text-emerald-400 font-bold">Sem custo (Habilidade Grátis)</span>
                          ) : (
                            <span className="text-orange-400 font-semibold">{editingSkill.cost.join(' + ')}</span>
                          )}
                        </div>
                      </div>

                      {/* Dynamic Cost Modification Rules (Regras de Redução de Custo de Chakra) */}
                      {/* Cost Rules (Regras de Custo de Chakra Condicional / Substituição ou Grátis) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-orange-400 font-mono">
                              ⚡ Regras de Custo de Chakra Condicional (Substituição / Habilidade Grátis)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando a habilidade/efeito especificado estiver ativo em um combatente, substitui o custo de chakra desta habilidade pelos selecionados abaixo. Se nenhum chakra for marcado, a habilidade fica <strong>GRÁTIS (0 Custo)</strong>.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.costRules || [];
                              handleUpdateSkillField('costRules', [
                                ...currentRules,
                                { activeSkillName: '', overrideCost: [] }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-orange-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.costRules || editingSkill.costRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de custo condicional configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-3 pt-1">
                            {editingSkill.costRules.map((rule, rIdx) => {
                              const overrideCost = rule.overrideCost ?? [];
                              return (
                                <div key={rIdx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[10px] font-mono space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-slate-400 font-bold">Quando ativo:</span>
                                    <input
                                      type="text"
                                      list="costSkills-suggestions"
                                      value={rule.activeSkillName}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.costRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                        handleUpdateSkillField('costRules', updated);
                                      }}
                                      placeholder="Ex: Two-Headed Wolf / Transformation"
                                      className="flex-1 min-w-[150px] px-2.5 py-1 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded-lg text-white outline-none text-[10px]"
                                    />
                                    <datalist id="costSkills-suggestions">
                                      {editingChar?.skills && editingChar.skills.length > 0 ? (
                                        editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                      ) : <option value="" disabled />}
                                    </datalist>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (editingSkill.costRules || []).filter((_, i) => i !== rIdx);
                                        handleUpdateSkillField('costRules', updated.length > 0 ? updated : undefined);
                                      }}
                                      className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                      title="Remover Regra"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* CUSTO SUBSTITUTO / GRÁTIS */}
                                  <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 space-y-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-slate-300 font-bold text-[9.5px]">Custo de Chakra quando ativo:</span>
                                      {overrideCost.length === 0 ? (
                                        <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 rounded text-[9px] font-bold tracking-wide animate-pulse">
                                          ✨ HABILIDADE GRÁTIS (0 CUSTO)
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-amber-400 font-bold">
                                          {overrideCost.length} Chakra(s) Requerido(s)
                                        </span>
                                      )}
                                    </div>

                                    {/* BADGES DO CUSTO ATUAL */}
                                    <div className="flex flex-wrap items-center gap-1.5 min-h-[26px]">
                                      {overrideCost.length === 0 ? (
                                        <span className="text-[9px] text-slate-500 italic">Nenhum chakra marcado. A habilidade fica sem custo de chakra ao ativar.</span>
                                      ) : (
                                        overrideCost.map((cType, cIdx) => (
                                          <span
                                            key={cIdx}
                                            className="px-2 py-0.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-md text-[9px] font-bold flex items-center gap-1"
                                          >
                                            {cType}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newCost = [...overrideCost];
                                                newCost.splice(cIdx, 1);
                                                const updated = [...(editingSkill.costRules || [])];
                                                updated[rIdx] = { ...updated[rIdx], overrideCost: newCost };
                                                handleUpdateSkillField('costRules', updated);
                                              }}
                                              className="text-slate-400 hover:text-red-400 font-bold ml-0.5"
                                              title="Remover este chakra"
                                            >
                                              ×
                                            </button>
                                          </span>
                                        ))
                                      )}
                                    </div>

                                    {/* BOTOES ADICIONAR CHAKRA */}
                                    <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-800/60">
                                      <span className="text-[9px] text-slate-400 font-bold mr-1">Adicionar Chakra:</span>
                                      {(['Tai', 'Nin', 'Gen', 'Blood', 'Rand'] as ChakraType[]).map((cType) => (
                                        <button
                                          key={cType}
                                          type="button"
                                          onClick={() => {
                                            const newCost = [...overrideCost, cType];
                                            const updated = [...(editingSkill.costRules || [])];
                                            updated[rIdx] = { ...updated[rIdx], overrideCost: newCost };
                                            handleUpdateSkillField('costRules', updated);
                                          }}
                                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded text-[9px] font-bold cursor-pointer transition-all"
                                        >
                                          + {cType}
                                        </button>
                                      ))}
                                      {overrideCost.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...(editingSkill.costRules || [])];
                                            updated[rIdx] = { ...updated[rIdx], overrideCost: [] };
                                            handleUpdateSkillField('costRules', updated);
                                          }}
                                          className="px-2 py-0.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded text-[9px] font-bold cursor-pointer transition-all ml-auto"
                                        >
                                          Limpar (Tornar Grátis)
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Target Rules (Regras de Alvo Condicional - Alterar Alvo da Habilidade) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                              🎯 Regras de Alvo Condicional (Alterar Alvo da Habilidade)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando a habilidade/efeito especificado estiver ativo, altera o alvo padrão desta habilidade para o novo alvo selecionado (ex: passar de Inimigo Único para <strong>Todos os Inimigos</strong>).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.targetRules || [];
                              handleUpdateSkillField('targetRules', [
                                ...currentRules,
                                { activeSkillName: '', overrideTarget: 'AllEnemies' }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra de Alvo
                          </button>
                        </div>

                        {(!editingSkill.targetRules || editingSkill.targetRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de alvo condicional configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-3 pt-1">
                            {editingSkill.targetRules.map((rule, rIdx) => (
                              <div key={rIdx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[10px] font-mono space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-slate-400 font-bold">Quando ativo:</span>
                                  <input
                                    type="text"
                                    list="targetSkills-suggestions"
                                    value={rule.activeSkillName}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.targetRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                      handleUpdateSkillField('targetRules', updated);
                                    }}
                                    placeholder="Ex: Modo Sábio / Sharingan"
                                    className="flex-1 min-w-[150px] px-2.5 py-1 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg text-white outline-none text-[10px]"
                                  />
                                  <datalist id="targetSkills-suggestions">
                                    {editingChar?.skills && editingChar.skills.length > 0 ? (
                                      editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                    ) : <option value="" disabled />}
                                  </datalist>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (editingSkill.targetRules || []).filter((_, i) => i !== rIdx);
                                      handleUpdateSkillField('targetRules', updated.length > 0 ? updated : undefined);
                                    }}
                                    className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                    title="Remover Regra"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 flex flex-wrap items-center gap-2">
                                  <span className="text-slate-300 font-bold text-[9.5px]">Alterar Alvo da Skill para:</span>
                                  <select
                                    value={rule.overrideTarget || 'AllEnemies'}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.targetRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], overrideTarget: e.target.value as any };
                                      handleUpdateSkillField('targetRules', updated);
                                    }}
                                    className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-indigo-300 font-bold outline-none"
                                  >
                                    <option value="AllEnemies">👥 Todos os Inimigos (All Enemies)</option>
                                    <option value="Enemy">👤 Um Inimigo (Single Enemy)</option>
                                    <option value="AllAllies">🛡️ Todos os Aliados (All Allies)</option>
                                    <option value="Ally">👤 Um Aliado (Single Ally)</option>
                                    <option value="Self">🌀 Si Mesmo (Self)</option>
                                    <option value="SelfAndAlly">🌀 Si Mesmo e Aliado</option>
                                  </select>
                                </div>

                                <label className="flex items-start gap-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!rule.oncePerActivation}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.targetRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], oncePerActivation: e.target.checked };
                                      handleUpdateSkillField('targetRules', updated);
                                    }}
                                    className="accent-indigo-500 mt-0.5"
                                  />
                                  <span className="flex flex-col">
                                    <span className="text-indigo-300 font-bold text-[9.5px]">🔄 Só na 1ª Vez por Ativação</span>
                                    <span className="text-[8.5px] text-slate-400">
                                      O alvo só muda na PRIMEIRA skill usada enquanto a condição estiver ativa. Depois de atacar, volta ao alvo normal. Para mudar de novo, reative a habilidade condição (RESETA).
                                    </span>
                                  </span>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Cooldown Rules (Regras de Cooldown Condicional - Alterar Recarga) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                              ⏳ Regras de Cooldown Condicional (Alterar Recarga)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando a habilidade/efeito especificado estiver ativo, altera o tempo de recarga desta habilidade para o valor definido (ex: colocar em <strong>0 de cooldown</strong>).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.cooldownRules || [];
                              handleUpdateSkillField('cooldownRules', [
                                ...currentRules,
                                { activeSkillName: '', overrideCooldown: 0 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra de Cooldown
                          </button>
                        </div>

                        {(!editingSkill.cooldownRules || editingSkill.cooldownRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de cooldown condicional configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-3 pt-1">
                            {editingSkill.cooldownRules.map((rule, rIdx) => (
                              <div key={rIdx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[10px] font-mono space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-slate-400 font-bold">Quando ativo:</span>
                                  <input
                                    type="text"
                                    list="cooldownSkills-suggestions"
                                    value={rule.activeSkillName}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.cooldownRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                      handleUpdateSkillField('cooldownRules', updated);
                                    }}
                                    placeholder="Ex: Modo Sábio / Chakra Infinito"
                                    className="flex-1 min-w-[150px] px-2.5 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-lg text-white outline-none text-[10px]"
                                  />
                                  <datalist id="cooldownSkills-suggestions">
                                    {editingChar?.skills && editingChar.skills.length > 0 ? (
                                      editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                    ) : <option value="" disabled />}
                                  </datalist>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (editingSkill.cooldownRules || []).filter((_, i) => i !== rIdx);
                                      handleUpdateSkillField('cooldownRules', updated.length > 0 ? updated : undefined);
                                    }}
                                    className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                    title="Remover Regra"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 flex flex-wrap items-center gap-2">
                                  <span className="text-slate-300 font-bold text-[9.5px]">Novo Cooldown da Skill:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={10}
                                    value={rule.overrideCooldown ?? 0}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.cooldownRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], overrideCooldown: parseInt(e.target.value) || 0 };
                                      handleUpdateSkillField('cooldownRules', updated);
                                    }}
                                    className="w-20 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-center text-[10px] font-mono text-cyan-300 font-bold outline-none"
                                  />
                                  <span className="text-[10px] text-slate-400 font-mono">Turno(s)</span>
                                  {rule.overrideCooldown === 0 ? (
                                    <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 rounded text-[9px] font-bold tracking-wide animate-pulse ml-auto">
                                      ✨ SEM RECARGA (0 COOLDOWN)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-cyan-950/80 text-cyan-400 border border-cyan-500/40 rounded text-[9px] font-bold tracking-wide ml-auto">
                                      ⏳ Recarga de {rule.overrideCooldown} Turnos
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-rose-400 font-mono">Regras de Dano (Damage Rules)</label>
                        <button
                          type="button"
                          onClick={() => {
                            const current = editingSkill.damageRules || [];
                            handleUpdateSkillField('damageRules', [
                              ...current,
                              { activeSkillName: '', damageBoost: 20, damageType: 'damage', ignoreBaseDamage: true }
                            ]);
                          }}
                          className="mt-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                        >
                          + Adicionar Regra de Dano
                        </button>
                        {(!editingSkill.damageRules || editingSkill.damageRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic mt-1.5">
                            Nenhuma regra de dano configurada.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1.5">
                            {editingSkill.damageRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">Quando ativo:</span>
                                <input
                                  type="text"
                                  list="dmgSkills-suggestions"
                                  value={rule.activeSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.damageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                    handleUpdateSkillField('damageRules', updated);
                                  }}
                                  placeholder="Ex: Sharingan"
                                  className="flex-1 min-w-[120px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="dmgSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-slate-400 font-bold">Dano:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={200}
                                  value={rule.damageBoost}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.damageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damageBoost: val };
                                    handleUpdateSkillField('damageRules', updated);
                                  }}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold">Tipo:</span>
                                <select
                                  value={rule.damageType || 'damage'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.damageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damageType: e.target.value as any };
                                    handleUpdateSkillField('damageRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-amber-300 outline-none text-[10px]"
                                >
                                  <option value="damage">💥 Dano Normal</option>
                                  <option value="direct_damage">🎯 Dano Direto</option>
                                  <option value="piercing">🗡️ Dano Perfurante</option>
                                  <option value="affliction">💀 Dano de Aflição</option>
                                  <option value="bleeding">🩸 Dano de Sangramento</option>
                                  <option value="dot">🔥 DoT (Turnos)</option>
                                  <option value="life_steal">🧛 Roubo de Vida</option>
                                </select>
                                <label className="flex items-center gap-1.5 cursor-pointer bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80" title="Quando a regra estiver ativa, o dano base/direto padrão da habilidade é zerado para não acumular">
                                  <input
                                    type="checkbox"
                                    checked={rule.ignoreBaseDamage !== false}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.damageRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], ignoreBaseDamage: e.target.checked };
                                      handleUpdateSkillField('damageRules', updated);
                                    }}
                                    className="accent-rose-500 rounded cursor-pointer"
                                  />
                                  <span className="text-[9px] text-slate-300 font-bold">Ignorar Dano Base</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.damageRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('damageRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Regras de Dano ao Usar Habilidade (Punição por Habilidade) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                              ⚔️ Dano ao Usar Habilidade (Punição por Skill)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Se o alvo/inimigo usar qualquer habilidade, sofrerá o dano configurado a cada uso durante os turnos definidos.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editingSkill.onSkillUseDamageRules || [];
                              handleUpdateSkillField('onSkillUseDamageRules', [
                                ...current,
                                { damage: 20, duration: 2, damageType: 'direct_damage', target: 'target', irremovable: false }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.onSkillUseDamageRules || editingSkill.onSkillUseDamageRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de dano ao usar habilidade configurada.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1.5">
                            {editingSkill.onSkillUseDamageRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">Dano:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={500}
                                  value={rule.damage}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    const updated = [...(editingSkill.onSkillUseDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damage: val };
                                    handleUpdateSkillField('onSkillUseDamageRules', updated);
                                  }}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-white outline-none text-[10px]"
                                />

                                <span className="text-slate-400 font-bold">Turnos:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={rule.duration === 99999 ? 0 : (rule.duration || 1)}
                                  title={rule.duration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.onSkillUseDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], duration: val };
                                    handleUpdateSkillField('onSkillUseDamageRules', updated);
                                  }}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-white outline-none text-[10px]"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={rule.duration === 99999}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.onSkillUseDamageRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], duration: e.target.checked ? 99999 : 1 };
                                      handleUpdateSkillField('onSkillUseDamageRules', updated);
                                    }}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>

                                <span className="text-slate-400 font-bold">Tipo:</span>
                                <select
                                  value={rule.damageType || 'direct_damage'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.onSkillUseDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damageType: e.target.value as any };
                                    handleUpdateSkillField('onSkillUseDamageRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-amber-300 outline-none text-[10px]"
                                >
                                  <option value="direct_damage">🎯 Dano Direto</option>
                                  <option value="damage">💥 Dano Normal</option>
                                  <option value="piercing">🗡️ Dano Perfurante</option>
                                  <option value="affliction">💀 Dano de Aflição</option>
                                  <option value="bleeding">🩸 Sangramento</option>
                                  <option value="dot">🔥 DoT</option>
                                  <option value="life_steal">🧛 Roubo de Vida</option>
                                </select>

                                <span className="text-slate-400 font-bold">Alvo:</span>
                                <select
                                  value={rule.target || 'target'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.onSkillUseDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], target: e.target.value as any };
                                    handleUpdateSkillField('onSkillUseDamageRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-cyan-300 outline-none text-[10px]"
                                >
                                  <option value="target">Inimigo (Alvo)</option>
                                  <option value="enemies">Todos os Inimigos</option>
                                  <option value="self">Eu Mesmo</option>
                                  <option value="allies">Todos os Aliados</option>
                                </select>

                                <label className="flex items-center gap-1.5 cursor-pointer bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                                  <input
                                    type="checkbox"
                                    checked={!!rule.irremovable}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.onSkillUseDamageRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], irremovable: e.target.checked };
                                      handleUpdateSkillField('onSkillUseDamageRules', updated);
                                    }}
                                    className="accent-amber-500 rounded cursor-pointer"
                                  />
                                  <span className="text-[9px] text-slate-300 font-bold">Inremovível</span>
                                </label>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.onSkillUseDamageRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('onSkillUseDamageRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Stack Damage Rules (Dano por Stack no alvo) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-yellow-400 font-mono">
                              ⚡ Dano por Stack
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Causa dano adicional baseado na quantidade de stacks do tipo especificado (no Alvo, em Mim, nos Inimigos, Aliados ou em Todos).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.stackDamageRules || [];
                              handleUpdateSkillField('stackDamageRules', [
                                ...currentRules,
                                { stackType: '', damagePerStack: 5, stackSource: 'target' }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-yellow-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.stackDamageRules || editingSkill.stackDamageRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de dano por stack configurada.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.stackDamageRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">StackType:</span>
                                <input
                                  type="text"
                                  list="stackType-suggestions"
                                  value={rule.stackType}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.stackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], stackType: e.target.value };
                                    handleUpdateSkillField('stackDamageRules', updated);
                                  }}
                                  placeholder="Ex: Marca, Veneno, Cortes"
                                  className="flex-1 min-w-[110px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="stackType-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.filter(s => s.stackable && s.stackType).map(s => <option key={s.stackType} value={s.stackType!} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-slate-400 font-bold text-[9px]">Verificar em:</span>
                                <select
                                  value={rule.stackSource || 'target'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.stackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], stackSource: e.target.value as any };
                                    handleUpdateSkillField('stackDamageRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px] font-mono"
                                >
                                  <option value="target">🎯 No Alvo (Padrão)</option>
                                  <option value="self">👤 Em Mim (Conjurador)</option>
                                  <option value="enemies">⚔️ Todos Inimigos</option>
                                  <option value="allies">🛡️ Todos Aliados</option>
                                  <option value="all">🌐 Todos em Campo</option>
                                </select>
                                <span className="text-slate-400 font-bold">Dano/Stack:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={rule.damagePerStack}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.stackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damagePerStack: val };
                                    handleUpdateSkillField('stackDamageRules', updated);
                                  }}
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold text-[9px]">Remover Stacks:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={rule.removeStacks ?? 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    const updated = [...(editingSkill.stackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], removeStacks: val > 0 ? val : undefined };
                                    handleUpdateSkillField('stackDamageRules', updated);
                                  }}
                                  placeholder="0 = não remove"
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold text-[9px]">Duração:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={rule.duration === 99999 ? 0 : (rule.duration ?? 0)}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    const updated = [...(editingSkill.stackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], duration: val > 0 ? val : undefined };
                                    handleUpdateSkillField('stackDamageRules', updated);
                                  }}
                                  placeholder="0 = instantâneo"
                                  className="w-10 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px]"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={rule.duration === 99999}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.stackDamageRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], duration: e.target.checked ? 99999 : undefined };
                                      handleUpdateSkillField('stackDamageRules', updated);
                                    }}
                                    className="rounded bg-slate-950 border-yellow-800/60 text-yellow-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-yellow-400 font-mono">♾️ Infinito</span>
                                </label>
                                {rule.duration && rule.duration > 0 ? (
                                  <>
                                    <span className="text-slate-400 font-bold text-[9px]">Tipo:</span>
                                    <select
                                      value={rule.damageType || 'dot'}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.stackDamageRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], damageType: e.target.value as any };
                                        handleUpdateSkillField('stackDamageRules', updated);
                                      }}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px] font-mono"
                                    >
                                      <option value="dot">🔥 DOT</option>
                                      <option value="bleeding">🩸 Sangramento</option>
                                      <option value="affliction">💀 Aflição</option>
                                      <option value="life_steal">🧛 Roubo de Vida</option>
                                      <option value="direct_damage">🎯 Direto</option>
                                      <option value="damage">💥 Normal</option>
                                    </select>
                                    <label className="flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={rule.ignoreBaseDamage || false}
                                        onChange={(e) => {
                                          const updated = [...(editingSkill.stackDamageRules || [])];
                                          updated[rIdx] = { ...updated[rIdx], ignoreBaseDamage: e.target.checked };
                                          handleUpdateSkillField('stackDamageRules', updated);
                                        }}
                                        className="rounded bg-slate-950 border-slate-700 text-yellow-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span className="text-[9px] text-slate-400 font-mono">Ignorar Dano Base</span>
                                    </label>
                                  </>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.stackDamageRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('stackDamageRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Self Stack Damage Rules (Aumento de dano por stack em mim) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-pink-400 font-mono">
                              💪 Aumento de Dano por Stack em Mim
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Esta skill ganha dano adicional baseado na quantidade de stacks que VOCÊ possui do tipo especificado.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.selfStackDamageRules || [];
                              handleUpdateSkillField('selfStackDamageRules', [
                                ...currentRules,
                                { stackType: '', damagePerStack: 20 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-pink-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.selfStackDamageRules || editingSkill.selfStackDamageRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de aumento por stack configurada.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.selfStackDamageRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">StackType:</span>
                                <input
                                  type="text"
                                  list="stackType-suggestions"
                                  value={rule.stackType}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.selfStackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], stackType: e.target.value };
                                    handleUpdateSkillField('selfStackDamageRules', updated);
                                  }}
                                  placeholder="Ex: Marca, Veneno, Cortes"
                                  className="flex-1 min-w-[110px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-pink-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold">Dano/Stack:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={rule.damagePerStack}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.selfStackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damagePerStack: val };
                                    handleUpdateSkillField('selfStackDamageRules', updated);
                                  }}
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-pink-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold ml-1">Tipo Dano:</span>
                                <select
                                  value={rule.damageType || 'damage'}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    const updated = [...(editingSkill.selfStackDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damageType: val };
                                    handleUpdateSkillField('selfStackDamageRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-pink-500 rounded text-white outline-none text-[10px]"
                                >
                                  <option value="damage">Normal</option>
                                  <option value="direct_damage">Direto</option>
                                  <option value="dot">DOT / Poção</option>
                                  <option value="bleeding">Sangramento</option>
                                  <option value="affliction">Aflição</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.selfStackDamageRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('selfStackDamageRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Redução de Dano por Stack em Mim */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                              🛡️ Redução de Dano por Stack em Mim
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Ao usar a skill, você ganha redução de dano baseada na quantidade de stacks que VOCÊ possui do tipo especificado.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.selfStackReductionRules || [];
                              handleUpdateSkillField('selfStackReductionRules', [
                                ...currentRules,
                                { stackType: '', reductionValue: 5, reductionType: 'damage_reduction', duration: 3 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.selfStackReductionRules || editingSkill.selfStackReductionRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de redução por stack configurada.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.selfStackReductionRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">StackType:</span>
                                <input
                                  type="text"
                                  list="stackType-suggestions"
                                  value={rule.stackType}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.selfStackReductionRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], stackType: e.target.value };
                                    handleUpdateSkillField('selfStackReductionRules', updated);
                                  }}
                                  placeholder="Ex: Marca, Veneno, Cortes"
                                  className="flex-1 min-w-[110px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold">Redução/Stack:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={rule.reductionValue}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.selfStackReductionRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], reductionValue: val };
                                    handleUpdateSkillField('selfStackReductionRules', updated);
                                  }}
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold ml-1">Tipo Redução:</span>
                                <select
                                  value={rule.reductionType || 'damage_reduction'}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    const updated = [...(editingSkill.selfStackReductionRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], reductionType: val };
                                    handleUpdateSkillField('selfStackReductionRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded text-white outline-none text-[10px]"
                                >
                                  <option value="damage_reduction">Redução de Dano (Guard)</option>
                                  <option value="damage_reduction_pierce">Redução Imune a Perfuração</option>
                                </select>
                                <span className="text-slate-400 font-bold ml-1">Turnos:</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={rule.duration && rule.duration !== 99999 ? rule.duration : ''}
                                  placeholder="∞"
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const updated = [...(editingSkill.selfStackReductionRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], duration: raw === '' ? 99999 : (parseInt(raw) || 1) };
                                    handleUpdateSkillField('selfStackReductionRules', updated);
                                  }}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded text-white outline-none text-[10px]"
                                />
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!rule.duration || rule.duration === 99999}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.selfStackReductionRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], duration: e.target.checked ? 99999 : 3 };
                                      handleUpdateSkillField('selfStackReductionRules', updated);
                                    }}
                                    className="accent-emerald-500"
                                  />
                                  <span className="text-[9px] text-slate-400 font-bold">♾️ Infinito</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.selfStackReductionRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('selfStackReductionRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Stack Duration Rules (Duração por Stack no Alvo) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                              ⏳ Duração por Stack no Alvo
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando usar esta skill em um alvo com stacks do tipo especificado, os efeitos dela duram mais turnos.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.stackDurationRules || [];
                              handleUpdateSkillField('stackDurationRules', [
                                ...currentRules,
                                { stackType: '', durationOverride: 2 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.stackDurationRules || editingSkill.stackDurationRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de duração por stack configurada.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.stackDurationRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">StackType:</span>
                                <input
                                  type="text"
                                  list="stackType-suggestions"
                                  value={rule.stackType}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.stackDurationRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], stackType: e.target.value };
                                    handleUpdateSkillField('stackDurationRules', updated);
                                  }}
                                  placeholder="Ex: Marca, Veneno, Cortes"
                                  className="flex-1 min-w-[110px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold">Duração:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={rule.durationOverride}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.stackDurationRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], durationOverride: val };
                                    handleUpdateSkillField('stackDurationRules', updated);
                                  }}
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 font-bold text-[9px]">turnos</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.stackDurationRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('stackDurationRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Heal Rules (Regras de Cura Extra quando condição ativa) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                              💚 Regras de Cura Extra (Condicional)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Adiciona cura extra quando uma habilidade/efeito específico estiver ativo em qualquer personagem.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.healRules || [];
                              handleUpdateSkillField('healRules', [
                                ...currentRules,
                                { activeSkillName: '', healBoost: 5 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.healRules || editingSkill.healRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de cura extra configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.healRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">Quando ativo:</span>
                                <input
                                  type="text"
                                  list="healSkills-suggestions"
                                  value={rule.activeSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.healRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                    handleUpdateSkillField('healRules', updated);
                                  }}
                                  placeholder="Ex: Byakugan"
                                  className="flex-1 min-w-[130px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="healSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-slate-400 font-bold">Cura+:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={rule.healBoost}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.healRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], healBoost: val };
                                    handleUpdateSkillField('healRules', updated);
                                  }}
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded text-white outline-none text-[10px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.healRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('healRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Chakra Remove Rules (Regras de Remoção de Chakra quando condição ativa) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">
                              🔥 Regras de Remoção de Chakra (Condicional)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Remove chakra do estoque inimigo quando uma habilidade/efeito específico estiver ativo em qualquer personagem (aliado ou inimigo).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.chakraRemoveRules || [];
                              handleUpdateSkillField('chakraRemoveRules', [
                                ...currentRules,
                                { activeSkillName: '', removeAmount: 1 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.chakraRemoveRules || editingSkill.chakraRemoveRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de remoção de chakra configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.chakraRemoveRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">Quando ativo:</span>
                                <input
                                  type="text"
                                  list="removeSkills-suggestions"
                                  value={rule.activeSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.chakraRemoveRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                    handleUpdateSkillField('chakraRemoveRules', updated);
                                  }}
                                  placeholder="Ex: Two-Headed Wolf"
                                  className="flex-1 min-w-[130px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="removeSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-slate-400 font-bold">Remover Chakra:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={rule.removeAmount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.chakraRemoveRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], removeAmount: val };
                                    handleUpdateSkillField('chakraRemoveRules', updated);
                                  }}
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 text-[9px]">chakra(s) aleatório(s)</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.chakraRemoveRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('chakraRemoveRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Chakra Steal Rules (Roubo de Chakras quando skill ativa) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-pink-400 font-mono">Roubo de Chakra</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.chakraStealRules || [];
                              handleUpdateSkillField('chakraStealRules', [
                                ...currentRules,
                                { activeSkillName: '', chakraAmount: 1 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.chakraStealRules || editingSkill.chakraStealRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de roubo de chakra configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.chakraStealRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-slate-400 font-bold">Quando ativa:</span>
                                <input
                                  type="text"
                                  list="stealSkills-suggestions"
                                  value={rule.activeSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.chakraStealRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                    handleUpdateSkillField('chakraStealRules', updated);
                                  }}
                                  placeholder="Ex: Two-Headed Wolf"
                                  className="flex-1 min-w-[130px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="stealSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-slate-400 font-bold">Roubar:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={rule.chakraAmount}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    const updated = [...(editingSkill.chakraStealRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], chakraAmount: val };
                                    handleUpdateSkillField('chakraStealRules', updated);
                                  }}
                                  className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px]"
                                />
                                <span className="text-slate-400 text-[9px]">chakra(s)</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.chakraStealRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('chakraStealRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Target Change On Stacks Rules (Mudança de Alvo por Marcação) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">
                              🎯 Mudança de Alvo por Marcação (Stack)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando a marcação tiver X stacks (em mim), esta skill muda o alvo para o tipo selecionado por X turnos (ex: mim mesmo, todos os inimigos, minha equipe...). <strong>O efeito some quando o turno acabar.</strong>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.targetChangeOnStacksRules || [];
                              handleUpdateSkillField('targetChangeOnStacksRules', [
                                ...currentRules,
                                { markingSkillName: '', requiredStacks: 1, overrideTarget: 'AllEnemies', durationTurns: 1 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.targetChangeOnStacksRules || editingSkill.targetChangeOnStacksRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de mudança de alvo por marcação configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.targetChangeOnStacksRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-rose-400 font-bold">Marcação:</span>
                                <input
                                  type="text"
                                  list="targetChangeStackSkills-suggestions"
                                  value={rule.markingSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.targetChangeOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], markingSkillName: e.target.value };
                                    handleUpdateSkillField('targetChangeOnStacksRules', updated);
                                  }}
                                  placeholder="Ex: Marcação"
                                  className="flex-1 min-w-[110px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="targetChangeStackSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-slate-400 font-bold">com</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={rule.requiredStacks || 1}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.targetChangeOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], requiredStacks: parseInt(e.target.value) || 1 };
                                    handleUpdateSkillField('targetChangeOnStacksRules', updated);
                                  }}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-white outline-none text-[10px] text-center"
                                />
                                <span className="text-slate-400 font-bold">stacks, muda o alvo para:</span>
                                <select
                                  value={rule.overrideTarget || 'AllEnemies'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.targetChangeOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], overrideTarget: e.target.value as any };
                                    handleUpdateSkillField('targetChangeOnStacksRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-[10px] font-mono text-rose-300 font-bold outline-none"
                                >
                                  <option value="AllEnemies">👥 Todos os Inimigos</option>
                                  <option value="Enemy">👤 Um Inimigo</option>
                                  <option value="AllAllies">🛡️ Todos os Aliados (Minha Equipe)</option>
                                  <option value="Ally">👤 Um Aliado</option>
                                  <option value="Self">🌀 Mim Mesmo</option>
                                  <option value="SelfAndAlly">🌀 Mim Mesmo e Aliado</option>
                                </select>
                                <span className="text-slate-400 font-bold">por</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={rule.durationTurns || 1}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.targetChangeOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], durationTurns: parseInt(e.target.value) || 1 };
                                    handleUpdateSkillField('targetChangeOnStacksRules', updated);
                                  }}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-white outline-none text-[10px] text-center"
                                />
                                <span className="text-slate-400 text-[9px]">turnos (some no fim do turno)</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.targetChangeOnStacksRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('targetChangeOnStacksRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Bonus Damage On Stacks Rules (Dano Adicional por Marcação) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-orange-400 font-mono">
                              💥 Dano Adicional por Marcação (Stack)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando a marcação tiver X stacks (em mim), esta skill dá X de dano adicional que eu escolher por X turnos. <strong>O efeito some quando o turno acabar.</strong>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.bonusDamageOnStacksRules || [];
                              handleUpdateSkillField('bonusDamageOnStacksRules', [
                                ...currentRules,
                                { markingSkillName: '', requiredStacks: 1, bonusDamage: 10, durationTurns: 1 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-orange-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.bonusDamageOnStacksRules || editingSkill.bonusDamageOnStacksRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de dano adicional por marcação configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.bonusDamageOnStacksRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-orange-400 font-bold">Marcação:</span>
                                <input
                                  type="text"
                                  list="bonusStackSkills-suggestions"
                                  value={rule.markingSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.bonusDamageOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], markingSkillName: e.target.value };
                                    handleUpdateSkillField('bonusDamageOnStacksRules', updated);
                                  }}
                                  placeholder="Ex: Marcação"
                                  className="flex-1 min-w-[110px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="bonusStackSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-slate-400 font-bold">com</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={rule.requiredStacks || 1}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.bonusDamageOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], requiredStacks: parseInt(e.target.value) || 1 };
                                    handleUpdateSkillField('bonusDamageOnStacksRules', updated);
                                  }}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded text-white outline-none text-[10px] text-center"
                                />
                                <span className="text-slate-400 font-bold">stacks, dá +</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99999}
                                  value={rule.bonusDamage || 0}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.bonusDamageOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], bonusDamage: parseInt(e.target.value) || 0 };
                                    handleUpdateSkillField('bonusDamageOnStacksRules', updated);
                                  }}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded text-white outline-none text-[10px] text-center"
                                />
                                <select
                                  value={rule.damageType || 'damage'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.bonusDamageOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damageType: e.target.value as any };
                                    handleUpdateSkillField('bonusDamageOnStacksRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded text-white outline-none text-[10px] font-mono"
                                >
                                  <option value="damage">💥 Normal</option>
                                  <option value="direct_damage">🎯 Direto</option>
                                  <option value="physical">🤜 Físico</option>
                                  <option value="chakra">⚡ Chakra</option>
                                  <option value="mental">🧠 Mental</option>
                                  <option value="ranged">🏹 Distância</option>
                                  <option value="affliction">💀 Aflição</option>
                                  <option value="dot">🔥 Queimadura</option>
                                  <option value="bleeding">🩸 Sangramento</option>
                                  <option value="life_steal">🧛 Roubo de Vida</option>
                                </select>
                                <span className="text-slate-400 font-bold">de dano por</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={rule.durationTurns || 1}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.bonusDamageOnStacksRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], durationTurns: parseInt(e.target.value) || 1 };
                                    handleUpdateSkillField('bonusDamageOnStacksRules', updated);
                                  }}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-orange-500 rounded text-white outline-none text-[10px] text-center"
                                />
                                <span className="text-slate-400 text-[9px]">turnos (some no fim do turno)</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.bonusDamageOnStacksRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('bonusDamageOnStacksRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Conditional Kill Rules (Execução Instantânea) */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono">
                              💀 Execução Instantânea (Condicional)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Mata INSTANTANEAMENTE o Oponente que estiver com a habilidade/efeito específico ATIVO nele.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.killWhenActiveRules || [];
                              handleUpdateSkillField('killWhenActiveRules', [
                                ...currentRules,
                                { activeSkillName: '', killScope: 'target' }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-red-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.killWhenActiveRules || editingSkill.killWhenActiveRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de execução configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.killWhenActiveRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-red-400 font-bold">Matar quando ativo no Oponente:</span>
                                <input
                                  type="text"
                                  list="killSkills-suggestions"
                                  value={rule.activeSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.killWhenActiveRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                    handleUpdateSkillField('killWhenActiveRules', updated);
                                  }}
                                  placeholder="Ex: Two-Headed Wolf"
                                  className="flex-1 min-w-[130px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-red-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="killSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <span className="text-red-400 font-bold">Quem morre:</span>
                                <select
                                  value={rule.killScope || 'target'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.killWhenActiveRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], killScope: e.target.value === 'self_and_target' ? 'self_and_target' : 'target' };
                                    handleUpdateSkillField('killWhenActiveRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-red-800/60 rounded text-[10px] font-mono text-red-300 focus:border-red-500 outline-none"
                                >
                                  <option value="target">Somente o Oponente</option>
                                  <option value="self_and_target">Mim e o Oponente (Sacrifício)</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.killWhenActiveRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('killWhenActiveRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Conditional Ignore Invulnerability Rules */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                              ⛓️ Ignorar Invulnerabilidade (Condicional)
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Se a habilidade/efeito específico estiver ATIVO no Oponente, esta skill IGNORA a invulnerabilidade dele.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.ignoreInvulnWhenActiveRules || [];
                              handleUpdateSkillField('ignoreInvulnWhenActiveRules', [
                                ...currentRules,
                                { activeSkillName: '' }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.ignoreInvulnWhenActiveRules || editingSkill.ignoreInvulnWhenActiveRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de invulnerabilidade condicional configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.ignoreInvulnWhenActiveRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-amber-400 font-bold">Ignorar invuln. quando ativo:</span>
                                <select
                                  value={rule.activeOn || 'target'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.ignoreInvulnWhenActiveRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeOn: e.target.value === 'self' ? 'self' : 'target' };
                                    handleUpdateSkillField('ignoreInvulnWhenActiveRules', updated);
                                  }}
                                  className="px-2 py-0.5 bg-slate-900 border border-amber-800/60 rounded text-[10px] font-mono text-amber-300 focus:border-amber-500 outline-none"
                                >
                                  <option value="target">No Oponente</option>
                                  <option value="self">Em Mim (Conjurador)</option>
                                </select>
                                <input
                                  type="text"
                                  list="ignoreInvulnSkills-suggestions"
                                  value={rule.activeSkillName}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.ignoreInvulnWhenActiveRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                    handleUpdateSkillField('ignoreInvulnWhenActiveRules', updated);
                                  }}
                                  placeholder="Ex: Two-Headed Wolf"
                                  className="flex-1 min-w-[130px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-white outline-none text-[10px]"
                                />
                                <datalist id="ignoreInvulnSkills-suggestions">
                                  {editingChar?.skills && editingChar.skills.length > 0 ? (
                                    editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                  ) : <option value="" disabled />}
                                </datalist>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.ignoreInvulnWhenActiveRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('ignoreInvulnWhenActiveRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover Regra"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Conditional Stun Rules */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-yellow-400 font-mono">
                              🌀 Stun Condicional
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Se a habilidade/efeito específico estiver ATIVO (em mim ou no Oponente), esta skill STUNNA o inimigo. Escolha quais classes o stun bloqueia.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentRules = editingSkill.stunWhenActiveRules || [];
                              handleUpdateSkillField('stunWhenActiveRules', [
                                ...currentRules,
                                { activeSkillName: '', activeOn: 'target', stunClasses: [], stunTurns: 1 }
                              ]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-yellow-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.stunWhenActiveRules || editingSkill.stunWhenActiveRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de stun condicional configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.stunWhenActiveRules.map((rule, rIdx) => {
                              const ruleClasses = rule.stunClasses || [];
                              const toggleClass = (cls: string) => {
                                const updated = [...(editingSkill.stunWhenActiveRules || [])];
                                const next = ruleClasses.includes(cls) ? ruleClasses.filter(c => c !== cls) : [...ruleClasses, cls];
                                updated[rIdx] = { ...updated[rIdx], stunClasses: next };
                                handleUpdateSkillField('stunWhenActiveRules', updated);
                              };
                              return (
                                <div key={rIdx} className="space-y-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-yellow-400 font-bold">Stunnar quando ativo:</span>
                                    <select
                                      value={rule.activeOn || 'target'}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.stunWhenActiveRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], activeOn: e.target.value === 'self' ? 'self' : 'target' };
                                        handleUpdateSkillField('stunWhenActiveRules', updated);
                                      }}
                                      className="px-2 py-0.5 bg-slate-900 border border-yellow-800/60 rounded text-[10px] font-mono text-yellow-300 focus:border-yellow-500 outline-none"
                                    >
                                      <option value="target">No Oponente</option>
                                      <option value="self">Em Mim (Conjurador)</option>
                                    </select>
                                    <input
                                      type="text"
                                      list="stunWhenSkills-suggestions"
                                      value={rule.activeSkillName}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.stunWhenActiveRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                        handleUpdateSkillField('stunWhenActiveRules', updated);
                                      }}
                                      placeholder="Ex: Two-Headed Wolf"
                                      className="flex-1 min-w-[130px] px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px]"
                                    />
                                    <datalist id="stunWhenSkills-suggestions">
                                      {editingChar?.skills && editingChar.skills.length > 0 ? (
                                        editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                                      ) : <option value="" disabled />}
                                    </datalist>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={1}
                                        max={99}
                                        value={rule.stunTurns || 1}
                                        onChange={(e) => {
                                          const updated = [...(editingSkill.stunWhenActiveRules || [])];
                                          updated[rIdx] = { ...updated[rIdx], stunTurns: parseInt(e.target.value) || 1 };
                                          handleUpdateSkillField('stunWhenActiveRules', updated);
                                        }}
                                        className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                      />
                                      <span className="text-[9px] text-slate-500 font-mono">Turnos</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (editingSkill.stunWhenActiveRules || []).filter((_, i) => i !== rIdx);
                                        handleUpdateSkillField('stunWhenActiveRules', updated.length > 0 ? updated : undefined);
                                      }}
                                      className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                      title="Remover Regra"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold">🧱 Bloquear classes:</span>
                                    {[
                                      { key: 'physical', label: 'Físico' },
                                      { key: 'chakra', label: 'Chakra' },
                                      { key: 'mental', label: 'Mental' },
                                      { key: 'affliction', label: 'Aflição' },
                                    ].map(opt => (
                                      <label key={opt.key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer select-none border transition-all ${ruleClasses.includes(opt.key) ? 'bg-yellow-950/60 border-yellow-700/60 text-yellow-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-yellow-800/50'}`}>
                                        <input
                                          type="checkbox"
                                          checked={ruleClasses.includes(opt.key)}
                                          onChange={() => toggleClass(opt.key)}
                                          className="rounded bg-slate-950 border-yellow-800/60 text-yellow-500 focus:ring-0 w-3 h-3"
                                        />
                                        <span className="text-[9px] font-mono">{opt.label}</span>
                                      </label>
                                    ))}
                                    <span className="text-[9px] text-slate-500 italic">(nenhuma marcada = Stun Completo)</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Counter Success Damage Rules */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                              💥 Dano Bônus no Contra-Ataque
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando o CONTRA-ATAQUE desta skill for efetuado com sucesso (anular uma habilidade ofensiva), o inimigo que atacou recebe o dano direto configurado.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editingSkill.counterSuccessDamageRules || [];
                              handleUpdateSkillField('counterSuccessDamageRules', [...current, { damage: 0 }]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Dano
                          </button>
                        </div>

                        {(!editingSkill.counterSuccessDamageRules || editingSkill.counterSuccessDamageRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhum dano bônus de contra-ataque configurado para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.counterSuccessDamageRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-cyan-400 font-bold">Dano bônus no contra-ataque:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={99999}
                                  value={rule.damage || 0}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.counterSuccessDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damage: parseInt(e.target.value) || 0 };
                                    handleUpdateSkillField('counterSuccessDamageRules', updated);
                                  }}
                                  className="w-20 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px] text-center"
                                />
                                <select
                                  value={rule.damageType || 'direct_damage'}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.counterSuccessDamageRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], damageType: e.target.value as any };
                                    handleUpdateSkillField('counterSuccessDamageRules', updated);
                                  }}
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px] font-mono"
                                >
                                  <option value="direct_damage">🎯 Direto</option>
                                  <option value="damage">💥 Normal</option>
                                  <option value="dot">🔥 Queimadura</option>
                                  <option value="bleeding">🩸 Sangramento</option>
                                  <option value="affliction">💀 Aflição</option>
                                  <option value="life_steal">🧛 Roubo de Vida</option>
                                </select>
                                <span className="text-[9px] text-slate-400">de dano ao inimigo</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.counterSuccessDamageRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('counterSuccessDamageRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Counter Success Stun Rules */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-yellow-400 font-mono">
                              ⛓️ Stun no Contra-Ataque
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando o CONTRA-ATAQUE desta skill for efetuado com sucesso (anular uma habilidade ofensiva), o inimigo que atacou fica stunado por X turnos e recebe dano adicional de skills das classes escolhidas.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editingSkill.counterSuccessStunRules || [];
                              handleUpdateSkillField('counterSuccessStunRules', [...current, { stunTurns: 1, bonusDamage: 0, damageClasses: [] }]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-yellow-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.counterSuccessStunRules || editingSkill.counterSuccessStunRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhum stun de contra-ataque configurado para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.counterSuccessStunRules.map((rule, rIdx) => {
                              const ruleClasses = rule.damageClasses || [];
                              return (
                                <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                  <span className="text-yellow-400 font-bold">Stun no contra-ataque:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={rule.stunTurns || 1}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.counterSuccessStunRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], stunTurns: parseInt(e.target.value) || 1 };
                                      handleUpdateSkillField('counterSuccessStunRules', updated);
                                    }}
                                    className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px] text-center"
                                  />
                                  <span className="text-[9px] text-slate-400">turno(s) de stun</span>
                                  <span className="text-yellow-400 font-bold">+ dano:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={99999}
                                    value={rule.bonusDamage || 0}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.counterSuccessStunRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], bonusDamage: parseInt(e.target.value) || 0 };
                                      handleUpdateSkillField('counterSuccessStunRules', updated);
                                    }}
                                    className="w-20 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-yellow-500 rounded text-white outline-none text-[10px] text-center"
                                  />
                                  <span className="text-[9px] text-slate-400">de dano adicional</span>
                                  <div className="flex flex-wrap items-center gap-1 w-full pt-1">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold">⚔️ Classes que dão o dano adicional nele:</span>
                                    {[
                                      { key: 'physical', label: 'Físico' },
                                      { key: 'chakra', label: 'Chakra' },
                                      { key: 'mental', label: 'Mental' },
                                      { key: 'affliction', label: 'Aflição' },
                                    ].map(opt => (
                                      <label key={opt.key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer select-none border transition-all ${ruleClasses.includes(opt.key) ? 'bg-yellow-950/60 border-yellow-700/60 text-yellow-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-yellow-800/50'}`}>
                                        <input
                                          type="checkbox"
                                          checked={ruleClasses.includes(opt.key)}
                                          onChange={() => {
                                            const updated = [...(editingSkill.counterSuccessStunRules || [])];
                                            const next = ruleClasses.includes(opt.key) ? ruleClasses.filter(c => c !== opt.key) : [...ruleClasses, opt.key];
                                            updated[rIdx] = { ...updated[rIdx], damageClasses: next };
                                            handleUpdateSkillField('counterSuccessStunRules', updated);
                                          }}
                                          className="rounded bg-slate-950 border-yellow-800/60 text-yellow-500 focus:ring-0 w-3 h-3"
                                        />
                                        <span className="text-[9px] font-mono">{opt.label}</span>
                                      </label>
                                    ))}
                                    <span className="text-[9px] text-slate-500 italic">(nenhuma marcada = dano adicional em qualquer classe)</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (editingSkill.counterSuccessStunRules || []).filter((_, i) => i !== rIdx);
                                      handleUpdateSkillField('counterSuccessStunRules', updated.length > 0 ? updated : undefined);
                                    }}
                                    className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                    title="Remover"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Reflect by Stack Rules */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">
                              🔁 Reflexão por Stack
                            </span>
                            <p className="text-[9px] text-slate-400">
                              Quando o inimigo que possui esta stack (marca) atacar o portador que <strong>TAMBÉM</strong> possui a stack, a skill ofensiva do atacante usada no portador é <strong>redirecionada ao ALIADO do atacante</strong> (em vez de acertar o portador). Só <strong>não</strong> redireciona se a skill inimiga estiver marcada como <strong>"Esta habilidade não pode ser refletida"</strong>. A reflexão dura os <strong>turnos</strong> configurados em cada regra (vazio/0 = enquanto a stack estiver ativa).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editingSkill.reflectByStackRules || [];
                              handleUpdateSkillField('reflectByStackRules', [...current, { activeStackName: '' }]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Stack
                          </button>
                        </div>

                        {(!editingSkill.reflectByStackRules || editingSkill.reflectByStackRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma stack de reflexão configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.reflectByStackRules.map((rule, rIdx) => (
                              <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                <span className="text-purple-400 font-bold">Stack a refletir:</span>
                                <input
                                  type="text"
                                  value={rule.activeStackName || ''}
                                  onChange={(e) => {
                                    const updated = [...(editingSkill.reflectByStackRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], activeStackName: e.target.value };
                                    handleUpdateSkillField('reflectByStackRules', updated);
                                  }}
                                  placeholder="ex: Marca do Diabo"
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px] flex-1 min-w-[160px]"
                                />
                                <span className="text-[9px] text-slate-500 italic">(vazio = própria stack desta skill)</span>
                                <span className="text-slate-400 font-bold">Turnos:</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={rule.durationTurns ?? ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    const parsed = v === '' ? undefined : Math.max(0, Math.floor(Number(v) || 0));
                                    const updated = [...(editingSkill.reflectByStackRules || [])];
                                    updated[rIdx] = { ...updated[rIdx], durationTurns: parsed };
                                    handleUpdateSkillField('reflectByStackRules', updated);
                                  }}
                                  placeholder="0 = ∞"
                                  className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px] w-16 text-center"
                                />
                                <span className="text-[9px] text-slate-500 italic">(0/vazio = permanente)</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingSkill.reflectByStackRules || []).filter((_, i) => i !== rIdx);
                                    handleUpdateSkillField('reflectByStackRules', updated.length > 0 ? updated : undefined);
                                  }}
                                  className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                  title="Remover"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reduzir Custo de Chakra do Alvo */}
                      <div className="md:col-span-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                              💧 Reduzir Custo de Chakra do Alvo
                            </span>
                            <p className="text-[9px] text-slate-400">
                              As skills do(s) alvo(s) desta skill passam a custar MENOS do tipo de chakra escolhido pela quantidade definida por X turnos. Ex.: alvo = sua equipe, reduz -1 de chakra aleatório nas skills que tenham chakra aleatório no custo.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editingSkill.chakraCostReduceRules || [];
                              handleUpdateSkillField('chakraCostReduceRules', [...current, { chakraTypes: ['Rand'], amount: 1, durationTurns: 2 }]);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700/80 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.chakraCostReduceRules || editingSkill.chakraCostReduceRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma redução de custo de chakra configurada para esta habilidade.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {editingSkill.chakraCostReduceRules.map((rule, rIdx) => {
                              const ruleTypes = rule.chakraTypes || [];
                              return (
                                <div key={rIdx} className="space-y-2 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-cyan-400 font-bold">Reduzir:</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={rule.amount || 1}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.chakraCostReduceRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], amount: parseInt(e.target.value) || 1 };
                                        handleUpdateSkillField('chakraCostReduceRules', updated);
                                      }}
                                      className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px] text-center"
                                    />
                                    <span className="text-[9px] text-slate-400">chakra por</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={rule.durationTurns || 1}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.chakraCostReduceRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], durationTurns: parseInt(e.target.value) || 1 };
                                        handleUpdateSkillField('chakraCostReduceRules', updated);
                                      }}
                                      className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px] text-center"
                                    />
                                    <span className="text-[9px] text-slate-400">turno(s)</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (editingSkill.chakraCostReduceRules || []).filter((_, i) => i !== rIdx);
                                        handleUpdateSkillField('chakraCostReduceRules', updated.length > 0 ? updated : undefined);
                                      }}
                                      className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                      title="Remover"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold">🧬 Tipos de Chakra a reduzir:</span>
                                    {([
                                      { value: 'Tai', label: '🥋 Tai' },
                                      { value: 'Nin', label: '🌀 Nin' },
                                      { value: 'Gen', label: '🧠 Gen' },
                                      { value: 'Blood', label: '🩸 Blood' },
                                      { value: 'Rand', label: '🎲 Rand' },
                                    ] as { value: ChakraType; label: string }[]).map(opt => {
                                      const isSelected = ruleTypes.includes(opt.value);
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() => {
                                            const updated = [...(editingSkill.chakraCostReduceRules || [])];
                                            const next = isSelected ? ruleTypes.filter(t => t !== opt.value) : [...ruleTypes, opt.value];
                                            updated[rIdx] = { ...updated[rIdx], chakraTypes: next };
                                            handleUpdateSkillField('chakraCostReduceRules', updated);
                                          }}
                                          className={`px-1.5 py-0.5 rounded cursor-pointer select-none border transition-all ${isSelected ? 'bg-cyan-950/60 border-cyan-700/60 text-cyan-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-cyan-800/50'}`}
                                        >
                                          <span className="text-[9px] font-mono">{opt.label}</span>
                                        </button>
                                      );
                                    })}
                                    <span className="text-[9px] text-slate-500 italic">(só afeta skills que tenham o tipo escolhido no custo)</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* ⚡ Combo por Stacks (Efeitos ao usar a skill com X stacks) */}
                      <div className="md:col-span-2 bg-purple-950/20 p-3 rounded-xl border border-purple-800/50 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">
                              ⚡ Combo por Stacks (Efeitos ao usar com X stacks)
                            </span>
                            <p className="text-[9px] text-purple-200/70">
                              Ao usar a skill com determinada quantidade de stacks do conjurador, aplica os efeitos configurados. Ex.: 1ª vez = nada (só ganha a stack), 2ª vez = Stun, 3ª vez = Remove Chakra + Stun. Se a stack sumir (não usar a skill a tempo), o combo reinicia.
                            </p>
                            <p className="text-[9px] text-amber-300/80 mt-1 bg-purple-950/50 border border-purple-900/50 p-1.5 rounded-lg">
                              💡 <span className="font-bold">Importante:</span> a skill precisa estar com <span className="font-bold text-white">"Stackable (Acumulável)" ativo + Stack Gain "Ao usar a skill" + duração da stack de 1 turno</span> para o combo funcionar como no exemplo.
                            </p>
                            <p className="text-[9px] text-slate-400 mt-1">
                              🔀 <span className="font-bold text-purple-300">"↗ Em diante":</span> ativa o combo com X stacks <span className="text-white">ou mais</span> (ex.: "3 em diante" = 3x, 4x, 5x... sempre o maior satisfeito). Desativado = só ativa com o número exato de stacks.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editingSkill.stackUseEffectRules || [];
                              const nextStacks = current.length > 0 ? Math.max(...current.map(r => r.requiredStacks || 1)) + 1 : 2;
                              handleUpdateSkillField('stackUseEffectRules', [...current, { requiredStacks: nextStacks, onwards: true, stun: true, stunDuration: 1, stunType: [], chakraRemove: 0, stackType: '' }]);
                            }}
                            className="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-800/50 text-purple-300 border border-purple-800/60 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Etapa do Combo
                          </button>
                        </div>

                        {(!editingSkill.stackUseEffectRules || editingSkill.stackUseEffectRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma etapa de combo configurada.
                          </p>
                        ) : (
                          <div className="space-y-3 pt-1">
                            {editingSkill.stackUseEffectRules.map((rule, rIdx) => (
                              <div key={rIdx} className="bg-slate-950 rounded-lg border border-purple-900/50 text-[10px] font-mono overflow-hidden">
                                <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-slate-900/60 border-b border-purple-900/40">
                                  <span className="text-purple-400 font-bold">Com o combo em:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={rule.requiredStacks}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.stackUseEffectRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], requiredStacks: parseInt(e.target.value) || 1 };
                                      handleUpdateSkillField('stackUseEffectRules', updated);
                                    }}
                                    className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px] text-center"
                                  />
                                  <label className="flex items-center gap-1 cursor-pointer select-none bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                                    <input
                                      type="checkbox"
                                      checked={rule.onwards !== false}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.stackUseEffectRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], onwards: e.target.checked };
                                        handleUpdateSkillField('stackUseEffectRules', updated);
                                      }}
                                      className="accent-purple-500 rounded cursor-pointer"
                                    />
                                    <span className="text-[9px] text-purple-300 font-bold">{rule.onwards !== false ? '↗ em diante' : 'exato'}</span>
                                  </label>
                                  <span className="text-[9px] text-slate-400">{rule.onwards !== false ? '→ aplica:' : 'stack(s) → aplica:'}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (editingSkill.stackUseEffectRules || []).filter((_, i) => i !== rIdx);
                                      handleUpdateSkillField('stackUseEffectRules', updated.length > 0 ? updated : undefined);
                                    }}
                                    className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                    title="Remover etapa"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 px-2 py-2">
                                  <label className="flex items-center gap-1 cursor-pointer select-none bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                                    <input
                                      type="checkbox"
                                      checked={rule.stun || false}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.stackUseEffectRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], stun: e.target.checked };
                                        handleUpdateSkillField('stackUseEffectRules', updated);
                                      }}
                                      className="accent-purple-500 rounded cursor-pointer"
                                    />
                                    <span className="text-[9px] text-purple-300 font-bold">⚡ Stun</span>
                                  </label>
                                  {rule.stun && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-slate-400">por</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={rule.stunDuration || 1}
                                        onChange={(e) => {
                                          const updated = [...(editingSkill.stackUseEffectRules || [])];
                                          updated[rIdx] = { ...updated[rIdx], stunDuration: parseInt(e.target.value) || 1 };
                                          handleUpdateSkillField('stackUseEffectRules', updated);
                                        }}
                                        className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px] text-center"
                                      />
                                      <span className="text-[9px] text-slate-400">turno(s)</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-slate-400 font-bold">🔥 Remove Chakra:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={99}
                                      value={rule.chakraRemove || 0}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.stackUseEffectRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], chakraRemove: parseInt(e.target.value) || 0 };
                                        handleUpdateSkillField('stackUseEffectRules', updated);
                                      }}
                                      className="w-12 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded text-white outline-none text-[10px] text-center"
                                    />
                                  </div>
                                </div>
                                {rule.stun && (
                                  <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold">🚫 Bloquear tipos de skill (vazio = Stun Completo):</span>
                                    {([
                                      { value: 'physical', label: '🥋 Físico' },
                                      { value: 'mental', label: '🧠 Mental' },
                                      { value: 'affliction', label: '💀 Aflição' },
                                      { value: 'chakra', label: '🌀 Chakra' },
                                    ] as { value: string; label: string }[]).map(opt => {
                                      const ruleTypes = rule.stunType || [];
                                      const isSelected = ruleTypes.includes(opt.value);
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() => {
                                            const updated = [...(editingSkill.stackUseEffectRules || [])];
                                            const next = isSelected ? ruleTypes.filter(t => t !== opt.value) : [...ruleTypes, opt.value];
                                            updated[rIdx] = { ...updated[rIdx], stunType: next };
                                            handleUpdateSkillField('stackUseEffectRules', updated);
                                          }}
                                          className={`px-1.5 py-0.5 rounded cursor-pointer select-none border transition-all ${isSelected ? 'bg-purple-950/60 border-purple-700/60 text-purple-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-purple-800/50'}`}
                                        >
                                          <span className="text-[9px] font-mono">{opt.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 🔁 Skill em Mim com Stack (selfCastStackRules) */}
                      <div className="md:col-span-2 bg-cyan-950/20 p-3 rounded-xl border border-cyan-800/50 space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                              🔁 Skill em Mim com Stack (Auto-Cast em si mesmo)
                            </span>
                            <p className="text-[9px] text-cyan-200/70">
                              Se o conjurador tiver X stacks <span className="font-bold text-white">OU</span> a skill indicada estiver ATIVA nele, ao usar esta skill UMA skill do PRÓPRIO personagem é aplicada/usada nele mesmo (dano, cura, escudo, buffs, DoT, cleanse, chakra, invisibilidade, stun...).
                            </p>
                            <p className="text-[9px] text-slate-400 mt-1">
                              🔀 <span className="font-bold text-cyan-300">StackType:</span> preencha com o tipo da stack OU o nome da skill que deve estar ativa. Vazio = usa o stackType/nome desta própria skill.
                            </p>
                            <p className="text-[9px] text-slate-400 mt-1">
                              👁️ <span className="font-bold text-cyan-300">"Invisível para o oponente":</span> a skill é aplicada SEM log e SEM texto flutuante — só quem usou percebe.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editingSkill.selfCastStackRules || [];
                              handleUpdateSkillField('selfCastStackRules', [...current, { stackType: '', requiredStacks: 1, skillName: '', invisible: false }]);
                            }}
                            className="px-2.5 py-1 bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-300 border border-cyan-800/60 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            + Adicionar Regra
                          </button>
                        </div>

                        {(!editingSkill.selfCastStackRules || editingSkill.selfCastStackRules.length === 0) ? (
                          <p className="text-[9px] text-slate-500 font-mono italic">
                            Nenhuma regra de auto-cast configurada.
                          </p>
                        ) : (
                          <div className="space-y-3 pt-1">
                            {editingSkill.selfCastStackRules.map((rule, rIdx) => (
                              <div key={rIdx} className="bg-slate-950 rounded-lg border border-cyan-900/50 text-[10px] font-mono overflow-hidden">
                                <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-slate-900/60 border-b border-cyan-900/40">
                                  <span className="text-cyan-400 font-bold">Com</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={rule.requiredStacks}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.selfCastStackRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], requiredStacks: parseInt(e.target.value) || 1 };
                                      handleUpdateSkillField('selfCastStackRules', updated);
                                    }}
                                    className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px] text-center"
                                  />
                                  <span className="text-[9px] text-slate-400">stack(s) de:</span>
                                  <input
                                    list="self-cast-stacktype-list"
                                    type="text"
                                    value={rule.stackType || ''}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.selfCastStackRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], stackType: e.target.value };
                                      handleUpdateSkillField('selfCastStackRules', updated);
                                    }}
                                    placeholder="StackType (vazio = desta skill)"
                                    className="w-44 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px]"
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-slate-900/40 border-b border-cyan-900/40">
                                  <span className="text-[9px] text-slate-400 font-bold">💡 Minha skill ATIVA em mim (opcional):</span>
                                  <input
                                    list="self-cast-skill-list"
                                    type="text"
                                    value={rule.activeSkillName || ''}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.selfCastStackRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], activeSkillName: e.target.value };
                                      handleUpdateSkillField('selfCastStackRules', updated);
                                    }}
                                    placeholder="Se esta skill estiver ativa, dispara (mesmo sem stacks)"
                                    className="flex-1 min-w-40 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...(editingSkill.selfCastStackRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], activeSkillName: undefined };
                                      handleUpdateSkillField('selfCastStackRules', updated);
                                    }}
                                    className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer"
                                    title="Remover skill ativa"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (editingSkill.selfCastStackRules || []).filter((_, i) => i !== rIdx);
                                      handleUpdateSkillField('selfCastStackRules', updated.length > 0 ? updated : undefined);
                                    }}
                                    className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer ml-auto"
                                    title="Remover regra"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 px-2 py-2">
                                  <span className="text-[9px] text-slate-400 font-bold">🎯 Aplica em mim:</span>
                                  <input
                                    list="self-cast-skill-list"
                                    type="text"
                                    value={rule.skillName || ''}
                                    onChange={(e) => {
                                      const updated = [...(editingSkill.selfCastStackRules || [])];
                                      updated[rIdx] = { ...updated[rIdx], skillName: e.target.value };
                                      handleUpdateSkillField('selfCastStackRules', updated);
                                    }}
                                    placeholder="Nome de uma skill minha (autocomplete)"
                                    className="flex-1 min-w-40 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded text-white outline-none text-[10px]"
                                  />
                                  <label className="flex items-center gap-1 cursor-pointer select-none bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                                    <input
                                      type="checkbox"
                                      checked={rule.invisible || false}
                                      onChange={(e) => {
                                        const updated = [...(editingSkill.selfCastStackRules || [])];
                                        updated[rIdx] = { ...updated[rIdx], invisible: e.target.checked };
                                        handleUpdateSkillField('selfCastStackRules', updated);
                                      }}
                                      className="accent-cyan-500 rounded cursor-pointer"
                                    />
                                    <span className="text-[9px] text-cyan-300 font-bold">👁️ Invisível p/ oponente</span>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <datalist id="self-cast-skill-list">
                          {editingChar?.skills && editingChar.skills.length > 0 ? (
                            editingChar.skills.map(s => <option key={s.name} value={s.name} />)
                          ) : null}
                        </datalist>
                        <datalist id="self-cast-stacktype-list">
                          {editingChar?.skills && editingChar.skills.length > 0 ? (
                            editingChar.skills.filter(s => s.stackable && s.stackType).map(s => <option key={s.stackType} value={s.stackType!} />)
                          ) : null}
                        </datalist>
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
                                  value={editingSkill.damageDuration === 99999 ? 0 : (editingSkill.damageDuration || 1)}
                                  title={editingSkill.damageDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-red-400 font-mono uppercase font-bold">💔 Dano = HP Perdido:</span>
                                <select
                                  value={editingSkill.missingHpDamageType || ''}
                                  onChange={(e) => handleUpdateSkillField('missingHpDamageType', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 focus:border-red-600 outline-none"
                                >
                                  <option value="">Desativado</option>
                                  <option value="normal">Dano Normal</option>
                                  <option value="direct">Dano Direto</option>
                                  <option value="dot">Queimadura (DoT)</option>
                                  <option value="bleeding">Sangramento</option>
                                  <option value="affliction">Aflição</option>
                                </select>
                              </div>

                              {/* Dano Bônus por Passo de HP Perdido */}
                              <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-rose-400 font-mono font-bold uppercase flex items-center gap-1">
                                    💔 Dano Bônus por HP Perdido
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                  <div>
                                    <span className="text-slate-400 block text-[9px] mb-0.5">+Dano Adicional:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={500}
                                      value={editingSkill.bonusDamagePerMissingHp || 0}
                                      onChange={(e) => handleUpdateSkillField('bonusDamagePerMissingHp', parseInt(e.target.value) || 0)}
                                      placeholder="Ex: 10"
                                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-white text-xs font-bold text-center"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[9px] mb-0.5">A cada HP Perdido:</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={1000}
                                      value={editingSkill.missingHpStep || 20}
                                      onChange={(e) => handleUpdateSkillField('missingHpStep', parseInt(e.target.value) || 20)}
                                      placeholder="Ex: 20"
                                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 focus:border-rose-500 rounded text-white text-xs font-bold text-center"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[9px] mb-0.5">Origem da Vida:</span>
                                    <select
                                      value={editingSkill.missingHpSource || 'caster'}
                                      onChange={(e) => handleUpdateSkillField('missingHpSource', e.target.value)}
                                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-amber-300 outline-none"
                                    >
                                      <option value="caster">Conjurador (Mim)</option>
                                      <option value="target">Alvo (Inimigo)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block text-[9px] mb-0.5">Tipo do Bônus:</span>
                                    <select
                                      value={editingSkill.missingHpBonusType || 'damage'}
                                      onChange={(e) => handleUpdateSkillField('missingHpBonusType', e.target.value)}
                                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-rose-300 outline-none"
                                    >
                                      <option value="damage">💥 Dano Normal</option>
                                      <option value="direct">🎯 Dano Direto</option>
                                      <option value="dot">🔥 DoT (Queima)</option>
                                      <option value="bleeding">🩸 Sangramento</option>
                                      <option value="affliction">💀 Aflição</option>
                                    </select>
                                  </div>
                                </div>
                                {editingSkill.bonusDamagePerMissingHp && editingSkill.bonusDamagePerMissingHp > 0 ? (
                                  <p className="text-[9px] text-emerald-400 font-mono italic">
                                    💡 Regra: Dano Base ({editingSkill.damage || 0}) + {editingSkill.bonusDamagePerMissingHp} de dano bônus a cada {editingSkill.missingHpStep || 20} HP perdidos ({editingSkill.missingHpSource === 'target' ? 'Alvo' : 'Conjurador'}).
                                  </p>
                                ) : null}
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
                                  value={editingSkill.directDamageDuration === 99999 ? 0 : (editingSkill.directDamageDuration || 1)}
                                  title={editingSkill.directDamageDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('directDamageDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.directDamageDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('directDamageDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
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
                                          value={editingSkill.counterAttackDuration === 99999 ? 0 : (editingSkill.counterAttackDuration || 1)}
                                          title={editingSkill.counterAttackDuration === 99999 ? '♾️ Infinito' : 'Turnos ativo'}
                                          onChange={(e) => handleUpdateSkillField('counterAttackDuration', parseInt(e.target.value) || 1)}
                                          className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                        />
                                        <label className="flex items-center gap-1 cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            checked={editingSkill.counterAttackDuration === 99999}
                                            onChange={(e) => handleUpdateSkillField('counterAttackDuration', e.target.checked ? 99999 : 1)}
                                            className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                          />
                                          <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                        </label>
                                        <span className="text-[9px] text-slate-500 font-mono">Turnos ativo</span>
                                  </div>

                                  <label className="flex items-start gap-2 text-[10px] cursor-pointer select-none bg-red-950/30 border border-red-900/50 px-2 py-1.5 rounded-lg">
                                    <input
                                      type="checkbox"
                                      checked={editingSkill.counterAttackUntilTriggered || false}
                                      onChange={(e) => handleUpdateSkillField('counterAttackUntilTriggered', e.target.checked)}
                                      className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3.5 h-3.5 mt-0.5"
                                    />
                                    <span className="text-red-300 font-bold leading-tight">
                                      ⏳ Persistir até contra-atacar
                                      <span className="block text-[9px] text-slate-400 font-normal font-mono mt-0.5">
                                        Fica marcado no alvo por tempo INFINITO e só sai quando de fato contra-atacar uma habilidade dele (ignora "Turnos ativo").
                                      </span>
                                    </span>
                                  </label>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">Modo de Anulação:</span>
                                    <select
                                      value={editingSkill.counterAttackMode || 'first'}
                                      onChange={(e) => handleUpdateSkillField('counterAttackMode', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 outline-none w-full"
                                    >
                                      <option value="first">Anular somente a 1ª skill (consome ao anular)</option>
                                      <option value="all">Anular TODAS as skills durante a duração</option>
                                    </select>
                                    <p className="text-[9px] text-slate-500 font-mono leading-tight">
                                      {editingSkill.counterAttackMode === 'all'
                                        ? 'Todas as skills na janela de turnos são anuladas, sem consumir o contra-ataque.'
                                        : 'A 1ª skill anulada consome o contra-ataque; as demais passam normalmente.'}
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">Tipo de Anulação:</span>
                                    <select
                                      value={editingSkill.counterAttackType || 'defender'}
                                      onChange={(e) => handleUpdateSkillField('counterAttackType', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 outline-none w-full"
                                    >
                                      <option value="attacker">No inimigo: anula as skills OFENSIVAS usadas por ele</option>
                                      <option value="defender">No aliado/alvo: anula as skills usadas NELE</option>
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
                                    <p className="text-[9px] text-slate-500 font-mono leading-tight">
                                      Ex.: marque em um aliado (defender) para anular a 1ª skill usada nele, ou em todos os inimigos (attacker) para anular as skills deles pelos turnos configurados.
                                    </p>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[9px] text-red-400 font-mono uppercase font-bold">🗂️ Classes que serão anuladas:</span>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSkillField('counterAttackClasses', [])}
                                        className="text-[8px] px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 font-mono font-bold border border-slate-800 transition-all cursor-pointer"
                                        title="Anular qualquer skill (todas as classes)"
                                      >
                                        ❌ Limpar (anula qualquer skill)
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {[
                                        { value: 'A distancia', label: '🎯 A distância' },
                                        { value: 'Chakra', label: '🌀 Chakra' },
                                        { value: 'Mental', label: '🧠 Mental' },
                                        { value: 'Físico', label: '⚔️ Físico' },
                                        { value: 'Aflição', label: '🩸 Aflição' },
                                        { value: 'Amigável', label: '🤝 Amigável' },
                                      ].map((opt) => {
                                        const cur = editingSkill.counterAttackClasses || [];
                                        const isSelected = cur.some(c =>
                                          c.toLowerCase() === opt.value.toLowerCase() ||
                                          (opt.value === 'A distancia' && (c.toLowerCase().includes('distancia') || c.toLowerCase().includes('distância')))
                                        );
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                              let updated: string[];
                                              if (isSelected) {
                                                updated = cur.filter(c =>
                                                  c.toLowerCase() !== opt.value.toLowerCase() &&
                                                  !(opt.value === 'A distancia' && (c.toLowerCase().includes('distancia') || c.toLowerCase().includes('distância')))
                                                );
                                              } else {
                                                updated = [...cur, opt.value];
                                              }
                                              handleUpdateSkillField('counterAttackClasses', updated);
                                            }}
                                            className={`px-1.5 py-1 rounded-lg text-[9px] font-mono font-bold border transition-all cursor-pointer select-none ${
                                              isSelected
                                                ? 'bg-red-950 border-red-500/70 text-red-200 shadow-md shadow-red-950/50'
                                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                            }`}
                                          >
                                            {opt.label} <span className="text-[8px] font-bold">{isSelected ? '✓' : ''}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <p className="text-[9px] text-slate-500 font-mono leading-tight">
                                      {(!editingSkill.counterAttackClasses || editingSkill.counterAttackClasses.length === 0)
                                        ? 'Nenhuma classe selecionada → anula QUALQUER skill (todas as classes).'
                                        : `Apenas skills das classes: ${editingSkill.counterAttackClasses.join(', ')}. Skills de outras classes NÃO serão anuladas.`}
                                    </p>
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
                                      value={editingSkill.reflectDuration === 99999 ? 0 : (editingSkill.reflectDuration || 1)}
                                      title={editingSkill.reflectDuration === 99999 ? '♾️ Infinito' : 'Turnos ativo'}
                                      onChange={(e) => handleUpdateSkillField('reflectDuration', parseInt(e.target.value) || 1)}
                                      className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                    />
                                    <label className="flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={editingSkill.reflectDuration === 99999}
                                        onChange={(e) => handleUpdateSkillField('reflectDuration', e.target.checked ? 99999 : 1)}
                                        className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                    </label>
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
                                  value={editingSkill.healDuration === 99999 ? 0 : (editingSkill.healDuration || 1)}
                                  title={editingSkill.healDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('healDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.healDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('healDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
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
                                  value={editingSkill.stunTurns === 99999 ? 0 : (editingSkill.stunTurns || 0)}
                                  title={editingSkill.stunTurns === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    handleUpdateSkillField('stunTurns', val);
                                  }}
                                  className="w-20 px-2 py-1.5 bg-slate-900 border border-purple-900/60 focus:border-purple-500 rounded-lg text-purple-400 font-mono text-xs text-center font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.stunTurns === 99999}
                                    onChange={(e) => handleUpdateSkillField('stunTurns', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-purple-400 font-mono">♾️ Infinito</span>
                                </label>
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
                                        const allTypes = ['ranged', 'chakra', 'mental', 'physical', 'affliction', 'friendly'];
                                        const isAllSelected = (editingSkill.stunType || []).length >= 6;
                                        handleUpdateSkillField('stunType', isAllSelected ? ['physical'] : allTypes);
                                      }}
                                      className="text-[9px] px-2 py-0.5 rounded bg-purple-900/50 hover:bg-purple-800 text-purple-300 font-mono font-bold border border-purple-700/60 transition-all cursor-pointer select-none"
                                    >
                                      {(editingSkill.stunType || []).length >= 6 ? '❌ Desmarcar Todos' : '⚡ Stun Completo (Todos)'}
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                      { value: 'ranged', altVal: 'A distancia', label: '🎯 Stun A distancia', desc: 'Ataques à distância' },
                                      { value: 'chakra', altVal: 'Chakra', label: '🌀 Stun Chakra', desc: 'Selamento / corte de fluxo' },
                                      { value: 'mental', altVal: 'Mental', label: '🧠 Stun Mental', desc: 'Genjutsu / efeito de ilusão' },
                                      { value: 'physical', altVal: 'Físico', label: '⚔️ Stun Físico', desc: 'Impacto marcial / corporal' },
                                      { value: 'affliction', altVal: 'Aflição', label: '🩸 Stun Aflição', desc: 'Hemorragia / venenos / dor' },
                                      { value: 'friendly', altVal: 'Amigável', label: '🤝 Stun Amigável', desc: 'Suporte / pacificação' },
                                    ].map((opt) => {
                                      const currentTypes = editingSkill.stunType || [];
                                      const isSelected = currentTypes.some(t => 
                                        t.toLowerCase() === opt.value.toLowerCase() || 
                                        t.toLowerCase() === opt.altVal.toLowerCase() ||
                                        (opt.value === 'ranged' && (t.toLowerCase().includes('distancia') || t.toLowerCase().includes('distância')))
                                      );
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() => {
                                            let updated: string[];
                                            if (isSelected) {
                                              updated = currentTypes.filter(t => 
                                                t.toLowerCase() !== opt.value.toLowerCase() && 
                                                t.toLowerCase() !== opt.altVal.toLowerCase() &&
                                                !(opt.value === 'ranged' && (t.toLowerCase().includes('distancia') || t.toLowerCase().includes('distância')))
                                              );
                                            } else {
                                              updated = [...currentTypes, opt.value];
                                            }
                                            handleUpdateSkillField('stunType', updated);
                                          }}
                                          className={`p-1.5 text-left rounded-lg border transition-all cursor-pointer ${
                                            isSelected
                                              ? 'bg-purple-950 border-purple-500 text-purple-200 font-bold shadow-md shadow-purple-950/60'
                                              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                                          }`}
                                        >
                                          <div className="text-[10px] font-mono flex items-center justify-between">
                                            <span>{opt.label}</span>
                                            <span className="text-[9px] font-bold">{isSelected ? '✓' : ''}</span>
                                          </div>
                                          <div className="text-[8px] text-slate-500 font-mono leading-tight mt-0.5">{opt.desc}</div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="text-[9px] text-slate-400 font-mono leading-normal bg-purple-950/20 border border-purple-900/30 p-2 rounded-lg mt-1">
                                    🎯 <span className="font-bold text-purple-300">Resumo:</span> Ao usar esta habilidade, o alvo receberá <span className="text-purple-400 font-bold font-mono">{editingSkill.stunTurns} {editingSkill.stunTurns === 1 ? 'turno' : 'turnos'}</span> de <span className="text-pink-400 font-bold font-mono uppercase">{(editingSkill.stunType && editingSkill.stunType.length > 0) ? editingSkill.stunType.map(t => t === 'physical' ? 'Físico' : t === 'mental' ? 'Mental' : t === 'affliction' ? 'Aflição' : t === 'chakra' ? 'Chakra' : t === 'ranged' ? 'A distancia' : t === 'friendly' ? 'Amigável' : t).join(' + ') : 'Stun'}</span>.
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
                                      value={editingSkill.removeShieldDuration === 99999 ? 0 : (editingSkill.removeShieldDuration || 1)}
                                      title={editingSkill.removeShieldDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                      onChange={(e) => handleUpdateSkillField('removeShieldDuration', parseInt(e.target.value) || 1)}
                                      className="w-14 px-1.5 py-1 bg-slate-900 border border-amber-900/60 focus:border-amber-500 rounded text-center text-xs font-mono text-amber-400 font-bold"
                                    />
                                    <label className="flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={editingSkill.removeShieldDuration === 99999}
                                        onChange={(e) => handleUpdateSkillField('removeShieldDuration', e.target.checked ? 99999 : 1)}
                                        className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                    </label>
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
                                  value={editingSkill.gainChakraDuration === 99999 ? 0 : (editingSkill.gainChakraDuration || 1)}
                                  title={editingSkill.gainChakraDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('gainChakraDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.gainChakraDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('gainChakraDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="mt-1.5 pt-1.5 border-t border-blue-900/30">
                                <div className="flex items-center justify-between">
                                  <span className="block text-[9px] text-blue-400 font-mono uppercase font-bold">Chakra Gerado:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const isAllSelected = (editingSkill.gainChakraTypes || []).includes('Rand');
                                      handleUpdateSkillField('gainChakraTypes', isAllSelected ? [] : ['Rand']);
                                    }}
                                    className="text-[9px] px-2 py-0.5 rounded bg-blue-900/50 hover:bg-blue-800 text-blue-300 font-mono font-bold border border-blue-700/60 transition-all cursor-pointer select-none"
                                  >
                                    {(editingSkill.gainChakraTypes || []).includes('Rand') ? '❌ Padrão' : '🎲 Aleatório'}
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 mt-1">
                                  {([
                                    { value: 'Tai', label: '🥋 Taijutsu', desc: 'Gera chakra Tai' },
                                    { value: 'Nin', label: '🌀 Ninjutsu', desc: 'Gera chakra Nin' },
                                    { value: 'Gen', label: '🧠 Genjutsu', desc: 'Gera chakra Gen' },
                                    { value: 'Blood', label: '🩸 Kekkei Genkai', desc: 'Gera chakra Blood' },
                                    { value: 'Existing', label: '♻️ Dos Existentes', desc: 'Aleatório entre os que o alvo já tem' },
                                  ] as { value: string; label: string; desc: string }[]).map((opt) => {
                                    const currentTypes = editingSkill.gainChakraTypes || [];
                                    const isSelected = currentTypes.includes(opt.value);
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => {
                                          const updated = isSelected ? currentTypes.filter(t => t !== opt.value) : [...currentTypes, opt.value];
                                          handleUpdateSkillField('gainChakraTypes', updated);
                                        }}
                                        className={`p-1.5 text-left rounded-lg border transition-all cursor-pointer ${
                                          isSelected
                                            ? 'bg-blue-950 border-blue-500 text-blue-200 font-bold shadow-md shadow-blue-950/60'
                                            : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                                        }`}
                                      >
                                        <div className="text-[10px] font-mono flex items-center justify-between">
                                          <span>{opt.label}</span>
                                          <span className="text-[9px] font-bold">{isSelected ? '✓' : ''}</span>
                                        </div>
                                        <div className="text-[8px] text-slate-500 font-mono leading-tight mt-0.5">{opt.desc}</div>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="text-[8px] text-slate-500 font-mono mt-1">Sem seleção ou 🎲 Aleatório = qualquer tipo. Vários marcados = sorteia entre eles. ♻️ = só tipos que o alvo já tem.</div>
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
                                  value={editingSkill.drainChakraDuration === 99999 ? 0 : (editingSkill.drainChakraDuration || 1)}
                                  title={editingSkill.drainChakraDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('drainChakraDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.drainChakraDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('drainChakraDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
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

                          {/* 7.1. Roubar Chakra */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">Roubar Chakra</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.stealChakra || 0}
                                  onChange={(e) => handleUpdateSkillField('stealChakra', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.stealChakraDuration === 99999 ? 0 : (editingSkill.stealChakraDuration || 1)}
                                  title={editingSkill.stealChakraDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('stealChakraDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.stealChakraDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('stealChakraDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-800/60">
                                <span className="text-[9px] text-purple-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.stealChakraTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('stealChakraTarget', e.target.value)}
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
                                    checked={editingSkill.stealChakraIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('stealChakraIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.stealChakraRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('stealChakraRemoveType', e.target.value)}
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

                          {/* 7.2. Remover Chakra */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">Remover Chakra (Destruir)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.removeChakra || 0}
                                  onChange={(e) => handleUpdateSkillField('removeChakra', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.removeChakraDuration === 99999 ? 0 : (editingSkill.removeChakraDuration || 1)}
                                  title={editingSkill.removeChakraDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('removeChakraDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.removeChakraDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('removeChakraDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-800/60">
                                <span className="text-[9px] text-rose-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.removeChakraTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('removeChakraTarget', e.target.value)}
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
                                    checked={editingSkill.removeChakraIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('removeChakraIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.removeChakraRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('removeChakraRemoveType', e.target.value)}
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
                                  title="Quantidade de escudo que a skill gera"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Valor do Escudo</span>
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
                              <div className="space-y-1">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold block">⏳ Duração do Escudo</span>
                                <label className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono cursor-pointer select-none">
                                  <input
                                    type="radio"
                                    name="shield-duration-mode"
                                    checked={!(editingSkill.shieldDuration && editingSkill.shieldDuration > 0)}
                                    onChange={() => handleUpdateSkillField('shieldDuration', 0)}
                                    className="w-3 h-3 accent-orange-500"
                                  />
                                  Permanente (fica até ser destruído)
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <label className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono cursor-pointer select-none whitespace-nowrap">
                                    <input
                                      type="radio"
                                      name="shield-duration-mode"
                                      checked={!!(editingSkill.shieldDuration && editingSkill.shieldDuration > 0)}
                                      onChange={() => handleUpdateSkillField('shieldDuration', editingSkill.shieldDuration && editingSkill.shieldDuration > 0 ? editingSkill.shieldDuration : 2)}
                                      className="w-3 h-3 accent-orange-500"
                                    />
                                    Sumir em
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    value={editingSkill.shieldDuration || 2}
                                    onChange={(e) => handleUpdateSkillField('shieldDuration', parseInt(e.target.value) || 2)}
                                    placeholder="Turnos"
                                    className="w-14 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                  />
                                  <span className="text-[9px] text-slate-500 font-mono">turnos</span>
                                </div>
                              </div>
                              <div className="space-y-1 pt-1 border-t border-slate-800/50">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold block">📦 Limite Máx. de Escudo que esta skill pode gerar</span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={10000}
                                    value={editingSkill.shieldMaxVal || 0}
                                    onChange={(e) => handleUpdateSkillField('shieldMaxVal', parseInt(e.target.value) || 0)}
                                    placeholder="Sem limite"
                                    className="w-24 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                    title="O escudo total do personagem não ultrapassa este valor. Deixe em branco para sem limite."
                                  />
                                  <span className="text-[9px] text-slate-500 font-mono">vazio = sem limite</span>
                                </div>
                              </div>
                              <div className="space-y-1 pt-1 border-t border-slate-800/50">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold block">🔁 Gerar Escudo por Turno (Adicional)</span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={99}
                                    value={editingSkill.shieldRegenTurns || 0}
                                    onChange={(e) => handleUpdateSkillField('shieldRegenTurns', parseInt(e.target.value) || 0)}
                                    placeholder="0"
                                    className="w-14 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                    title="A cada turno, durante N turnos, gera o 'Valor do Escudo' como escudo ADICIONAL (0 = desativado)"
                                  />
                                  <span className="text-[9px] text-slate-500 font-mono">por {editingSkill.shieldRegenTurns || 0} turnos, +{editingSkill.shieldVal || 0} de escudo ADICIONAL por turno (0 = desativado)</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/50">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.shieldIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('shieldIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-slate-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.shieldStunImmunity || false}
                                    onChange={(e) => handleUpdateSkillField('shieldStunImmunity', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-slate-500 focus:ring-0 w-3 h-3"
                                  />
                                  ⚡ Enquanto o escudo durar, o alvo não pode ser stunado
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
                                  value={editingSkill.damageReductionDuration === 99999 ? 0 : (editingSkill.damageReductionDuration || 0)}
                                  title={editingSkill.damageReductionDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageReductionDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageReductionDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageReductionDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.shieldTarget || 'Self'}
                                  onChange={(e) => handleUpdateSkillField('shieldTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-orange-600 outline-none w-full max-w-[150px]"
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

                          {/* 9.1 Redução de Dano Imune a Perfuração */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">Redução de Dano Imune a Perfuração</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.damageReductionPierceVal || 0}
                                  onChange={(e) => handleUpdateSkillField('damageReductionPierceVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.damageReductionPierceDuration === 99999 ? 0 : (editingSkill.damageReductionPierceDuration || 0)}
                                  title={editingSkill.damageReductionPierceDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageReductionPierceDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageReductionPierceDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageReductionPierceDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-purple-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.damageReductionPierceTarget || 'Self'}
                                  onChange={(e) => handleUpdateSkillField('damageReductionPierceTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-purple-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <p className="text-[9px] text-slate-500 font-mono italic mt-1">Igual à Redução de Dano (Guard), mas <strong className="text-purple-400">também reduz dano direto (perfuração)</strong>.</p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageReductionPierceIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageReductionPierceIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-slate-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.damageReductionPierceRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('damageReductionPierceRemoveType', e.target.value)}
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

                          {/* 9.2 Cópia de Habilidades */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-fuchsia-400 font-mono">🪞 Cópia de Habilidades</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={editingSkill.skillCopyDuration || 0}
                                  onChange={(e) => handleUpdateSkillField('skillCopyDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <span className="text-[9px] text-slate-500 font-mono">Turnos de duração</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">🎯 Copiar de:</span>
                                <select
                                  value={editingSkill.skillCopyTarget || 'AnyLiving'}
                                  onChange={(e) => handleUpdateSkillField('skillCopyTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-300 focus:border-fuchsia-600 outline-none w-full max-w-[150px]"
                                >
                                  <option value="AnyLiving">Qualquer Personagem Vivo</option>
                                  <option value="Enemy">Inimigo Único</option>
                                  <option value="Ally">Aliado Único</option>
                                  <option value="Self">Próprio (Self)</option>
                                </select>
                              </div>
                              <p className="text-[9px] text-slate-500 font-mono italic mt-1">Escolha um personagem e <strong className="text-fuchsia-400">substitua suas habilidades pelas dele por X turnos</strong> (nomes, imagens, custos e funções). Quando acabar, suas habilidades voltam ao normal.</p>
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
                                  value={editingSkill.damageBuffDuration === 99999 ? 0 : (editingSkill.damageBuffDuration || 0)}
                                  title={editingSkill.damageBuffDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageBuffDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageBuffDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageBuffDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-amber-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.damageBuffTarget || 'Self'}
                                  onChange={(e) => handleUpdateSkillField('damageBuffTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-amber-300 focus:border-amber-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <p className="text-[8px] text-slate-500 font-mono">Alvo do buff (padrão: Conjurador)</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="text-[9px] text-amber-400 font-mono uppercase font-bold mr-1">Classes do buff (vazio = todas):</span>
                                {(['physical','mental','affliction','chakra','ranged','friendly'] as const).map(t => {
                                  const current = editingSkill.damageBuffTypes;
                                  const isChecked = !current || current.length === 0 || current.includes(t);
                                  return (
                                    <label key={t} className="flex items-center gap-0.5 cursor-pointer select-none text-[9px] text-slate-400 font-mono">
                                      <input type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          const allTypes = ['physical','mental','affliction','chakra','ranged','friendly'];
                                          const base = current && current.length > 0 ? [...current] : [...allTypes];
                                          const idx = base.indexOf(t);
                                          if (idx >= 0) base.splice(idx, 1); else base.push(t);
                                          handleUpdateSkillField('damageBuffTypes', base.length > 0 && base.length < 6 ? base : undefined);
                                        }}
                                        className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-2.5 h-2.5" />
                                      {t === 'physical' ? '💪Físico' : t === 'mental' ? '🧠Mental' : t === 'affliction' ? '💀Aflição' : t === 'chakra' ? '⚡Chakra' : t === 'ranged' ? '🏹Distância' : '🤝Amigável'}
                                    </label>
                                  );
                                })}
                              </div>
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

                          {/* 10b. Sofrer Dano (Dano Amigável/Próprio) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-violet-400 font-mono">Sofrer Dano (Próprio/Equipe)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.friendlyDamageVal || 0}
                                  onChange={(e) => handleUpdateSkillField('friendlyDamageVal', parseInt(e.target.value) || 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.friendlyDamageDuration === 99999 ? 0 : (editingSkill.friendlyDamageDuration || 0)}
                                  title={editingSkill.friendlyDamageDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('friendlyDamageDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.friendlyDamageDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('friendlyDamageDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                <div>
                                  <span className="text-[9px] text-violet-400 font-mono uppercase font-bold block mb-0.5">⚔️ Tipo do Dano:</span>
                                  <select
                                    value={editingSkill.friendlyDamageType || 'damage'}
                                    onChange={(e) => handleUpdateSkillField('friendlyDamageType', e.target.value as any)}
                                    className="w-full px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-violet-300 focus:border-violet-600 outline-none"
                                  >
                                    <option value="damage">💥 Dano Normal</option>
                                    <option value="direct_damage">🎯 Dano Direto</option>
                                    <option value="dot">🔥 Queimadura (DoT)</option>
                                    <option value="bleeding">🩸 Sangramento</option>
                                    <option value="affliction">💀 Aflição</option>
                                  </select>
                                </div>
                                <div>
                                  <span className="text-[9px] text-violet-400 font-mono uppercase font-bold block mb-0.5">🎯 Quem sofre:</span>
                                  <select
                                    value={editingSkill.friendlyDamageTarget || 'Self'}
                                    onChange={(e) => handleUpdateSkillField('friendlyDamageTarget', e.target.value as any)}
                                    className="w-full px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-violet-300 focus:border-violet-600 outline-none"
                                  >
                                    <option value="Self">Conjurador (Mim)</option>
                                    <option value="Ally">Aliado</option>
                                    <option value="AllAllies">Toda Minha Equipe</option>
                                  </select>
                                </div>
                              </div>
                              <p className="text-[8px] text-slate-500 font-mono mt-0.5">Ao usar a skill, quem sofre perde {editingSkill.friendlyDamageVal || 0} de {editingSkill.friendlyDamageType === 'direct_damage' ? 'dano direto' : editingSkill.friendlyDamageType === 'dot' ? 'queimadura' : editingSkill.friendlyDamageType === 'bleeding' ? 'sangramento' : editingSkill.friendlyDamageType === 'affliction' ? 'aflição' : 'dano'} por turno durante {editingSkill.friendlyDamageDuration || 0} turnos.</p>
                            </div>
                          </div>

                          {/* 11. Reduzir Dano das Skills (Debuff) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">Reduzir Dano das Skills (Debuff)</label>
                              <div className="flex items-center gap-2">
                                <input type="number" min={0} max={100}
                                  value={editingSkill.damageDebuffVal || 0}
                                  onChange={(e) => handleUpdateSkillField('damageDebuffVal', parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold" />
                                <input type="number" min={1} max={10}
                                  value={editingSkill.damageDebuffDuration === 99999 ? 0 : (editingSkill.damageDebuffDuration || 0)}
                                  title={editingSkill.damageDebuffDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageDebuffDuration', parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white" />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageDebuffDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageDebuffDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">Val / Turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-rose-400 font-mono uppercase font-bold">🎯 Aplicar Debuff em:</span>
                                <select
                                  value={editingSkill.damageDebuffTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('damageDebuffTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-rose-300 focus:border-rose-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="text-[9px] text-slate-500 font-mono mr-1">Afetar:</span>
                                {(['skill','dot','bleeding','affliction','direct_damage','damage'] as const).map(t => {
                                  const allTypes = ['skill','dot','bleeding','affliction','direct_damage','damage'];
                                  const current = editingSkill.damageDebuffTypes;
                                  const isChecked = !current || current.length === 0 || current.includes(t);
                                  return (
                                    <label key={t} className="flex items-center gap-0.5 cursor-pointer select-none text-[9px] text-slate-400 font-mono">
                                      <input type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          const base = editingSkill.damageDebuffTypes && editingSkill.damageDebuffTypes.length > 0
                                            ? [...editingSkill.damageDebuffTypes] : [...allTypes];
                                          const idx = base.indexOf(t);
                                          if (idx >= 0) base.splice(idx, 1); else base.push(t);
                                          handleUpdateSkillField('damageDebuffTypes', base.length > 0 && base.length < 6 ? base : undefined);
                                        }}
                                        className="rounded bg-slate-950 border-slate-700 text-rose-500 focus:ring-0 w-2.5 h-2.5" />
                                      {t === 'skill' ? 'Skills' : t === 'dot' ? '🔥DoT' : t === 'bleeding' ? '🩸Sangra' : t === 'affliction' ? '💀Aflição' : t === 'direct_damage' ? '🎯Direto' : '💥Dano'}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input type="checkbox"
                                    checked={editingSkill.damageDebuffIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageDebuffIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 w-3 h-3" />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select value={editingSkill.damageDebuffRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('damageDebuffRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600">
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

                          {/* 11.5 Receber Dano Extra por Classe (Vulnerabilidade) */}
                          <div className="space-y-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-fuchsia-400 font-mono">Receber Dano Extra por Classe (Vulnerabilidade)</label>
                              <div className="flex items-center gap-2">
                                <input type="number" min={0} max={100}
                                  value={editingSkill.damageVulnerabilityVal || 0}
                                  onChange={(e) => handleUpdateSkillField('damageVulnerabilityVal', parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 bg-slate-900 border border-fuchsia-800/60 rounded text-center text-xs font-mono text-fuchsia-300 font-bold" />
                                <input type="number" min={1} max={10}
                                  value={editingSkill.damageVulnerabilityDuration === 99999 ? 0 : (editingSkill.damageVulnerabilityDuration || 0)}
                                  onChange={(e) => handleUpdateSkillField('damageVulnerabilityDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  title={editingSkill.damageVulnerabilityDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white" />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input type="checkbox"
                                    checked={editingSkill.damageVulnerabilityDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageVulnerabilityDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-fuchsia-500 focus:ring-0 w-3 h-3" />
                                  <span className="text-[9px] text-fuchsia-400 font-mono">♾️ Infinito</span>
                                </label>
                              </div>
                              <p className="text-[9px] text-slate-500 font-mono mt-1">O alvo marcado recebe +Val de dano extra de skills das classes abaixo.</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-fuchsia-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.damageVulnerabilityTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('damageVulnerabilityTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-fuchsia-300 focus:border-fuchsia-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className="text-[9px] text-slate-500 font-mono mr-1">Classes afetadas:</span>
                                {(['physical','mental','affliction','chakra','ranged','friendly'] as const).map(t => {
                                  const current = editingSkill.damageVulnerabilityTypes;
                                  const isChecked = !current || current.length === 0 || current.includes(t);
                                  return (
                                    <label key={t} className="flex items-center gap-0.5 cursor-pointer select-none text-[9px] text-slate-400 font-mono">
                                      <input type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          const allTypes = ['physical','mental','affliction','chakra','ranged','friendly'];
                                          const base = current && current.length > 0 ? [...current] : [...allTypes];
                                          const idx = base.indexOf(t);
                                          if (idx >= 0) base.splice(idx, 1); else base.push(t);
                                          handleUpdateSkillField('damageVulnerabilityTypes', base.length > 0 && base.length < 6 ? base : undefined);
                                        }}
                                        className="rounded bg-slate-950 border-slate-700 text-fuchsia-500 focus:ring-0 w-2.5 h-2.5" />
                                      {t === 'physical' ? '💪Físico' : t === 'mental' ? '🧠Mental' : t === 'affliction' ? '💀Aflição' : t === 'chakra' ? '⚡Chakra' : t === 'ranged' ? '🏹Distância' : '🤝Amigável'}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input type="checkbox"
                                    checked={editingSkill.damageVulnerabilityIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageVulnerabilityIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-fuchsia-500 focus:ring-0 w-3 h-3" />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select value={editingSkill.damageVulnerabilityRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('damageVulnerabilityRemoveType', e.target.value)}
                                    className="px-1 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-mono text-slate-300 outline-none focus:border-slate-600">
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

                          {/* 12. Dano por Turno (DoT) */}
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
                                  placeholder="Val"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.dotDuration === 99999 ? 0 : (editingSkill.dotDuration || 0)}
                                  onChange={(e) => handleUpdateSkillField('dotDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Dur"
                                  title={editingSkill.dotDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.dotDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('dotDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-orange-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">por turno</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.dotInstant || 0}
                                  onChange={(e) => handleUpdateSkillField('dotInstant', parseInt(e.target.value) || 0)}
                                  placeholder="Inst"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-amber-700/60 rounded text-center text-xs font-mono text-amber-400 font-bold"
                                  title="Dano instantâneo de queima"
                                />
                                <span className="text-[9px] text-amber-400 font-mono">instantâneo</span>
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
                                  value={editingSkill.invulnerableDuration === 99999 ? 0 : (editingSkill.invulnerableDuration || 0)}
                                  title={editingSkill.invulnerableDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('invulnerableDuration', parseInt(e.target.value) || 0)}
                                  className="w-20 px-2 py-1.5 bg-slate-900 border border-cyan-900/60 focus:border-cyan-500 rounded-lg text-cyan-400 font-mono text-xs text-center font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.invulnerableDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('invulnerableDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-cyan-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.invulnerableTarget || 'Self'}
                                  onChange={(e) => handleUpdateSkillField('invulnerableTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-cyan-900/50 rounded text-[10px] font-mono text-cyan-300 focus:border-cyan-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="mt-2">
                                <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold">🛡️ Tipos de Proteção:</span>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {(['all','damage','direct_damage','affliction','bleeding','dot','mental','physical','chakra','ranged','friendly','stun'] as const).map(t => {
                                    const allInvulTypes = ['all','damage','direct_damage','affliction','bleeding','dot','mental','physical','chakra','ranged','friendly','stun'];
                                    const current = editingSkill.invulnerableTypes;
                                    const isChecked = !current || current.length === 0 || current.includes(t);
                                    return (
                                      <label key={t} className="flex items-center gap-0.5 cursor-pointer select-none text-[9px] text-slate-400 font-mono">
                                        <input type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {
                                            const base = editingSkill.invulnerableTypes && editingSkill.invulnerableTypes.length > 0
                                              ? [...editingSkill.invulnerableTypes] : [...allInvulTypes];
                                            const idx = base.indexOf(t);
                                            if (idx >= 0) base.splice(idx, 1); else base.push(t);
                                            handleUpdateSkillField('invulnerableTypes', base.length > 0 && base.length < allInvulTypes.length ? base : undefined);
                                          }}
                                          className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0 w-2.5 h-2.5" />
                                        {t === 'all' ? 'Tudo' : t === 'damage' ? '💥Dano' : t === 'direct_damage' ? '🎯Direto' : t === 'affliction' ? '💀Aflição' : t === 'bleeding' ? '🩸Sangra' : t === 'dot' ? '🔥DoT' : t === 'mental' ? '🧠Mental' : t === 'physical' ? '🤜Físico' : t === 'chakra' ? '⚡Chakra' : t === 'ranged' ? '🏹Distância' : t === 'friendly' ? '🤝Amigo' : '⚡Stun'}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="mt-2">
                                <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold">🏷️ Classes protegidas (digite a classe):</span>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {(editingSkill.invulnerableClasses || []).map(cls => (
                                    <span key={cls} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/50 border border-cyan-700/50 text-[9px] font-mono text-cyan-300">
                                      {cls}
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSkillField('invulnerableClasses', (editingSkill.invulnerableClasses || []).filter(c => c !== cls))}
                                        className="text-cyan-500 hover:text-red-400 cursor-pointer"
                                        title="Remover"
                                      >×</button>
                                    </span>
                                  ))}
                                  <input
                                    type="text"
                                    value={invulnClassInput}
                                    onChange={(e) => setInvulnClassInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && invulnClassInput.trim()) {
                                        e.preventDefault();
                                        const val = invulnClassInput.trim();
                                        const current = editingSkill.invulnerableClasses || [];
                                        if (!current.some(c => c.toLowerCase() === val.toLowerCase())) {
                                          handleUpdateSkillField('invulnerableClasses', [...current, val]);
                                        }
                                        setInvulnClassInput('');
                                      }
                                    }}
                                    placeholder="ex.: Taijutsu"
                                    className="flex-1 min-w-[110px] px-2 py-0.5 bg-slate-900 border border-cyan-900/50 rounded text-[10px] font-mono text-cyan-300 placeholder-slate-600 focus:border-cyan-600 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const val = invulnClassInput.trim();
                                      if (!val) return;
                                      const current = editingSkill.invulnerableClasses || [];
                                      if (!current.some(c => c.toLowerCase() === val.toLowerCase())) {
                                        handleUpdateSkillField('invulnerableClasses', [...current, val]);
                                      }
                                      setInvulnClassInput('');
                                    }}
                                    className="px-2 py-0.5 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/60 rounded text-[9px] font-mono text-cyan-300 cursor-pointer transition-all"
                                  >+ Adicionar</button>
                                </div>
                                <p className="text-[9px] text-slate-500 italic mt-0.5">A proteção só vale contra skills que tenham UMA dessas classes (vazio = protege pelos tipos acima).</p>
                              </div>
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
                                  placeholder="Val"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-red-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.bleedingDuration === 99999 ? 0 : (editingSkill.bleedingDuration || 0)}
                                  title={editingSkill.bleedingDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('bleedingDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Dur"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-red-900/60 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.bleedingDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('bleedingDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-red-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">por turno</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.bleedingInstant || 0}
                                  onChange={(e) => handleUpdateSkillField('bleedingInstant', parseInt(e.target.value) || 0)}
                                  placeholder="Inst"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-red-700/60 rounded text-center text-xs font-mono text-red-400 font-bold"
                                  title="Dano instantâneo de sangramento"
                                />
                                <span className="text-[9px] text-red-400 font-mono">instantâneo</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.bleedingVal || 0}
                                  onChange={(e) => handleUpdateSkillField('bleedingVal', parseInt(e.target.value) || 0)}
                                  placeholder="Val"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-red-700/60 rounded text-center text-xs font-mono text-red-400 font-bold"
                                  title="Quantidade de sangramento por turno (a partir do turno atrasado)"
                                />
                                <span className="text-[9px] text-red-400/80 font-mono">sofrerá nos próximos</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.bleedingDelay || 0}
                                  onChange={(e) => handleUpdateSkillField('bleedingDelay', parseInt(e.target.value) || 0)}
                                  placeholder="Atr"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-red-700/60 rounded text-center text-xs font-mono text-red-400 font-bold"
                                  title="Turnos de atraso: o alvo NÃO sofre sangramento agora; só começa a sangrar depois deste número de turnos"
                                />
                                <span className="text-[9px] text-red-400/80 font-mono">turnos, durante</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.bleedingDuration === 99999 ? 0 : (editingSkill.bleedingDuration || 0)}
                                  onChange={(e) => handleUpdateSkillField('bleedingDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Dur"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-red-700/60 rounded text-center text-xs font-mono text-red-400 font-bold"
                                  title="Número de turnos que o alvo sofrerá o sangramento"
                                />
                                <span className="text-[9px] text-red-400/80 font-mono">turnos</span>
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
                                  placeholder="Val"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-purple-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.afflictionDuration === 99999 ? 0 : (editingSkill.afflictionDuration || 0)}
                                  title={editingSkill.afflictionDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('afflictionDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Dur"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-purple-900/60 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.afflictionDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('afflictionDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-purple-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">por turno</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.afflictionInstant || 0}
                                  onChange={(e) => handleUpdateSkillField('afflictionInstant', parseInt(e.target.value) || 0)}
                                  placeholder="Inst"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-purple-700/60 rounded text-center text-xs font-mono text-purple-400 font-bold"
                                  title="Dano instantâneo de aflição"
                                />
                                <span className="text-[9px] text-purple-400 font-mono">instantâneo</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.afflictionVal || 0}
                                  onChange={(e) => handleUpdateSkillField('afflictionVal', parseInt(e.target.value) || 0)}
                                  placeholder="Val"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-purple-700/60 rounded text-center text-xs font-mono text-purple-400 font-bold"
                                  title="Quantidade de aflição por turno (a partir do turno atrasado)"
                                />
                                <span className="text-[9px] text-purple-400/80 font-mono">sofrerá nos próximos</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.afflictionDelay || 0}
                                  onChange={(e) => handleUpdateSkillField('afflictionDelay', parseInt(e.target.value) || 0)}
                                  placeholder="Atr"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-purple-700/60 rounded text-center text-xs font-mono text-purple-400 font-bold"
                                  title="Turnos de atraso: o alvo NÃO sofre aflição agora; só começa a sofrer depois deste número de turnos"
                                />
                                <span className="text-[9px] text-purple-400/80 font-mono">turnos, durante</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.afflictionDuration === 99999 ? 0 : (editingSkill.afflictionDuration || 0)}
                                  onChange={(e) => handleUpdateSkillField('afflictionDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Dur"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-purple-700/60 rounded text-center text-xs font-mono text-purple-400 font-bold"
                                  title="Número de turnos que o alvo sofrerá a aflição"
                                />
                                <span className="text-[9px] text-purple-400/80 font-mono">turnos</span>
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
                                  value={editingSkill.paralyzeCooldownDuration === 99999 ? 0 : (editingSkill.paralyzeCooldownDuration || 0)}
                                  title={editingSkill.paralyzeCooldownDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('paralyzeCooldownDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.paralyzeCooldownDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('paralyzeCooldownDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
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

                          {/* 15.1 Aumentar Cooldown de Skills */}
                          <div className="space-y-1 bg-orange-950/10 border border-orange-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-orange-500 font-mono">⏱️ Aumentar Cooldown de Skills</label>
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                Enquanto o debuff durar, cada skill que o alvo usar ganha +X de cooldown (ex.: skill de 1 cooldown vira 2).
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.cooldownIncreaseAmount || 0}
                                  onChange={(e) => handleUpdateSkillField('cooldownIncreaseAmount', parseInt(e.target.value) || 0)}
                                  placeholder="+CD"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-orange-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">+X cooldown por skill usada</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={editingSkill.cooldownIncreaseDuration === 99999 ? 0 : (editingSkill.cooldownIncreaseDuration || 0)}
                                  title={editingSkill.cooldownIncreaseDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('cooldownIncreaseDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-orange-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.cooldownIncreaseDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('cooldownIncreaseDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-orange-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-orange-500 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.cooldownIncreaseTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('cooldownIncreaseTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-orange-900/50 rounded text-[10px] font-mono text-orange-300 focus:border-orange-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.cooldownIncreaseIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('cooldownIncreaseIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.cooldownIncreaseRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('cooldownIncreaseRemoveType', e.target.value)}
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

                          {/* 15.2 Conversão de Dano em Escudo */}
                          <div className="space-y-1 bg-emerald-950/20 border border-emerald-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">🛡️ Conversão de Dano em Escudo</label>
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                Enquanto durar, o dano recebido vira escudo em vez de reduzir a vida (ex.: 10 de aflição + 45 de piercing no turno → +55 de escudo).
                              </p>
                              <DamageTypeToggles
                                title="⚔️ Tipos de dano convertidos"
                                selected={editingSkill.damageToShieldTypes || []}
                                onChange={(next) => handleUpdateSkillField('damageToShieldTypes', next)}
                                activeClass="bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                                checkClass="text-emerald-500"
                                hoverClass="hover:border-emerald-800/50"
                              />
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={editingSkill.damageToShieldDuration === 99999 ? 0 : (editingSkill.damageToShieldDuration || 0)}
                                  title={editingSkill.damageToShieldDuration === 99999 ? '♾️ Infinito' : 'Duração da conversão em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageToShieldDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-emerald-800/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageToShieldDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageToShieldDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-emerald-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração da conversão</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={editingSkill.damageToShieldShieldTurns === 99999 ? 0 : (editingSkill.damageToShieldShieldTurns || 0)}
                                  title={editingSkill.damageToShieldShieldTurns === 99999 ? '♾️ Infinito' : 'Duração do escudo gerado em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageToShieldShieldTurns', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-emerald-800/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageToShieldShieldTurns === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageToShieldShieldTurns', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-emerald-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração do escudo gerado</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-emerald-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.damageToShieldTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('damageToShieldTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-emerald-900/50 rounded text-[10px] font-mono text-emerald-300 focus:border-emerald-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.damageToShieldIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageToShieldIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <label className="text-[9px] text-emerald-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageToShieldFirstHitOnly || false}
                                    onChange={(e) => handleUpdateSkillField('damageToShieldFirstHitOnly', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-3 h-3"
                                  />
                                  🎯 Só o 1º Dano: apenas o PRIMEIRO dano recebido vira escudo
                                </label>
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
                                      value={editingSkill.invisibleDuration === 99999 ? 0 : (editingSkill.invisibleDuration || 1)}
                                      title={editingSkill.invisibleDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                      onChange={(e) => handleUpdateSkillField('invisibleDuration', parseInt(e.target.value) || 1)}
                                      className="w-14 px-1.5 py-1 bg-slate-900 border border-pink-900/60 focus:border-pink-500 rounded text-center text-xs font-mono text-pink-400 font-bold"
                                    />
                                    <label className="flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={editingSkill.invisibleDuration === 99999}
                                        onChange={(e) => handleUpdateSkillField('invisibleDuration', e.target.checked ? 99999 : 1)}
                                        className="rounded bg-slate-950 border-slate-800 text-pink-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span className="text-[9px] text-pink-400 font-mono">♾️ Infinito</span>
                                    </label>
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

                          {/* 16.5. Revelar Skills Invisíveis */}
                          <div className="space-y-1 bg-cyan-950/15 border border-cyan-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono mb-1">👁️ Revelar Skills Invisíveis</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.revealInvisibleDuration === 99999 ? 0 : (editingSkill.revealInvisibleDuration || 0)}
                                  title={editingSkill.revealInvisibleDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('revealInvisibleDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-cyan-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.revealInvisibleDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('revealInvisibleDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-cyan-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.revealInvisibleTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('revealInvisibleTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-cyan-900/50 rounded text-[10px] font-mono text-cyan-300 focus:border-cyan-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.revealInvisibleIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('revealInvisibleIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.revealInvisibleRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('revealInvisibleRemoveType', e.target.value)}
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

                          {/* 17. Incapaz de Reduzir Dano */}
                          <div className="space-y-1 bg-rose-950/10 border border-rose-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">🚫 Incapaz de Reduzir Dano</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.cannotReduceDamageDuration === 99999 ? 0 : (editingSkill.cannotReduceDamageDuration || 0)}
                                  title={editingSkill.cannotReduceDamageDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('cannotReduceDamageDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-rose-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.cannotReduceDamageDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('cannotReduceDamageDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-rose-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-rose-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.cannotReduceDamageTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('cannotReduceDamageTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-rose-900/50 rounded text-[10px] font-mono text-rose-300 focus:border-rose-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.cannotReduceDamageIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('cannotReduceDamageIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.cannotReduceDamageRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('cannotReduceDamageRemoveType', e.target.value)}
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

                          {/* 18. Incapaz de Ficar Invulnerável */}
                          <div className="space-y-1 bg-amber-950/10 border border-amber-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">🛡️ Incapaz de Ficar Invulnerável</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.cannotBeInvulnerableDuration === 99999 ? 0 : (editingSkill.cannotBeInvulnerableDuration || 0)}
                                  title={editingSkill.cannotBeInvulnerableDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('cannotBeInvulnerableDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.cannotBeInvulnerableDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('cannotBeInvulnerableDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-amber-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-amber-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.cannotBeInvulnerableTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('cannotBeInvulnerableTarget', e.target.value)}
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
                                    checked={editingSkill.cannotBeInvulnerableIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('cannotBeInvulnerableIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.cannotBeInvulnerableRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('cannotBeInvulnerableRemoveType', e.target.value)}
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

                          {/* 18b. Incapaz de Receber Habilidades Amigáveis */}
                          <div className="space-y-1 bg-fuchsia-950/10 border border-fuchsia-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-fuchsia-400 font-mono">🚫 Incapaz de Receber Skills Amigáveis (Bloqueio de Aliados)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.cannotReceiveFriendlyDuration === 99999 ? 0 : (editingSkill.cannotReceiveFriendlyDuration || 0)}
                                  title={editingSkill.cannotReceiveFriendlyDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('cannotReceiveFriendlyDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-fuchsia-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.cannotReceiveFriendlyDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('cannotReceiveFriendlyDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-fuchsia-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-fuchsia-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-fuchsia-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.cannotReceiveFriendlyTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('cannotReceiveFriendlyTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-fuchsia-900/50 rounded text-[10px] font-mono text-fuchsia-300 focus:border-fuchsia-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.cannotReceiveFriendlyIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('cannotReceiveFriendlyIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-fuchsia-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.cannotReceiveFriendlyRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('cannotReceiveFriendlyRemoveType', e.target.value)}
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

                          {/* 18c. Anulação de Efeitos Amigáveis */}
                          <div className="space-y-1 bg-rose-950/10 border border-rose-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">🚫 Anulação de Efeitos Amigáveis (Ignora Buffs/Invulnerabilidade/Redução/Curas)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.negateFriendlyDuration === 99999 ? 0 : (editingSkill.negateFriendlyDuration || 0)}
                                  title={editingSkill.negateFriendlyDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('negateFriendlyDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-rose-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.negateFriendlyDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('negateFriendlyDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-rose-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-rose-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.negateFriendlyTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('negateFriendlyTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-rose-900/50 rounded text-[10px] font-mono text-rose-300 focus:border-rose-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.negateFriendlyIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('negateFriendlyIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.negateFriendlyRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('negateFriendlyRemoveType', e.target.value)}
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

                          {/* 19. Ignorar Stun */}
                          <div className="space-y-1 bg-indigo-950/10 border border-indigo-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono">⚡ Ignorar Stun</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.ignoreStunDuration === 99999 ? 0 : (editingSkill.ignoreStunDuration || 0)}
                                  title={editingSkill.ignoreStunDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('ignoreStunDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-indigo-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.ignoreStunDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('ignoreStunDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-indigo-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-indigo-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-indigo-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.ignoreStunTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('ignoreStunTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-indigo-900/50 rounded text-[10px] font-mono text-indigo-300 focus:border-indigo-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.ignoreStunIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('ignoreStunIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-indigo-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.ignoreStunRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('ignoreStunRemoveType', e.target.value)}
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

                          {/* 20. Imunidade a Dano */}
                          <div className="space-y-1 bg-yellow-950/10 border border-yellow-900/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-yellow-400 font-mono">🛡️ Imunidade a Dano</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.damageImmunityDuration === 99999 ? 0 : (editingSkill.damageImmunityDuration || 0)}
                                  title={editingSkill.damageImmunityDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('damageImmunityDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-yellow-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageImmunityDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('damageImmunityDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-yellow-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-yellow-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <label className="flex items-center gap-1.5 mt-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={editingSkill.damageImmunityFirstHitOnly || false}
                                  onChange={(e) => handleUpdateSkillField('damageImmunityFirstHitOnly', e.target.checked)}
                                  className="rounded bg-slate-950 border-slate-800 text-yellow-500 focus:ring-0 w-3 h-3"
                                />
                                <span className="text-[9px] text-yellow-400 font-mono">🎯 Só o 1º Dano: bloqueia apenas o PRIMEIRO dano recebido e depois a imunidade é consumida</span>
                              </label>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-yellow-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.damageImmunityTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('damageImmunityTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-yellow-900/50 rounded text-[10px] font-mono text-yellow-300 focus:border-yellow-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <DamageTypeToggles
                                title="⚔️ Tipos de dano imunes"
                                selected={editingSkill.damageImmunityTypes || []}
                                onChange={(next) => handleUpdateSkillField('damageImmunityTypes', next)}
                                activeClass="bg-yellow-950/60 border-yellow-700/60 text-yellow-300"
                                checkClass="text-yellow-500"
                                hoverClass="hover:border-yellow-800/50"
                              />
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.damageImmunityIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('damageImmunityIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-yellow-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.damageImmunityRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('damageImmunityRemoveType', e.target.value)}
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

                          {/* 21. Imortalidade */}
                          <div className="space-y-1 bg-green-950/15 border border-green-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-green-400 font-mono">💪 Imortalidade</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.immortalDuration === 99999 ? 0 : (editingSkill.immortalDuration || '')}
                                  title={editingSkill.immortalDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('immortalDuration', e.target.value ? parseInt(e.target.value) : undefined)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-green-800/60 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.immortalDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('immortalDuration', e.target.checked ? 99999 : undefined)}
                                    className="rounded bg-slate-950 border-slate-800 text-green-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-green-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              <div className="flex items-center gap-2 mt-2 pt-1 border-t border-green-800/30">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.immortalImmediate || false}
                                    onChange={(e) => handleUpdateSkillField('immortalImmediate', e.target.checked)}
                                    className="rounded bg-slate-950 border-green-800/60 text-green-500 focus:ring-0 w-4 h-4"
                                  />
                                  <span className="text-[10px] font-bold text-green-300 font-mono">Ativar ao usar a habilidade (Imediato)</span>
                                </label>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.immortalHpThreshold || ''}
                                  onChange={(e) => handleUpdateSkillField('immortalHpThreshold', e.target.value ? parseInt(e.target.value) : undefined)}
                                  placeholder="HP ≤"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-green-800/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">HP mínimo para ativar (Gatilho de HP)</span>
                              </div>
                            </div>
                          </div>

                          {/* 21b. Reviver ao Morrer (Ressurreição) */}
                          <div className="space-y-1 bg-violet-950/15 border border-violet-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-violet-400 font-mono">💀 Reviver ao Morrer (Ressurreição)</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={editingSkill.reviveHp || ''}
                                  onChange={(e) => handleUpdateSkillField('reviveHp', e.target.value ? parseInt(e.target.value) : undefined)}
                                  placeholder="HP"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-violet-800/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">vida ao ressuscitar (use a skill em si mesmo)</span>
                              </div>
                              <p className="text-[8px] text-slate-500 font-mono mt-1">
                                Stack passiva infinita: cada uso da skill adiciona +1 ressurreição. Quando o personagem morrer, 1 stack é consumida automaticamente e ele revive com esta quantidade de vida. Personagens ressuscitados ficam marcados para os requerimentos "Ressurreição".
                              </p>
                            </div>
                          </div>

                          {/* 19b. Aumentar Custo de Chakra (Debuff) */}
                          <div className="space-y-1 bg-cyan-950/15 border border-cyan-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">⛓️ Aumentar Custo de Chakra (Debuff)</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={editingSkill.chakraCostIncreaseDuration === 99999 ? 0 : (editingSkill.chakraCostIncreaseDuration || 0)}
                                  title={editingSkill.chakraCostIncreaseDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('chakraCostIncreaseDuration', parseInt(e.target.value) || 0)}
                                  placeholder="Turnos"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-cyan-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.chakraCostIncreaseDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('chakraCostIncreaseDuration', e.target.checked ? 99999 : 0)}
                                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-cyan-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[10px] text-slate-500 font-mono">Duração em turnos</span>
                              </div>
                              {(editingSkill.chakraCostIncreaseDuration || 0) > 0 && (
                                <>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                    <select
                                      value={editingSkill.chakraCostIncreaseTarget || 'Target'}
                                      onChange={(e) => handleUpdateSkillField('chakraCostIncreaseTarget', e.target.value)}
                                      className="px-2 py-0.5 bg-slate-900 border border-cyan-900/50 rounded text-[10px] font-mono text-cyan-300 focus:border-cyan-600 outline-none w-full max-w-[150px]"
                                    >
                                      {TARGET_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="mt-1.5 pt-1.5 border-t border-cyan-900/30">
                                    <div className="flex items-center justify-between">
                                      <span className="block text-[9px] text-slate-400 font-mono uppercase font-bold">Tipos de Chakra a Aumentar:</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const allTypes: ChakraType[] = ['Tai', 'Nin', 'Gen', 'Blood', 'Rand'];
                                          const isAllSelected = (editingSkill.chakraCostIncreaseTypes || []).length >= 5;
                                          handleUpdateSkillField('chakraCostIncreaseTypes', isAllSelected ? [] : allTypes);
                                        }}
                                        className="text-[9px] px-2 py-0.5 rounded bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 font-mono font-bold border border-cyan-700/60 transition-all cursor-pointer select-none"
                                      >
                                        {(editingSkill.chakraCostIncreaseTypes || []).length >= 5 ? '❌ Desmarcar Todos' : '⚡ Todos'}
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                                      {([
                                        { value: 'Tai', label: '🥋 Taijutsu', desc: 'Aumenta custo Tai' },
                                        { value: 'Nin', label: '🌀 Ninjutsu', desc: 'Aumenta custo Nin' },
                                        { value: 'Gen', label: '🧠 Genjutsu', desc: 'Aumenta custo Gen' },
                                        { value: 'Blood', label: '🩸 Kekkei Genkai', desc: 'Aumenta custo Blood' },
                                        { value: 'Rand', label: '🎲 Aleatório', desc: 'Aumenta custo Rand (qualquer chakra)' },
                                      ] as { value: ChakraType; label: string; desc: string }[]).map((opt) => {
                                        const currentTypes = editingSkill.chakraCostIncreaseTypes || [];
                                        const isSelected = currentTypes.includes(opt.value);
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                              const updated = isSelected ? currentTypes.filter(t => t !== opt.value) : [...currentTypes, opt.value];
                                              handleUpdateSkillField('chakraCostIncreaseTypes', updated);
                                            }}
                                            className={`p-1.5 text-left rounded-lg border transition-all cursor-pointer ${
                                              isSelected
                                                ? 'bg-cyan-950 border-cyan-500 text-cyan-200 font-bold shadow-md shadow-cyan-950/60'
                                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                                            }`}
                                          >
                                            <div className="text-[10px] font-mono flex items-center justify-between">
                                              <span>{opt.label}</span>
                                              <span className="text-[9px] font-bold">{isSelected ? '✓' : ''}</span>
                                            </div>
                                            <div className="text-[8px] text-slate-500 font-mono leading-tight mt-0.5">{opt.desc}</div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="mt-1.5 pt-1.5 border-t border-cyan-900/30">
                                    <div className="flex items-center justify-between">
                                      <span className="block text-[9px] text-slate-400 font-mono uppercase font-bold">Tipos de Skill Afetadas:</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const allTypes = ['physical', 'chakra', 'ranged', 'mental', 'affliction', 'friendly'];
                                          const isAllSelected = (editingSkill.chakraCostIncreaseSkillTypes || []).length >= 6;
                                          handleUpdateSkillField('chakraCostIncreaseSkillTypes', isAllSelected ? [] : allTypes);
                                        }}
                                        className="text-[9px] px-2 py-0.5 rounded bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 font-mono font-bold border border-cyan-700/60 transition-all cursor-pointer select-none"
                                      >
                                        {(editingSkill.chakraCostIncreaseSkillTypes || []).length >= 6 ? '❌ Desmarcar Todos' : '⚡ Todas'}
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                                      {[
                                        { value: 'physical', label: '⚔️ Físico', desc: 'Taijutsu / marcial' },
                                        { value: 'chakra', label: '🌀 Chakra', desc: 'Ninjutsu / selos' },
                                        { value: 'ranged', label: '🎯 A Distância', desc: 'Projéteis / arremesso' },
                                        { value: 'mental', label: '🧠 Mental', desc: 'Genjutsu / ilusão' },
                                        { value: 'affliction', label: '🩸 Aflição', desc: 'Venenos / dor / sangra' },
                                        { value: 'friendly', label: '🤝 Amigável', desc: 'Suporte / cura' },
                                      ].map((opt) => {
                                        const currentTypes = editingSkill.chakraCostIncreaseSkillTypes || [];
                                        const isSelected = currentTypes.includes(opt.value);
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                              const updated = isSelected ? currentTypes.filter(t => t !== opt.value) : [...currentTypes, opt.value];
                                              handleUpdateSkillField('chakraCostIncreaseSkillTypes', updated);
                                            }}
                                            className={`p-1.5 text-left rounded-lg border transition-all cursor-pointer ${
                                              isSelected
                                                ? 'bg-cyan-950 border-cyan-500 text-cyan-200 font-bold shadow-md shadow-cyan-950/60'
                                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                                            }`}
                                          >
                                            <div className="text-[10px] font-mono flex items-center justify-between">
                                              <span>{opt.label}</span>
                                              <span className="text-[9px] font-bold">{isSelected ? '✓' : ''}</span>
                                            </div>
                                            <div className="text-[8px] text-slate-500 font-mono leading-tight mt-0.5">{opt.desc}</div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="mt-1.5 pt-1.5 border-t border-cyan-900/30 space-y-1">
                                    <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={editingSkill.chakraCostIncreaseIrremovable || false}
                                        onChange={(e) => handleUpdateSkillField('chakraCostIncreaseIrremovable', e.target.checked)}
                                        className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3 h-3"
                                      />
🔒 Nunca Remover
                                </label>
                                    <p className="text-[9px] text-cyan-300 font-mono italic leading-tight">
                                      💡 Resumo: Ao usar esta habilidade, o(s) alvo(s) terá(ão) +1 de custo em {(editingSkill.chakraCostIncreaseTypes || []).map(ct => ct === 'Tai' ? 'Taijutsu' : ct === 'Nin' ? 'Ninjutsu' : ct === 'Gen' ? 'Genjutsu' : ct === 'Blood' ? 'Kekkei Genkai' : ct === 'Rand' ? 'Aleatório' : ct).join(' + ') || 'chakra'}{(editingSkill.chakraCostIncreaseSkillTypes && editingSkill.chakraCostIncreaseSkillTypes.length > 0 ? ` nas skills de ${editingSkill.chakraCostIncreaseSkillTypes.map(st => st === 'physical' ? 'Físico' : st === 'mental' ? 'Mental' : st === 'affliction' ? 'Aflição' : st === 'chakra' ? 'Chakra' : st === 'ranged' ? 'A Distância' : st === 'friendly' ? 'Amigável' : st).join(' + ')}` : '')} por {editingSkill.chakraCostIncreaseDuration} {editingSkill.chakraCostIncreaseDuration === 1 ? 'turno' : 'turnos'}!
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* 20. Stackable (Acumulável) */}
                          <div className="space-y-1 bg-purple-950/15 border border-purple-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">📚 Stackable (Acumulável)</label>
                              <div className="flex items-center gap-2 mt-1">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.stackable || false}
                                    onChange={(e) => handleUpdateSkillField('stackable', e.target.checked)}
                                    className="rounded bg-slate-950 border-purple-800/60 text-purple-500 focus:ring-0 w-4 h-4"
                                  />
                                  <span className="text-xs text-purple-300 font-mono font-bold">Ativar Stacks</span>
                                </label>
                              </div>
                              {editingSkill.stackable && (
                                <>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <input
                                      type="text"
                                      value={editingSkill.stackType || ''}
                                      onChange={(e) => handleUpdateSkillField('stackType', e.target.value)}
placeholder="Tipo (ex: Marca) — vazio usa o nome da skill"
                                       className="w-full px-2 py-1 bg-slate-900 border border-purple-800/60 rounded text-center text-xs font-mono text-purple-300 focus:border-purple-500 outline-none"
                                    />
                                    <span className="text-[10px] text-slate-500 font-mono shrink-0">Tipo de Stack</span>
                                  </div>
                                   <div className="flex items-center gap-2 mt-1.5">
                                     <input
                                       type="number"
                                       min={1}
                                       max={999}
value={editingSkill.stackDuration === 99999 ? 0 : (editingSkill.stackDuration ?? '')}
                                        title={editingSkill.stackDuration === 99999 ? '♾️ Infinito' : 'Duração da Stack (turnos)'}
                                        onChange={(e) => handleUpdateSkillField('stackDuration', e.target.value ? parseInt(e.target.value) : undefined)}
                                        placeholder="999"
                                        className="w-16 px-2 py-1 bg-slate-900 border border-purple-800/60 rounded text-center text-xs font-mono text-white"
                                      />
                                      <label className="flex items-center gap-1 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={editingSkill.stackDuration === 99999}
                                          onChange={(e) => handleUpdateSkillField('stackDuration', e.target.checked ? 99999 : undefined)}
                                          className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                        />
                                        <span className="text-[9px] text-purple-400 font-mono">♾️ Infinito</span>
                                      </label>
                                      <span className="text-[10px] text-slate-500 font-mono">Duração da Stack (turnos)</span>
                                   </div>
                                   <div className="flex items-center gap-2 mt-1.5">
                                     <select
                                       value={editingSkill.stackTarget || 'Target'}
                                       onChange={(e) => handleUpdateSkillField('stackTarget', e.target.value)}
                                       className="px-2 py-0.5 bg-slate-900 border border-purple-800/60 rounded text-[10px] font-mono text-purple-300 focus:border-purple-500 outline-none w-full max-w-[150px]"
                                     >
                                       {TARGET_OPTIONS.map(opt => (
                                         <option key={opt.value} value={opt.value}>{opt.label}</option>
                                       ))}
</select>
                                     <span className="text-[10px] text-slate-500 font-mono">Aplicar Stacks em:</span>
                                   </div>
                                   <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                     <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                       <input
                                         type="checkbox"
                                         checked={editingSkill.stackApplyOnAttack || false}
                                         onChange={(e) => handleUpdateSkillField('stackApplyOnAttack', e.target.checked)}
                                         className="rounded bg-slate-950 border-purple-800/60 text-purple-500 focus:ring-0 w-3.5 h-3.5"
                                       />
                                       <span className="text-[10px] text-purple-300 font-mono font-bold">🎯 Marcar quem atacar o portador (aplica a stack no inimigo que atacar)</span>
                                     </label>
                                     {editingSkill.stackApplyOnAttack && (
                                       <div className="flex flex-wrap items-center gap-2">
                                         <input
                                           type="number"
                                           min={1}
                                           max={999}
                                           value={editingSkill.stackApplyOnAttackDuration === 99999 ? 0 : (editingSkill.stackApplyOnAttackDuration ?? 1)}
                                           title="Duração da marca no atacante (turnos)"
                                           onChange={(e) => handleUpdateSkillField('stackApplyOnAttackDuration', e.target.value ? parseInt(e.target.value) : undefined)}
                                           className="w-14 px-2 py-1 bg-slate-900 border border-purple-800/60 rounded text-center text-xs font-mono text-white"
                                         />
                                         <label className="flex items-center gap-1 cursor-pointer select-none">
                                           <input
                                             type="checkbox"
                                             checked={editingSkill.stackApplyOnAttackDuration === 99999}
                                             onChange={(e) => handleUpdateSkillField('stackApplyOnAttackDuration', e.target.checked ? 99999 : undefined)}
                                             className="rounded bg-slate-950 border-slate-800 text-purple-500 focus:ring-0 w-3 h-3"
                                           />
                                           <span className="text-[9px] text-purple-400 font-mono">♾️ Infinito</span>
                                         </label>
                                         <span className="text-[10px] text-slate-500 font-mono">Duração da marca no atacante (turnos)</span>
                                       </div>
                                     )}
                                     <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                       <input
                                         type="checkbox"
                                         checked={editingSkill.stackNonCumulative || false}
                                         onChange={(e) => handleUpdateSkillField('stackNonCumulative', e.target.checked)}
                                         className="rounded bg-slate-950 border-purple-800/60 text-purple-500 focus:ring-0 w-3.5 h-3.5"
                                       />
                                       <span className="text-[10px] text-purple-300 font-mono font-bold">🔒 Não Acumulativa (fica sempre 1x)</span>
                                     </label>
                                   </div>
                                   <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                     <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                       <input
                                         type="checkbox"
                                         checked={editingSkill.stackStartActive || false}
                                         onChange={(e) => handleUpdateSkillField('stackStartActive', e.target.checked)}
                                         className="rounded bg-slate-950 border-purple-800/60 text-purple-500 focus:ring-0 w-3.5 h-3.5"
                                       />
                                       <span className="text-[10px] text-purple-300 font-mono font-bold">🌀 Passiva (ativa no início da batalha)</span>
                                     </label>
                                     {editingSkill.stackStartActive && (
                                       <div className="flex items-center gap-1">
                                         <input
                                           type="number"
                                           min={1}
                                           max={99}
                                           value={editingSkill.stackStartCount || 1}
                                           onChange={(e) => handleUpdateSkillField('stackStartCount', e.target.value ? parseInt(e.target.value) : 1)}
                                           className="w-14 px-2 py-1 bg-slate-900 border border-purple-800/60 rounded text-center text-xs font-mono text-white"
                                         />
                                         <span className="text-[9px] text-slate-500 font-mono">stacks iniciais</span>
                                       </div>
                                     )}
                                   </div>
                                   <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                     <select
                                       value={editingSkill.stackGainMode || 'none'}
                                       onChange={(e) => handleUpdateSkillField('stackGainMode', e.target.value === 'none' ? undefined : e.target.value)}
                                       className="px-2 py-0.5 bg-slate-900 border border-purple-800/60 rounded text-[10px] font-mono text-purple-300 focus:border-purple-500 outline-none w-full max-w-[220px]"
                                     >
                                       <option value="none">Nenhum (só ao usar a skill)</option>
                                       <option value="turn">A cada turno</option>
                                       <option value="skill">Ao usar qualquer skill</option>
                                       <option value="both">A cada turno + ao usar skill</option>
                                     </select>
                                     {editingSkill.stackGainMode && (
                                       <div className="flex items-center gap-1">
                                         <input
                                           type="number"
                                           min={1}
                                           max={99}
                                           value={editingSkill.stackGainAmount || 1}
                                           onChange={(e) => handleUpdateSkillField('stackGainAmount', e.target.value ? parseInt(e.target.value) : 1)}
                                           className="w-14 px-2 py-1 bg-slate-900 border border-purple-800/60 rounded text-center text-xs font-mono text-white"
                                         />
                                         <span className="text-[9px] text-slate-500 font-mono">stacks por ganho</span>
                                       </div>
                                     )}
                                   </div>
                                   <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                     <input
                                       type="number"
                                       min={2}
                                       max={999}
                                       value={editingSkill.stackCapReset || ''}
                                       title="Quando a stack atingir esse valor, ela reseta para 1"
                                       onChange={(e) => handleUpdateSkillField('stackCapReset', e.target.value ? parseInt(e.target.value) : undefined)}
                                       placeholder="—"
                                       className="w-14 px-2 py-1 bg-slate-900 border border-purple-800/60 rounded text-center text-xs font-mono text-white"
                                     />
                                     <span className="text-[9px] text-slate-500 font-mono">🔄 Resetar p/ 1 ao chegar em (stacks)</span>
                                   </div>
                                 </>
                               )}
                             </div>
                           </div>

                          {/* 21. Splash / Dano em Área */}
                          <div className="space-y-1 bg-orange-950/15 border border-orange-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-orange-400 font-mono">💥 Splash / Dano em Área</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={200}
                                  value={editingSkill.splashDamage || ''}
                                  onChange={(e) => handleUpdateSkillField('splashDamage', e.target.value ? parseInt(e.target.value) : 0)}
                                  placeholder="Valor"
                                  className="w-16 px-2 py-1 bg-slate-900 border border-orange-800/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <span className="text-[10px] text-slate-500 font-mono">Dano Secundário</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] text-orange-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.splashTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('splashTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-orange-900/50 rounded text-[10px] font-mono text-orange-300 focus:border-orange-600 outline-none w-full max-w-[150px]"
                                >
                                  {TARGET_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* 22. Retaliação / Dano Reativo */}
                          <div className="space-y-1 bg-red-950/20 border border-red-800/50 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono flex items-center gap-1">
                                ⚡ Retaliação / Dano Reativo
                              </label>
                              <div className="flex items-center gap-2 mt-1">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.retaliateDamage || false}
                                    onChange={(e) => handleUpdateSkillField('retaliateDamage', e.target.checked)}
                                    className="rounded bg-slate-950 border-red-800/60 text-red-500 focus:ring-0 w-4 h-4"
                                  />
                                  <span className="text-xs text-red-300 font-mono font-bold">Ativar Retaliação</span>
                                </label>
                              </div>

                              {editingSkill.retaliateDamage && (
                                <div className="space-y-2 mt-2 pt-2 border-t border-red-900/30">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        max={500}
                                        value={editingSkill.retaliateDamageVal || 0}
                                        onChange={(e) => handleUpdateSkillField('retaliateDamageVal', parseInt(e.target.value) || 0)}
                                        className="w-16 px-2 py-1 bg-slate-900 border border-red-900/60 focus:border-red-500 rounded text-red-400 font-mono text-xs text-center font-bold"
                                      />
                                      <span className="text-[9px] text-slate-500 font-mono">Dano</span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      {editingSkill.retaliateDamagePermanent || (editingSkill.retaliateDamageDuration && editingSkill.retaliateDamageDuration >= 999) ? (
                                        <div className="w-16 px-2 py-1 bg-slate-900 border border-amber-800/60 rounded text-amber-400 font-mono text-xs text-center font-bold">
                                          ♾️ Inf.
                                        </div>
                                      ) : (
                                        <input
                                          type="number"
                                          min={1}
                                          max={99}
                                          value={editingSkill.retaliateDamageDuration || 1}
                                          onChange={(e) => handleUpdateSkillField('retaliateDamageDuration', parseInt(e.target.value) || 1)}
                                          placeholder="Turnos"
                                          className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-white"
                                        />
                                      )}
                                      <span className="text-[9px] text-slate-500 font-mono">Turnos</span>
                                    </div>

                                    <label className="flex items-center gap-1 cursor-pointer select-none ml-1 bg-slate-900/80 px-2 py-1 rounded border border-slate-800 hover:border-amber-500/50 transition-colors">
                                      <input
                                        type="checkbox"
                                        checked={!!(editingSkill.retaliateDamagePermanent || (editingSkill.retaliateDamageDuration && editingSkill.retaliateDamageDuration >= 999))}
                                        onChange={(e) => {
                                          const isInf = e.target.checked;
                                          handleUpdateSkillField('retaliateDamagePermanent', isInf);
                                          handleUpdateSkillField('retaliateDamageDuration', isInf ? 99999 : 1);
                                        }}
                                        className="rounded bg-slate-950 border-amber-800/60 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                                      />
                                      <span className="text-[10px] text-amber-300 font-mono font-bold flex items-center gap-0.5">♾️ Infinito</span>
                                    </label>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">Tipo de Dano Reativo:</span>
                                    <select
                                      value={editingSkill.retaliateDamageType || 'damage'}
                                      onChange={(e) => handleUpdateSkillField('retaliateDamageType', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 outline-none w-full focus:border-red-600"
                                    >
                                      <option value="damage">Dano Normal (Abate Escudo)</option>
                                      <option value="direct_damage">Dano Direto / Perfura Defesa</option>
                                      <option value="affliction">Aflição</option>
                                      <option value="dot">Queimadura (DoT)</option>
                                      <option value="bleeding">Sangramento</option>
                                      <option value="true">Dano Verdadeiro</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">Gatilho / Alvo Atacado:</span>
                                    <select
                                      value={editingSkill.retaliateTargetScope || 'self'}
                                      onChange={(e) => handleUpdateSkillField('retaliateTargetScope', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 outline-none w-full focus:border-red-600"
                                    >
                                      <option value="self">Apenas quando usar no Próprio Personagem</option>
                                      <option value="ally">Apenas quando usar em um Aliado</option>
                                      <option value="self_or_ally">Próprio Personagem ou Aliado</option>
                                      <option value="team">Qualquer Membro do Time</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">Modo / Frequência:</span>
                                    <select
                                      value={editingSkill.retaliateTriggerMode || 'always'}
                                      onChange={(e) => handleUpdateSkillField('retaliateTriggerMode', e.target.value)}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-red-300 outline-none w-full focus:border-red-600"
                                    >
                                      <option value="always">Sempre que qualquer inimigo usar skill</option>
                                      <option value="first_only">Apenas o 1º inimigo que usar skill (outros não)</option>
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold block">Classes que Disparam a Retaliação (vazio = todas):</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {['Melee', 'Chakra', 'Mental', 'Físico', 'A distancia', 'Corpo a Corpo', 'Amigável'].map(cls => {
                                        const isOn = (editingSkill.retaliateClasses || []).includes(cls);
                                        return (
                                          <label
                                            key={cls}
                                            className={`flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded border transition-colors ${
                                              isOn ? 'bg-red-900/40 border-red-500/70 text-red-200' : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-red-500/40'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isOn}
                                              onChange={(e) => {
                                                const cur = editingSkill.retaliateClasses || [];
                                                const next = e.target.checked ? [...cur, cls] : cur.filter(c => c !== cls);
                                                handleUpdateSkillField('retaliateClasses', next);
                                              }}
                                              className="rounded bg-slate-950 border-red-800/60 text-red-500 focus:ring-0 w-3 h-3"
                                            />
                                            <span className="text-[10px] font-mono font-bold">{cls}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                    <button
                                      onClick={() => handleUpdateSkillField('retaliateClasses', [])}
                                      className="text-[9px] text-slate-500 font-mono underline hover:text-red-400 transition-colors"
                                    >
                                      Limpar (todas as classes)
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="text-[9px] text-red-400 font-mono uppercase font-bold">🎯 Aplicar Buff em:</span>
                                    <select
                                      value={editingSkill.retaliateDamageTarget || 'Self'}
                                      onChange={(e) => handleUpdateSkillField('retaliateDamageTarget', e.target.value)}
                                      className="px-2 py-0.5 bg-slate-900 border border-red-900/50 rounded text-[10px] font-mono text-red-300 focus:border-red-600 outline-none w-full max-w-[150px]"
                                    >
                                      {TARGET_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>

                            {editingSkill.retaliateDamage && (
                              <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-[9px] text-slate-400 font-mono flex items-center gap-1 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={editingSkill.retaliateDamageIrremovable || false}
                                      onChange={(e) => handleUpdateSkillField('retaliateDamageIrremovable', e.target.checked)}
                                      className="rounded bg-slate-950 border-slate-800 text-red-500 focus:ring-0 w-3 h-3"
                                    />
🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                    <select
                                      value={editingSkill.retaliateDamageRemoveType || 'none'}
                                      onChange={(e) => handleUpdateSkillField('retaliateDamageRemoveType', e.target.value)}
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
                            )}
                          </div>

                          {/* Remover Contra-Ataques / Refletir do Inimigo */}
                          <div className="space-y-3 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800/40 flex flex-col justify-between">
                            <div className="space-y-2">
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-400 font-mono">
                                ⚔️ Remover Contra-Ataques & Refletir
                              </label>
                              <label className="flex items-center gap-2 text-[10px] cursor-pointer select-none text-slate-300 font-mono">
                                <input
                                  type="checkbox"
                                  checked={editingSkill.removeCounterReflect || false}
                                  onChange={(e) => handleUpdateSkillField('removeCounterReflect', e.target.checked)}
                                  className="rounded bg-slate-950 border-slate-800 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                Remover Contra-Ataques/Refletir do alvo
                              </label>

                              {editingSkill.removeCounterReflect && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-2 pt-2 border-t border-slate-800/40 mt-1"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-rose-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                    <select
                                      value={editingSkill.removeCounterReflectTarget || 'Target'}
                                      onChange={(e) => handleUpdateSkillField('removeCounterReflectTarget', e.target.value)}
                                      className="px-2 py-0.5 bg-slate-900 border border-rose-900/50 rounded text-[10px] font-mono text-rose-300 focus:border-rose-600 outline-none w-full max-w-[150px]"
                                    >
                                      {TARGET_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>

                          {/* 24. Redirecionamento / Proteção do Guarda-Costas */}
                          <div className="space-y-3 bg-cyan-950/20 border border-cyan-800/40 p-3.5 rounded-xl flex flex-col justify-between">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono flex items-center gap-1">
                                  🛡️ Redirecionar Skills Ofensivas em Mim (Guarda-Costas)
                                </label>
                                {editingSkill.redirectOffensiveToCaster ? (
                                  <span className="text-[9px] bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">
                                    ⚡ ATIVO
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-slate-800 border border-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                                    Inativo
                                  </span>
                                )}
                              </div>

                              <label className="flex items-center gap-2 text-[10px] cursor-pointer select-none text-slate-300 font-mono">
                                <input
                                  type="checkbox"
                                  checked={editingSkill.redirectOffensiveToCaster || false}
                                  onChange={(e) => handleUpdateSkillField('redirectOffensiveToCaster', e.target.checked)}
                                  className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                Ativar Proteção / Redirecionar para o Conjurador
                              </label>

                              {editingSkill.redirectOffensiveToCaster && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-3 pt-2 border-t border-cyan-900/40 mt-2"
                                >
                                  {/* Alvo / Escopo da Proteção */}
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-cyan-400 font-mono uppercase font-bold block">
                                      🎯 Proteger Quem (Quem recebe o Buff de Redirecionamento):
                                    </span>
                                    <select
                                      value={editingSkill.redirectOffensiveScope || 'ally'}
                                      onChange={(e) => handleUpdateSkillField('redirectOffensiveScope', e.target.value as 'ally' | 'team')}
                                      className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-cyan-300 outline-none w-full"
                                    >
                                      <option value="ally">👤 Apenas um Aliado Selecionado</option>
                                      <option value="team">🛡️ Minha Equipe Inteira (Todos os Aliados)</option>
                                    </select>
                                  </div>

                                  {/* Duração em Turnos */}
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      value={editingSkill.redirectOffensiveDuration === 99999 ? 0 : (editingSkill.redirectOffensiveDuration || 1)}
                                      title={editingSkill.redirectOffensiveDuration === 99999 ? '♾️ Infinito' : 'Turno(s) de Duração'}
                                      onChange={(e) => handleUpdateSkillField('redirectOffensiveDuration', parseInt(e.target.value) || 1)}
                                      className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-center text-xs font-mono text-cyan-300 font-bold"
                                    />
                                    <label className="flex items-center gap-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={editingSkill.redirectOffensiveDuration === 99999}
                                        onChange={(e) => handleUpdateSkillField('redirectOffensiveDuration', e.target.checked ? 99999 : 1)}
                                        className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span className="text-[9px] text-cyan-400 font-mono">♾️ Infinito</span>
                                    </label>
                                    <span className="text-[10px] text-slate-400 font-mono">Turno(s) de Duração</span>
                                  </div>

                                  <div className="text-[8.5px] text-cyan-200/80 font-mono leading-relaxed bg-cyan-950/40 border border-cyan-900/50 p-2 rounded-lg">
                                    💡 <span className="font-bold text-cyan-300">Como funciona:</span> Qualquer habilidade ofensiva usada pelo oponente contra {editingSkill.redirectOffensiveScope === 'team' ? 'qualquer aliado da sua equipe' : 'o aliado protegido'} será <span className="font-bold text-white uppercase">redirecionada diretamente para Você (conjurador)</span>, exceto se a habilidade inimiga estiver configurada com <span className="font-bold text-amber-300 font-mono">"Não Pode Ser Refletida"</span>.
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>

                          {/* 23. Remover Debuffs (Purificação / Cleanse Multi-seleção) */}
                          <div className="space-y-3 bg-emerald-950/20 border border-emerald-800/40 p-3.5 rounded-xl flex flex-col justify-between">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                                  ✨ Remover Debuffs (Purificação)
                                </label>
                                {(editingSkill.cleanseDebuffTypes || []).length > 0 || editingSkill.cleanseDebuffs ? (
                                  <span className="text-[9px] bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">
                                    ⚡ ATIVO
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-slate-800 border border-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                                    Inativo
                                  </span>
                                )}
                              </div>

                              <label className="flex items-center gap-2 text-[10px] cursor-pointer select-none text-slate-300 font-mono">
                                <input
                                  type="checkbox"
                                  checked={editingSkill.cleanseDebuffs || (editingSkill.cleanseDebuffTypes && editingSkill.cleanseDebuffTypes.length > 0) || false}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    handleUpdateSkillField('cleanseDebuffs', checked);
                                    if (checked && (!editingSkill.cleanseDebuffTypes || editingSkill.cleanseDebuffTypes.length === 0)) {
                                      handleUpdateSkillField('cleanseDebuffTypes', ['affliction', 'dot', 'bleeding']);
                                    } else if (!checked) {
                                      handleUpdateSkillField('cleanseDebuffTypes', []);
                                    }
                                  }}
                                  className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                Ativar Purificação / Remoção de Debuffs
                              </label>

                              {(editingSkill.cleanseDebuffs || (editingSkill.cleanseDebuffTypes && editingSkill.cleanseDebuffTypes.length > 0)) && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-2.5 pt-2 border-t border-emerald-900/30 mt-2"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-emerald-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                    <select
                                      value={editingSkill.cleanseDebuffTarget || 'Self'}
                                      onChange={(e) => handleUpdateSkillField('cleanseDebuffTarget', e.target.value)}
                                      className="px-2 py-0.5 bg-slate-900 border border-emerald-900/50 rounded text-[10px] font-mono text-emerald-300 focus:border-emerald-600 outline-none w-full max-w-[160px]"
                                    >
                                      {TARGET_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">
                                        Debuffs a Remover (Selecione 1 ou mais):
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const allTypes = ['affliction', 'dot', 'bleeding', 'stun', 'paralyze_cooldown', 'damage_debuff', 'damage_vulnerability', 'cannot_reduce_damage', 'cannot_be_invulnerable', 'cannot_receive_friendly', 'on_skill_use_damage'];
                                          const isAllSelected = (editingSkill.cleanseDebuffTypes || []).length >= allTypes.length;
                                          handleUpdateSkillField('cleanseDebuffTypes', isAllSelected ? [] : allTypes);
                                        }}
                                        className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 font-mono font-bold border border-emerald-700/60 transition-all cursor-pointer"
                                      >
                                        {(editingSkill.cleanseDebuffTypes || []).length >= 10 ? '❌ Desmarcar Todos' : '⚡ Marcar Todos'}
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-1.5">
                                      {[
                                        { value: 'affliction', label: '💜 Aflição', desc: 'Dano de aflição' },
                                        { value: 'dot', label: '🔥 DoT / Queimadura', desc: 'Dano por turno' },
                                        { value: 'bleeding', label: '🩸 Sangramento', desc: 'Hemorragia ativa' },
                                        { value: 'stun', label: '⚡ Atordoamento', desc: 'Stuns / paralisias' },
                                        { value: 'paralyze_cooldown', label: '⏳ Paralisar Cooldown', desc: 'Trava de recarga' },
                                        { value: 'damage_debuff', label: '📉 Redução de Dano', desc: 'Debuff de dano' },
                                        { value: 'damage_vulnerability', label: '🎯 Vulnerabilidade', desc: 'Dano extra por classe' },
                                        { value: 'cannot_reduce_damage', label: '🚫 Incapaz Reduzir', desc: 'Quebra de defesa' },
                                        { value: 'cannot_be_invulnerable', label: '🛡️ Incapaz Invulnerável', desc: 'Bloqueio de esquiva' },
                                        { value: 'cannot_receive_friendly', label: '🤝 Incapaz Amigável', desc: 'Bloqueio de cura/buff' },
                                        { value: 'on_skill_use_damage', label: '⚔️ Punição por Skill', desc: 'Dano ao usar skill' },
                                        { value: 'all_debuffs', label: '🌀 Purificação Total', desc: 'Remove QUALQUER debuff' },
                                      ].map((opt) => {
                                        const current = editingSkill.cleanseDebuffTypes || [];
                                        const isSelected = current.includes(opt.value);
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                              let updated: string[];
                                              if (isSelected) {
                                                updated = current.filter(t => t !== opt.value);
                                              } else {
                                                updated = [...current, opt.value];
                                              }
                                              handleUpdateSkillField('cleanseDebuffTypes', updated);
                                            }}
                                            className={`p-1.5 text-left rounded-lg border transition-all cursor-pointer ${
                                              isSelected
                                                ? 'bg-emerald-950 border-emerald-500 text-emerald-200 font-bold shadow-md shadow-emerald-950/60'
                                                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                                            }`}
                                          >
                                            <div className="text-[10px] font-mono flex items-center justify-between">
                                              <span>{opt.label}</span>
                                              <span className="text-[9px] font-bold">{isSelected ? '✓' : ''}</span>
                                            </div>
                                            <div className="text-[8px] text-slate-500 font-mono leading-tight mt-0.5">{opt.desc}</div>
                                          </button>
                                        );
                                      })}
                                    </div>

                                    {(editingSkill.cleanseDebuffTypes || []).length > 0 && (
                                      <div className="text-[9px] text-emerald-300 font-mono leading-normal bg-emerald-950/30 border border-emerald-900/40 p-2 rounded-lg mt-2">
                                        ✨ <span className="font-bold">Resumo:</span> Remove <span className="font-bold text-white uppercase">{(editingSkill.cleanseDebuffTypes || []).map(t => {
                                          if (t === 'affliction') return 'Aflição';
                                          if (t === 'dot') return 'DoT';
                                          if (t === 'bleeding') return 'Sangramento';
                                          if (t === 'stun') return 'Stun';
                                          if (t === 'paralyze_cooldown') return 'Paralisar Cooldown';
                                          if (t === 'damage_debuff') return 'Redução de Dano';
                                          if (t === 'damage_vulnerability') return 'Vulnerabilidade';
                                          if (t === 'cannot_reduce_damage') return 'Incapaz Reduzir Dano';
                                          if (t === 'cannot_be_invulnerable') return 'Incapaz Invulnerável';
                                          if (t === 'cannot_receive_friendly') return 'Incapaz Receber Amigável';
                                          if (t === 'on_skill_use_damage') return 'Punição por Skill';
                                          if (t === 'all_debuffs') return 'Purificação Total';
                                          return t;
                                        }).join(', ')}</span> do alvo.
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>

                        {/* 24. Prisão de Madeira (Wood Spire Prison) */}
                          <div className="space-y-3 bg-amber-950/20 border border-amber-800/40 p-3.5 rounded-xl flex flex-col justify-between">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                                  🌳 Prisão de Madeira (Wood Spire Prison)
                                </label>
                                {editingSkill.prisonRule?.enabled ? (
                                  <span className="text-[9px] bg-amber-500/20 border border-amber-500/50 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">
                                    ⚡ ATIVO
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-slate-800 border border-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                                    Inativo
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] text-amber-200/70 leading-relaxed">
                                Aliado: remove debuffs, zera cooldowns e reduz dano recebido de skills NÃO-Aflição. Inimigo: habilidades NÃO-Mentais causam menos dano e ele sofre dano por turno se NÃO usar habilidade ofensiva.
                              </p>

                              <label className="flex items-center gap-2 text-[10px] cursor-pointer select-none text-slate-300 font-mono">
                                <input
                                  type="checkbox"
                                  checked={editingSkill.prisonRule?.enabled || false}
                                  onChange={(e) => {
                                    const current = editingSkill.prisonRule || {};
                                    handleUpdateSkillField('prisonRule', { ...current, enabled: e.target.checked });
                                  }}
                                  className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                Ativar Prisão de Madeira
                              </label>

                              {editingSkill.prisonRule?.enabled && (
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-2.5 pt-2 border-t border-amber-900/30 mt-2"
                                >
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-[9px] text-amber-400 font-mono uppercase font-bold">🤝 Redução ALIADO</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={editingSkill.prisonRule?.allyReduction ?? 15}
                                        onChange={(e) => {
                                          const current = editingSkill.prisonRule || {};
                                          handleUpdateSkillField('prisonRule', { ...current, allyReduction: parseInt(e.target.value) || 0 });
                                        }}
                                        className="w-full px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-amber-400 font-mono uppercase font-bold">😈 Redução INIMIGO</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={editingSkill.prisonRule?.enemyReduction ?? 15}
                                        onChange={(e) => {
                                          const current = editingSkill.prisonRule || {};
                                          handleUpdateSkillField('prisonRule', { ...current, enemyReduction: parseInt(e.target.value) || 0 });
                                        }}
                                        className="w-full px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-amber-400 font-mono uppercase font-bold">💥 Punição (dano/turno)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={editingSkill.prisonRule?.punishmentDamage ?? 15}
                                        onChange={(e) => {
                                          const current = editingSkill.prisonRule || {};
                                          handleUpdateSkillField('prisonRule', { ...current, punishmentDamage: parseInt(e.target.value) || 0 });
                                        }}
                                        className="w-full px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-amber-400 font-mono uppercase font-bold">⏳ Duração (turnos)</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={editingSkill.prisonRule?.duration ?? 2}
                                        onChange={(e) => {
                                          const current = editingSkill.prisonRule || {};
                                          handleUpdateSkillField('prisonRule', { ...current, duration: parseInt(e.target.value) || 1 });
                                        }}
                                        className="w-full px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-amber-400 font-mono uppercase font-bold">💧 Geyser Spring (boost)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={editingSkill.prisonRule?.geyserBoost ?? 25}
                                        onChange={(e) => {
                                          const current = editingSkill.prisonRule || {};
                                          handleUpdateSkillField('prisonRule', { ...current, geyserBoost: parseInt(e.target.value) || 0 });
                                        }}
                                        className="w-full px-2 py-1 bg-slate-900 border border-amber-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                                      <input
                                        type="checkbox"
                                        checked={(editingSkill.prisonRule?.cleanseAlly ?? true)}
                                        onChange={(e) => {
                                          const current = editingSkill.prisonRule || {};
                                          handleUpdateSkillField('prisonRule', { ...current, cleanseAlly: e.target.checked });
                                        }}
                                        className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span className="text-[9px] text-amber-300 font-mono">✨ Limpar debuffs do aliado</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none bg-slate-900/80 px-2 py-1 rounded border border-slate-800/80">
                                      <input
                                        type="checkbox"
                                        checked={(editingSkill.prisonRule?.resetCooldownsAlly ?? true)}
                                        onChange={(e) => {
                                          const current = editingSkill.prisonRule || {};
                                          handleUpdateSkillField('prisonRule', { ...current, resetCooldownsAlly: e.target.checked });
                                        }}
                                        className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3 h-3"
                                      />
                                      <span className="text-[9px] text-amber-300 font-mono">⏱️ Zerar cooldowns do aliado</span>
                                    </label>
                                  </div>

                                  <div className="text-[9px] text-amber-300 font-mono leading-normal bg-amber-950/30 border border-amber-900/40 p-2 rounded-lg">
                                    🌳 <span className="font-bold">Resumo:</span> Aliado recebe -{editingSkill.prisonRule?.allyReduction ?? 15} de dano (não-Aflição){editingSkill.prisonRule?.cleanseAlly ?? true ? ' + limpeza de debuffs' : ''}{editingSkill.prisonRule?.resetCooldownsAlly ?? true ? ' + cooldowns zerados' : ''}. Inimigo sofre -{editingSkill.prisonRule?.enemyReduction ?? 15} de dano (não-Mental) e {editingSkill.prisonRule?.punishmentDamage ?? 15} de dano por turno sem usar skill ofensiva. Duração: {editingSkill.prisonRule?.duration ?? 2} turno(s). Com Geyser Spring: -{(editingSkill.prisonRule?.geyserBoost ?? 25)}.
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          </div>

                        {/* 14b. Roubar Vida (Vampirismo) */}
                          <div className="space-y-1 bg-lime-950/15 border border-lime-800/40 p-2.5 rounded-xl flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-lime-400 font-mono">🧛 Roubar Vida (Vampirismo)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editingSkill.stealLifeVal || 0}
                                  onChange={(e) => handleUpdateSkillField('stealLifeVal', parseInt(e.target.value) || 0)}
                                  placeholder="Val"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-lime-900/60 rounded text-center text-xs font-mono text-white font-bold"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={editingSkill.stealLifeDuration === 99999 ? 0 : (editingSkill.stealLifeDuration || 1)}
                                  title={editingSkill.stealLifeDuration === 99999 ? '♾️ Infinito' : 'Duração em turnos'}
                                  onChange={(e) => handleUpdateSkillField('stealLifeDuration', parseInt(e.target.value) || 1)}
                                  placeholder="Dur"
                                  className="w-12 px-1.5 py-1 bg-slate-900 border border-lime-900/60 rounded text-center text-xs font-mono text-white"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editingSkill.stealLifeDuration === 99999}
                                    onChange={(e) => handleUpdateSkillField('stealLifeDuration', e.target.checked ? 99999 : 1)}
                                    className="rounded bg-slate-950 border-slate-800 text-lime-500 focus:ring-0 w-3 h-3"
                                  />
                                  <span className="text-[9px] text-lime-400 font-mono">♾️ Infinito</span>
                                </label>
                                <span className="text-[9px] text-slate-500 font-mono">por turno</span>
                              </div>
                              {(editingSkill.stealLifeVal || 0) > 0 && (
                                <p className="text-[9px] text-lime-300 font-mono leading-normal bg-lime-950/30 border border-lime-900/40 p-2 rounded-lg mt-1">
                                  🧛 <span className="font-bold text-white uppercase">Resumo:</span> Todo turno que você pular, rouba <span className="font-bold text-white">{editingSkill.stealLifeVal}</span> de vida do alvo por {editingSkill.stealLifeDuration === 99999 ? '♾️ turnos' : `${editingSkill.stealLifeDuration} ${editingSkill.stealLifeDuration === 1 ? 'turno' : 'turnos'}`} — o inimigo perde e VOCÊ recupera o dano causado. Age como Dano Normal (sofre redução de dano e escudo). Se o inimigo ficar invulnerável, o roubo não acontece.
                                </p>
                              )}
                              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-lime-900/30">
                                <span className="text-[9px] text-lime-400 font-mono uppercase font-bold">🎯 Aplicar em:</span>
                                <select
                                  value={editingSkill.stealLifeTarget || 'Target'}
                                  onChange={(e) => handleUpdateSkillField('stealLifeTarget', e.target.value)}
                                  className="px-2 py-0.5 bg-slate-900 border border-lime-900/50 rounded text-[10px] font-mono text-lime-300 focus:border-lime-600 outline-none w-full max-w-[150px]"
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
                                    checked={editingSkill.stealLifeIrremovable || false}
                                    onChange={(e) => handleUpdateSkillField('stealLifeIrremovable', e.target.checked)}
                                    className="rounded bg-slate-950 border-slate-800 text-lime-500 focus:ring-0 w-3 h-3"
                                  />
                                  🔒 Nunca Remover
                                </label>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-slate-500 font-mono">Limpar:</span>
                                  <select
                                    value={editingSkill.stealLifeRemoveType || 'none'}
                                    onChange={(e) => handleUpdateSkillField('stealLifeRemoveType', e.target.value)}
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

                          {/* 💣 Contagem Regressiva (Bomba): dano quando o TEMPO acabar */}
                          <div className="space-y-2 bg-amber-950/20 border border-amber-800/50 p-3.5 rounded-xl flex flex-col justify-between md:col-span-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono flex items-center gap-1">
                                💣 Contagem Regressiva (Dano após X Turnos)
                              </label>
                              <p className="text-[9px] text-amber-200/70 font-mono leading-relaxed mt-1 bg-amber-950/40 border border-amber-900/50 p-2 rounded-lg">
                                ⏳ <span className="font-bold text-amber-300">Como funciona:</span> ao usar a skill no alvo, ele recebe um timer de <span className="font-bold text-white">X turnos</span> (aparece como debuff contando os turnos). Quando o <span className="font-bold text-white uppercase">tempo acabar</span>, ele recebe o dano configurado (ex.: 2 turnos → recebe 20 de dano).
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = editingSkill.countdownDamageRules || [];
                                  handleUpdateSkillField('countdownDamageRules', [
                                    ...current,
                                    { damage: 20, duration: 2, damageType: 'damage', target: 'holder' }
                                  ]);
                                }}
                                className="mt-2 px-2.5 py-1 bg-amber-900/40 hover:bg-amber-800/50 text-amber-300 border border-amber-800/60 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                              >
                                + Adicionar Bomba (Contagem Regressiva)
                              </button>
                              {(!editingSkill.countdownDamageRules || editingSkill.countdownDamageRules.length === 0) ? (
                                <p className="text-[9px] text-slate-500 font-mono italic mt-1.5">
                                  Nenhuma bomba de contagem regressiva configurada.
                                </p>
                              ) : (
                                <div className="space-y-2 pt-1.5">
                                  {editingSkill.countdownDamageRules.map((rule, rIdx) => (
                                    <div key={rIdx} className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-lg border border-amber-900/50 text-[10px] font-mono">
                                      <span className="text-slate-400 font-bold">Dano:</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={500}
                                        value={rule.damage}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 1;
                                          const updated = [...(editingSkill.countdownDamageRules || [])];
                                          updated[rIdx] = { ...updated[rIdx], damage: val };
                                          handleUpdateSkillField('countdownDamageRules', updated);
                                        }}
                                        className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-white outline-none text-[10px]"
                                      />
                                      <span className="text-slate-400 font-bold">Tipo:</span>
                                      <select
                                        value={rule.damageType || 'damage'}
                                        onChange={(e) => {
                                          const updated = [...(editingSkill.countdownDamageRules || [])];
                                          updated[rIdx] = { ...updated[rIdx], damageType: e.target.value as any };
                                          handleUpdateSkillField('countdownDamageRules', updated);
                                        }}
                                        className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-amber-300 outline-none text-[10px]"
                                      >
                                        <option value="damage">💥 Dano Normal (sofre redução)</option>
                                        <option value="direct_damage">🎯 Dano Direto (ignora redução)</option>
                                        <option value="piercing">🗡️ Dano Perfurante</option>
                                        <option value="true">☠️ Dano Verdadeiro</option>
                                        <option value="affliction">💀 Dano de Aflição</option>
                                        <option value="bleeding">🩸 Dano de Sangramento</option>
                                        <option value="dot">🔥 Dano de Queimadura</option>
                                      </select>
                                      <span className="text-slate-400 font-bold">Em turnos:</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={99}
                                        value={rule.duration}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 1;
                                          const updated = [...(editingSkill.countdownDamageRules || [])];
                                          updated[rIdx] = { ...updated[rIdx], duration: val };
                                          handleUpdateSkillField('countdownDamageRules', updated);
                                        }}
                                        title="Contagem regressiva: turnos até a bomba explodir"
                                        className="w-14 px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-white outline-none text-[10px]"
                                      />
                                      <span className="text-slate-400 font-bold">Quem recebe:</span>
                                      <select
                                        value={rule.target || 'holder'}
                                        onChange={(e) => {
                                          const updated = [...(editingSkill.countdownDamageRules || [])];
                                          updated[rIdx] = { ...updated[rIdx], target: e.target.value as any };
                                          handleUpdateSkillField('countdownDamageRules', updated);
                                        }}
                                        className="px-2 py-1 bg-slate-900 border border-slate-800 focus:border-amber-500 rounded text-amber-300 outline-none text-[10px]"
                                      >
                                        <option value="holder">🎯 Quem tem a bomba (Padrão)</option>
                                        <option value="enemy">⚔️ Um inimigo do portador</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = (editingSkill.countdownDamageRules || []).filter((_, i) => i !== rIdx);
                                          handleUpdateSkillField('countdownDamageRules', updated.length > 0 ? updated : undefined);
                                        }}
                                        className="p-1 bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 rounded border border-slate-800 transition-all cursor-pointer"
                                        title="Remover Regra"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
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
 