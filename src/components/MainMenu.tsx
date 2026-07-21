/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, Sword, Play, HelpCircle, Shield, Award, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';

interface MainMenuProps {
  onStartGame: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  playClickSound: () => void;
  onOpenAdmin: () => void;
  user: UserProfile;
  onLogout: () => void;
}

export default function MainMenu({ onStartGame, isMuted, onToggleMute, playClickSound, onOpenAdmin, user, onLogout }: MainMenuProps) {
  const [showRules, setShowRules] = useState(false);

  const handleStart = () => {
    playClickSound();
    onStartGame();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 relative overflow-hidden font-sans selection:bg-orange-600 selection:text-white">
      {/* Decorative Background effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-orange-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

      {/* Top Header Row */}
      <div className="flex justify-between items-center max-w-7xl w-full mx-auto z-10 gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-orange-600 to-amber-500 p-2 rounded-lg border border-orange-400/20 shadow-lg shadow-orange-600/10">
            <Sword className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <span className="font-mono text-xs tracking-wider text-orange-400 uppercase font-bold hidden sm:inline">Unison Engine v1.0</span>
        </div>

        {/* User Profile display & Actions */}
        <div className="flex items-center gap-4 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80 max-w-full">
          <div className="flex items-center gap-2.5 px-2">
            <img
              src={user.photoUrl}
              alt={user.name}
              className="w-8 h-8 rounded-full border-2 border-orange-500 object-cover shadow-md shadow-orange-500/20"
              referrerPolicy="no-referrer"
            />
            <div className="text-left">
              <p className="text-xs font-bold tracking-tight text-slate-200">{user.name}</p>
              <p className="text-[9px] font-mono uppercase tracking-wider text-orange-500">@{user.username}</p>
            </div>
          </div>
          <div className="h-6 w-px bg-slate-800" />
          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 transition cursor-pointer"
            title="Sair da Conta"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              playClickSound();
              onOpenAdmin();
            }}
            className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-orange-500 hover:bg-slate-950 hover:text-orange-400 transition-all cursor-pointer text-slate-400 font-mono text-xs flex items-center gap-2 uppercase tracking-wider font-semibold"
            title="Painel Administrativo"
          >
            <Shield className="w-4 h-4 text-orange-500" />
            <span>Painel</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              onToggleMute();
            }}
            className="p-3 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 transition-all cursor-pointer text-slate-300"
            title={isMuted ? "Ativar Som" : "Desativar Som"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-orange-400" />}
          </button>
        </div>
      </div>

      {/* Center Hero/Cta */}
      <div className="max-w-4xl w-full mx-auto flex flex-col items-center justify-center text-center py-10 z-10 flex-1">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <div className="inline-block px-3 py-1 bg-orange-600/10 rounded-full border border-orange-500/30 text-xs font-mono text-orange-400 font-semibold tracking-wider uppercase">
            Arena Tática Lendária 3v3
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent uppercase">
            NARUTO <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">UNISON</span>
          </h1>

          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed">
            A nova geração de combates táticos por turnos de anime. Escolha seu time de 3 ninjas lendários, gerencie suas reservas elementais de chakra e esmague os oponentes com habilidades de combos sincronizados.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={handleStart}
              className="px-8 py-4 bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-bold rounded-lg flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-orange-600/25 border border-orange-400 cursor-pointer text-base uppercase tracking-wider"
            >
              <Play className="w-5 h-5 fill-slate-950 text-slate-950" />
              Entrar na Arena
            </button>

            <button
              onClick={() => {
                playClickSound();
                setShowRules(!showRules);
              }}
              className="px-8 py-4 bg-slate-900 border border-slate-800 text-slate-300 font-semibold rounded-lg flex items-center gap-2 hover:bg-slate-800 hover:border-slate-700 active:scale-95 transition-all cursor-pointer text-base uppercase tracking-wider"
            >
              <HelpCircle className="w-5 h-5 text-orange-400" />
              Como Jogar
            </button>
          </div>
        </motion.div>

        {/* Rules Expansion Section */}
        {showRules && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            className="mt-10 p-6 bg-slate-900/80 border border-slate-800 rounded-xl text-left max-w-3xl w-full space-y-4"
          >
            <h3 className="font-semibold text-lg text-orange-400 flex items-center gap-2">
              <Sword className="w-5 h-5" /> Regras e Mecânicas de Combate
            </h3>
            <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-300">
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">1. Escolha e Formação de Equipe</p>
                <p className="text-slate-400 leading-relaxed">
                  Escolha <strong className="text-orange-400">3 Ninjas</strong> para formar seu esquadrão. Cada ninja possui uma imagem e 4 habilidades personalizadas. Algumas habilidades exigem outras condições (ex: o Rasengan de Naruto requer Clones das Sombras ativos).
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">2. Rolagem de Chakra por Turno</p>
                <p className="text-slate-400 leading-relaxed">
                  A cada turno, você gera <strong className="text-orange-400">3 pontos aleatórios de chakra</strong> dos tipos representados pelos elementos ativos: Taijutsu (Vermelho), Ninjutsu (Azul), Genjutsu (Verde) ou Linhagem Sanguínea (Roxo).
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">3. Seleção de Alvo e Gasto de Chakra</p>
                <p className="text-slate-400 leading-relaxed">
                  Selecione uma habilidade e clique no alvo correspondente (Inimigo, Aliado ou Próprio). As habilidades consomem chakra elemental ou Aleatório (Cinza). Os custos de chakra aleatório podem ser pagos com qualquer tipo de chakra.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-white uppercase tracking-wider text-xs border-b border-slate-800 pb-1">4. Efeitos e Vitória</p>
                <p className="text-slate-400 leading-relaxed">
                  Use de forma tática Escudos, Invulnerabilidade, Redução de Dano, Contra-ataques e Atordoamentos. Reduza a vida de todos os 3 ninjas inimigos a 0 para garantir a vitória!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-900 pt-6 max-w-7xl w-full mx-auto flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 font-mono z-10 gap-4">
        <div>
          Naruto é propriedade de Masashi Kishimoto, Pierrot Co. e Viz Media.
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-orange-500/60" /> Anti-Cheat Verificado</span>
          <span className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-blue-500/60" /> Unison Engine v1.0.0</span>
        </div>
      </div>
    </div>
  );
}
