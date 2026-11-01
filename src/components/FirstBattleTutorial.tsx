import { useEffect, useState } from 'react';

interface FirstBattleTutorialProps {
  targetSelector: string | null;
  instruction: string;
  onContinue?: () => void;
  allowTargetClick?: boolean;
  allowClicksWithin?: string;
  centered?: boolean;
  topAligned?: boolean;
  lowerAligned?: boolean;
  extraLowerAligned?: boolean;
}

interface TargetBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function FirstBattleTutorial({
  targetSelector,
  instruction,
  onContinue,
  allowTargetClick = true,
  allowClicksWithin,
  centered = false,
  topAligned = false,
  lowerAligned = false,
  extraLowerAligned = false,
}: FirstBattleTutorialProps) {
  const [targetBounds, setTargetBounds] = useState<TargetBounds | null>(null);

  useEffect(() => {
    let activeTarget: HTMLElement | null = null;
    const updateTarget = () => {
      activeTarget = targetSelector
        ? Array.from(document.querySelectorAll<HTMLElement>(targetSelector)).find(element => {
          const bounds = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        }) || null
        : null;
      if (!activeTarget) {
        setTargetBounds(null);
        return;
      }

      const bounds = activeTarget.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
        activeTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      if (bounds.width && bounds.height) {
        setTargetBounds({
          top: bounds.top,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
        });
      } else {
        setTargetBounds(null);
      }
    };

    const allowTutorialControl = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[data-tutorial-control]');

    const guardClick = (event: MouseEvent) => {
      if (allowTutorialControl(event.target)) return;
      const clickedTarget = event.target instanceof Element ? event.target : null;
      if (clickedTarget && allowClicksWithin && clickedTarget.closest(allowClicksWithin)) return;
      const tutorialTarget = clickedTarget?.closest('[data-tutorial-target]');
      if (allowTargetClick && activeTarget && tutorialTarget && activeTarget.contains(tutorialTarget)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tutorial-target'],
    });
    document.addEventListener('click', guardClick, true);
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', guardClick, true);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
    };
  }, [allowClicksWithin, allowTargetClick, targetSelector]);

  const tooltipTop = targetBounds
    ? targetBounds.top + targetBounds.height / 2 > window.innerHeight * 0.55
    : false;
  const highlightedInstruction = instruction
    .split(/(Naruto Arena Mobile|gratuitamente|free-to-play|estratégia|apoiar o projeto|Tai \(verde\)|Nin \(azul\)|Gen \(branco\)|Kekkei Genkai \(vermelho\)|Uzumaki Barrage|Healing Technique|Shadow Clones|Sharingan|Rasengan|Chidori|\bNaruto\b|\bSasuke\b|\bSakura\b|\bcurar\b|\bcura\b)/gi)
    .map((part, index) => {
      if (/^(Naruto Arena Mobile|apoiar o projeto)$/i.test(part)) {
        return <span key={index} className="font-black text-orange-300">{part}</span>;
      }
      if (/^gratuitamente$/i.test(part)) {
        return <span key={index} className="font-black text-green-300">{part}</span>;
      }
      if (/^(free-to-play|estratégia)$/i.test(part)) {
        return <span key={index} className="font-black text-amber-300">{part}</span>;
      }
      if (/^(curar|cura)$/i.test(part)) {
        return <span key={index} className="font-black text-emerald-300">{part}</span>;
      }
      if (/^Tai \(verde\)$/i.test(part)) {
        return <span key={index} className="font-black text-green-300">{part}</span>;
      }
      if (/^Nin \(azul\)$/i.test(part)) {
        return <span key={index} className="font-black text-blue-300">{part}</span>;
      }
      if (/^Gen \(branco\)$/i.test(part)) {
        return <span key={index} className="font-black text-white">{part}</span>;
      }
      if (/^Kekkei Genkai \(vermelho\)$/i.test(part)) {
        return <span key={index} className="font-black text-red-300">{part}</span>;
      }
      if (/^(Uzumaki Barrage|Healing Technique|Shadow Clones|Sharingan|Rasengan|Chidori)$/i.test(part)) {
        return <span key={index} className="font-black text-amber-300">{part}</span>;
      }
      if (/^(Naruto|Sasuke|Sakura)$/i.test(part)) {
        return <span key={index} className="font-black text-orange-300">{part}</span>;
      }
      return part;
    });

  return (
    <div className="fixed inset-0 z-[2147483646] pointer-events-none" aria-live="polite">
      {targetBounds && (
        <div
          className="fixed rounded-xl border-4 border-amber-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.78),0_0_30px_rgba(251,191,36,0.9)] transition-all duration-200"
          style={{
            top: targetBounds.top - 5,
            left: targetBounds.left - 5,
            width: targetBounds.width + 10,
            height: targetBounds.height + 10,
          }}
        />
      )}
      {instruction && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Tutorial de batalha"
          className={`${onContinue ? 'pointer-events-auto' : 'pointer-events-none'} fixed mx-auto max-w-md rounded-2xl border border-white/35 bg-slate-900/45 p-4 text-center text-white shadow-[0_8px_40px_rgba(2,6,23,0.45),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-2xl ${
            centered && extraLowerAligned
              ? 'left-3 right-3 top-36 w-auto sm:left-1/2 sm:right-auto sm:w-[min(90vw,28rem)] sm:-translate-x-1/2'
              : centered && lowerAligned
                ? 'left-3 right-3 top-24 w-auto sm:left-1/2 sm:right-auto sm:w-[min(90vw,28rem)] sm:-translate-x-1/2'
                : centered
                  ? 'left-1/2 top-1/2 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2'
                  : `left-3 right-3 w-auto sm:left-1/2 sm:right-auto sm:w-[min(90vw,28rem)] sm:-translate-x-1/2 ${lowerAligned ? 'top-24' : topAligned || tooltipTop ? 'top-4' : 'bottom-4'}`
          }`}
        >
          <div className="mb-3 flex items-center gap-3 text-left">
            <img
              src="/static/img/ui/kakashi_tutorial.webp"
              alt="Kakashi, instrutor do tutorial"
              className="h-20 w-16 shrink-0 object-contain sm:h-24 sm:w-20"
            />
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-amber-300">Kakashi · Instrutor</p>
              <p className="text-sm font-semibold leading-relaxed">{highlightedInstruction}</p>
            </div>
          </div>
          {onContinue && (
            <button
              type="button"
              data-tutorial-control
              onClick={onContinue}
              className="rounded-xl border border-amber-300 bg-amber-500 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-300"
            >
              Continuar
            </button>
          )}
        </section>
      )}
    </div>
  );
}
