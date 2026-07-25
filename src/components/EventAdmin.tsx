/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, Plus, Trash2, Edit3, Save, RefreshCw, 
  CheckCircle, AlertTriangle, Search, Trophy, Gift, 
  Clock, Sparkles, Tag, Eye, Star, Target, Shield, Upload, ImageIcon, Shirt, User
} from 'lucide-react';
import { NinjaEvent, NinjaEventObjective, Character, CharacterSkin } from '../types';
import { getEvents, saveEvents, resetToDefaultEvents, fetchEventsFromServer } from '../lib/eventStorage';
import { getPngFrames, addPngFrame, deletePngFrame, PngFrameItem, resetToDefaultPngFrames, fetchPngFramesFromServer } from '../lib/frameStorage';
import { getCustomBanners, addCustomBanner, deleteCustomBanner, resetToDefaultCustomBanners, CustomBannerItem, fetchCustomBannersFromServer } from '../lib/bannerStorage';
import { getCharacters, saveCharacters, fetchCharactersFromServer } from '../lib/characterStorage';
import { motion, AnimatePresence } from 'motion/react';

interface EventAdminProps {
  playClickSound: () => void;
}

export default function EventAdmin({ playClickSound }: EventAdminProps) {
  const [activeTab, setActiveTab] = useState<'events' | 'png-frames' | 'banners' | 'skins'>('events');

  // Events State
  const [events, setEvents] = useState<NinjaEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [editingEvent, setEditingEvent] = useState<NinjaEvent | null>(null);

  const [editingObjectiveIndex, setEditingObjectiveIndex] = useState<number | null>(null);
  const [editingObjective, setEditingObjective] = useState<NinjaEventObjective | null>(null);

  // PNG Frames Library State
  const [pngFrames, setPngFrames] = useState<PngFrameItem[]>([]);
  const [newFrameCustomId, setNewFrameCustomId] = useState(`frame-png-${Date.now().toString().slice(-4)}`);
  const [newFrameName, setNewFrameName] = useState('');
  const [newFrameDesc, setNewFrameDesc] = useState('');
  const [newFrameBadge, setNewFrameBadge] = useState('EVENTO');
  const [newFrameUrl, setNewFrameUrl] = useState('');

  // Banners Library State
  const [customBanners, setCustomBanners] = useState<CustomBannerItem[]>([]);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [newBannerCustomId, setNewBannerCustomId] = useState(`banner-${Date.now().toString().slice(-4)}`);
  const [newBannerName, setNewBannerName] = useState('');
  const [newBannerDesc, setNewBannerDesc] = useState('');
  const [newBannerBadge, setNewBannerBadge] = useState('EVENTO');
  const [newBannerUrl, setNewBannerUrl] = useState('');

  // Character Skins State
  const [charactersList, setCharactersList] = useState<Character[]>([]);
  const [selectedCharFilter, setSelectedCharFilter] = useState<string>('all');
  const [newSkinCharId, setNewSkinCharId] = useState<string>('');
  const [newSkinName, setNewSkinName] = useState<string>('');
  const [newSkinImage, setNewSkinImage] = useState<string>('');
  const [editingSkinInfo, setEditingSkinInfo] = useState<{ charId: string; skinIdx: number; name: string; image: string } | null>(null);

  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    fetchEventsFromServer().then(loaded => {
      setEvents(loaded);
      if (loaded.length > 0) {
        setSelectedEventId(loaded[0].id);
        setEditingEvent(JSON.parse(JSON.stringify(loaded[0])));
      }
    });

    fetchPngFramesFromServer().then(setPngFrames);
    fetchCustomBannersFromServer().then(setCustomBanners);

    fetchCharactersFromServer().then(loadedChars => {
      setCharactersList(loadedChars);
      if (loadedChars.length > 0) {
        setNewSkinCharId(loadedChars[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      const found = events.find(e => e.id === selectedEventId);
      if (found) {
        setEditingEvent(JSON.parse(JSON.stringify(found)));
        setEditingObjectiveIndex(null);
        setEditingObjective(null);
      }
    }
  }, [selectedEventId, events]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 4000);
  };

  // --- PNG FRAME LIBRARY HANDLERS ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.includes('png') && !file.type.includes('image')) {
        showError('A imagem da moldura deve preferencialmente ser um formato transparente (PNG).');
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setNewFrameUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPngFrame = () => {
    playClickSound();
    if (!newFrameName.trim()) {
      showError('Informe um nome para a moldura PNG.');
      return;
    }
    if (!newFrameUrl.trim()) {
      showError('Envie um arquivo PNG ou insira uma URL de imagem.');
      return;
    }

    const frameItem: PngFrameItem = {
      id: newFrameCustomId.trim() || `frame-png-${Date.now()}`,
      name: newFrameName.trim(),
      description: newFrameDesc.trim() || 'Moldura exclusiva em formato PNG para avatares do evento.',
      imageUrl: newFrameUrl.trim(),
      badge: newFrameBadge.trim() || 'EVENTO',
      isCustomUploaded: true
    };

    const updated = addPngFrame(frameItem);
    setPngFrames(updated);
    setNewFrameCustomId(`frame-png-${Date.now().toString().slice(-4)}`);
    setNewFrameName('');
    setNewFrameDesc('');
    setNewFrameUrl('');
    showSuccess(`Moldura PNG "${frameItem.name}" adicionada ao acervo!`);
  };

  const handleDeletePngFrame = (id: string) => {
    playClickSound();
    const updated = deletePngFrame(id);
    setPngFrames(updated);
    showSuccess('Moldura PNG removida da galeria.');
  };

  const handleResetPngFrames = () => {
    playClickSound();
    if (confirm('Restaurar acervo de molduras PNG padrão?')) {
      const defs = resetToDefaultPngFrames();
      setPngFrames(defs);
      showSuccess('Galeria de molduras restaurada para os padrões!');
    }
  };

  // --- BANNERS LIBRARY HANDLERS ---
  const handleBannerFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setNewBannerUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddOrUpdateCustomBanner = () => {
    playClickSound();
    if (!newBannerName.trim()) {
      showError('Informe um nome para o banner do perfil.');
      return;
    }
    if (!newBannerUrl.trim()) {
      showError('Envie um arquivo de imagem ou insira uma URL.');
      return;
    }

    const bannerItem: CustomBannerItem = {
      id: editingBannerId || newBannerCustomId.trim() || `banner-${Date.now()}`,
      name: newBannerName.trim(),
      description: newBannerDesc.trim() || 'Banner exclusivo de fundo do card de perfil.',
      imageUrl: newBannerUrl.trim(),
      badge: newBannerBadge.trim() || 'EVENTO',
      isCustomUploaded: true
    };

    const updated = addCustomBanner(bannerItem);
    setCustomBanners(updated);
    setEditingBannerId(null);
    setNewBannerCustomId(`banner-${Date.now().toString().slice(-4)}`);
    setNewBannerName('');
    setNewBannerDesc('');
    setNewBannerUrl('');
    showSuccess(editingBannerId ? `Banner "${bannerItem.name}" atualizado!` : `Banner "${bannerItem.name}" adicionado ao acervo!`);
  };

  const handleEditBanner = (banner: CustomBannerItem) => {
    playClickSound();
    setEditingBannerId(banner.id);
    setNewBannerCustomId(banner.id);
    setNewBannerName(banner.name);
    setNewBannerDesc(banner.description || '');
    setNewBannerBadge(banner.badge || 'EVENTO');
    setNewBannerUrl(banner.imageUrl);
  };

  const handleCancelEditBanner = () => {
    playClickSound();
    setEditingBannerId(null);
    setNewBannerCustomId(`banner-${Date.now().toString().slice(-4)}`);
    setNewBannerName('');
    setNewBannerDesc('');
    setNewBannerUrl('');
  };

  const handleDeleteCustomBanner = (id: string) => {
    playClickSound();
    const updated = deleteCustomBanner(id);
    setCustomBanners(updated);
    if (editingBannerId === id) {
      handleCancelEditBanner();
    }
    showSuccess('Banner removido da galeria.');
  };

  const handleResetCustomBanners = () => {
    playClickSound();
    if (confirm('Restaurar acervo de banners de perfil padrão?')) {
      const defs = resetToDefaultCustomBanners();
      setCustomBanners(defs);
      showSuccess('Galeria de banners restaurada para os padrões!');
    }
  };

  // --- SKINS GALLERY HANDLERS ---
  const handleSkinFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setNewSkinImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddOrUpdateSkin = () => {
    playClickSound();
    if (!newSkinCharId) {
      showError('Selecione o ninja para cadastrar a skin.');
      return;
    }
    if (!newSkinName.trim()) {
      showError('Informe o nome da skin.');
      return;
    }
    if (!newSkinImage.trim()) {
      showError('Envie um arquivo PNG da skin ou informe a URL.');
      return;
    }

    if (editingSkinInfo) {
      const { charId, skinIdx } = editingSkinInfo;
      const updatedChars = charactersList.map(char => {
        if (char.id === charId && char.skins) {
          const updatedSkins = [...char.skins];
          updatedSkins[skinIdx] = {
            ...updatedSkins[skinIdx],
            name: newSkinName.trim(),
            image: newSkinImage.trim()
          };
          return { ...char, skins: updatedSkins };
        }
        return char;
      });

      setCharactersList(updatedChars);
      saveCharacters(updatedChars);
      setEditingSkinInfo(null);
      setNewSkinName('');
      setNewSkinImage('');
      showSuccess('Skin do personagem atualizada com sucesso!');
    } else {
      const targetChar = charactersList.find(c => c.id === newSkinCharId);
      const updatedChars = charactersList.map(char => {
        if (char.id === newSkinCharId) {
          const currentSkins = char.skins || [];
          const newSkinItem: CharacterSkin = {
            id: `${char.id}-skin-${Date.now().toString().slice(-4)}`,
            name: newSkinName.trim(),
            image: newSkinImage.trim()
          };
          return { ...char, skins: [...currentSkins, newSkinItem] };
        }
        return char;
      });

      setCharactersList(updatedChars);
      saveCharacters(updatedChars);
      setNewSkinName('');
      setNewSkinImage('');
      showSuccess(`Nova skin adicionada para ${targetChar?.name || 'Ninja'}!`);
    }
  };

  const handleEditSkin = (charId: string, skinIdx: number, skin: CharacterSkin) => {
    playClickSound();
    setEditingSkinInfo({ charId, skinIdx, name: skin.name, image: skin.image });
    setNewSkinCharId(charId);
    setNewSkinName(skin.name);
    setNewSkinImage(skin.image);
  };

  const handleCancelEditSkin = () => {
    playClickSound();
    setEditingSkinInfo(null);
    setNewSkinName('');
    setNewSkinImage('');
  };

  const handleDeleteSkin = (charId: string, skinIdx: number, skinName: string) => {
    playClickSound();
    if (!confirm(`Tem certeza que deseja remover a skin "${skinName}"?`)) return;

    const updatedChars = charactersList.map(char => {
      if (char.id === charId) {
        const currentSkins = char.skins || [];
        const updatedSkins = currentSkins.filter((_, idx) => idx !== skinIdx);
        return { ...char, skins: updatedSkins };
      }
      return char;
    });

    setCharactersList(updatedChars);
    saveCharacters(updatedChars);
    if (editingSkinInfo?.charId === charId && editingSkinInfo?.skinIdx === skinIdx) {
      handleCancelEditSkin();
    }
    showSuccess('Skin removida com sucesso!');
  };

  const totalSkinsCount = charactersList.reduce((acc, c) => acc + (c.skins?.length || 0), 0);

  // --- EVENT HANDLERS ---
  const handleCreateNewEvent = () => {
    playClickSound();
    const newId = `evento-ninja-${Date.now().toString().slice(-4)}`;
    const newEv: NinjaEvent = {
      id: newId,
      title: 'Novo Evento Temporário',
      subtitle: 'Subtítulo do Evento Ninja',
      description: 'Descrição detalhada dos objetivos e histórias do novo evento.',
      bannerUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
      badge: 'NOVO EVENTO',
      timeLeft: '7 dias',
      featured: false,
      objectives: [
        {
          id: `${newId}-obj1`,
          description: 'Vença 1 batalha na Arena',
          current: 0,
          target: 1,
          rewardType: 'ryos',
          rewardValue: 500,
          rewardLabel: '500 Ryos'
        }
      ]
    };

    const updated = [...events, newEv];
    setEvents(updated);
    saveEvents(updated);
    setSelectedEventId(newId);
    setEditingEvent(newEv);
    showSuccess('Novo evento criado com sucesso!');
  };

  const handleSaveEvent = () => {
    if (!editingEvent) return;
    playClickSound();

    if (!editingEvent.title.trim()) {
      showError('O título do evento não pode estar vazio.');
      return;
    }

    if (editingEvent.objectives.length === 0) {
      showError('O evento precisa ter pelo menos 1 objetivo.');
      return;
    }

    const updated = events.map(e => e.id === editingEvent.id ? editingEvent : e);
    setEvents(updated);
    saveEvents(updated);
    showSuccess(`Evento "${editingEvent.title}" salvo com sucesso!`);
  };

  const handleDeleteEvent = (eventId: string) => {
    playClickSound();
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    if (confirm(`Tem certeza de que deseja excluir o evento "${ev.title}"?`)) {
      const updated = events.filter(e => e.id !== eventId);
      setEvents(updated);
      saveEvents(updated);

      if (updated.length > 0) {
        setSelectedEventId(updated[0].id);
      } else {
        setSelectedEventId('');
        setEditingEvent(null);
      }
      showSuccess(`Evento "${ev.title}" removido.`);
    }
  };

  const handleResetDefaults = () => {
    playClickSound();
    if (confirm('Deseja restaurar os eventos para os padrões originais?')) {
      const defaults = resetToDefaultEvents();
      setEvents(defaults);
      if (defaults.length > 0) {
        setSelectedEventId(defaults[0].id);
        setEditingEvent(JSON.parse(JSON.stringify(defaults[0])));
      }
      showSuccess('Eventos restaurados para os padrões!');
    }
  };

  // Objectives Management
  const handleAddObjective = () => {
    if (!editingEvent) return;
    playClickSound();

    const newObj: NinjaEventObjective = {
      id: `${editingEvent.id}-obj-${Date.now().toString().slice(-4)}`,
      description: 'Novo Objetivo do Evento',
      current: 0,
      target: 5,
      rewardType: 'gems',
      rewardValue: 50,
      rewardLabel: '50 Gemas Ninja'
    };

    const newObjectives = [...editingEvent.objectives, newObj];
    const updatedEv = { ...editingEvent, objectives: newObjectives };
    setEditingEvent(updatedEv);

    setEditingObjectiveIndex(newObjectives.length - 1);
    setEditingObjective(newObj);
    showSuccess('Novo objetivo adicionado ao evento!');
  };

  const handleDeleteObjective = (index: number) => {
    if (!editingEvent) return;
    playClickSound();

    if (editingEvent.objectives.length <= 1) {
      showError('Um evento deve possuir pelo menos 1 objetivo.');
      return;
    }

    const newObjectives = editingEvent.objectives.filter((_, idx) => idx !== index);
    setEditingEvent({ ...editingEvent, objectives: newObjectives });
    setEditingObjectiveIndex(null);
    setEditingObjective(null);
    showSuccess('Objetivo removido.');
  };

  const handleSelectObjective = (index: number) => {
    if (!editingEvent) return;
    playClickSound();
    setEditingObjectiveIndex(index);
    setEditingObjective(JSON.parse(JSON.stringify(editingEvent.objectives[index])));
  };

  const handleSaveObjective = () => {
    if (!editingEvent || editingObjectiveIndex === null || !editingObjective) return;
    playClickSound();

    if (!editingObjective.description.trim()) {
      showError('A descrição do objetivo não pode estar vazia.');
      return;
    }

    const updatedObjectives = [...editingEvent.objectives];
    updatedObjectives[editingObjectiveIndex] = editingObjective;

    setEditingEvent({
      ...editingEvent,
      objectives: updatedObjectives
    });

    showSuccess('Objetivo atualizado! Clique em "Salvar Evento Completo" para gravar as alterações.');
  };

  const handleSelectPngFrameForObjective = (frame: PngFrameItem) => {
    if (!editingObjective) return;
    setEditingObjective({
      ...editingObjective,
      rewardType: 'frame',
      rewardValue: frame.name,
      rewardLabel: `Moldura: "${frame.name}"`,
      rewardFrameImageUrl: frame.imageUrl
    });
  };

  const handleSelectBannerForObjective = (banner: CustomBannerItem) => {
    if (!editingObjective) return;
    setEditingObjective({
      ...editingObjective,
      rewardType: 'banner',
      rewardValue: banner.name,
      rewardLabel: `Banner: "${banner.name}"`,
      rewardFrameImageUrl: banner.imageUrl
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 font-sans">
      {/* Toast Feedback */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 font-mono text-xs"
          >
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{successMessage}</span>
          </motion.div>
        )}

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 font-mono text-xs"
          >
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Submenu: Events vs PNG Frames Gallery vs Banners Gallery vs Skins Gallery */}
      <div className="flex bg-slate-900/80 border border-slate-800 p-1.5 rounded-2xl max-w-3xl flex-wrap gap-1">
        <button
          onClick={() => { playClickSound(); setActiveTab('events'); }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'events'
              ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Eventos ({events.length})
        </button>

        <button
          onClick={() => { playClickSound(); setActiveTab('png-frames'); }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'png-frames'
              ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          Molduras PNG ({pngFrames.length})
        </button>

        <button
          onClick={() => { playClickSound(); setActiveTab('banners'); }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'banners'
              ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          Galeria de Banners ({customBanners.length})
        </button>

        <button
          onClick={() => { playClickSound(); setActiveTab('skins'); }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'skins'
              ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shirt className="w-4 h-4" />
          Galeria de Skins ({totalSkinsCount})
        </button>
      </div>

      {/* TAB 1: PNG FRAMES GALLERY MANAGEMENT */}
      {activeTab === 'png-frames' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add Frame Form */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-extrabold">
                  Cadastrar Moldura PNG
                </h3>
              </div>
              <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                RECOMPENSA DE EVENTO
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">ID Único da Moldura (`id`)</label>
              <input
                type="text"
                placeholder="Ex: frame-fogo-da-vontade-png"
                value={newFrameCustomId}
                onChange={e => setNewFrameCustomId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Nome da Moldura</label>
              <input
                type="text"
                placeholder="Ex: Moldura Sharingan Supremo"
                value={newFrameName}
                onChange={e => setNewFrameName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Badge de Categoria / Evento</label>
              <input
                type="text"
                placeholder="Ex: EXCLUSIVO, LENDÁRIO, GUERRA"
                value={newFrameBadge}
                onChange={e => setNewFrameBadge(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Imagem da Moldura (Arquivo PNG / URL)</label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://...imagem.png"
                    value={newFrameUrl}
                    onChange={e => setNewFrameUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                  />
                  <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1 cursor-pointer flex-shrink-0">
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span>Upload</span>
                    <input type="file" accept="image/png,image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Descrição</label>
              <textarea
                rows={2}
                placeholder="Descrição de como a moldura foi conquistada no evento..."
                value={newFrameDesc}
                onChange={e => setNewFrameDesc(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
              />
            </div>

            {/* Live Preview */}
            {newFrameUrl && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center">
                <p className="text-[10px] font-mono text-slate-400 uppercase mb-2">Pré-visualização da Moldura em Avatar</p>
                <div className="relative w-20 h-20 mx-auto">
                  <div className="w-full h-full rounded-full bg-slate-800 overflow-hidden">
                    <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150" alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <img
                    src={newFrameUrl}
                    alt="Preview Frame"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleAddPngFrame}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Guardar Moldura no Acervo
            </button>
          </div>

          {/* Stored Frames List */}
          <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-extrabold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" /> Molduras PNG Salvas para Recompensas
                </h3>
                <p className="text-[10px] font-mono text-slate-500">Estas molduras podem ser vinculadas como recompensas de eventos</p>
              </div>

              <button
                onClick={handleResetPngFrames}
                className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-400 text-[10px] font-mono font-bold rounded-lg transition flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Restaurar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
              {pngFrames.map(frame => (
                <div key={frame.id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-3 relative group">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                      <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" alt="User" className="w-full h-full object-cover" />
                    </div>
                    <img src={frame.imageUrl} alt={frame.name} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none pointer-events-none object-contain" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-xs text-slate-200 truncate">{frame.name}</p>
                    <span className="text-[9px] font-mono text-orange-400 uppercase font-bold block">{frame.badge || 'PNG'}</span>
                    <p className="text-[10px] text-slate-400 line-clamp-1">{frame.description}</p>
                  </div>

                  <button
                    onClick={() => handleDeletePngFrame(frame.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition rounded hover:bg-slate-800 opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Excluir Moldura"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BANNERS GALLERY MANAGEMENT */}
      {activeTab === 'banners' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add / Edit Banner Form (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-extrabold">
                  {editingBannerId ? 'Editar Banner do Perfil' : 'Cadastrar Banner de Perfil'}
                </h3>
              </div>
              <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                FUNDO DO CARD
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">ID Único do Banner (`id`)</label>
              <input
                type="text"
                placeholder="Ex: banner-fogo-da-vontade"
                value={newBannerCustomId}
                disabled={!!editingBannerId}
                onChange={e => setNewBannerCustomId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Nome do Banner</label>
              <input
                type="text"
                placeholder="Ex: Vale do Fim - Crepúsculo"
                value={newBannerName}
                onChange={e => setNewBannerName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Badge / Categoria</label>
              <input
                type="text"
                placeholder="Ex: LENDÁRIO, EVENTO, MISSÃO"
                value={newBannerBadge}
                onChange={e => setNewBannerBadge(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Imagem do Banner (URL / Arquivo)</label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://...imagem.jpg ou png"
                    value={newBannerUrl}
                    onChange={e => setNewBannerUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                  />
                  <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-mono text-xs font-bold transition flex items-center gap-1 cursor-pointer flex-shrink-0">
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span>Upload</span>
                    <input type="file" accept="image/*" onChange={handleBannerFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Descrição</label>
              <textarea
                rows={2}
                placeholder="Descrição de como o banner foi obtido..."
                value={newBannerDesc}
                onChange={e => setNewBannerDesc(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
              />
            </div>

            {/* Live Preview of Banner */}
            {newBannerUrl && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center">
                <p className="text-[10px] font-mono text-slate-400 uppercase mb-2">Pré-visualização do Banner no Card</p>
                <div className="h-24 w-full rounded-xl overflow-hidden relative border border-slate-700 shadow flex items-center justify-center">
                  <img src={newBannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                  <div className="absolute bottom-2 left-2 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-amber-500 overflow-hidden">
                      <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-extrabold text-white leading-none">{newBannerName || 'Nome do Banner'}</p>
                      <span className="text-[8px] font-mono text-amber-300 uppercase">{newBannerBadge || 'BADGE'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleAddOrUpdateCustomBanner}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {editingBannerId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4 stroke-[3]" />}
                {editingBannerId ? 'Salvar Alterações' : 'Guardar Banner no Acervo'}
              </button>

              {editingBannerId && (
                <button
                  onClick={handleCancelEditBanner}
                  className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Stored Banners List (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-extrabold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-400" /> Banners Salvos na Galeria ({customBanners.length})
                </h3>
                <p className="text-[10px] font-mono text-slate-500">Adicione, edite ou remova os banners de fundo do perfil do usuário</p>
              </div>

              <button
                onClick={handleResetCustomBanners}
                className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-400 text-[10px] font-mono font-bold rounded-lg transition flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Restaurar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
              {customBanners.map(banner => (
                <div key={banner.id} className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden relative group flex flex-col justify-between">
                  <div className="h-24 w-full relative overflow-hidden bg-slate-900">
                    <img src={banner.imageUrl} alt={banner.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
                    <span className="absolute top-2 left-2 text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-slate-950/80 text-amber-400 border border-amber-500/30">
                      {banner.badge || 'BANNER'}
                    </span>

                    {/* Action Buttons Top Right */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-950/80 backdrop-blur rounded-lg p-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => handleEditBanner(banner)}
                        className="p-1 text-slate-300 hover:text-amber-400 transition rounded hover:bg-slate-800"
                        title="Editar Banner"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomBanner(banner.id)}
                        className="p-1 text-slate-300 hover:text-red-400 transition rounded hover:bg-slate-800"
                        title="Excluir Banner"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3">
                    <p className="font-extrabold text-xs text-slate-200 truncate">{banner.name}</p>
                    <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">{banner.description}</p>
                    <span className="text-[9px] font-mono text-slate-500 block mt-1 truncate">ID: {banner.id}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EVENTS MANAGER */}
      {activeTab === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Events Sidebar (4 cols) */}
          <section className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 h-fit">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-extrabold">Eventos Ativos</h3>
              </div>
              <button
                onClick={handleCreateNewEvent}
                className="px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-slate-950 font-mono font-bold text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-md"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                Novo Evento
              </button>
            </div>

            {/* Events List */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {events.map(ev => {
                const isSelected = ev.id === selectedEventId;
                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 group ${
                      isSelected
                        ? 'bg-slate-950 border-orange-500/80 shadow-md shadow-orange-950/20'
                        : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex-shrink-0">
                        <img src={ev.bannerUrl} alt={ev.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-200 truncate group-hover:text-orange-400">{ev.title}</p>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                          <span className="text-orange-400 font-bold">{ev.badge}</span>
                          <span>•</span>
                          <span>{ev.objectives.length} Objetivos</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteEvent(ev.id);
                      }}
                      className="p-1 text-slate-500 hover:text-red-400 transition rounded hover:bg-slate-800 opacity-0 group-hover:opacity-100"
                      title="Excluir Evento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {events.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  Nenhum evento cadastrado. Clique em "+ Novo Evento".
                </div>
              )}
            </div>

            <button
              onClick={handleResetDefaults}
              className="w-full mt-2 py-2 border border-slate-800 hover:border-red-500/40 bg-slate-950 text-slate-400 hover:text-red-400 rounded-xl text-[10px] font-mono uppercase font-bold transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restaurar Eventos Originais
            </button>
          </section>

          {/* Right Column: Event Editor & Objectives Control (8 cols) */}
          <section className="lg:col-span-8 flex flex-col gap-6">
            {editingEvent ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-4">
                  <div>
                    <span className="text-[10px] font-mono text-orange-400 uppercase font-bold">Editando Configurações do Evento</span>
                    <h2 className="text-xl font-extrabold text-slate-100">{editingEvent.title}</h2>
                  </div>

                  <button
                    onClick={handleSaveEvent}
                    className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Evento Completo
                  </button>
                </div>

                {/* Event General Properties */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">ID Único do Evento (`id`)</label>
                    <input
                      type="text"
                      value={editingEvent.id}
                      onChange={e => setEditingEvent({ ...editingEvent, id: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Título do Evento</label>
                    <input
                      type="text"
                      value={editingEvent.title}
                      onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Subtítulo</label>
                    <input
                      type="text"
                      value={editingEvent.subtitle}
                      onChange={e => setEditingEvent({ ...editingEvent, subtitle: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Badge de Destaque</label>
                    <input
                      type="text"
                      value={editingEvent.badge}
                      onChange={e => setEditingEvent({ ...editingEvent, badge: e.target.value })}
                      placeholder="Ex: EVENTO PRINCIPAL, FESTIVAL..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Tempo Restante (Texto Exibido)</label>
                    <input
                      type="text"
                      value={editingEvent.timeLeft}
                      onChange={e => setEditingEvent({ ...editingEvent, timeLeft: e.target.value })}
                      placeholder="Ex: 4 dias 18 horas, 11 dias..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">URL da Imagem de Capa (Banner)</label>
                    <input
                      type="text"
                      value={editingEvent.bannerUrl}
                      onChange={e => setEditingEvent({ ...editingEvent, bannerUrl: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Descrição do Evento</label>
                    <textarea
                      rows={2}
                      value={editingEvent.description}
                      onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>
                </div>

                {/* OBJECTIVES & REWARDS SECTION */}
                <div className="border-t border-slate-800 pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-mono font-extrabold uppercase text-orange-400 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4" /> Objetivos e Recompensas
                      </h3>
                      <p className="text-[10px] font-mono text-slate-500">Configure metas, contadores e molduras PNG como recompensa</p>
                    </div>

                    <button
                      onClick={handleAddObjective}
                      className="px-2.5 py-1.5 rounded-lg border border-orange-500/40 hover:bg-orange-600/10 text-orange-400 text-[10px] font-mono font-bold uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar Objetivo
                    </button>
                  </div>

                  {/* Objectives List */}
                  <div className="space-y-3">
                    {editingEvent.objectives.map((obj, idx) => {
                      const isSelected = editingObjectiveIndex === idx;
                      return (
                        <div
                          key={obj.id}
                          onClick={() => handleSelectObjective(idx)}
                          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-slate-950 border-orange-500/80 shadow'
                              : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
                                #{idx + 1}
                              </span>
                              <p className="text-xs font-bold text-slate-200 truncate">{obj.description}</p>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                              <span>Alvo: <strong className="text-slate-200">{obj.target}</strong></span>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-amber-300">
                                <Gift className="w-3 h-3 text-amber-400" />
                                {obj.rewardLabel}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleDeleteObjective(idx);
                            }}
                            className="p-1 text-slate-500 hover:text-red-400 transition rounded hover:bg-slate-800"
                            title="Excluir Objetivo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Objective Form Editor */}
                  {editingObjective && editingObjectiveIndex !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-mono font-bold text-orange-400 uppercase flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" /> Editando Objetivo #{editingObjectiveIndex + 1}
                        </span>
                        <button
                          onClick={handleSaveObjective}
                          className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-slate-950 font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg transition"
                        >
                          Salvar Objetivo
                        </button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">ID Único do Objetivo (`id`)</label>
                          <input
                            type="text"
                            value={editingObjective.id}
                            onChange={e => setEditingObjective({ ...editingObjective, id: e.target.value })}
                            placeholder="Ex: obj-vencera-arena-1"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Descrição do Objetivo</label>
                          <input
                            type="text"
                            value={editingObjective.description}
                            onChange={e => setEditingObjective({ ...editingObjective, description: e.target.value })}
                            placeholder="Ex: Vença 3 partidas na Arena..."
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Progresso Inicial/Testes (`current`)</label>
                          <input
                            type="number"
                            value={editingObjective.current}
                            onChange={e => setEditingObjective({ ...editingObjective, current: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Meta Requerida (`target`)</label>
                          <input
                            type="number"
                            value={editingObjective.target}
                            onChange={e => setEditingObjective({ ...editingObjective, target: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Tipo de Recompensa</label>
                          <select
                            value={editingObjective.rewardType}
                            onChange={e => setEditingObjective({ ...editingObjective, rewardType: e.target.value as any })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none"
                          >
                            <option value="ryos">🪙 Ryos (Moeda)</option>
                            <option value="gems">💎 Gemas (Moeda Premium)</option>
                            <option value="frame">🛡️ Moldura PNG do Evento</option>
                            <option value="banner">🖼️ Banner do Perfil (Fundo)</option>
                            <option value="title">🎖️ Título Shinobi</option>
                            <option value="skin">👘 Skin de Ninja</option>
                          </select>
                        </div>

                        {/* PNG Frame Picker for Event Reward */}
                        {editingObjective.rewardType === 'frame' ? (
                          <div className="md:col-span-2 bg-slate-900 p-3 rounded-xl border border-amber-500/30 space-y-2">
                            <label className="block text-[10px] font-mono uppercase font-bold text-amber-400">
                              Selecione uma Moldura PNG do Acervo
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {pngFrames.map(frame => (
                                <button
                                  type="button"
                                  key={frame.id}
                                  onClick={() => handleSelectPngFrameForObjective(frame)}
                                  className={`p-2 rounded-lg border text-left transition flex items-center gap-2 ${
                                    editingObjective.rewardFrameImageUrl === frame.imageUrl
                                      ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <div className="w-8 h-8 rounded-full bg-slate-800 relative flex-shrink-0">
                                    <img src={frame.imageUrl} alt={frame.name} className="w-full h-full object-contain" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-bold truncate">{frame.name}</p>
                                    <span className="text-[8px] font-mono text-orange-400 block">{frame.badge}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : editingObjective.rewardType === 'banner' ? (
                          <div className="md:col-span-2 bg-slate-900 p-3 rounded-xl border border-amber-500/30 space-y-2">
                            <label className="block text-[10px] font-mono uppercase font-bold text-amber-400">
                              Selecione um Banner da Galeria
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {customBanners.map(banner => (
                                <button
                                  type="button"
                                  key={banner.id}
                                  onClick={() => handleSelectBannerForObjective(banner)}
                                  className={`p-2 rounded-lg border text-left transition flex items-center gap-2 ${
                                    editingObjective.rewardFrameImageUrl === banner.imageUrl
                                      ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <div className="w-12 h-8 rounded bg-slate-800 overflow-hidden relative flex-shrink-0">
                                    <img src={banner.imageUrl} alt={banner.name} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-bold truncate">{banner.name}</p>
                                    <span className="text-[8px] font-mono text-amber-400 block">{banner.badge || 'BANNER'}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">
                              {editingObjective.rewardType === 'ryos' || editingObjective.rewardType === 'gems' ? 'Valor Numérico' : 'Nome/ID Concedido'}
                            </label>
                            <input
                              type="text"
                              value={editingObjective.rewardValue}
                              onChange={e => setEditingObjective({
                                ...editingObjective,
                                rewardValue: editingObjective.rewardType === 'ryos' || editingObjective.rewardType === 'gems' ? Number(e.target.value) : e.target.value
                              })}
                              placeholder={editingObjective.rewardType === 'ryos' || editingObjective.rewardType === 'gems' ? 'Ex: 500' : 'Ex: Herói da Aliança'}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                            />
                          </div>
                        )}

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Rótulo Exibido no Card (`rewardLabel`)</label>
                          <input
                            type="text"
                            value={editingObjective.rewardLabel}
                            onChange={e => setEditingObjective({ ...editingObjective, rewardLabel: e.target.value })}
                            placeholder='Ex: Moldura "Nuvens da Akatsuki", 500 Ryos...'
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-orange-500 text-slate-100 rounded-xl text-xs outline-none"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 font-mono text-xs">
                Selecione um evento à esquerda ou clique em "+ Novo Evento" para começar.
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: SKINS GALLERY MANAGEMENT */}
      {activeTab === 'skins' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add / Edit Skin Form (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shirt className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-extrabold">
                  {editingSkinInfo ? 'Editar Skin de Ninja' : 'Cadastrar Skin de Ninja'}
                </h3>
              </div>
              <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase">
                ARTE PNG
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">
                  Selecione o Ninja *
                </label>
                <select
                  disabled={!!editingSkinInfo}
                  value={newSkinCharId}
                  onChange={(e) => setNewSkinCharId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono disabled:opacity-60"
                >
                  {charactersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.skins?.length || 0} skins)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">
                  Nome da Skin *
                </label>
                <input
                  type="text"
                  value={newSkinName}
                  onChange={(e) => setNewSkinName(e.target.value)}
                  placeholder="Ex: Sasuke Hebi, Naruto Modo Sábio"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">
                  Imagem PNG da Skin (URL ou Arquivo) *
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSkinImage}
                      onChange={(e) => setNewSkinImage(e.target.value)}
                      placeholder="Ex: https://.../skin.png"
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                    <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold rounded-xl border border-slate-700 cursor-pointer flex items-center gap-1.5 flex-shrink-0">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>Upload</span>
                      <input type="file" accept="image/*" onChange={handleSkinFileUpload} className="hidden" />
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono">
                    Recomendado imagem em formato PNG com fundo transparente do ninja em pé.
                  </p>
                </div>
              </div>

              {/* Preview Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center min-h-[140px] relative overflow-hidden">
                <span className="text-[9px] font-mono text-slate-500 uppercase mb-2">PRÉ-VISUALIZAÇÃO DA SKIN</span>
                {newSkinImage ? (
                  <img
                    src={newSkinImage}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="max-h-36 object-contain filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)]"
                    onError={(e) => {
                      const img = e.currentTarget; img.onerror = null; img.src = 'https://via.placeholder.com/150?text=Erro+PNG';
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center text-slate-600 space-y-1">
                    <Shirt className="w-8 h-8 opacity-40" />
                    <span className="text-[10px] font-mono">Nenhuma imagem carregada</span>
                  </div>
                )}
              </div>

              {/* Submit / Cancel Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAddOrUpdateSkin}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {editingSkinInfo ? 'Atualizar Skin' : 'Salvar e Adicionar Skin'}
                </button>

                {editingSkinInfo && (
                  <button
                    type="button"
                    onClick={handleCancelEditSkin}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs uppercase transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Skins Gallery List (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col">
            <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-extrabold flex items-center gap-2">
                  <Shirt className="w-4 h-4 text-amber-400" /> Skins Cadastradas ({totalSkinsCount})
                </h3>
                <p className="text-[10px] font-mono text-slate-500">
                  Abaixo estão todas as skins disponíveis por personagem para seleção nos cards de batalha.
                </p>
              </div>

              {/* Ninja Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Filtrar:</span>
                <select
                  value={selectedCharFilter}
                  onChange={(e) => setSelectedCharFilter(e.target.value)}
                  className="px-2 py-1 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-200 rounded-lg text-xs outline-none font-mono"
                >
                  <option value="all">Todos os Ninjas ({totalSkinsCount})</option>
                  {charactersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.skins?.length || 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Skins Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto max-h-[550px] pr-1">
              {charactersList
                .filter(c => selectedCharFilter === 'all' || c.id === selectedCharFilter)
                .flatMap(char => 
                  (char.skins || []).map((skin, skinIdx) => ({
                    char,
                    skin,
                    skinIdx
                  }))
                )
                .map(({ char, skin, skinIdx }) => (
                  <div
                    key={`${char.id}-${skin.id || skinIdx}`}
                    className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex gap-3 items-center relative group transition-all shadow-md"
                  >
                    {/* Skin PNG Preview Card */}
                    <div className="w-20 h-24 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center p-1 relative flex-shrink-0 overflow-hidden">
                      <img
                        src={skin.image}
                        alt={skin.name}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]"
                        onError={(e) => {
                          const img = e.currentTarget; img.onerror = null; img.src = char.portrait;
                        }}
                      />
                    </div>

                    {/* Skin Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <img src={char.portrait} alt={char.name} className="w-4 h-4 rounded-full border border-amber-500/50" />
                        <span className="text-[10px] font-mono text-amber-400 font-extrabold uppercase truncate">
                          {char.name}
                        </span>
                      </div>

                      <h4 className="text-xs font-mono font-bold text-slate-100 truncate uppercase">
                        {skin.name}
                      </h4>

                      <p className="text-[9px] font-mono text-slate-500 truncate">
                        ID: {skin.id || `skin-${skinIdx}`}
                      </p>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleEditSkin(char.id, skinIdx, skin)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-400 font-mono text-[9px] font-bold uppercase transition flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" /> Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSkin(char.id, skinIdx, skin.name)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-red-950 text-red-400 font-mono text-[9px] font-bold uppercase transition flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" /> Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {charactersList
                .filter(c => selectedCharFilter === 'all' || c.id === selectedCharFilter)
                .reduce((acc, c) => acc + (c.skins?.length || 0), 0) === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500 font-mono text-xs italic bg-slate-950/40 rounded-xl border border-slate-800/60">
                  Nenhuma skin encontrada para este filtro. Cadastre uma nova skin no formulário ao lado!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
