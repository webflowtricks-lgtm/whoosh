import React, { useState } from 'react';
import { User, Lock, Mail, Shield, Sparkles, UserPlus, LogIn, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';

// URL base do backend. Em produção (Vercel), defina VITE_API_URL nas
// variáveis de ambiente apontando pro backend hospedado (ex: Render).
// Em desenvolvimento local, fica vazio e usa caminho relativo.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const AVATAR_PRESETS = [
  { name: 'Naruto Uzumaki', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg' },
  { name: 'Sasuke Uchiha', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/sasuke-uchiha/icon.jpg' },
  { name: 'Sakura Haruno', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/sakura-haruno/icon.jpg' },
  { name: 'Kakashi Hatake', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/kakashi-hatake/icon.jpg' },
  { name: 'Itachi Uchiha', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/itachi-uchiha/icon.jpg' },
  { name: 'Gaara', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/gaara/icon.jpg' },
];

interface AuthScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
  playClickSound: () => void;
}

export default function AuthScreen({ onLoginSuccess, playClickSound }: AuthScreenProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  
  // Login fields
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // Register fields
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regName, setRegName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_PRESETS[0].url);

  // Errors/Success
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    playClickSound();
    setError('');
    setSuccess('');

    if (!loginUser.trim() || !loginPass.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar login.');
      }

      setSuccess('Conectando ao servidor...');
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Falha de rede.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    playClickSound();
    setError('');
    setSuccess('');

    if (!regUser.trim() || !regPass.trim() || !regName.trim()) {
      setError('Por favor, preencha todos os campos do cadastro.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUser,
          password: regPass,
          name: regName,
          photoUrl: selectedAvatar,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar cadastro.');
      }

      setSuccess('Cadastro realizado! Entrando...');
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Falha de rede.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 relative select-none">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse delay-700" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/80 border border-slate-800/80 rounded-2xl p-8 shadow-2xl relative z-10 backdrop-blur-xl"
      >
        {/* Logo / Heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-slate-950 mb-3 shadow-lg shadow-orange-600/20">
            <Swords className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-wider bg-gradient-to-r from-orange-500 via-amber-400 to-red-500 bg-clip-text text-transparent font-display">
            NARUTO UNISON
          </h1>
          <p className="text-slate-400 text-xs font-mono tracking-widest uppercase mt-1">
            Arena de Batalha Shinobi
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-950 border border-slate-800/60 p-1 rounded-xl mb-6">
          <button
            onClick={() => { playClickSound(); setActiveTab('login'); setError(''); setSuccess(''); }}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'login'
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Entrar
          </button>
          <button
            onClick={() => { playClickSound(); setActiveTab('register'); setError(''); setSuccess(''); }}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'register'
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Cadastrar
          </button>
        </div>

        {/* Feedback Messages */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center"
            >
              ⚠️ {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form area */}
        <AnimatePresence mode="wait">
          {activeTab === 'login' ? (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Nome de Usuário (Username)
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    placeholder="Digite seu username"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="Sua senha secreta"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:brightness-110 active:scale-[0.98] transition text-slate-950 text-xs font-bold uppercase tracking-widest rounded-xl mt-6 flex items-center justify-center gap-2 shadow-lg shadow-orange-600/15"
              >
                {loading ? 'Entrando...' : 'Entrar na Arena'}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="register"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleRegister}
              className="space-y-4"
            >
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Username Único
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={regUser}
                    onChange={(e) => setRegUser(e.target.value)}
                    placeholder="Ex: narutinho99"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Nome do Shinobi (Exibição)
                </label>
                <div className="relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Naruto Uzumaki"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Escolha sua Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    placeholder="Senha do ninja"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition"
                  />
                </div>
              </div>

              {/* Avatar Preset selector */}
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Escolha seu Avatar de Perfil
                </label>
                <div className="grid grid-cols-6 gap-2 bg-slate-950/60 p-2 border border-slate-800/85 rounded-xl">
                  {AVATAR_PRESETS.map((preset) => {
                    const isSelected = selectedAvatar === preset.url;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => { playClickSound(); setSelectedAvatar(preset.url); }}
                        className={`aspect-square relative rounded-lg overflow-hidden border-2 transition active:scale-90 ${
                          isSelected ? 'border-orange-500 shadow shadow-orange-500/50' : 'border-transparent hover:border-slate-800'
                        }`}
                        title={preset.name}
                      >
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-orange-500/10 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  // Pre-set guest avatar
                  onLoginSuccess({
                    username: 'convidado',
                    name: 'Shinobi Convidado',
                    photoUrl: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg'
                  });
                }}
                className="w-full mt-2 text-center text-[10px] text-slate-500 font-mono hover:text-slate-300 uppercase tracking-wider"
              >
                Ou pular e entrar como Convidado
              </button>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:brightness-110 active:scale-[0.98] transition text-slate-950 text-xs font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-600/15"
              >
                {loading ? 'Criando Ninja...' : 'Criar Conta Shinobi'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
