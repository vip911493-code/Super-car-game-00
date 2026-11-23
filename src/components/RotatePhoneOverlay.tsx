import { Maximize2, Smartphone } from 'lucide-react';

interface RotatePhoneOverlayProps {
  onRequestLandscape: () => void;
}

export function RotatePhoneOverlay({ onRequestLandscape }: RotatePhoneOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050914]/96 text-center px-6
        pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]
        pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]"
      role="dialog"
      aria-modal="true"
      aria-label="Rotate your phone to landscape"
    >
      <div className="relative flex items-center justify-center w-28 h-28 rounded-3xl bg-white/5 border border-white/15 mb-6 shadow-2xl">
        <div className="animate-phone-rotate flex items-center justify-center text-amber-400">
          <Smartphone className="w-14 h-14 stroke-[1.75]" />
        </div>
      </div>

      <p className="text-[11px] font-extrabold tracking-[0.22em] uppercase text-amber-400">
        Landscape Mode Required
      </p>
      <h2 className="mt-2 text-2xl sm:text-3xl font-black italic tracking-wide text-white">
        ROTATE YOUR PHONE
      </h2>
      <p className="mt-2 max-w-xs text-xs sm:text-sm text-slate-300 leading-relaxed">
        The race is paused. Turn your device sideways to landscape to resume driving.
      </p>

      <button
        type="button"
        onClick={onRequestLandscape}
        className="mt-6 flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white text-xs sm:text-sm font-extrabold tracking-wider uppercase shadow-lg cursor-pointer"
      >
        <Maximize2 className="w-4 h-4" />
        Lock Landscape Fullscreen
      </button>
    </div>
  );
}
