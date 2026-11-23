import {
  CAR_LIVERIES,
  ControlButtonSize,
  ControlsSettings,
  GarageState,
  RimStyle,
  SpoilerStyle,
  UpgradeLevel,
  WeatherMode,
  WindowTint,
} from './types';

const GARAGE_STORAGE_KEY = 'turbo-drift-garage-v1';
const WEATHER_STORAGE_KEY = 'turbo-drift-weather-v1';
const CONTROLS_STORAGE_KEY = 'turbo-drift-controls-v1';

export const DEFAULT_CONTROLS_SETTINGS: ControlsSettings = {
  buttonSize: 'M',
  buttonOpacity: 0.85,
};

export const UPGRADE_COSTS: Record<Exclude<UpgradeLevel, 0>, number> = {
  1: 150,
  2: 350,
  3: 650,
};

export const DEFAULT_GARAGE_STATE: GarageState = {
  coins: 300,
  bodyColor: CAR_LIVERIES[0].cssColor,
  stripeColor: CAR_LIVERIES[0].stripeCss,
  rimStyle: 'twin5',
  spoilerEnabled: true,
  spoilerStyle: 'gt',
  windowTint: 'dark',
  engineLevel: 0,
  tiresLevel: 0,
  nitroLevel: 0,
};

function isValidHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function clampLevel(v: unknown): UpgradeLevel {
  if (v === 1 || v === 2 || v === 3) return v;
  return 0;
}

function parseRimStyle(v: unknown): RimStyle {
  if (v === 'twin5' || v === 'spoke5' || v === 'turbofan' || v === 'mesh') return v;
  return 'twin5';
}

function parseSpoilerStyle(v: unknown): SpoilerStyle {
  if (v === 'gt' || v === 'ducktail' || v === 'twin') return v;
  return 'gt';
}

function parseWindowTint(v: unknown): WindowTint {
  if (v === 'light' || v === 'smoke' || v === 'dark' || v === 'limo') return v;
  return 'dark';
}

export function loadGarageState(): GarageState {
  try {
    const raw = window.localStorage.getItem(GARAGE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GARAGE_STATE };
    const parsed = JSON.parse(raw) as Partial<GarageState>;
    return {
      coins:
        typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) && parsed.coins >= 0
          ? Math.floor(parsed.coins)
          : DEFAULT_GARAGE_STATE.coins,
      bodyColor: isValidHexColor(parsed.bodyColor)
        ? parsed.bodyColor
        : DEFAULT_GARAGE_STATE.bodyColor,
      stripeColor: isValidHexColor(parsed.stripeColor)
        ? parsed.stripeColor
        : DEFAULT_GARAGE_STATE.stripeColor,
      rimStyle: parseRimStyle(parsed.rimStyle),
      spoilerEnabled:
        typeof parsed.spoilerEnabled === 'boolean'
          ? parsed.spoilerEnabled
          : DEFAULT_GARAGE_STATE.spoilerEnabled,
      spoilerStyle: parseSpoilerStyle(parsed.spoilerStyle),
      windowTint: parseWindowTint(parsed.windowTint),
      engineLevel: clampLevel(parsed.engineLevel),
      tiresLevel: clampLevel(parsed.tiresLevel),
      nitroLevel: clampLevel(parsed.nitroLevel),
    };
  } catch {
    return { ...DEFAULT_GARAGE_STATE };
  }
}

export function saveGarageState(state: GarageState): void {
  try {
    window.localStorage.setItem(GARAGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors on restricted contexts
  }
}

export function loadWeatherMode(): WeatherMode {
  try {
    const raw = window.localStorage.getItem(WEATHER_STORAGE_KEY);
    if (raw === 'clear' || raw === 'rain' || raw === 'fog' || raw === 'night') return raw;
  } catch {
    // Ignore storage read restrictions
  }
  return 'clear';
}

export function saveWeatherMode(mode: WeatherMode): void {
  try {
    window.localStorage.setItem(WEATHER_STORAGE_KEY, mode);
  } catch {
    // Ignore storage write restrictions
  }
}

function parseButtonSize(v: unknown): ControlButtonSize {
  if (v === 'M' || v === 'L' || v === 'XL') return v;
  return 'M';
}

export function loadControlsSettings(): ControlsSettings {
  try {
    const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTROLS_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ControlsSettings>;
    const opacity =
      typeof parsed.buttonOpacity === 'number' && Number.isFinite(parsed.buttonOpacity)
        ? Math.min(1, Math.max(0.35, parsed.buttonOpacity))
        : DEFAULT_CONTROLS_SETTINGS.buttonOpacity;
    return {
      buttonSize: parseButtonSize(parsed.buttonSize),
      buttonOpacity: opacity,
    };
  } catch {
    return { ...DEFAULT_CONTROLS_SETTINGS };
  }
}

export function saveControlsSettings(settings: ControlsSettings): void {
  try {
    window.localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write restrictions
  }
}

export function calculateRaceRewards(position: number, driftScore: number): {
  racePrizeCoins: number;
  driftBonusCoins: number;
  totalCoins: number;
} {
  const prizeTable = [400, 260, 170, 100];
  const racePrizeCoins = prizeTable[Math.max(0, Math.min(3, position - 1))] ?? 100;
  const driftBonusCoins = Math.min(450, Math.round(Math.max(0, driftScore) / 18));
  return {
    racePrizeCoins,
    driftBonusCoins,
    totalCoins: racePrizeCoins + driftBonusCoins,
  };
}

export function getPerformanceStats(garage: GarageState): {
  topSpeedPct: number;
  accelPct: number;
  gripPct: number;
  nitroPct: number;
} {
  return {
    topSpeedPct: 62 + garage.engineLevel * 12,
    accelPct: 58 + garage.engineLevel * 13,
    gripPct: 56 + garage.tiresLevel * 14,
    nitroPct: 54 + garage.nitroLevel * 15,
  };
}
