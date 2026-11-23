import { Coins, Compass, Flag, Play, Settings, Volume2, VolumeX, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import {
  ControlsSettings,
  GameMode,
  GraphicsQuality,
  TimeOfDayMode,
  WeatherMode,
} from '../game/types';
import { ControlsSettingsSection } from './ControlsSettingsSection';

interface TitleScreenProps {
  coins: number;
  gameMode: GameMode;
  onSelectGameMode: (mode: GameMode) => void;
  quality: GraphicsQuality;
  onSelectQuality: (quality: GraphicsQuality) => void;
  timeOfDay: TimeOfDayMode;
  onSelectTimeOfDay: (mode: TimeOfDayMode) => void;
  weather: WeatherMode;
  onSelectWeather: (mode: WeatherMode) => void;
  controlsSettings: ControlsSettings;
  onUpdateControlsSettings: (next: ControlsSettings) => void;
  onOpenGarage: () => void;
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

const MODE_OPTIONS: Array<{ id: GameMode; label: string }> = [
  { id: 'race', label: 'Race' },
  { id: 'freeRoam', label: 'Free Roam' },
];

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
  { id: 'morning', label: 'Morning' },
  { id: 'noon', label: 'Noon' },
  { id: 'sunset', label: 'Sunset' },
];

export function TitleScreen({
  coins,
  gameMode,
  onSelectGameMode,
  quality,
  onSelectQuality,
  timeOfDay,
  onSelectTimeOfDay,
  weather,
  onSelectWeather,
  controlsSettings,
  onUpdateControlsSettings,
  onOpenGarage,
  onStart,
  muted,
  onToggleMute,
}: TitleScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none overflow-y-auto
        pt-[max(0.85rem,env(safe-area-inset-top))] pr-[max(0.85rem,env(safe-area-inset-right))]
        pb-[max(0.85rem,env(safe-area-inset-bottom))] pl-[max(0.85rem,env(safe-area-inset-left))]
        sm:pt-[max(1.75rem,env(safe-area-inset-top))] sm:pr-[max(2.25rem,env(safe-area-inset-right))]
        sm:pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:pl-[max(2.25rem,env(safe-area-inset-left))]
        [@media(max-height:500px)]:py-[max(0.45rem,env(safe-area-inset-top))]"
    >
      {/* Subtle top-bottom edge scrims leaving the orbiting 3D coupe centered & clear */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(6,10,18,0.72) 0%, rgba(6,10,18,0.08) 34%, rgba(6,10,18,0.08) 64%, rgba(6,10,18,0.84) 100%)',
        }}
      />

      {/* Top Row: Bespoke SVG Motorsport Title Lockup + Coins + Mute Toggle */}
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto min-w-0">
          <svg
            viewBox="0 0 460 112"
            className="w-[205px] sm:w-[360px] [@media(max-height:500px)]:w-[175px] h-auto drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
            role="img"
            aria-label="Turbo Drift"
          >
            <defs>
              <linearGradient id="td-metal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="55%" stopColor="#e2e8f0" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>
              <linearGradient id="td-accent" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="55%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#facc15" />
              </linearGradient>
            </defs>

            <polygon points="10,20 74,20 62,30 -2,30" fill="#ef4444" />
            <polygon points="4,36 52,36 42,44 -6,44" fill="#facc15" />

            <text
              x="76"
              y="46"
              fill="url(#td-metal)"
              fontFamily="Inter, Segoe UI, system-ui, sans-serif"
              fontWeight="900"
              fontStyle="italic"
              fontSize="42"
              letterSpacing="5"
            >
              TURBO
            </text>

            <text
              x="64"
              y="96"
              fill="url(#td-accent)"
              fontFamily="Inter, Segoe UI, system-ui, sans-serif"
              fontWeight="900"
              fontStyle="italic"
              fontSize="54"
              letterSpacing="6"
            >
              DRIFT
            </text>

            <rect x="278" y="84" width="144" height="5" fill="#f8fafc" opacity="0.85" />
            <rect x="278" y="84" width="48" height="5" fill="#ef4444" />
          </svg>
          <p className="mt-1 ml-1 text-[10px] sm:text-xs font-medium tracking-[0.18em] uppercase text-slate-200/85">
            City Grid · Highway · Mountain Pass · Coastal Road · Dirt Trails
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
          <button
            type="button"
            onClick={onOpenGarage}
            title="Open Garage & Coins"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0b111e]/88 border border-amber-400/35 text-amber-300 hover:bg-[#141e33] transition-colors cursor-pointer text-xs font-black tabular-nums"
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span>{coins.toLocaleString()}</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Control Button Settings"
            aria-label="Control Settings"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0b111e]/88 border border-white/15 text-slate-100 hover:bg-[#141e33] transition-colors cursor-pointer text-xs font-semibold tracking-wider uppercase"
          >
            <Settings className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0b111e]/88 border border-white/15 text-slate-100 hover:bg-[#141e33] transition-colors cursor-pointer text-xs font-semibold tracking-wider uppercase"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound'}</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Mode / Weather / Sky / Quality Selector + Garage & Start CTAs */}
      <div className="flex flex-col items-center gap-2 sm:gap-3 [@media(max-height:500px)]:gap-1.5">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#090e19]/88 border border-white/15 shadow-xl max-w-full">
          {/* Mode Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.16em] uppercase text-slate-300 mr-0.5">
              Mode
            </span>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectGameMode(opt.id)}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    gameMode === opt.id
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.id === 'race' ? (
                    <Flag className="w-3 h-3" />
                  ) : (
                    <Compass className="w-3 h-3" />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-white/15 hidden md:block" />

          {/* Weather Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.16em] uppercase text-slate-300 mr-0.5">
              Weather
            </span>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
              {WEATHER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectWeather(opt.id)}
                  className={`px-2 sm:px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    weather === opt.id
                      ? 'bg-sky-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-white/15 hidden md:block" />

          {/* Sky Cycle */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.16em] uppercase text-slate-300 mr-0.5">
              Time
            </span>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
              {TOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectTimeOfDay(opt.id)}
                  className={`px-2 sm:px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    timeOfDay === opt.id
                      ? 'bg-orange-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-white/15 hidden md:block" />

          {/* Quality */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.16em] uppercase text-slate-300 mr-0.5">
              Quality
            </span>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectQuality(opt.id)}
                  className={`px-2 sm:px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    quality === opt.id
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons: Garage + Start Race / Free Roam */}
        <div className="pointer-events-auto flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onOpenGarage}
            className="flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 [@media(max-height:500px)]:py-2 rounded-xl bg-[#0c1424]/92 hover:bg-[#16223b] border border-white/25 text-white font-extrabold tracking-[0.12em] uppercase text-sm sm:text-base shadow-xl active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            GARAGE
          </button>

          <button
            type="button"
            onClick={onStart}
            className={`flex items-center gap-2.5 sm:gap-3 px-7 sm:px-10 py-3 sm:py-3.5 [@media(max-height:500px)]:py-2 rounded-xl text-white font-black italic tracking-[0.14em] text-base sm:text-xl active:scale-[0.98] transition-transform cursor-pointer ${
              gameMode === 'freeRoam'
                ? 'bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 shadow-[0_10px_30px_rgba(20,184,166,0.45)]'
                : 'bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-[0_10px_30px_rgba(239,68,68,0.45)]'
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            {gameMode === 'freeRoam' ? 'FREE ROAM' : 'START RACE'}
          </button>
        </div>

        <p className="text-[10px] sm:text-xs font-medium tracking-wider text-slate-200/85 text-center [@media(max-height:420px)]:hidden">
          WASD / Arrows Drive · Shift Nitro · Space Drift · G / Tab Map · C Camera · R Reset · F Fullscreen
        </p>
      </div>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-40 pointer-events-auto flex items-center justify-center bg-[#04070e]/75 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#0a101d] border border-white/15 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-cyan-400">
                  Touch HUD
                </p>
                <h3 className="text-lg font-black italic tracking-wide text-white">
                  CONTROL SETTINGS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ControlsSettingsSection
              settings={controlsSettings}
              onUpdateSettings={onUpdateControlsSettings}
            />

            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white text-xs font-extrabold tracking-wider uppercase cursor-pointer"
            >
              Save &amp; Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
