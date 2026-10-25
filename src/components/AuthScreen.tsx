import React, { useEffect, useRef, useState } from 'react';
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
  const authChidoriButtonRef = useRef<HTMLButtonElement>(null);
  const authChidoriIconCanvasRef = useRef<HTMLCanvasElement>(null);
  const authChidoriBorderCanvasRef = useRef<HTMLCanvasElement>(null);
  const accentText = isAkatsuki ? 'text-red-500' : 'text-cyan-600';
  const inputFocus = isAkatsuki
    ? 'focus:border-red-400 focus:bg-white focus:shadow-[0_0_15px_rgba(229,9,20,0.2)]'
    : 'focus:border-cyan-400 focus:bg-white focus:shadow-[0_0_15px_rgba(0,210,255,0.25)]';

  useEffect(() => {
    if (activeTab !== 'login' || onboardingStep !== 'auth') return;

    let setupFrameId = 0;
    let animationFrameId = 0;
    let stopped = false;
    let cleanupAnimation: (() => void) | undefined;

    const startAnimation = () => {
      if (stopped) return;

      const button = authChidoriButtonRef.current;
      const iconCanvas = authChidoriIconCanvasRef.current;
      const borderCanvas = authChidoriBorderCanvasRef.current;
      if (!button || !iconCanvas || !borderCanvas) {
        setupFrameId = requestAnimationFrame(startAnimation);
        return;
      }

      const iconContext = iconCanvas.getContext('2d');
      const borderContext = borderCanvas.getContext('2d');
      if (!iconContext || !borderContext) return;

    const centerX = iconCanvas.width / 2;
    const centerY = iconCanvas.height / 2;
    let hovered = false;

    const sparks = Array.from({ length: 35 }, () => {
      const spark = {
        x: centerX,
        y: centerY,
        vx: 0,
        vy: 0,
        size: 0,
        life: 1,
        decay: 0,
        color: '#fff',
        reset() {
          this.x = centerX;
          this.y = centerY;
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * (hovered ? 6 : 3) + 1;
          this.vx = Math.cos(angle) * speed;
          this.vy = Math.sin(angle) * speed;
          this.size = Math.random() * 2.5 + 0.8;
          this.life = 1;
          this.decay = Math.random() * 0.05 + 0.02;
          this.color = Math.random() > 0.3 ? '#ffffff' : Math.random() > 0.5 ? '#00f3ff' : '#0088ff';
        },
        update() {
          this.x += this.vx;
          this.y += this.vy;
          this.vy += 0.05;
          this.life -= this.decay;
          if (this.life <= 0) this.reset();
        },
        draw() {
          iconContext.save();
          iconContext.globalAlpha = this.life;
          iconContext.fillStyle = this.color;
          iconContext.shadowColor = '#00f3ff';
          iconContext.shadowBlur = 10;
          iconContext.beginPath();
          iconContext.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          iconContext.fill();
          iconContext.restore();
        },
      };
      spark.reset();
      return spark;
    });

    const drawLightningBranch = (
      context: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      displacement: number,
      depth: number,
      mainColor: string,
      glowColor: string
    ) => {
      if (depth === 0) {
        context.save();
        context.strokeStyle = mainColor;
        context.lineWidth = Math.random() * 2 + 2;
        context.shadowColor = glowColor;
        context.shadowBlur = 16;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        context.restore();
        return;
      }

      const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * displacement;
      const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * displacement;
      drawLightningBranch(context, x1, y1, midX, midY, displacement / 2, depth - 1, mainColor, glowColor);
      drawLightningBranch(context, midX, midY, x2, y2, displacement / 2, depth - 1, mainColor, glowColor);

      if (Math.random() < 0.35) {
        const branchAngle = Math.atan2(y2 - y1, x2 - x1) + (Math.random() - 0.5) * 1.2;
        const branchLength = Math.hypot(x2 - x1, y2 - y1) * 0.4;
        drawLightningBranch(
          context,
          midX,
          midY,
          midX + Math.cos(branchAngle) * branchLength,
          midY + Math.sin(branchAngle) * branchLength,
          displacement / 2,
          depth - 1,
          mainColor,
          glowColor
        );
      }
    };

    const resizeBorderCanvas = () => {
      const bounds = button.getBoundingClientRect();
      borderCanvas.width = Math.ceil(bounds.width + 40);
      borderCanvas.height = Math.ceil(bounds.height + 40);
      borderCanvas.style.width = `${bounds.width + 40}px`;
      borderCanvas.style.height = `${bounds.height + 40}px`;
    };
    resizeBorderCanvas();
    const resizeObserver = new ResizeObserver(resizeBorderCanvas);
    resizeObserver.observe(button);

    const onMouseEnter = () => { hovered = true; };
    const onMouseLeave = () => { hovered = false; };
    button.addEventListener('mouseenter', onMouseEnter);
    button.addEventListener('mouseleave', onMouseLeave);

    const animate = () => {
      iconContext.clearRect(0, 0, iconCanvas.width, iconCanvas.height);

      sparks.forEach(spark => {
        spark.update();
        spark.draw();
      });

      iconContext.save();
      const coreRadius = (hovered ? 22 : 17) + Math.random() * 4 - 2;
      const outerGlow = iconContext.createRadialGradient(centerX, centerY, coreRadius * 0.12, centerX, centerY, coreRadius * 2.5);
      outerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      outerGlow.addColorStop(0.18, 'rgba(125, 211, 252, 0.95)');
      outerGlow.addColorStop(0.42, 'rgba(14, 165, 233, 0.82)');
      outerGlow.addColorStop(0.72, 'rgba(37, 99, 235, 0.48)');
      outerGlow.addColorStop(1, 'transparent');
      iconContext.fillStyle = outerGlow;
      iconContext.shadowColor = '#168bff';
      iconContext.shadowBlur = hovered ? 32 : 20;
      iconContext.beginPath();
      iconContext.arc(centerX, centerY, coreRadius * 2.5, 0, Math.PI * 2);
      iconContext.fill();

      const plasmaCore = iconContext.createRadialGradient(
        centerX - coreRadius * 0.18,
        centerY - coreRadius * 0.2,
        0,
        centerX,
        centerY,
        coreRadius
      );
      plasmaCore.addColorStop(0, '#ffffff');
      plasmaCore.addColorStop(0.3, '#e0f7ff');
      plasmaCore.addColorStop(0.62, '#38bdf8');
      plasmaCore.addColorStop(1, 'rgba(0, 102, 255, 0)');
      iconContext.fillStyle = plasmaCore;
      iconContext.shadowColor = '#38bdf8';
      iconContext.shadowBlur = hovered ? 24 : 15;
      iconContext.beginPath();
      iconContext.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      iconContext.fill();

      iconContext.fillStyle = '#fff';
      iconContext.shadowColor = '#fff';
      iconContext.shadowBlur = 12;
      iconContext.beginPath();
      iconContext.arc(centerX, centerY, coreRadius * 0.28, 0, Math.PI * 2);
      iconContext.fill();
      iconContext.restore();

      const boltCount = hovered ? 12 : 6;
      for (let i = 0; i < boltCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * (hovered ? 65 : 45) + 15;
        drawLightningBranch(
          iconContext,
          centerX,
          centerY,
          centerX + Math.cos(angle) * distance,
          centerY + Math.sin(angle) * distance,
          15,
          3,
          Math.random() > 0.72 ? '#7dd3fc' : '#ffffff',
          Math.random() > 0.45 ? '#168bff' : '#00d9ff'
        );
      }

      borderContext.clearRect(0, 0, borderCanvas.width, borderCanvas.height);
      if (hovered || Math.random() < 0.35) {
        const width = borderCanvas.width - 40;
        const height = borderCanvas.height - 40;
        const borderArcsCount = hovered ? Math.floor(Math.random() * 3) + 2 : 1;

        for (let i = 0; i < borderArcsCount; i++) {
          const side = Math.floor(Math.random() * 4);
          let startX: number;
          let startY: number;
          let endX: number;
          let endY: number;

          if (side === 0) {
            startX = 20 + Math.random() * width;
            startY = 20;
            endX = startX + (Math.random() - 0.5) * 80;
            endY = 20 + (Math.random() - 0.5) * 15;
          } else if (side === 1) {
            startX = 20 + width;
            startY = 20 + Math.random() * height;
            endX = startX + (Math.random() - 0.5) * 15;
            endY = startY + (Math.random() - 0.5) * 80;
          } else if (side === 2) {
            startX = 20 + Math.random() * width;
            startY = 20 + height;
            endX = startX + (Math.random() - 0.5) * 80;
            endY = startY + (Math.random() - 0.5) * 15;
          } else {
            startX = 20;
            startY = 20 + Math.random() * height;
            endX = 20 + (Math.random() - 0.5) * 15;
            endY = startY + (Math.random() - 0.5) * 80;
          }
          drawLightningBranch(borderContext, startX, startY, endX, endY, 12, 3, '#fff', '#00f3ff');
        }
      }

        animationFrameId = requestAnimationFrame(animate);
      };
      animationFrameId = requestAnimationFrame(animate);

      cleanupAnimation = () => {
        resizeObserver.disconnect();
        button.removeEventListener('mouseenter', onMouseEnter);
        button.removeEventListener('mouseleave', onMouseLeave);
        iconContext.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
        borderContext.clearRect(0, 0, borderCanvas.width, borderCanvas.height);
      };
    };
    setupFrameId = requestAnimationFrame(startAnimation);

    return () => {
      stopped = true;
      cancelAnimationFrame(setupFrameId);
      cancelAnimationFrame(animationFrameId);
      cleanupAnimation?.();
    };
  }, [activeTab, onboardingStep]);

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
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-[radial-gradient(circle_at_top,#f8fdff_0%,#f4f6fb_65%,#edf0f7_100%)] px-4 py-16 font-sans text-slate-800">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />
          <div className="absolute -right-24 bottom-1/4 h-72 w-72 rounded-full bg-blue-300/20 blur-3xl" />
          <Leaf className="absolute left-1/2 top-1/2 h-[min(80vw,380px)] w-[min(80vw,380px)] -translate-x-1/2 -translate-y-1/2 text-slate-700 opacity-[0.035]" />
        </div>
        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <LanguageSelector playClickSound={playClickSound} variant="pills" />
        </div>
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-2xl rounded-[32px] border border-white/85 bg-[rgba(255,255,255,0.86)] p-6 text-center shadow-[0_20px_50px_rgba(0,10,30,0.08),0_2px_10px_rgba(0,0,0,0.03)] backdrop-blur-2xl sm:p-7"
        >
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              {t('Etapa 2 de 2', 'Step 2 of 2')}
            </p>
            <h1 className="mt-2 text-2xl font-black uppercase tracking-wide text-slate-800">
              {t('Escolha sua vila', 'Choose your village')}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {t('Escolha sua vila para concluir o cadastro.', 'Choose your village to complete your account setup.')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {VILLAGES.map(village => {
              const selected = selectedVillage === village.id;
              return (
                <button
                  key={village.id}
                  type="button"
                  onClick={() => selectVillage(village.id)}
                  aria-pressed={selected}
                  className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border p-3 transition ${
                    selected
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-800 shadow-md shadow-cyan-900/10'
                      : 'border-slate-200 bg-white/75 text-slate-600 hover:border-cyan-300 hover:bg-cyan-50/50'
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

          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => { playClickSound(); continueFromVillage(); }}
            disabled={!selectedVillage}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-700 py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-[0_8px_20px_rgba(2,132,199,0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('Continuar', 'Continue')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </motion.section>

        {onboardingStep === 'welcome' && pendingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-md">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="welcome-title"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-sm rounded-[32px] border border-white/90 bg-[rgba(255,255,255,0.94)] p-7 text-center text-slate-800 shadow-[0_20px_50px_rgba(0,10,30,0.16)] backdrop-blur-2xl"
            >
              <img
                src={pendingAccount.profile.photoUrl}
                alt=""
                className="mx-auto mb-4 h-20 w-20 rounded-full border-2 border-cyan-300 object-cover shadow-md shadow-cyan-900/10"
                referrerPolicy="no-referrer"
              />
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-cyan-100 bg-cyan-50 text-cyan-600">
                <Check className="h-6 w-6" />
              </div>
              <h2 id="welcome-title" className="text-2xl font-black text-slate-800">
                {t('Bem-vindo!', 'Welcome!')}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {t(`Que bom ter você aqui, ${pendingAccount.profile.name || pendingAccount.profile.username}.`, `Glad to have you here, ${pendingAccount.profile.name || pendingAccount.profile.username}.`)}
              </p>
              <p className="mt-2 text-sm font-bold text-cyan-700">
                {t(`Sua vila: ${villageName}`, `Your village: ${villageName}`)}
              </p>
              <button
                type="button"
                onClick={() => { playClickSound(); finishOnboarding(); }}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-sky-500 to-blue-700 py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-[0_8px_20px_rgba(2,132,199,0.25)] transition hover:brightness-105"
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
    <div className={`relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-[#f4f6fb] px-0 font-sans text-slate-800 select-none md:px-4 ${
      isAkatsuki
        ? 'bg-[radial-gradient(circle_at_top,#fff1f2_0%,#f4f6fb_65%,#edf0f7_100%)]'
        : 'bg-[radial-gradient(circle_at_top,#f8fdff_0%,#f4f6fb_65%,#edf0f7_100%)]'
    }`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
        <div className={`absolute -left-24 top-1/4 h-72 w-72 rounded-full blur-3xl ${isAkatsuki ? 'bg-red-300/25' : 'bg-cyan-300/25'}`} />
        <div className={`absolute -right-24 bottom-1/4 h-72 w-72 rounded-full blur-3xl ${isAkatsuki ? 'bg-rose-300/20' : 'bg-blue-300/20'}`} />
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.035]">
          {isAkatsuki ? (
            <Cloud className="h-[min(80vw,420px)] w-[min(80vw,420px)] text-red-900" />
          ) : (
            <Leaf className="h-[min(80vw,380px)] w-[min(80vw,380px)] text-slate-700" />
          )}
        </div>
        {Array.from({ length: 16 }, (_, index) => (
          <span
            key={index}
            className={`absolute h-1 w-1 rounded-full animate-pulse ${isAkatsuki ? 'bg-red-300' : index % 2 ? 'bg-cyan-300' : 'bg-blue-300'}`}
            style={{ left: `${(index * 37 + 9) % 100}%`, top: `${(index * 61 + 7) % 100}%`, animationDelay: `${(index % 5) * 300}ms` }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative z-10 my-auto flex h-screen w-full max-w-md flex-col justify-start overflow-x-hidden overflow-y-auto border border-white/85 bg-[rgba(255,255,255,0.82)] p-6 shadow-[0_20px_50px_rgba(0,10,30,0.08),0_2px_10px_rgba(0,0,0,0.03)] backdrop-blur-2xl transition-colors md:h-auto md:max-h-[96vh] md:rounded-[40px] sm:p-7 ${
          isAkatsuki ? 'ring-1 ring-red-100' : ''
        }`}
      >
        <div className="relative z-20 mb-8 flex items-center justify-between">
          {onBack ? (
            <button
              onClick={() => {
                playClickSound();
                onBack();
              }}
              className={`rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-500 shadow-sm transition hover:text-slate-900 ${isAkatsuki ? 'hover:border-red-300 hover:text-red-600' : 'hover:border-cyan-300 hover:text-cyan-700'}`}
              title={t('Voltar ao Menu', 'Back to Menu')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </button>
          ) : <span />}
          <LanguageSelector playClickSound={playClickSound} variant="pills" />
        </div>

        <div className="relative z-10 mb-9 text-center">
          <div className="relative inline-block">
            <h1 className="auth-naruto-logo text-5xl tracking-wider text-slate-800 sm:text-7xl">
              NARUTO
            </h1>
            <span className="auth-arena-tag absolute -bottom-2 right-0 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-cyan-700 transition-colors duration-500">
              MOBILE ARENA
            </span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="relative z-10 mb-4 flex justify-center gap-3">
          <button
            onClick={() => { playScrollSound(); setActiveTab('login'); setError(''); setSuccess(''); }}
            className={`relative flex-1 rounded-lg border py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'login'
                ? isAkatsuki ? 'border-red-200 bg-red-50 text-red-700 shadow-sm' : 'border-cyan-100 bg-white text-cyan-700 shadow-sm'
                : 'border-slate-200/70 bg-slate-100/80 text-slate-500 hover:text-slate-800'
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
                ? isAkatsuki ? 'border-red-200 bg-red-50 text-red-700 shadow-sm' : 'border-cyan-100 bg-white text-cyan-700 shadow-sm'
                : 'border-slate-200/70 bg-slate-100/80 text-slate-500 hover:text-slate-800'
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
              className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-xs font-mono text-red-700"
            >
              ⚠️ {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-mono text-emerald-700"
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
              className="relative z-10 space-y-3.5"
            >
              <div>
                <label className="mb-1 flex items-center text-xs font-bold text-slate-600">
                  <span className="flex items-center">
                    <ScrollText className="mr-1.5 h-4 w-4 text-slate-400" />
                    {t('ID Ninja ou e-mail', 'Ninja ID or email')}
                  </span>
                </label>
                <div className="relative">
                  <img
                    src="/static/img/icon/kakashi-icon.svg"
                    alt=""
                    aria-hidden="true"
                    className="auth-field-icon auth-login-id-icon absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
                  />
                  <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value.replace(/\s/g, ''))}
                    placeholder={t('Ex: Uzumaki_77', 'e.g. Uzumaki_77')}
                    className={`w-full rounded-2xl border border-slate-200/80 bg-slate-100/85 py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none transition ${inputFocus}`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-bold text-slate-600">
                  <span className="flex items-center">
                    <Lock className="mr-1.5 h-4 w-4 text-slate-400" />
                    {t('Senha Ninja', 'Ninja password')}
                  </span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full rounded-2xl border border-slate-200/80 bg-slate-100/85 py-3 pl-11 pr-12 text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none transition ${inputFocus}`}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? t('Ocultar senha', 'Hide password') : t('Mostrar senha', 'Show password')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700"
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

              <label className="group flex cursor-pointer select-none items-center gap-2.5 pt-1 text-xs font-medium text-slate-500 transition hover:text-slate-800">
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
                  className={`h-4 w-4 rounded border-slate-300 bg-white ${isAkatsuki ? 'accent-red-500' : 'accent-cyan-600'}`}
                />
                {t('Lembrar meu login', 'Remember my login')}
              </label>

              <div className="auth-chidori-wrap relative mt-2 w-full">
                <canvas
                  ref={authChidoriBorderCanvasRef}
                  className="auth-chidori-border-canvas"
                  aria-hidden="true"
                />
                <button
                  ref={authChidoriButtonRef}
                  type="submit"
                  disabled={loading}
                  onMouseEnter={event => event.currentTarget.parentElement?.classList.add('auth-chidori-shake')}
                  onMouseLeave={event => event.currentTarget.parentElement?.classList.remove('auth-chidori-shake')}
                  className="auth-chidori-button group relative z-10 flex w-full items-center justify-center gap-4 rounded-2xl px-3 py-2 text-center text-white disabled:cursor-wait disabled:opacity-60 sm:px-4 sm:py-2.5"
                >
                  <span className="auth-chidori-inner" aria-hidden="true">
                    <span className="auth-chidori-hover-flash" />
                  </span>
                  <span className="auth-chidori-frame" aria-hidden="true" />
                  <span className="auth-chidori-icon-wrap" aria-hidden="true">
                    <canvas ref={authChidoriIconCanvasRef} width="160" height="160" />
                  </span>
                  <span className="auth-chidori-copy">
                    <span className="auth-chidori-label">
                      {loading ? t('ENTRANDO...', 'LOGGING IN...') : t('ENTRAR NA ARENA', 'ENTER THE ARENA')}
                      <ArrowRight className="auth-chidori-arrow" aria-hidden="true" />
                    </span>
                  </span>
                </button>
                <span className="auth-chidori-aura" aria-hidden="true" />
              </div>
              <div className="mt-5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <span className="h-px flex-1 bg-slate-300/70" />
                <span>{t('ou', 'or')}</span>
                <span className="h-px flex-1 bg-slate-300/70" />
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-3 text-xs font-bold uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-white hover:shadow-md disabled:cursor-wait disabled:opacity-60"
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
              className="relative z-10 space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">
                  {t('Username Único', 'Unique Username')}
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={regUser}
                    onChange={(e) => setRegUser(e.target.value.replace(/\s/g, ''))}
                    placeholder={t('Ex: narutinho99', 'Ex: narutodev99')}
                    className={`w-full rounded-2xl border border-slate-200/80 bg-slate-100/85 py-3 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition ${inputFocus}`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">
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
                    className={`w-full rounded-2xl border border-slate-200/80 bg-slate-100/85 py-3 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition ${inputFocus}`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">
                  {t('Senha', 'Password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    placeholder={t('Digite sua senha', 'Enter your password')}
                    className={`w-full rounded-2xl border border-slate-200/80 bg-slate-100/85 py-3 pl-11 pr-12 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition ${inputFocus}`}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? t('Ocultar senha', 'Hide password') : t('Mostrar senha', 'Show password')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700"
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
                <label className="mb-2 block text-xs font-bold text-slate-600">
                  {t('Escolha seu Avatar de Perfil', 'Choose your Profile Avatar')}
                </label>
                <div className="grid grid-cols-6 gap-2 rounded-2xl border border-slate-200/70 bg-slate-100/80 p-2">
                  {AVATAR_PRESETS.map((preset) => {
                    const isSelected = selectedAvatar === preset.url;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => { playClickSound(); setSelectedAvatar(preset.url); }}
                        className={`aspect-square relative rounded-lg overflow-hidden border-2 transition cursor-pointer active:scale-90 ${
                          isSelected
                            ? isAkatsuki ? 'border-red-500 shadow shadow-red-500/50' : 'border-cyan-500 shadow shadow-cyan-500/50'
                            : 'border-transparent hover:border-slate-300'
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
                          <div className={`absolute inset-0 flex items-center justify-center ${isAkatsuki ? 'bg-red-500/10' : 'bg-cyan-500/10'}`}>
                              <div className={`h-1.5 w-1.5 rounded-full ${isAkatsuki ? 'bg-red-500' : 'bg-cyan-500'}`} />
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
              <div className="flex items-center gap-3 pt-3 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <span className="h-px flex-1 bg-slate-300/70" />
                <span>{t('ou', 'or')}</span>
                <span className="h-px flex-1 bg-slate-300/70" />
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-3 text-xs font-bold uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-cyan-200 hover:shadow-md disabled:cursor-wait disabled:opacity-60"
              >
                <img src="/static/img/icon/g-google.svg" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {loading ? t('Conectando...', 'Connecting...') : t('Entrar com Google', 'Sign in with Google')}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="relative z-10 mt-5 pt-2 text-center text-[10px] font-medium text-slate-400">
          {t('Vila da Folha • Arena Ninja', 'Hidden Leaf • Ninja Arena')}
        </div>
      </motion.div>
    </div>
  );
}
