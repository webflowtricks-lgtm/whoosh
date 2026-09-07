/**
 * Utilitário de som global com throttle anti-duplicação.
 * Usa mp3 (mais compatível no mobile/desktop) e evita tocar o mesmo
 * som mais de uma vez num curto intervalo (ex.: StrictMode, double-clicks).
 */

const lastSoundTime: Record<string, number> = {};
const THROTTLE_MS = 120;
let effectsVolumeMultiplier = 1;
const LOUD_EFFECTS = new Set(['NextTurn', 'ApplySkill', 'Cancel', 'Click', 'Target', 'Death']);
const soundTemplates = new Map<string, HTMLAudioElement>();

export const setEffectsVolumeMultiplier = (value: number) => {
  effectsVolumeMultiplier = Math.max(0, Math.min(1, value));
};

/**
 * Toca um efeito sonoro pelo nome do arquivo (sem extensão).
 * @param soundName Nome do arquivo em /static/audio/<soundName>.mp3
 * @param volume Volume 0..1 (padrão 0.45)
 */
export const playGlobalSound = (soundName: string, volume = 0.45) => {
  const now = Date.now();
  if (lastSoundTime[soundName] && now - lastSoundTime[soundName] < THROTTLE_MS) {
    return;
  }
  lastSoundTime[soundName] = now;

  try {
    let template = soundTemplates.get(soundName);
    if (!template) {
      template = new Audio(`/static/audio/${soundName}.mp3`);
      template.preload = 'auto';
      soundTemplates.set(soundName, template);
      template.load();
    }
    const audio = template.cloneNode(true) as HTMLAudioElement;
    audio.currentTime = 0;
    const nativeGain = LOUD_EFFECTS.has(soundName) ? 2.5 : 1;
    audio.volume = Math.min(1, volume * nativeGain * effectsVolumeMultiplier);
    audio.play().catch(() => {
      // Autoplay ou formato bloqueado: silencioso (não polui console)
    });
  } catch {
    /* ignore */
  }
};

export const preloadGlobalSounds = (soundNames: string[]) => {
  soundNames.forEach(soundName => {
    if (soundTemplates.has(soundName)) return;
    const audio = new Audio(`/static/audio/${soundName}.mp3`);
    audio.preload = 'auto';
    soundTemplates.set(soundName, audio);
    audio.load();
  });
};

/**
 * Listener global de clique: toca `Click` em QUAISQUER elementos interativos
 * (botões, elementos com cursor-pointer, links) que não tenham sido
 * interceptados manualmente. O `sound` customizado no elemento pode
 * sobrescrever o som padrão via data-sound.
 */
let globalClickBound = false;
let globalClickSoundEnabled = () => true;
export const bindGlobalClickSound = (enabled: () => boolean) => {
  globalClickSoundEnabled = enabled;
  if (globalClickBound) return;
  globalClickBound = true;

  document.addEventListener('click', (e) => {
    if (!globalClickSoundEnabled()) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Ignora apenas campos de texto (para não soar a cada interação de digitação)
    const tag = target.tagName?.toLowerCase();
    const inputType = target instanceof HTMLInputElement ? target.type : '';
    if (tag === 'textarea' || (tag === 'input' && ['text', 'search', 'password', 'email', 'number', 'url', 'tel'].includes(inputType))) return;

    // Caminha até um elemento interativo (ou o próprio)
    let el: HTMLElement | null = target;
    let clickedInteractive = false;
    let customSound: string | null = null;

    while (el && el !== document.body) {
      const dataSound = el.getAttribute?.('data-sound');
      if (dataSound) {
        customSound = dataSound;
        clickedInteractive = true;
        break;
      }
      if (
        el.tagName?.toLowerCase() === 'button' ||
        el.tagName?.toLowerCase() === 'a' ||
        el.getAttribute?.('role') === 'button' ||
        (el.className && typeof el.className === 'string' && el.className.includes('cursor-pointer')) ||
        (el.className && typeof el.className === 'string' && el.className.includes('cursor-not-allowed'))
      ) {
        clickedInteractive = true;
        break;
      }
      el = el.parentElement;
    }

    if (!clickedInteractive) return;

    const modalAncestor = el?.closest<HTMLElement>('[class*="fixed"][class*="inset-0"]');
    if (
      modalAncestor &&
      typeof modalAncestor.className === 'string' &&
      /z-(?:50|70|\[|[1-9]\d{2,})/.test(modalAncestor.className) &&
      !modalAncestor.className.includes('-z-')
    ) {
      // Modais marcados com data-no-uah (ex.: galeria de figurinhas/cards)
      // NÃO sobrescrevem o som padrão para uah — voltam ao Click normal.
      if (!(modalAncestor as HTMLElement).hasAttribute?.('data-no-uah')) {
        customSound = customSound || 'uah';
      }
    }

    playGlobalSound(customSound || 'Click');
  });
};

let globalModalObserverBound = false;
let globalModalSoundEnabled = () => true;
export const bindGlobalModalSound = (enabled: () => boolean) => {
  globalModalSoundEnabled = enabled;
  if (globalModalObserverBound || typeof MutationObserver === 'undefined') return;
  globalModalObserverBound = true;

  const isModalRoot = (node: Node) => {
    if (!(node instanceof HTMLElement)) return false;
    const classes = node.className;
    if (typeof classes !== 'string' || !classes.includes('fixed') || !classes.includes('inset-0')) return false;
    // Background layers use negative/zero z-index; modal overlays use z-50 or above.
    return /z-(?:50|70|\[|[1-9]\d{2,})/.test(classes) && !classes.includes('-z-');
  };

  document.addEventListener('mousedown', (e) => {
    if (!globalModalSoundEnabled()) return;
    const target = e.target as HTMLElement | null;
    const modal = target?.closest<HTMLElement>('[class*="fixed"][class*="inset-0"]');
    if (!modal || !isModalRoot(modal)) return;
    // Só toca Scroll ao clicar no FUNDO do modal (fechar por backdrop).
    // Botões/interações dentro do modal já têm o próprio som (Click/uah),
    // e a abertura de modais aninhados (ex.: lightbox de figurinha) é
    // anunciada pelo MutationObserver — senão toca Scroll DUAS vezes.
    if (target === modal) {
      playGlobalSound('Scroll');
    }
  }, true);

  const observer = new MutationObserver((mutations) => {
    if (!globalModalSoundEnabled()) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (isModalRoot(node)) {
          playGlobalSound('Scroll');
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
};