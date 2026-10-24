import React, { useEffect, useState } from 'react';
import { User, Lock, Sparkles, UserPlus, LogIn, Cloud, Leaf, ScrollText, Check, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { useLanguage } from '../lib/i18n';
import { getGoogleRedirectUser, signInWithGoogle, signInWithGoogleRedirect } from '../lib/firebase';
import { VillageId, VILLAGES } from '../lib/villages';
import LanguageSelector from './LanguageSelector';

const AVATAR_PRESETS = [
  { name: 'Naruto Uzumaki', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/naruto-uzumaki/icon.jpg' },
  { name: 'Sasuke Uchiha', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/sasuke-uchiha/icon.jpg' },
  { name: 'Sakura Haruno', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/sakura-haruno/icon.jpg' },
  { name: 'Kakashi Hatake', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/kakashi-hatake/icon.jpg' },
  { name: 'Itachi Uchiha', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/itachi-uchiha/icon.jpg' },
  { name: 'Gaara', url: 'https://raw.githubusercontent.com/naruto-unison/naruto-unison/master/static/img/ninja/gaara/icon.jpg' },
];

const REMEMBERED_USERNAME_KEY = 'naruto_remembered_username';
const AFFILIATION_STORAGE_KEY = 'naruto_ninja_affiliation';

interface AuthScreenProps {
  onLoginSuccess: (user: UserProfile, sessionTicket?: string) => void;
  playClickSound: () => void;
  playScrollSound: () => void;
  onBack?: () => void;
}

export default function AuthScreen({ onLoginSuccess, playClickSound, playScrollSound, onBack }: AuthScreenProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [onboardingStep, setOnboardingStep] = useState<'auth' | 'village' | 'welcome'>('auth');
  const [isAkatsuki, setIsAkatsuki] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState<VillageId | null>(null);
  const [pendingAccount, setPendingAccount] = useState<{
    profile: UserProfile;
    ticket: string;
    source: 'google' | 'register';
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [sharinganSpinKey, setSharinganSpinKey] = useState(0);
  const [sharinganSpinDirection, setSharinganSpinDirection] = useState<'forward' | 'reverse' | null>(null);
  const accentText = isAkatsuki ? 'text-red-400' : 'text-orange-400';
  const inputFocus = isAkatsuki
    ? 'focus:border-red-500 focus:shadow-[0_0_12px_rgba(229,9,20,0.45)]'
    : 'focus:border-orange-500 focus:shadow-[0_0_12px_rgba(255,107,0,0.45)]';

  const togglePasswordVisibility = () => {
    playClickSound();
    const nextVisible = !showPassword;
    setShowPassword(nextVisible);
    setSharinganSpinDirection(nextVisible ? 'forward' : 'reverse');
    setSharinganSpinKey(key => key + 1);
  };
  
  // Login fields
  const [loginUser, setLoginUser] = useState(() => {
    try {
      return localStorage.getItem(REMEMBERED_USERNAME_KEY) || '';
    } catch (error) {
      console.error('Failed to load remembered username:', error);
      return '';
    }
  });
  const [rememberMe, setRememberMe] = useState(() => Boolean(loginUser));
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

  const beginOnboarding = (profile: UserProfile, ticket: string, source: 'google' | 'register') => {
    setPendingAccount({ profile, ticket, source });
    setIsAkatsuki(false);
    setSelectedVillage(null);
    setOnboardingStep('village');
  };

  const continueFromVillage = (village: VillageId | null = selectedVillage) => {
    if (!village) return;
    try {
      localStorage.setItem(AFFILIATION_STORAGE_KEY, village);
    } catch (storageError) {
      console.error('Failed to save selected ninja affiliation:', storageError);
      setError(t('Não foi possível salvar sua vila. Tente novamente.', 'Could not save your village. Please try again.'));
      return;
    }
    if (pendingAccount?.source === 'google') {
      onLoginSuccess({ ...pendingAccount.profile, village }, pendingAccount.ticket);
      return;
    }
    setOnboardingStep('welcome');
  };

  const selectVillage = (village: VillageId) => {
    playScrollSound();
    setSelectedVillage(village);
    setIsAkatsuki(village === 'akatsuki');
    if (pendingAccount?.source === 'google') continueFromVillage(village);
  };

  const finishOnboarding = () => {
    if (!pendingAccount) {
      setError(t('Não foi possível concluir o cadastro. Entre novamente.', 'Could not complete setup. Please sign in again.'));
      setOnboardingStep('auth');
      return;
    }
    onLoginSuccess({ ...pendingAccount.profile, village: selectedVillage || undefined }, pendingAccount.ticket);
  };

  const completeGoogleLogin = async (googleUser: Awaited<ReturnType<typeof signInWithGoogle>>) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: googleUser.idToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || t('Erro ao entrar com Google.', 'Error signing in with Google.'));
    }
    if (typeof data.sessionTicket !== 'string') {
      throw new Error(t('Não foi possível iniciar uma sessão segura.', 'Could not start a secure session.'));
    }

    beginOnboarding({
      ...data.user,
      photoUrl: googleUser.photoUrl || data.user.photoUrl,
    }, data.sessionTicket, 'google');
  };

  useEffect(() => {
    let active = true;
    void getGoogleRedirectUser()
      .then(async googleUser => {
        if (!active || !googleUser) return;
        setLoading(true);
        await completeGoogleLogin(googleUser);
      })
      .catch((err: unknown) => {
        console.error('Google redirect login failed:', err);
        if (active) setError(err instanceof Error ? err.message : t('Falha ao entrar com Google.', 'Google sign-in failed.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    playClickSound();
    setError('');
    setSuccess('');

    if (!loginUser.trim() || !loginPass.trim()) {
      setError(t('Por favor, preencha todos os campos.', 'Please fill in all fields.'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('Erro ao realizar login.', 'Error logging in.'));
      }
      if (typeof data.sessionTicket !== 'string') {
        throw new Error(t('Não foi possível iniciar uma sessão segura.', 'Could not start a secure session.'));
      }

      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_USERNAME_KEY, loginUser.trim());
        } else {
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        }
      } catch (error) {
        console.error('Failed to save remembered username preference:', error);
      }

      setSuccess(t('Conectando ao servidor...', 'Connecting to server...'));
      setTimeout(() => {
        onLoginSuccess(data.user, data.sessionTicket);
      }, 800);
    } catch (err: any) {
      setError(err.message || t('Falha de rede.', 'Network failure.'));
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
      setError(t('Por favor, preencha todos os campos do cadastro.', 'Please fill in all registration fields.'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
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
        throw new Error(data.error || t('Erro ao realizar cadastro.', 'Error registering account.'));
      }
      if (typeof data.sessionTicket !== 'string') {
        throw new Error(t('Não foi possível iniciar uma sessão segura.', 'Could not start a secure session.'));
      }

      beginOnboarding(data.user, data.sessionTicket, 'register');
    } catch (err: any) {
      setError(err.message || t('Falha de rede.', 'Network failure.'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    playClickSound();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const googleUser = await signInWithGoogle();
      await completeGoogleLogin(googleUser);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'auth/popup-closed-by-user'
      ) {
        try {
          await signInWithGoogleRedirect();
          return;
        } catch (redirectError: unknown) {
          console.error('Google redirect sign-in failed:', redirectError);
          setError(redirectError instanceof Error ? redirectError.message : t('Falha ao entrar com Google.', 'Google sign-in failed.'));
          return;
        }
      }
      console.error('Google login failed:', err);
      setError(err instanceof Error ? err.message : t('Falha ao entrar com Google.', 'Google sign-in failed.'));
    } finally {
      setLoading(false);
    }
  };

  if (onboardingStep !== 'auth') {
    const villageName = VILLAGES.find(village => village.id === selectedVillage)?.name || '';
    return (
      <div className={`relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden px-4 py-16 font-sans text-white ${
        isAkatsuki
          ? 'bg-[radial-gradient(circle_at_top,#2d0507_0%,#120305_65%,#050203_100%)]'
          : 'bg-[radial-gradient(circle_at_top,#2c1810_0%,#0f0e17_65%,#050508_100%)]'
      }`}>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.08]">
          {isAkatsuki
            ? <Cloud className="h-[min(80vw,420px)] w-[min(80vw,420px)] text-red-500" />
            : <Leaf className="h-[min(80vw,380px)] w-[min(80vw,380px)] text-amber-500" />}
        </div>
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <LanguageSelector playClickSound={playClickSound} variant="pills" />
        </div>
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`relative z-10 w-full max-w-2xl rounded-2xl border-2 bg-[rgba(18,18,24,0.92)] p-7 text-center shadow-2xl backdrop-blur-xl ${
            isAkatsuki ? 'border-[#8b0000] shadow-red-950/60' : 'border-[#ffb800] shadow-orange-950/60'
          }`}
        >
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              {t('Etapa 2 de 2', 'Step 2 of 2')}
            </p>
            <h1 className={`mt-2 text-2xl font-black uppercase tracking-wide ${isAkatsuki ? 'text-red-300' : 'text-amber-200'}`}>
              {t('Escolha sua vila', 'Choose your village')}
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              {t('Escolha sua vila para concluir o cadastro.', 'Choose your village to complete your account setup.')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {VILLAGES.map(village => {
              const selected = selectedVillage === village.id;
              const isAkatsukiVillage = village.id === 'akatsuki';
              return (
                <button
                  key={village.id}
                  type="button"
                  onClick={() => selectVillage(village.id)}
                  aria-pressed={selected}
                  className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border p-3 transition ${
                    selected
                      ? isAkatsukiVillage
                        ? 'border-red-500 bg-red-600/15 text-red-200 shadow-lg shadow-red-950/40'
                        : 'border-orange-400 bg-orange-500/15 text-orange-200 shadow-lg shadow-orange-950/40'
                      : `border-white/10 bg-black/30 text-gray-300 ${isAkatsukiVillage ? 'hover:border-red-500/60' : 'hover:border-orange-400/60'}`
                  }`}
                >
                  <img
                    src={village.icon}
                    alt=""
                    aria-hidden="true"
                    className="auth-village-icon h-17 w-17 object-contain"
                  />
                  <span className="text-sm font-bold">{t(village.name, village.englishName)}</span>
                </button>
              );
            })}
          </div>

          {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
          <button
            type="button"
            onClick={() => { playClickSound(); continueFromVillage(); }}
            disabled={!selectedVillage}
            className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold uppercase tracking-wider text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
              isAkatsuki ? 'bg-gradient-to-r from-red-600 to-red-950' : 'bg-gradient-to-r from-orange-600 to-amber-500'
            }`}
          >
            {t('Continuar', 'Continue')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </motion.section>

        {onboardingStep === 'welcome' && pendingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="welcome-title"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`w-full max-w-sm rounded-2xl border-2 bg-slate-900 p-7 text-center shadow-2xl ${
                isAkatsuki ? 'border-red-600 shadow-red-950/50' : 'border-orange-500 shadow-orange-950/50'
              }`}
            >
              <img
                src={pendingAccount.profile.photoUrl}
                alt=""
                className={`mx-auto mb-4 h-20 w-20 rounded-full border-2 object-cover ${
                  isAkatsuki ? 'border-red-500' : 'border-amber-400'
                }`}
                referrerPolicy="no-referrer"
              />
              <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full ${
                isAkatsuki ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'
              }`}>
                <Check className="h-6 w-6" />
              </div>
              <h2 id="welcome-title" className="text-2xl font-black text-white">
                {t('Bem-vindo!', 'Welcome!')}
              </h2>
              <p className="mt-2 text-sm text-gray-300">
                {t(`Que bom ter você aqui, ${pendingAccount.profile.name || pendingAccount.profile.username}.`, `Glad to have you here, ${pendingAccount.profile.name || pendingAccount.profile.username}.`)}
              </p>
              <p className={`mt-2 text-sm font-bold ${isAkatsuki ? 'text-red-300' : 'text-amber-300'}`}>
                {t(`Sua vila: ${villageName}`, `Your village: ${villageName}`)}
              </p>
              <button
                type="button"
                onClick={() => { playClickSound(); finishOnboarding(); }}
                className={`mt-6 w-full rounded-xl py-3.5 text-sm font-bold uppercase tracking-wider text-white transition hover:brightness-110 ${
                  isAkatsuki ? 'bg-gradient-to-r from-red-600 to-red-950' : 'bg-gradient-to-r from-orange-600 to-amber-500'
                }`}
              >
                {t('Entrar na Arena', 'Enter the Arena')}
              </button>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-[#08080c] px-4 py-16 font-sans text-white select-none ${
      isAkatsuki
        ? 'bg-[radial-gradient(circle_at_top,#2d0507_0%,#120305_65%,#050203_100%)]'
        : 'bg-[radial-gradient(circle_at_top,#2c1810_0%,#0f0e17_65%,#050508_100%)]'
    }`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        <div className={`absolute -left-24 top-1/4 h-72 w-72 rounded-full blur-3xl ${isAkatsuki ? 'bg-red-600/20' : 'bg-orange-600/20'}`} />
        <div className={`absolute -right-24 bottom-1/4 h-72 w-72 rounded-full blur-3xl ${isAkatsuki ? 'bg-rose-600/15' : 'bg-cyan-500/15'}`} />
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.08]">
          {isAkatsuki ? (
            <Cloud className="h-[min(80vw,420px)] w-[min(80vw,420px)] text-red-500 drop-shadow-[0_0_12px_rgba(229,9,20,0.6)]" />
          ) : (
            <Leaf className="h-[min(80vw,380px)] w-[min(80vw,380px)] text-amber-500" />
          )}
        </div>
        {Array.from({ length: 16 }, (_, index) => (
          <span
            key={index}
            className={`absolute h-1 w-1 rounded-full animate-pulse ${isAkatsuki ? 'bg-red-400' : index % 2 ? 'bg-cyan-300' : 'bg-orange-400'}`}
            style={{ left: `${(index * 37 + 9) % 100}%`, top: `${(index * 61 + 7) % 100}%`, animationDelay: `${(index % 5) * 300}ms` }}
          />
        ))}
      </div>

      {/* Top Language Switcher Bar */}
      <div className="absolute top-6 right-6 z-20">
        <LanguageSelector playClickSound={playClickSound} variant="pills" />
      </div>

      {/* Back to menu */}
      {onBack && (
        <button
          onClick={() => {
            playClickSound();
            onBack();
          }}
          className={`absolute left-4 top-4 z-20 rounded-xl border border-white/10 bg-black/40 p-3 text-slate-300 shadow backdrop-blur transition-all hover:text-white sm:left-6 sm:top-6 ${isAkatsuki ? 'hover:border-red-500/80 hover:text-red-400' : 'hover:border-orange-500/80 hover:text-orange-400'}`}
          title={t('Voltar ao Menu', 'Back to Menu')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative z-10 my-auto w-full max-w-[420px] rounded-2xl border-2 bg-[rgba(18,18,24,0.88)] p-6 shadow-[0_15px_35px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-colors sm:p-7 ${
          isAkatsuki ? 'border-[#8b0000] shadow-[0_0_18px_rgba(229,9,20,0.4)]' : 'border-[#ffb800] shadow-[0_0_18px_rgba(255,107,0,0.35)]'
        }`}
      >
        <div className={`pointer-events-none absolute -left-3 -right-3 top-[-8px] z-20 h-3.5 rounded-full bg-[linear-gradient(90deg,#3d2314_0%,#8b4513_25%,#d2691e_50%,#8b4513_75%,#3d2314_100%)] shadow-[0_4px_8px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.3)] after:absolute after:left-0 after:right-0 after:top-0 after:mx-auto after:h-full after:w-[90%] after:rounded-full after:border-x-[5px] after:border-[#b8860b] ${isAkatsuki ? 'opacity-90' : ''}`} />
        <div className="pointer-events-none absolute -bottom-2 left-[-12px] right-[-12px] z-20 h-3.5 rounded-full bg-[linear-gradient(90deg,#3d2314_0%,#8b4513_25%,#d2691e_50%,#8b4513_75%,#3d2314_100%)] shadow-[0_4px_8px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.3)]" />

        <div className="mb-6 text-center">
          <div className="group relative mb-2 inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-400 bg-gradient-to-b from-gray-700 to-gray-950 shadow-xl transition-transform duration-500 hover:rotate-6">
            <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-gray-400" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gray-400" />
            <span className="absolute bottom-2 left-2 h-1.5 w-1.5 rounded-full bg-gray-400" />
            <span className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-gray-400" />
            {isAkatsuki ? <Cloud className="h-7 w-7 text-red-400" /> : <Leaf className="h-7 w-7 text-orange-400" />}
          </div>
          <h1 className={`font-display text-2xl font-black tracking-wider text-transparent bg-clip-text ${
            isAkatsuki
              ? 'bg-gradient-to-r from-red-500 via-rose-300 to-red-700'
              : 'bg-gradient-to-r from-orange-400 via-amber-200 to-orange-500'
          }`}>
            {isAkatsuki ? t('REFÚGIO AKATSUKI', 'AKATSUKI LAIR') : t('PORTAL SHINOBI', 'SHINOBI PORTAL')}
          </h1>
          <p className="mt-1 text-xs font-medium text-gray-400">
            {isAkatsuki
              ? t('Acesso restrito aos ninjas renegados', 'Rogue ninja access standard encryption')
              : t('Entre para acessar os arquivos da Folha', 'Enter your credentials to access Leaf Archives')}
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-3 justify-center mb-6">
          <button
            onClick={() => { playScrollSound(); setActiveTab('login'); setError(''); setSuccess(''); }}
            className={`relative flex-1 rounded-lg border py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'login'
                ? isAkatsuki ? 'border-red-500/60 bg-red-950/60 text-red-200' : 'border-orange-500/60 bg-orange-950/60 text-orange-200'
                : 'border-white/5 bg-black/20 text-gray-400 hover:text-white'
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-1.5">
              <LogIn className="w-3.5 h-3.5" />
              {t('Entrar', 'Log In')}
            </span>
          </button>
          <button
            onClick={() => { playScrollSound(); setActiveTab('register'); setError(''); setSuccess(''); }}
            className={`relative flex-1 rounded-lg border py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'register'
                ? isAkatsuki ? 'border-red-500/60 bg-red-950/60 text-red-200' : 'border-orange-500/60 bg-orange-950/60 text-orange-200'
                : 'border-white/5 bg-black/20 text-gray-400 hover:text-white'
            }`}
          >
            <span className="relative z-10 flex items-center justify-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              {t('Cadastrar', 'Sign Up')}
            </span>
          </button>
        </div>

        {/* Feedback Messages */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center text-xs font-mono text-red-300"
            >
              ⚠️ {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-mono text-emerald-300"
            >
              <img src="/static/img/icon/star.svg" alt="Loading" className="w-4 h-4 animate-spin object-contain" />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form area */}
        <AnimatePresence mode="wait">
          {activeTab === 'login' ? (
            <motion.form
              key="login"
              autoComplete="on"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 flex items-center text-xs font-bold tracking-wide text-gray-300">
                  <span className="flex items-center">
                    <ScrollText className={`mr-1.5 h-4 w-4 ${accentText}`} />
                    {t('ID Ninja / Nome de usuário', 'Ninja ID / Name')}
                  </span>
                </label>
                <div className="relative">
                  <img
                    src="/static/img/icon/kakashi-icon.svg"
                    alt=""
                    aria-hidden="true"
                    className="auth-field-icon absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2"
                  />
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value.replace(/\s/g, ''))}
                    placeholder={t('Digite seu ID', 'Enter your ID')}
                    className={`w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 outline-none transition ${inputFocus}`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-bold tracking-wide text-gray-300">
                  <span className="flex items-center">
                    <Lock className={`mr-1.5 h-4 w-4 ${accentText}`} />
                    {t('Senha', 'Password')}
                  </span>
                </label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${accentText}`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="••••••••••••"
                    className={`w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-11 pr-12 text-sm text-white placeholder:text-gray-500 outline-none transition ${inputFocus}`}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? t('Ocultar senha', 'Hide password') : t('Mostrar senha', 'Show password')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:text-white"
                  >
                    <span className="auth-sharingan-crop">
                      <span
                        key={sharinganSpinKey}
                        className={`auth-sharingan-rotor ${
                          sharinganSpinDirection ? `auth-sharingan-spin-${sharinganSpinDirection}` : ''
                        }`}
                      >
                        <img
                          src="/static/img/icon/sharingan-vetor.svg"
                          alt=""
                          aria-hidden="true"
                          className={`auth-sharingan-image ${showPassword ? 'auth-sharingan-active' : ''}`}
                        />
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              <label className="group flex cursor-pointer select-none items-center gap-2.5 pt-1 text-xs font-medium text-gray-300 transition hover:text-white">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    setRememberMe(e.target.checked);
                    if (!e.target.checked) {
                      try {
                        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
                      } catch (error) {
                        console.error('Failed to clear remembered username:', error);
                      }
                    }
                  }}
                  className={`h-4 w-4 rounded border-gray-500 bg-black/40 ${isAkatsuki ? 'accent-red-500' : 'accent-orange-500'}`}
                />
                {t('Lembrar meu login', 'Remember my login')}
              </label>

              <button
                type="submit"
                disabled={loading}
                className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${
                  isAkatsuki
                    ? 'bg-gradient-to-r from-red-600 to-red-950 shadow-[0_0_20px_rgba(229,9,20,0.5)]'
                    : 'bg-gradient-to-r from-orange-600 to-amber-500 shadow-[0_0_20px_rgba(255,107,0,0.45)]'
                }`}
              >
                <img src="/static/img/icon/sasuke-seal.svg" alt="" aria-hidden="true" className="auth-seal-icon h-10 w-10 object-contain" />
                {loading ? t('Entrando...', 'Logging in...') : t('Entrar na Arena', 'Enter the Arena')}
              </button>
              <div className="mt-5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-gray-400">
                <span className="h-px flex-1 bg-white/15" />
                <span>{t('ou', 'or')}</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white py-3 text-xs font-bold uppercase tracking-widest text-slate-900 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
              >
                <img src="/static/img/icon/g-google.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {loading ? t('Conectando...', 'Connecting...') : t('Entrar com Google', 'Sign in with Google')}
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
                <label className="mb-1.5 block text-xs font-bold tracking-wide text-gray-300">
                  {t('Username Único', 'Unique Username')}
                </label>
                <div className="relative">
                  <User className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${accentText}`} />
                  <input
                    type="text"
                    value={regUser}
                    onChange={(e) => setRegUser(e.target.value.replace(/\s/g, ''))}
                    placeholder={t('Ex: narutinho99', 'Ex: narutodev99')}
                    className={`w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 outline-none transition ${inputFocus}`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold tracking-wide text-gray-300">
                  {t('Nome De Exibição', 'Display name')}
                </label>
                <div className="relative">
                  <img
                    src="/static/img/icon/3-shuriken.svg"
                    alt=""
                    aria-hidden="true"
                    className="auth-field-icon absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2"
                  />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Naruto Uzumaki"
                    className={`w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 outline-none transition ${inputFocus}`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold tracking-wide text-gray-300">
                  {t('Senha', 'Password')}
                </label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${accentText}`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    placeholder={t('Digite sua senha', 'Enter your password')}
                    className={`w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-11 pr-12 text-sm text-white placeholder:text-gray-500 outline-none transition ${inputFocus}`}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? t('Ocultar senha', 'Hide password') : t('Mostrar senha', 'Show password')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition hover:text-white"
                  >
                    <span className="auth-sharingan-crop">
                      <span
                        key={sharinganSpinKey}
                        className={`auth-sharingan-rotor ${
                          sharinganSpinDirection ? `auth-sharingan-spin-${sharinganSpinDirection}` : ''
                        }`}
                      >
                        <img
                          src="/static/img/icon/sharingan-vetor.svg"
                          alt=""
                          aria-hidden="true"
                          className={`auth-sharingan-image ${showPassword ? 'auth-sharingan-active' : ''}`}
                        />
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Avatar Preset selector */}
              <div>
                <label className="mb-2 block text-xs font-bold tracking-wide text-gray-300">
                  {t('Escolha seu Avatar de Perfil', 'Choose your Profile Avatar')}
                </label>
                <div className="grid grid-cols-6 gap-2 rounded-xl border border-white/10 bg-black/40 p-2">
                  {AVATAR_PRESETS.map((preset) => {
                    const isSelected = selectedAvatar === preset.url;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => { playClickSound(); setSelectedAvatar(preset.url); }}
                        className={`aspect-square relative rounded-lg overflow-hidden border-2 transition cursor-pointer active:scale-90 ${
                          isSelected
                            ? isAkatsuki ? 'border-red-500 shadow shadow-red-500/50' : 'border-orange-500 shadow shadow-orange-500/50'
                            : 'border-transparent hover:border-white/20'
                        }`}
                        title={preset.name}
                      >
                        <img
                          src={preset.url || null}
                          alt={preset.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        {isSelected && (
                          <div className={`absolute inset-0 flex items-center justify-center ${isAkatsuki ? 'bg-red-500/10' : 'bg-orange-500/10'}`}>
                              <div className={`h-1.5 w-1.5 rounded-full ${isAkatsuki ? 'bg-red-500' : 'bg-orange-500'}`} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${
                  isAkatsuki ? 'bg-gradient-to-r from-red-600 to-red-950 shadow-lg shadow-red-600/30' : 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 shadow-lg shadow-orange-600/30'
                }`}
              >
                <img src="/static/img/icon/sasuke-seal.svg" alt="" aria-hidden="true" className="auth-seal-icon h-10 w-10 object-contain" />
                {loading ? t('Criando conta...', 'Creating account...') : t('Criar Conta', 'Create Account')}
              </button>
              <div className="flex items-center gap-3 pt-3 text-[10px] font-mono uppercase tracking-wider text-gray-400">
                <span className="h-px flex-1 bg-white/15" />
                <span>{t('ou', 'or')}</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white py-3 text-xs font-bold uppercase tracking-widest text-slate-900 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
              >
                <img src="/static/img/icon/g-google.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {loading ? t('Conectando...', 'Connecting...') : t('Entrar com Google', 'Sign in with Google')}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
