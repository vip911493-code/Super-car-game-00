import { Check, Coins, Flame, Gauge, Shield, Sparkles, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { getPerformanceStats, UPGRADE_COSTS } from '../game/storage';
import {
  CAR_LIVERIES,
  GarageState,
  RimStyle,
  SpoilerStyle,
  UpgradeLevel,
  WindowTint,
} from '../game/types';

interface GarageModalProps {
  garage: GarageState;
  onUpdateGarage: (updater: (prev: GarageState) => GarageState) => void;
  onClose: () => void;
}

type GarageTab = 'style' | 'upgrades';

const RIM_OPTIONS: Array<{ id: RimStyle; label: string }> = [
  { id: 'twin5', label: 'Twin-5' },
  { id: 'spoke5', label: '5-Spoke' },
  { id: 'turbofan', label: 'Turbofan' },
  { id: 'mesh', label: 'Mesh' },
];

const SPOILER_OPTIONS: Array<{ id: SpoilerStyle; label: string }> = [
  { id: 'gt', label: 'GT Wing' },
  { id: 'ducktail', label: 'Ducktail' },
  { id: 'twin', label: 'Twin-Tier' },
];

const TINT_OPTIONS: Array<{ id: WindowTint; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'smoke', label: 'Smoke' },
  { id: 'dark', label: 'Dark' },
  { id: 'limo', label: 'Limo' },
];

