import { Home, Play, RotateCcw } from 'lucide-react';
import { ControlsSettings, GameMode, GraphicsQuality, TimeOfDayMode, WeatherMode } from '../game/types';
import { ControlsSettingsSection } from './ControlsSettingsSection';

interface PauseModalProps {
  gameMode: GameMode;
  quality: GraphicsQuality;
  onSelectQuality: (quality: GraphicsQuality) => void;
  timeOfDay: TimeOfDayMode;
  onSelectTimeOfDay: (mode: TimeOfDayMode) => void;
  weather: WeatherMode;
  onSelectWeather: (mode: WeatherMode) => void;
  controlsSettings: ControlsSettings;
  onUpdateControlsSettings: (next: ControlsSettings) => void;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

const QUALITY_OPTIONS: Array<{ id: GraphicsQuality; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'med', label: 'Med' },
  { id: 'high', label: 'High' },
];

const WEATHER_OPTIONS: Array<{ id: WeatherMode; label: string }> = [
  { id: 'clear', label: 'Clear' },
  { id: 'rain', label: 'Rain' },
  { id: 'fog', label: 'Fog' },
  { id: 'night', label: 'Night' },
];

const TOD_OPTIONS: Array<{ id: TimeOfDayMode; label: string }> = [
  { id: 'auto', label: 'Cycle' },
  { id: 'morning', label: 'AM' },
  { id: 'noon', label: 'Noon' },
  { id: 'sunset', label: 'Sunset' },
];

export function PauseModal({
  gameMode,
  quality,
  onSelectQuality,
  timeOfDay,
  onSelectTimeOfDay,
  weather,
  onSelectWeather,
  controlsSettings,
  onUpdateControlsSettings,
  onResume,
  onRestart,
  onTitle,
}: PauseModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#04070e]/75 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]">
      <div className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-[#0a101d] border border-white/15 p-4 sm:p-5 shadow-2xl text-center">
        <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-amber-400">
          {gameMode === 'freeRoam' ? 'Free Roam Paused' : 'Race Paused'}
        </p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-black italic tracking-wider text-white">PIT STOP</h2>

        <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10">
          <span className="text-xs font-bold tracking-wider uppercase text-slate-300">Weather</span>
          <div className="flex items-center gap-1">
            {WEATHER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectWeather(opt.id)}
                className={`px-2 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  weather === opt.id
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10">
          <span className="text-xs font-bold tracking-wider uppercase text-slate-300">Time</span>
          <div className="flex items-center gap-1">
            {TOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectTimeOfDay(opt.id)}
                className={`px-2 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  timeOfDay === opt.id
                    ? 'bg-orange-400 text-slate-950'
                    : 'text-slate-300 hover:text-white bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10">
          <span className="text-xs font-bold tracking-wider uppercase text-slate-300">Graphics</span>
          <div className="flex items-center gap-1">
            {QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectQuality(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  quality === opt.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 text-left">
          <ControlsSettingsSection
            settings={controlsSettings}
            onUpdateSettings={onUpdateControlsSettings}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white font-extrabold tracking-wider uppercase text-sm cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            {gameMode === 'freeRoam' ? 'Resume Roam' : 'Resume Race'}
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-slate-100 font-bold tracking-wider uppercase text-sm cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            {gameMode === 'freeRoam' ? 'Reset Session' : 'Restart Trial'}
          </button>

          <button
            type="button"
            onClick={onTitle}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-semibold tracking-wider uppercase text-sm cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Garage &amp; Title
          </button>
        </div>
      </div>
    </div>
  );
}
