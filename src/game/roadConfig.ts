import { RoadType } from './types';

export interface RoadClassConfig {
  type: RoadType;
  label: string;
  /** Total road width in meters (1 unit = 1 meter) */
  width: number;
  lanes: number;
  laneWidth: number;
  shoulderWidth: number;
  medianWidth: number;
  sidewalkWidth: number;
  hasMedian: boolean;
  hasSidewalk: boolean;
  hasGuardrails: boolean;
  guardrailGap: number;
  speedLimitKmh: number;
  /** Unique vertical offset per road class (in meters) to prevent z-fighting */
  yOffset: number;
  polygonOffsetFactor: number;
  tileLengthMeters: number;
  maxBankRad: number;
  minimapStroke: string;
  minimapWidth: number;
  radarWidth: number;
  minimapDash?: string;
}

/** Smooth junction shared height offset where meeting roads blend cleanly */
export const JUNCTION_Y_OFFSET = 0.085;

/** Minimum vertical separation (meters) required for grade-separated bridges/overpasses */
export const MIN_OVERPASS_CLEARANCE = 8.0;

/**
 * Single shared road configuration table (1 unit = 1 meter).
 * Used across road generation, 3D meshes, textures, guardrails, terrain lowering,
 * AI/traffic lane offsets, and minimap / full-map rendering.
 */
export const ROAD_CONFIG: Record<RoadType, RoadClassConfig> = {
  highway: {
    type: 'highway',
    label: 'Express Highway',
    width: 16, // 4 lanes × 3.5m = 14m + 0.8m median + 2×0.6m shoulders
    lanes: 4,
    laneWidth: 3.5,
    shoulderWidth: 0.6,
    medianWidth: 0.8,
    sidewalkWidth: 0,
    hasMedian: true,
    hasSidewalk: false,
    hasGuardrails: true,
    guardrailGap: 1.6,
    speedLimitKmh: 120,
    yOffset: 0.14,
    polygonOffsetFactor: -3,
    tileLengthMeters: 18,
    maxBankRad: 0.055,
    minimapStroke: '#94a3b8',
    minimapWidth: 2.8,
    radarWidth: 1.75,
  },
  main: {
    type: 'main',
    label: 'Main Road',
    width: 12, // 2 lanes each way (4 × 2.75m + 2×0.5m shoulders)
    lanes: 4,
    laneWidth: 2.75,
    shoulderWidth: 0.5,
    medianWidth: 0.3,
    sidewalkWidth: 0,
    hasMedian: false,
    hasSidewalk: false,
    hasGuardrails: true,
    guardrailGap: 1.5,
    speedLimitKmh: 90,
    yOffset: 0.12,
    polygonOffsetFactor: -2,
    tileLengthMeters: 16,
    maxBankRad: 0.05,
    minimapStroke: '#cbd5e1',
    minimapWidth: 2.2,
    radarWidth: 1.4,
  },
  coastal: {
    type: 'coastal',
    label: 'Coastal Road',
    width: 12, // 2 lanes each way matching main road geometry
    lanes: 4,
    laneWidth: 2.75,
    shoulderWidth: 0.5,
    medianWidth: 0.3,
    sidewalkWidth: 0,
    hasMedian: false,
    hasSidewalk: false,
    hasGuardrails: false,
    guardrailGap: 1.5,
    speedLimitKmh: 90,
    yOffset: 0.10,
    polygonOffsetFactor: -2,
    tileLengthMeters: 16,
    maxBankRad: 0.045,
    minimapStroke: '#38bdf8',
    minimapWidth: 2.2,
    radarWidth: 1.4,
  },
  mountain: {
    type: 'mountain',
    label: 'Mountain Road',
    width: 8, // 2 lanes + guardrails
    lanes: 2,
    laneWidth: 3.4,
    shoulderWidth: 0.6,
    medianWidth: 0.2,
    sidewalkWidth: 0,
    hasMedian: false,
    hasSidewalk: false,
    hasGuardrails: true,
    guardrailGap: 1.35,
    speedLimitKmh: 75,
    yOffset: 0.08,
    polygonOffsetFactor: -1,
    tileLengthMeters: 14,
    maxBankRad: 0.05,
    minimapStroke: '#a8845e',
    minimapWidth: 1.75,
    radarWidth: 1.15,
  },
  city: {
    type: 'city',
    label: 'City Street',
    width: 8, // 2 lanes + sidewalks beside it
    lanes: 2,
    laneWidth: 3.4,
    shoulderWidth: 0.6,
    medianWidth: 0.16,
    sidewalkWidth: 2.2,
    hasMedian: false,
    hasSidewalk: true,
    hasGuardrails: false,
    guardrailGap: 1.4,
    speedLimitKmh: 60,
    yOffset: 0.06,
    polygonOffsetFactor: -1,
    tileLengthMeters: 14,
    maxBankRad: 0, // City streets stay flat for sidewalks & plazas
    minimapStroke: '#f59e0b',
    minimapWidth: 1.75,
    radarWidth: 1.15,
  },
  dirt: {
    type: 'dirt',
    label: 'Dirt Trail',
    width: 6, // Unpaved 6m trail, no markings
    lanes: 2,
    laneWidth: 2.8,
    shoulderWidth: 0.2,
    medianWidth: 0,
    sidewalkWidth: 0,
    hasMedian: false,
    hasSidewalk: false,
    hasGuardrails: false,
    guardrailGap: 1.2,
    speedLimitKmh: 70,
    yOffset: 0.04,
    polygonOffsetFactor: 0,
    tileLengthMeters: 12,
    maxBankRad: 0.025,
    minimapStroke: '#d97706',
    minimapWidth: 1.45,
    radarWidth: 0.95,
    minimapDash: '1.8 1.2',
  },
};

export function getRoadConfig(type: RoadType): RoadClassConfig {
  return ROAD_CONFIG[type];
}
