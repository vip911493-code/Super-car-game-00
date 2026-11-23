export type GamePhase = 'title' | 'playing' | 'paused' | 'finished';

export type GameMode = 'race' | 'freeRoam';

export type RoadType = 'highway' | 'main' | 'city' | 'mountain' | 'coastal' | 'dirt';

export type NodeKind = '4way' | 't_junction' | 'roundabout' | 'highway_exit';

export type CameraMode = 0 | 1 | 2; // 0 = Dynamic Chase, 1 = Hood Cam, 2 = Far Chase

export type GraphicsQuality = 'low' | 'med' | 'high';

export type TimeOfDayMode = 'auto' | 'morning' | 'noon' | 'sunset';

export type WeatherMode = 'clear' | 'rain' | 'fog' | 'night';

export type RimStyle = 'twin5' | 'spoke5' | 'turbofan' | 'mesh';

export type SpoilerStyle = 'gt' | 'ducktail' | 'twin';

export type WindowTint = 'light' | 'smoke' | 'dark' | 'limo';

export type UpgradeLevel = 0 | 1 | 2 | 3;

export type ControlButtonSize = 'M' | 'L' | 'XL';

export interface ControlsSettings {
  buttonSize: ControlButtonSize;
  buttonOpacity: number;
}

export interface GarageState {
  coins: number;
  bodyColor: string;
  stripeColor: string;
  rimStyle: RimStyle;
  spoilerEnabled: boolean;
  spoilerStyle: SpoilerStyle;
  windowTint: WindowTint;
  engineLevel: UpgradeLevel;
  tiresLevel: UpgradeLevel;
  nitroLevel: UpgradeLevel;
}

export interface CarLivery {
  id: string;
  name: string;
  paintHex: number;
  cssColor: string;
  stripeCss: string;
  stripeHex: number;
}

export const CAR_LIVERIES: CarLivery[] = [
  {
    id: 'crimson',
    name: 'Rosso Corsa',
    paintHex: 0xd0111b,
    cssColor: '#d0111b',
    stripeHex: 0xf8fafc,
    stripeCss: '#f8fafc',
  },
  {
    id: 'cobalt',
    name: 'Apex Cobalt',
    paintHex: 0x0284c7,
    cssColor: '#0284c7',
    stripeHex: 0xfacc15,
    stripeCss: '#facc15',
  },
  {
    id: 'amber',
    name: 'Solar GT',
    paintHex: 0xea580c,
    cssColor: '#ea580c',
    stripeHex: 0x111827,
    stripeCss: '#111827',
  },
  {
    id: 'emerald',
    name: 'British Racing',
    paintHex: 0x059669,
    cssColor: '#059669',
    stripeHex: 0xfef08a,
    stripeCss: '#fef08a',
  },
  {
    id: 'pearl',
    name: 'Pearl White',
    paintHex: 0xe2e8f0,
    cssColor: '#e2e8f0',
    stripeHex: 0xef4444,
    stripeCss: '#ef4444',
  },
  {
    id: 'midnight',
    name: 'Obsidian',
    paintHex: 0x1e293b,
    cssColor: '#1e293b',
    stripeHex: 0x38bdf8,
    stripeCss: '#38bdf8',
  },
  {
    id: 'violet',
    name: 'Amethyst GT',
    paintHex: 0x7c3aed,
    cssColor: '#7c3aed',
    stripeHex: 0xfde047,
    stripeCss: '#fde047',
  },
  {
    id: 'gold',
    name: 'Champagne Gold',
    paintHex: 0xca8a04,
    cssColor: '#ca8a04',
    stripeHex: 0x0f172a,
    stripeCss: '#0f172a',
  },
];

export interface MinimapPoint {
  x: number;
  y: number;
}

export interface MinimapRoadEdge {
  id: string;
  name: string;
  type: RoadType;
  width: number;
  points: MinimapPoint[];
}

export interface MinimapNodeMarker {
  id: string;
  x: number;
  y: number;
  kind: NodeKind;
  radiusNorm: number;
  label?: string;
}

export interface MinimapZoneMarker {
  x: number;
  y: number;
  icon: string;
  label: string;
  biome: 'city' | 'highway' | 'mountain' | 'coastal' | 'offroad' | 'bridge';
}

export interface MinimapWorldData {
  fullPoints: MinimapPoint[];
  highwayPoints: MinimapPoint[];
  mountainPoints: MinimapPoint[];
  tunnelPoints: MinimapPoint[];
  coastalPoints: MinimapPoint[];
  offroadPoints: MinimapPoint[];
  offroadLoopPoints: MinimapPoint[];
  cityPoints: MinimapPoint[];
  bridgePoints: MinimapPoint[];
  networkEdges: MinimapRoadEdge[];
  networkNodes: MinimapNodeMarker[];
  railPoints?: MinimapPoint[];
  riverStart: MinimapPoint;
  riverEnd: MinimapPoint;
  lakeCenters: MinimapPoint[];
  lakeRadius: number;
  oceanCenter: MinimapPoint;
  oceanRadius: number;
  zoneMarkers: MinimapZoneMarker[];
  worldBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    spanMax: number;
  };
}

export interface MinimapRacerDot {
  name: string;
  x: number;
  y: number;
  color: string;
}

export type GpsTurnDirection =
  | 'straight'
  | 'slight_left'
  | 'slight_right'
  | 'left'
  | 'right'
  | 'roundabout'
  | 'arrive';

export interface GpsInstruction {
  direction: GpsTurnDirection;
  text: string;
  distanceMeters: number;
  roadName: string;
}

export interface HudSnapshot {
  gameMode: GameMode;
  speedKmh: number;
  gearLabel: string;
  rpmRatio: number;
  nitroRatio: number;
  isBoosting: boolean;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  leaderGapText: string | null;
  zoneLabel: string | null;
  lapTimeSec: number;
  bestLapSec: number | null;
  driftScore: number;
  activeDriftPoints: number;
  isDrifting: boolean;
  onRoad: boolean;
  surfaceType: 'asphalt' | 'dirt' | 'sand' | 'grass';
  cameraMode: CameraMode;
  bannerText: string | null;
  bannerTone: 'info' | 'best' | 'finish' | 'countdown';
  playerNormX: number;
  playerNormY: number;
  playerHeading: number;
  gpsRoutePoints: MinimapPoint[];
  gpsInstruction: GpsInstruction | null;
  aiDots: MinimapRacerDot[];
  trafficDots: MinimapRacerDot[];
  aiDebugEnabled: boolean;
  stuckRespawnCount: number;
}

export interface RaceSummary {
  didWin: boolean;
  resultHeadline: string;
  position: number;
  totalTimeSec: number;
  lapTimesSec: number[];
  bestLapSec: number | null;
  topSpeedKmh: number;
  driftScore: number;
  coinsEarned: number;
  racePrizeCoins: number;
  driftBonusCoins: number;
}

export type TouchControlKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Space'
  | 'ShiftLeft';
