/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Images, Plus, Trash2, Save, RefreshCw,
  CheckCircle, AlertTriangle, Search, Package, Sparkles, Eye, Image as ImageIcon, Upload, Link2
} from 'lucide-react';
import { NinjaCard, NinjaPack, CardRarity } from '../types';
import {
  getCards, saveCards, buildDefaultCards, fetchCardsFromServer,
  getPacks, savePacks, DEFAULT_PACKS, fetchPacksFromServer,
  CARD_RARITY_META, RARITY_ORDER, rarityFx
} from '../lib/cardStorage';
import { motion, AnimatePresence } from 'motion/react';

const CARD_IMG_FALLBACK = 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/';

interface CardAdminProps {
  playClickSound: () => void;
}

export default function CardAdmin({ playClickSound }: CardAdminProps) {
  const [tab, setTab] = useState<'cards' | 'packs'>('cards');

  // Cards state
  const [cards, setCards] = useState<NinjaCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [editingCard, setEditingCard] = useState<NinjaCard | null>(null);
  const [packs, setPacks] = useState<NinjaPack[]>([]);
  const [filterRarity, setFilterRarity] = useState<'all' | CardRarity>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Packs state
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [editingPack, setEditingPack] = useState<NinjaPack | null>(null);

  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    fetchCardsFromServer().then(loaded => {
      setCards(loaded);
      if (loaded.length > 0) {
        setSelectedCardId(loaded[0].id);
        setEditingCard(JSON.parse(JSON.stringify(loaded[0])));
      }
    });
    fetchPacksFromServer().then(loadedPacks => {
      setPacks(loadedPacks);
    });
  }, []);

  useEffect(() => {
    if (tab === 'cards' && selectedCardId) {
      const found = cards.find(c => c.id === selectedCardId);
      if (found) setEditingCard(JSON.parse(JSON.stringify(found)));
    }
  }, [selectedCardId, cards, tab]);

  useEffect(() => {
    if (tab === 'packs' && selectedPackId) {
      const found = packs.find(p => p.id === selectedPackId);
      if (found) setEditingPack(JSON.parse(JSON.stringify(found)));
    }
  }, [selectedPackId, packs, tab]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 4000);
  };

  const cardImage = (card: NinjaCard) => card.imageUrl || `${CARD_IMG_FALLBACK}${card.slug}/icon.jpg`;

  const handleUploadCardImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCard) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setEditingCard({ ...editingCard, imageUrl: reader.result, slug: '' });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ─── CARDS ─────────────────────────────────────────────
  const handleCreateNewCard = () => {
    playClickSound();
    const newId = `card-${Date.now().toString().slice(-4)}`;
    const newCard: NinjaCard = {
      id: newId,
      characterId: '',
      characterName: 'Novo Ninja',
      slug: '',
      rarity: 'comum',
      title: 'Novo Ninja',
      description: '',
      variant: '',
      imageUrl: '',
      points: CARD_RARITY_META.comum.points,
      packs: [],
    };
    const updated = [...cards, newCard];
    setCards(updated);
    saveCards(updated);
    setSelectedCardId(newId);
    setEditingCard(newCard);
    showSuccess('Nova figura criada!');
  };

  const handleSaveCard = () => {
    if (!editingCard) return;
    playClickSound();
    if (!editingCard.characterName.trim()) {
      showError('Informe o nome do ninja da figura.');
      return;
    }
    if (!editingCard.id.trim()) {
      showError('Informe o ID (número) da figurinha.');
      return;
    }
    if (newIdConflict) {
      showError('Já existe outra figurinha com esse ID. Escolha um número único.');
      return;
    }
    // Título mantido como alias do nome (a figura é exibida só pela foto)
    const toSave: NinjaCard = {
      ...editingCard,
      title: editingCard.title?.trim() || editingCard.characterName.trim(),
      description: editingCard.description || '',
    };
    const updated = cards.map(c => c.id === selectedCardId ? toSave : c);
    setCards(updated);
    saveCards(updated);
    setEditingCard(toSave);
    setSelectedCardId(editingCard.id);
    showSuccess(`Figura "${toSave.characterName}" salva com sucesso!`);
  };

  const handleDeleteCard = (cardId: string) => {
    playClickSound();
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    if (confirm(`Excluir "${card.title}" (${card.characterName}) da coleção?`)) {
      const updated = cards.filter(c => c.id !== cardId);
      setCards(updated);
      saveCards(updated);
      if (updated.length > 0) {
        setSelectedCardId(updated[0].id);
      } else {
        setSelectedCardId('');
        setEditingCard(null);
      }
      showSuccess(`Card "${card.title}" removido.`);
    }
  };

  const handleResetCards = () => {
    playClickSound();
    if (confirm('Restaurar os cards para os padrões originais do jogo? (Isso apagará todas as figuras customizadas)')) {
      const defaults = buildDefaultCards();
      setCards(defaults);
      saveCards(defaults);
      if (defaults.length > 0) {
        setSelectedCardId(defaults[0].id);
        setEditingCard(JSON.parse(JSON.stringify(defaults[0])));
      }
      showSuccess('Cards restaurados para os padrões!');
    }
  };

  const filteredCards = cards.filter(c => {
    const matchRarity = filterRarity === 'all' || c.rarity === filterRarity;
    const matchSearch = (c.characterName + ' ' + c.title + ' ' + (c.variant || '')).toLowerCase().includes(searchTerm.toLowerCase());
    return matchRarity && matchSearch;
  });

  const newIdConflict = !!editingCard
    && cards.some(c => c.id === editingCard.id && c.id !== selectedCardId);

  // Organiza os cards em ordem numérica pelo ID
  const orderedCards = [...cards].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  );
  const cardNumber = (id: string) => (orderedCards.findIndex(c => c.id === id) + 1).toString().padStart(3, '0');

  const toggleCardPack = (packId: string) => {
    if (!editingCard) return;
    const current = editingCard.packs || [];
    const next = current.includes(packId)
      ? current.filter(p => p !== packId)
      : [...current, packId];
    setEditingCard({ ...editingCard, packs: next });
  };

  // ─── PACKS ─────────────────────────────────────────────
  const handleCreateNewPack = () => {
    playClickSound();
    const newId = `pack-${Date.now().toString().slice(-4)}`;
    const newPack: NinjaPack = {
      id: newId,
      name: 'Novo Pacote',
      description: 'Descrição do novo pacote de figuras.',
      currency: 'gems',
      price: 20,
      cardsPerPack: 3,
      allowedRarities: ['comum', 'raro'],
      badge: 'NOVO',
      imageUrl: '',
    };
    const updated = [...packs, newPack];
    setPacks(updated);
    savePacks(updated);
    setSelectedPackId(newId);
    setEditingPack(newPack);
    showSuccess('Novo pacote criado!');
  };

  const handleSavePack = () => {
    if (!editingPack) return;
    playClickSound();
    if (!editingPack.name.trim()) {
      showError('O nome do pacote não pode estar vazio.');
      return;
    }
    if (editingPack.price < 0 || editingPack.cardsPerPack < 1) {
      showError('Preço e quantidade de cards devem ser válidos.');
      return;
    }
    const updated = packs.map(p => p.id === editingPack.id ? editingPack : p);
    setPacks(updated);
    savePacks(updated);
    showSuccess(`Pacote "${editingPack.name}" salvo com sucesso!`);
  };

  const handleDeletePack = (packId: string) => {
    playClickSound();
    const pack = packs.find(p => p.id === packId);
    if (!pack) return;
    if (confirm(`Excluir o pacote "${pack.name}"?`)) {
      const updated = packs.filter(p => p.id !== packId);
      setPacks(updated);
      savePacks(updated);
      if (updated.length > 0) {
        setSelectedPackId(updated[0].id);
      } else {
        setSelectedPackId('');
        setEditingPack(null);
      }
      showSuccess(`Pacote "${pack.name}" removido.`);
    }
  };

  const handleResetPacks = () => {
    playClickSound();
    if (confirm('Restaurar os pacotes para os padrões originais do jogo?')) {
      const defaults = DEFAULT_PACKS;
      setPacks(defaults);
      savePacks(defaults);
      if (defaults.length > 0) setSelectedPackId(defaults[0].id);
      showSuccess('Pacotes restaurados para os padrões!');
    }
  };

  const togglePackRarity = (rarity: CardRarity) => {
    if (!editingPack) return;
    const current = editingPack.allowedRarities || [];
    const next = current.includes(rarity)
      ? current.filter(r => r !== rarity)
      : [...current, rarity];
    setEditingPack({ ...editingPack, allowedRarities: next });
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 font-sans">
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

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Images className="w-5 h-5 text-fuchsia-400" />
            <h2 className="text-lg font-bold uppercase tracking-wider text-white font-mono">Gestão de Cards & Pacotes</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Crie figuras colecionáveis (por raridade) e defina os pacotes dos quais elas podem sair.
          </p>
        </div>
      </div>

      {/* Tab switch */}
      <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl gap-1 w-fit mb-5">
        <button
          onClick={() => { playClickSound(); setTab('cards'); }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
            tab === 'cards'
              ? 'bg-gradient-to-r from-fuchsia-600 to-purple-500 text-slate-950 shadow-md font-extrabold'
              : 'text-slate-400 hover:text-slate-200 font-bold'
          }`}
        >
          <span className="flex items-center gap-1.5"><Images className="w-3.5 h-3.5" /> Cards ({cards.length})</span>
        </button>
        <button
          onClick={() => { playClickSound(); setTab('packs'); }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
            tab === 'packs'
              ? 'bg-gradient-to-r from-fuchsia-600 to-purple-500 text-slate-950 shadow-md font-extrabold'
              : 'text-slate-400 hover:text-slate-200 font-bold'
          }`}
        >
          <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Pacotes ({packs.length})</span>
        </button>
      </div>

      {tab === 'cards' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Card list */}
          <section className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 h-fit">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Images className="w-4 h-4 text-fuchsia-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-extrabold">Figuras</h3>
              </div>
              <button
                onClick={handleCreateNewCard}
                className="px-2.5 py-1.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-mono font-bold text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-md"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" /> Nova Figura
              </button>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {[{ id: 'all' as const, label: 'Tudo' }, ...RARITY_ORDER.map(r => ({ id: r, label: CARD_RARITY_META[r].label }))].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFilterRarity(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase font-bold transition whitespace-nowrap ${
                    filterRarity === opt.id
                      ? 'bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300'
                      : 'bg-slate-950/60 border border-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por ninja, título ou variante..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1.5 pl-8 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-fuchsia-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredCards.map(card => {
                const isSelected = card.id === selectedCardId;
                return (
                  <div
                    key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center gap-2.5 group ${
                      isSelected
                        ? 'bg-slate-950 border-fuchsia-500/80 shadow-md shadow-fuchsia-950/20'
                        : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg overflow-hidden border-2 flex-shrink-0 ${CARD_RARITY_META[card.rarity].border}`}>
                      <img src={cardImage(card)} alt={card.characterName} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-black text-xs text-fuchsia-300 group-hover:text-fuchsia-200">#{cardNumber(card.id)}</p>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                        <span className={`uppercase font-bold ${CARD_RARITY_META[card.rarity].text}`}>{CARD_RARITY_META[card.rarity].label}</span>
                        <span>•</span>
                        <span className="truncate">{card.characterName}</span>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteCard(card.id); }}
                      className="p-1 text-slate-500 hover:text-red-400 transition rounded hover:bg-slate-800 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      title="Excluir Figura"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {filteredCards.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">Nenhuma figura encontrada.</div>
              )}
            </div>

            <button
              onClick={handleResetCards}
              className="w-full mt-2 py-2 border border-slate-800 hover:border-red-500/40 bg-slate-950 text-slate-400 hover:text-red-400 rounded-xl text-[10px] font-mono uppercase font-bold transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Restaurar Figuras Padrão
            </button>
          </section>

          {/* Right: Card editor */}
          <section className="lg:col-span-8 flex flex-col gap-6">
            {editingCard ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-6">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-4">
                  <div>
                    <span className="text-[10px] font-mono text-fuchsia-400 uppercase font-bold">Editando Figura</span>
                    <h2 className="text-xl font-extrabold text-slate-100">{editingCard.characterName}</h2>
                  </div>
                  <button
                    onClick={handleSaveCard}
                    className="px-4 py-2 bg-gradient-to-r from-fuchsia-500 to-purple-500 hover:from-fuchsia-400 hover:to-purple-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" /> Salvar Alterações
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">ID Único (número da figurinha)</label>
                    <input
                      type="text"
                      value={editingCard.id}
                      onChange={e => setEditingCard({ ...editingCard, id: e.target.value })}
                      placeholder="Ex: 001, 002..."
                      className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-mono outline-none ${
                        newIdConflict ? 'border-red-500 text-red-300' : 'border-slate-800 focus:border-fuchsia-500 text-slate-100'
                      }`}
                    />
                    {newIdConflict && (
                      <p className="text-[9px] text-red-400 font-mono mt-1">Este ID já existe em outra figurinha.</p>
                    )}
                    <p className="text-[9px] text-slate-500 font-mono mt-1">Edite o ID para renumerar a figurinha (ex: 001).</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-fuchsia-400 mb-1">Raridade</label>
                    <select
                      value={editingCard.rarity}
                      onChange={e => {
                        const rarity = e.target.value as CardRarity;
                        setEditingCard({ ...editingCard, rarity, points: CARD_RARITY_META[rarity].points });
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-fuchsia-500/40 text-slate-100 rounded-xl text-xs outline-none"
                    >
                      {RARITY_ORDER.map(r => (
                        <option key={r} value={r}>{CARD_RARITY_META[r].label} ({CARD_RARITY_META[r].points} pts)</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Nome do Ninja</label>
                    <input
                      type="text"
                      value={editingCard.characterName}
                      onChange={e => setEditingCard({ ...editingCard, characterName: e.target.value })}
                      placeholder="Ex: Naruto Uzumaki"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Variante</label>
                    <input
                      type="text"
                      value={editingCard.variant || ''}
                      onChange={e => setEditingCard({ ...editingCard, variant: e.target.value })}
                      placeholder="Ex: ANBU, Clássico, Sábio"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Points (por raridade)</label>
                    <input
                      type="number"
                      value={editingCard.points}
                      onChange={e => setEditingCard({ ...editingCard, points: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase font-bold text-fuchsia-400 mb-1">Foto da Figura</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-fuchsia-500/40 bg-fuchsia-500/5 hover:bg-fuchsia-500/10 hover:border-fuchsia-400 text-fuchsia-300 text-xs font-mono font-bold uppercase tracking-wide transition cursor-pointer">
                        <Upload className="w-4 h-4" />
                        {editingCard.imageUrl?.startsWith('data:') ? 'Trocar foto enviada' : 'Enviar foto do dispositivo'}
                        <input type="file" accept="image/*" onChange={handleUploadCardImage} className="hidden" />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <input
                        type="text"
                        value={editingCard.imageUrl && !editingCard.imageUrl.startsWith('data:') ? editingCard.imageUrl : ''}
                        onChange={e => setEditingCard({ ...editingCard, imageUrl: e.target.value })}
                        placeholder="ou cole o link da imagem (https://...)"
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono mt-1.5">
                      A figura é exibida como foto completa (cover) no card. Se não enviar foto nem link, é usada a arte <code>{CARD_IMG_FALLBACK}{editingCard.slug || '&lt;slug&gt;'}/icon.jpg</code>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Slug do ninja (pasta da imagem)</label>
                    <input
                      type="text"
                      value={editingCard.slug}
                      onChange={e => setEditingCard({ ...editingCard, slug: e.target.value })}
                      placeholder="Ex: naruto, sasuke, itachi"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase font-bold text-purple-400 mb-2">
                      Pacotes dos quais esta figura pode sair
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {packs.length === 0 && (
                        <span className="text-[11px] text-slate-500 font-mono">Nenhum pacote criado ainda. Crie pacotes na aba "Pacotes".</span>
                      )}
                      {packs.map(pack => {
                        const active = (editingCard.packs || []).includes(pack.id);
                        return (
                          <button
                            key={pack.id}
                            onClick={() => toggleCardPack(pack.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase font-bold transition border ${
                              active
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                                : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {active ? '✔ ' : '+ '}{pack.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono mt-1.5">
                      Cards sem pacote marcado só saem de pacotes sem filtro de raridade (allowedRarities vazio).
                    </p>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="pt-4 border-t border-slate-800">
                  <h4 className="text-xs font-mono uppercase font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-fuchsia-400" /> Pré-visualização da Figura
                  </h4>
                  <div className={`max-w-[220px] aspect-[3/4] rounded-2xl overflow-hidden border-2 bg-slate-950 shadow-2xl relative ${CARD_RARITY_META[editingCard.rarity].border} ${CARD_RARITY_META[editingCard.rarity].glow} ${(() => { const fx = rarityFx(editingCard.rarity); return fx ? fx.frame : ''; })()}`}>
                    <img src={cardImage(editingCard)} alt={editingCard.characterName} className="absolute inset-0 w-full h-full object-cover" />
                    {(() => { const fx = rarityFx(editingCard.rarity); return fx ? <span className={fx.sweep} /> : null; })()}
                    <span className={`absolute top-1.5 right-1.5 text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${CARD_RARITY_META[editingCard.rarity].chip}`}>
                      {editingCard.rarity === 'secreto' ? '??? ' : ''}{editingCard.rarity}
                    </span>
                  </div>
                  <div className="mt-2 text-center">
                    <p className="text-xs font-extrabold text-slate-100">{editingCard.characterName}</p>
                    <p className="text-[10px] text-slate-400">{editingCard.variant || 'Figura colecionável'}</p>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-2">
                    A figurinha é exibida como foto sem texto.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 font-mono text-xs">
                Selecione uma figura à esquerda ou clique em "+ Nova Figura" para editar.
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Pack list */}
          <section className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 h-fit">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-extrabold">Pacotes</h3>
              </div>
              <button
                onClick={handleCreateNewPack}
                className="px-2.5 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-slate-950 font-mono font-bold text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-md"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" /> Novo Pacote
              </button>
            </div>

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {packs.map(pack => {
                const isSelected = pack.id === selectedPackId;
                return (
                  <div
                    key={pack.id}
                    onClick={() => setSelectedPackId(pack.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 group ${
                      isSelected
                        ? 'bg-slate-950 border-purple-500/80 shadow-md shadow-purple-950/20'
                        : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-purple-400 flex-shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-200 truncate group-hover:text-purple-300">{pack.name}</p>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                          <span className="uppercase text-purple-400 font-bold">{pack.badge || 'pacote'}</span>
                          <span>•</span>
                          <span>💎 {pack.price}</span>
                          <span>•</span>
                          <span>{pack.cardsPerPack} cards</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeletePack(pack.id); }}
                      className="p-1 text-slate-500 hover:text-red-400 transition rounded hover:bg-slate-800 opacity-0 group-hover:opacity-100 flex-shrink-0"
                      title="Excluir Pacote"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {packs.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">Nenhum pacote criado.</div>
              )}
            </div>

            <button
              onClick={handleResetPacks}
              className="w-full mt-2 py-2 border border-slate-800 hover:border-red-500/40 bg-slate-950 text-slate-400 hover:text-red-400 rounded-xl text-[10px] font-mono uppercase font-bold transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Restaurar Pacotes Padrão
            </button>
          </section>

          {/* Right: Pack editor */}
          <section className="lg:col-span-8 flex flex-col gap-6">
            {editingPack ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-6">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-4">
                  <div>
                    <span className="text-[10px] font-mono text-purple-400 uppercase font-bold">Editando Pacote</span>
                    <h2 className="text-xl font-extrabold text-slate-100">{editingPack.name}</h2>
                  </div>
                  <button
                    onClick={handleSavePack}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-400 hover:to-fuchsia-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" /> Salvar Alterações
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">ID Único</label>
                    <input type="text" disabled value={editingPack.id} className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 text-slate-500 rounded-xl text-xs font-mono cursor-not-allowed" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Nome do Pacote</label>
                    <input
                      type="text"
                      value={editingPack.name}
                      onChange={e => setEditingPack({ ...editingPack, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Preço (💎 Gemas)</label>
                    <input
                      type="number"
                      value={editingPack.price}
                      onChange={e => setEditingPack({ ...editingPack, price: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Cards por Pacote</label>
                    <input
                      type="number"
                      value={editingPack.cardsPerPack}
                      onChange={e => setEditingPack({ ...editingPack, cardsPerPack: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Selo / Badge</label>
                    <input
                      type="text"
                      value={editingPack.badge || ''}
                      onChange={e => setEditingPack({ ...editingPack, badge: e.target.value })}
                      placeholder="Ex: BÁSICO, ÉPICO, LENDÁRIO"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Imagem do Pacote (opcional)</label>
                    <input
                      type="text"
                      value={editingPack.imageUrl || ''}
                      onChange={e => setEditingPack({ ...editingPack, imageUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Descrição</label>
                    <textarea
                      rows={2}
                      value={editingPack.description}
                      onChange={e => setEditingPack({ ...editingPack, description: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-purple-500 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase font-bold text-purple-400 mb-2">
                      Raridades permitidas neste pacote
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {RARITY_ORDER.map(rarity => {
                        const active = (editingPack.allowedRarities || []).includes(rarity);
                        return (
                          <button
                            key={rarity}
                            onClick={() => togglePackRarity(rarity)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase font-bold transition border ${
                              active
                                ? `${CARD_RARITY_META[rarity].chip}`
                                : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {active ? '✔ ' : '+ '}{CARD_RARITY_META[rarity].label}
                          </button>
                        );
                      })}
                      {(editingPack.allowedRarities || []).length === 0 && (
                        <span className="text-[11px] text-slate-500 font-mono w-full">
                          Sem filtro: este pacote pode conter QUALQUER figura (use os cards marcados com este pacote).
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="pt-4 border-t border-slate-800">
                  <h4 className="text-xs font-mono uppercase font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Como o pacote aparece na galeria
                  </h4>
                  <div className="max-w-[260px] rounded-2xl border border-purple-500/40 bg-slate-950 p-4 shadow-2xl flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-purple-500/40 flex items-center justify-center bg-slate-900 flex-shrink-0">
                      {editingPack.imageUrl ? (
                        <img src={editingPack.imageUrl} alt={editingPack.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-7 h-7 text-purple-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-100">{editingPack.name}</p>
                      <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">{editingPack.description}</p>
                      <p className="text-[10px] font-mono font-bold text-purple-300 mt-1">💎 {editingPack.price} • {editingPack.cardsPerPack} cards</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 font-mono text-xs">
                Selecione um pacote à esquerda ou clique em "+ Novo Pacote" para editar.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