export function GarageModal({ garage, onUpdateGarage, onClose }: GarageModalProps) {
  const [tab, setTab] = useState<GarageTab>('style');
  const stats = getPerformanceStats(garage);

  const buyUpgrade = (field: 'engineLevel' | 'tiresLevel' | 'nitroLevel') => {
    onUpdateGarage((prev) => {
      const current = prev[field];
      if (current >= 3) return prev;
      const nextLevel = (current + 1) as Exclude<UpgradeLevel, 0>;
      const cost = UPGRADE_COSTS[nextLevel];
      if (prev.coins < cost) return prev;
      return {
        ...prev,
        coins: prev.coins - cost,
        [field]: nextLevel,
      };
    });
  };

  const renderUpgradeRow = (
    title: string,
    subtitle: string,
    level: UpgradeLevel,
    field: 'engineLevel' | 'tiresLevel' | 'nitroLevel',
    accentClass: string,
    icon: React.ReactNode,
  ) => {
    const isMax = level >= 3;
    const nextLevel = (level + 1) as Exclude<UpgradeLevel, 0>;
    const cost = isMax ? 0 : UPGRADE_COSTS[nextLevel];
    const canAfford = !isMax && garage.coins >= cost;

    return (
      <div className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accentClass}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white">
                {title}
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((pip) => (
                  <span
                    key={pip}
                    className={`w-3.5 h-1.5 rounded-xs ${
                      level >= pip ? 'bg-amber-400' : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">{subtitle}</p>
          </div>
        </div>

        {isMax ? (
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-extrabold tracking-wider uppercase shrink-0">
            <Check className="w-3.5 h-3.5" />
            MAX
          </div>
        ) : (
          <button
            type="button"
            disabled={!canAfford}
            onClick={() => buyUpgrade(field)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-wider uppercase shrink-0 transition-colors ${
              canAfford
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                : 'bg-white/10 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            {cost}
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between pointer-events-none
        pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))]
        pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]
        sm:p-6"
    >
      {/* Top Bar: Garage Title + Coins Balance + Done Button (leaves center 3D car clear) */}
      <div className="flex items-center justify-between gap-2 pointer-events-auto">
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#090e19]/92 border border-white/15 shadow-xl">
          <Wrench className="w-4 h-4 text-amber-400" />
          <div>
            <h2 className="text-sm sm:text-base font-black italic tracking-wider text-white leading-none">
              TURBO GARAGE
            </h2>
            <p className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mt-0.5">
              Live 3D Preview
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#090e19]/92 border border-amber-400/35 text-amber-300 font-black tabular-nums text-xs sm:text-sm shadow-xl">
            <Coins className="w-4 h-4 text-amber-400" />
            {garage.coins.toLocaleString()}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white text-xs sm:text-sm font-extrabold tracking-wider uppercase shadow-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
            Done
          </button>
        </div>
      </div>

      {/* Bottom Dock: Compact Tabbed Customization & Upgrades Panel */}
      <div className="pointer-events-auto w-full max-w-2xl mx-auto rounded-2xl bg-[#090e19]/92 border border-white/15 shadow-2xl p-3 sm:p-4 max-h-[54dvh] overflow-y-auto">
        {/* Tabs */}
        <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-white/10">
          <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-white/5 border border-white/10">
            <button
              type="button"
              onClick={() => setTab('style')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-extrabold tracking-wider uppercase cursor-pointer transition-colors ${
                tab === 'style'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Body &amp; Style
            </button>
            <button
              type="button"
              onClick={() => setTab('upgrades')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-extrabold tracking-wider uppercase cursor-pointer transition-colors ${
                tab === 'upgrades'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              Upgrades
            </button>
          </div>

          {/* Mini Stat Summary Pills */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>SPD {stats.topSpeedPct}</span>
            <span>GRP {stats.gripPct}</span>
            <span>NOS {stats.nitroPct}</span>
          </div>
        </div>

        {tab === 'style' ? (
          <div className="flex flex-col gap-3">
            {/* Body Colour Picker + Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-slate-300">
                Body Paint
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <label
                  title="Custom Body Colour Picker"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-[11px] font-bold text-white cursor-pointer hover:border-amber-400"
                >
                  <input
                    type="color"
                    value={garage.bodyColor}
                    onChange={(e) =>
                      onUpdateGarage((prev) => ({
                        ...prev,
                        bodyColor: e.target.value,
                      }))
                    }
                    className="w-5 h-5 rounded-sm bg-transparent border-0 cursor-pointer p-0"
                  />
                  <span>Pick</span>
                </label>

                {CAR_LIVERIES.map((preset) => {
                  const active =
                    garage.bodyColor.toLowerCase() === preset.cssColor.toLowerCase();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.name}
                      aria-label={`Select ${preset.name} paint`}
                      onClick={() =>
                        onUpdateGarage((prev) => ({
                          ...prev,
                          bodyColor: preset.cssColor,
                          stripeColor: preset.stripeCss,
                        }))
                      }
                      className={`w-7 h-7 rounded-lg border relative overflow-hidden cursor-pointer transition-transform ${
                        active
                          ? 'border-white scale-110 ring-2 ring-amber-400/70'
                          : 'border-white/25 hover:scale-105'
                      }`}
                      style={{ backgroundColor: preset.cssColor }}
                    >
                      <span
                        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5"
                        style={{ backgroundColor: preset.stripeCss }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rim Style */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-slate-300">
                Rim Style
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {RIM_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateGarage((prev) => ({ ...prev, rimStyle: opt.id }))
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                      garage.rimStyle === opt.id
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-white/5 border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Spoiler Toggle + Style */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-slate-300">
                Spoiler
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateGarage((prev) => ({
                      ...prev,
                      spoilerEnabled: !prev.spoilerEnabled,
                    }))
                  }
                  className={`px-2.5 py-1 rounded-md text-xs font-extrabold uppercase cursor-pointer transition-colors ${
                    garage.spoilerEnabled
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-rose-500/25 border border-rose-400/40 text-rose-200'
                  }`}
                >
                  {garage.spoilerEnabled ? 'ON' : 'OFF'}
                </button>

                {SPOILER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!garage.spoilerEnabled}
                    onClick={() =>
                      onUpdateGarage((prev) => ({
                        ...prev,
                        spoilerEnabled: true,
                        spoilerStyle: opt.id,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                      !garage.spoilerEnabled
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                        : garage.spoilerStyle === opt.id
                          ? 'bg-amber-400 text-slate-950 cursor-pointer'
                          : 'bg-white/5 border border-white/10 text-slate-300 hover:text-white cursor-pointer'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Window Tint */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-slate-300">
                Window Tint
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {TINT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateGarage((prev) => ({ ...prev, windowTint: opt.id }))
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                      garage.windowTint === opt.id
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-white/5 border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Performance Stat Bars */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10">
              {[
                { label: 'Top Speed', val: stats.topSpeedPct, bar: 'bg-rose-400' },
                { label: 'Acceleration', val: stats.accelPct, bar: 'bg-amber-400' },
                { label: 'Tyre Grip', val: stats.gripPct, bar: 'bg-emerald-400' },
                { label: 'Nitro Boost', val: stats.nitroPct, bar: 'bg-cyan-400' },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    <span>{s.label}</span>
                    <span className="tabular-nums text-white">{s.val}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${s.bar}`}
                      style={{ width: `${Math.min(100, s.val)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* 3 Upgrade Tracks (3 levels each) */}
            <div className="flex flex-col gap-2">
              {renderUpgradeRow(
                'Engine',
                `Stage ${garage.engineLevel}/3 · Higher top speed & acceleration`,
                garage.engineLevel,
                'engineLevel',
                'bg-rose-500/20 text-rose-400 border border-rose-400/30',
                <Gauge className="w-4 h-4" />,
              )}
              {renderUpgradeRow(
                'Tyres',
                `Stage ${garage.tiresLevel}/3 · Stronger corner grip & wet traction`,
                garage.tiresLevel,
                'tiresLevel',
                'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30',
                <Shield className="w-4 h-4" />,
              )}
              {renderUpgradeRow(
                'Nitro',
                `Stage ${garage.nitroLevel}/3 · Larger capacity, faster refill & thrust`,
                garage.nitroLevel,
                'nitroLevel',
                'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30',
                <Flame className="w-4 h-4" />,
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
