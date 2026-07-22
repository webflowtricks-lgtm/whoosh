/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, Plus, Trash2, Edit3, Save, RefreshCw, 
  CheckCircle, AlertTriangle, Search, Award, Shield, 
  CircleDollarSign, Shirt, Sparkles, Tag, Eye
} from 'lucide-react';
import { ShopItem } from '../types';
import { getShopItems, saveShopItems, resetToDefaultShopItems } from '../lib/shopStorage';
import { motion, AnimatePresence } from 'motion/react';

interface ShopAdminProps {
  playClickSound: () => void;
}

export default function ShopAdmin({ playClickSound }: ShopAdminProps) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const loaded = getShopItems();
    setItems(loaded);
    if (loaded.length > 0) {
      setSelectedItemId(loaded[0].id);
      setEditingItem(JSON.parse(JSON.stringify(loaded[0])));
    }
  }, []);

  useEffect(() => {
    if (selectedItemId) {
      const found = items.find(i => i.id === selectedItemId);
      if (found) {
        setEditingItem(JSON.parse(JSON.stringify(found)));
      }
    }
  }, [selectedItemId, items]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 4000);
  };

  const handleCreateNewItem = () => {
    playClickSound();
    const newId = `shop-item-${Date.now().toString().slice(-4)}`;
    const newItem: ShopItem = {
      id: newId,
      name: 'Novo Título Ninja',
      category: 'title',
      description: 'Descrição do novo item da loja.',
      currency: 'ryos',
      price: 500,
      badge: 'NOVO'
    };

    const updated = [...items, newItem];
    setItems(updated);
    saveShopItems(updated);
    setSelectedItemId(newId);
    setEditingItem(newItem);
    showSuccess('Novo item criado no catálogo da loja!');
  };

  const handleSaveItem = () => {
    if (!editingItem) return;
    playClickSound();

    if (!editingItem.name.trim()) {
      showError('O nome do item não pode estar vazio.');
      return;
    }

    if (editingItem.price < 0) {
      showError('O preço do item deve ser maior ou igual a zero.');
      return;
    }

    const updated = items.map(i => i.id === editingItem.id ? editingItem : i);
    setItems(updated);
    saveShopItems(updated);
    showSuccess(`Item "${editingItem.name}" salvo com sucesso!`);
  };

  const handleDeleteItem = (itemId: string) => {
    playClickSound();
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    if (confirm(`Tem certeza de que deseja excluir "${item.name}" da loja?`)) {
      const updated = items.filter(i => i.id !== itemId);
      setItems(updated);
      saveShopItems(updated);

      if (updated.length > 0) {
        setSelectedItemId(updated[0].id);
      } else {
        setSelectedItemId('');
        setEditingItem(null);
      }
      showSuccess(`Item "${item.name}" removido da loja.`);
    }
  };

  const handleResetDefaults = () => {
    playClickSound();
    if (confirm('Deseja restaurar os itens da loja para os padrões originais do jogo?')) {
      const defaults = resetToDefaultShopItems();
      setItems(defaults);
      if (defaults.length > 0) {
        setSelectedItemId(defaults[0].id);
        setEditingItem(JSON.parse(JSON.stringify(defaults[0])));
      }
      showSuccess('Catálogo da loja restaurado para os padrões!');
    }
  };

  const filteredList = items.filter(i => {
    const matchCategory = filterCategory === 'all' || i.category === filterCategory;
    const matchSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 font-sans">
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

      {/* Left Column: Shop Catalog Sidebar (4 cols) */}
      <section className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 h-fit">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-extrabold">Gerenciar Loja</h3>
          </div>
          <button
            onClick={handleCreateNewItem}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-md"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            Novo Item
          </button>
        </div>

        {/* Filter Category Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'Tudo' },
            { id: 'title', label: 'Títulos' },
            { id: 'skin', label: 'Skins' },
            { id: 'frame', label: 'Molduras' },
            { id: 'bundle', label: 'Pacotes' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase font-bold transition whitespace-nowrap ${
                filterCategory === cat.id
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  : 'bg-slate-950/60 border border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 pl-8 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-amber-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
        </div>

        {/* Item List */}
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {filteredList.map(item => {
            const isSelected = item.id === selectedItemId;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 group ${
                  isSelected
                    ? 'bg-slate-950 border-amber-500/80 shadow-md shadow-amber-950/20'
                    : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-amber-400 flex-shrink-0">
                    {item.category === 'title' && <Award className="w-4 h-4 text-amber-400" />}
                    {item.category === 'skin' && <Shirt className="w-4 h-4 text-orange-400" />}
                    {item.category === 'frame' && <Shield className="w-4 h-4 text-blue-400" />}
                    {item.category === 'bundle' && <CircleDollarSign className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-slate-200 truncate group-hover:text-amber-300">{item.name}</p>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                      <span className="uppercase text-amber-400 font-bold">{item.category}</span>
                      <span>•</span>
                      <span>{item.currency === 'ryos' ? '🪙' : '💎'} {item.price}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleDeleteItem(item.id);
                  }}
                  className="p-1 text-slate-500 hover:text-red-400 transition rounded hover:bg-slate-800 opacity-0 group-hover:opacity-100"
                  title="Excluir Item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {filteredList.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-xs font-mono">
              Nenhum item encontrado nesta categoria.
            </div>
          )}
        </div>

        <button
          onClick={handleResetDefaults}
          className="w-full mt-2 py-2 border border-slate-800 hover:border-red-500/40 bg-slate-950 text-slate-400 hover:text-red-400 rounded-xl text-[10px] font-mono uppercase font-bold transition flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Restaurar Padrões da Loja
        </button>
      </section>

      {/* Right Column: Item Editor & Live Preview (8 cols) */}
      <section className="lg:col-span-8 flex flex-col gap-6">
        {editingItem ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-4 gap-4">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">Editando Item da Loja</span>
                <h2 className="text-xl font-extrabold text-slate-100">{editingItem.name}</h2>
              </div>

              <button
                onClick={handleSaveItem}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Salvar Alterações
              </button>
            </div>

            {/* Form Fields */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">ID Único</label>
                <input
                  type="text"
                  disabled
                  value={editingItem.id}
                  className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 text-slate-500 rounded-xl text-xs font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Nome de Exibição</label>
                <input
                  type="text"
                  value={editingItem.name}
                  onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Categoria do Item</label>
                <select
                  value={editingItem.category}
                  onChange={e => setEditingItem({ ...editingItem, category: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
                >
                  <option value="title">Título Shinobi (title)</option>
                  <option value="skin">Skin de Ninja (skin)</option>
                  <option value="frame">Moldura de Perfil (frame)</option>
                  <option value="bundle">Pacote de Moedas (bundle)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Selo / Tag de Destaque (Badge)</label>
                <input
                  type="text"
                  value={editingItem.badge || ''}
                  onChange={e => setEditingItem({ ...editingItem, badge: e.target.value })}
                  placeholder="Ex: TÍTULO, LENDÁRIO, RARO, ANBU, OFERTA"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Moeda de Cobrança</label>
                <select
                  value={editingItem.currency}
                  onChange={e => setEditingItem({ ...editingItem, currency: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
                >
                  <option value="ryos">🪙 Ryos (Moeda Comum)</option>
                  <option value="gems">💎 Gemas (Moeda Premium)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Preço</label>
                <input
                  type="number"
                  value={editingItem.price}
                  onChange={e => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-mono uppercase font-bold text-slate-400 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editingItem.description}
                  onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500 text-slate-100 rounded-xl text-xs outline-none"
                />
              </div>

              {/* Dynamic Category Specific Inputs */}
              {editingItem.category === 'skin' && (
                <>
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-amber-400 mb-1">URL da Imagem da Skin</label>
                    <input
                      type="text"
                      value={editingItem.skinImageUrl || ''}
                      onChange={e => setEditingItem({ ...editingItem, skinImageUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-amber-400 mb-1">Nome do Personagem Alvo</label>
                    <input
                      type="text"
                      value={editingItem.characterName || ''}
                      onChange={e => setEditingItem({ ...editingItem, characterName: e.target.value })}
                      placeholder="Ex: Naruto Uzumaki, Sasuke Uchiha..."
                      className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 text-slate-100 rounded-xl text-xs outline-none"
                    />
                  </div>
                </>
              )}

              {editingItem.category === 'frame' && (
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-mono uppercase font-bold text-blue-400 mb-1">Classes de Estilo CSS da Moldura (Tailwind)</label>
                  <input
                    type="text"
                    value={editingItem.frameStyle || ''}
                    onChange={e => setEditingItem({ ...editingItem, frameStyle: e.target.value })}
                    placeholder="Ex: border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] bg-gradient-to-tr from-amber-500 to-red-500"
                    className="w-full px-3 py-2 bg-slate-950 border border-blue-500/40 text-slate-100 rounded-xl text-xs outline-none font-mono"
                  />
                </div>
              )}

              {editingItem.category === 'bundle' && (
                <>
                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-cyan-400 mb-1">Tipo de Recompensa do Pacote</label>
                    <select
                      value={editingItem.bundleGrant?.type || 'ryos'}
                      onChange={e => setEditingItem({
                        ...editingItem,
                        bundleGrant: { type: e.target.value as any, amount: editingItem.bundleGrant?.amount || 1000 }
                      })}
                      className="w-full px-3 py-2 bg-slate-950 border border-cyan-500/40 text-slate-100 rounded-xl text-xs outline-none"
                    >
                      <option value="ryos">🪙 Ryos</option>
                      <option value="gems">💎 Gemas</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase font-bold text-cyan-400 mb-1">Quantidade Concedida</label>
                    <input
                      type="number"
                      value={editingItem.bundleGrant?.amount || 1000}
                      onChange={e => setEditingItem({
                        ...editingItem,
                        bundleGrant: { type: editingItem.bundleGrant?.type || 'ryos', amount: Number(e.target.value) }
                      })}
                      className="w-full px-3 py-2 bg-slate-950 border border-cyan-500/40 text-slate-100 rounded-xl text-xs outline-none font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Live Preview Card */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-xs font-mono uppercase font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-400" /> Pré-visualização do Card na Loja
              </h4>

              <div className="max-w-xs p-4 rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    {editingItem.badge || editingItem.category}
                  </span>
                </div>

                <div className="h-28 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-3 relative overflow-hidden">
                  {editingItem.category === 'skin' && (
                    <div className="relative w-full h-full flex items-center justify-center">
                      {editingItem.skinImageUrl ? (
                        <img src={editingItem.skinImageUrl} alt={editingItem.name} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <Shirt className="w-10 h-10 text-orange-400" />
                      )}
                    </div>
                  )}

                  {editingItem.category === 'title' && (
                    <div className="text-center space-y-1">
                      <Award className="w-8 h-8 text-amber-400 mx-auto" />
                      <p className="text-xs font-mono font-black uppercase tracking-wider text-amber-300 px-3 py-1 bg-amber-500/10 rounded-lg border border-amber-500/20">
                        "{editingItem.name}"
                      </p>
                    </div>
                  )}

                  {editingItem.category === 'frame' && (
                    <div className={`w-16 h-16 rounded-full p-1 ${editingItem.frameStyle || 'border-2 border-amber-500'}`}>
                      <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-xs font-mono font-bold">NINJA</div>
                    </div>
                  )}

                  {editingItem.category === 'bundle' && (
                    <div className="text-center space-y-1">
                      <CircleDollarSign className="w-10 h-10 text-cyan-400 mx-auto" />
                      <p className="text-xs font-mono font-bold text-cyan-300">
                        +{editingItem.bundleGrant?.amount || 0} {editingItem.bundleGrant?.type === 'gems' ? 'Gemas' : 'Ryos'}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-extrabold text-slate-100">{editingItem.name}</h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{editingItem.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <div className="w-full py-2 px-3 rounded-xl bg-amber-500 text-slate-950 font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5">
                    <span>Comprar por</span>
                    <span>{editingItem.currency === 'ryos' ? '🪙' : '💎'} {editingItem.price}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 font-mono text-xs">
            Selecione um item da lista à esquerda ou clique em "+ Novo Item" para editar.
          </div>
        )}
      </section>
    </div>
  );
}
