/**
 * Utilitário de som global com throttle anti-duplicação.
 * Usa mp3 (mais compatível no mobile/desktop) e evita tocar o mesmo
 * som mais de uma vez num curto intervalo (ex.: StrictMode, double-clicks).
 */

const lastSoundTime: Record<string, number> = {};
const THROTTLE_MS = 120;
let effectsVolumeMultiplier = 1;
const LOUD_EFFECTS = new Set(['NextTurn', 'ApplySkill', 'Cancel', 'Click', 'Target']);

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
    const audio = new Audio(`/static/audio/${soundName}.mp3`);
    const nativeGain = LOUD_EFFECTS.has(soundName) ? 2.5 : 1;
    audio.volume = Math.min(1, volume * nativeGain * effectsVolumeMultiplier);
    audio.play().catch(() => {
      // Autoplay ou formato bloqueado: silencioso (não polui console)
    });
  } catch {
    /* ignore */
  }
};

/**
 * Listener global de clique: toca `Click` em QUAISQUER elementos interativos
 * (botões, elementos com cursor-pointer, links) que não tenham sido
 * interceptados manualmente. O `sound` customizado no elemento pode
 * sobrescrever o som padrão via data-sound.
 */
let globalClickBound = false;
export const bindGlobalClickSound = (enabled: () => boolean) => {
  if (globalClickBound) return;
  globalClickBound = true;

  document.addEventListener('click', (e) => {
    if (!enabled()) return;

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
      customSound = customSound || 'uah';
    }

    playGlobalSound(customSound || 'Click');
  });
};

let globalModalObserverBound = false;
export const bindGlobalModalSound = (enabled: () => boolean) => {
  if (globalModalObserverBound || typeof MutationObserver === 'undefined') return;
  globalModalObserverBound = true;

  const isModalRoot = (node: Node) => {
    if (!(node instanceof HTMLElement)) return false;
    const classes = node.className;
    if (typeof classes !== 'string' || !classes.includes('fixed') || !classes.includes('inset-0')) return false;
    // Background layers use negative/zero z-index; modal overlays use z-50 or above.
    return /z-(?:50|70|\[|[1-9]\d{2,})/.test(classes) && !classes.includes('-z-');
  };

  const observer = new MutationObserver((mutations) => {
    if (!enabled()) return;
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