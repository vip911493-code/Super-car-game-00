import { SlidersHorizontal } from 'lucide-react';
import { ControlButtonSize, ControlsSettings } from '../game/types';

interface ControlsSettingsSectionProps {
  settings: ControlsSettings;
  onUpdateSettings: (next: ControlsSettings) => void;
}

const SIZE_OPTIONS: Array<{ id: ControlButtonSize; label: string }> = [
  { id: 'M', label: 'M' },
  { id: 'L', label: 'L' },
  { id: 'XL', label: 'XL' },
];

export function ControlsSettingsSection({
  settings,
  onUpdateSettings,
}: ControlsSettingsSectionProps) {
  const opacityPct = Math.round(settings.buttonOpacity * 100);

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-slate-300">
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          Button Size
        </span>
        <div className="flex items-center gap-1">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  buttonSize: opt.id,
                })
              }
              className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition-colors cursor-pointer ${
                settings.buttonSize === opt.id
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-300 hover:text-white bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-wider uppercase text-slate-300 shrink-0">
          Opacity
        </span>
        <div className="flex items-center gap-2.5 flex-1 max-w-[180px]">
          <input
            type="range"
            min={35}
            max={100}
            step={5}
            aria-label="Touch button opacity"
            value={opacityPct}
            onChange={(e) =>
              onUpdateSettings({
                ...settings,
                buttonOpacity: Number(e.target.value) / 100,
              })
            }
            className="w-full accent-cyan-400 cursor-pointer h-1.5"
          />
          <span className="text-xs font-extrabold tabular-nums text-cyan-300 w-9 text-right">
            {opacityPct}%
          </span>
        </div>
      </div>
    </div>
  );
}
