import * as THREE from 'three';
import { JUNCTION_Y_OFFSET, MIN_OVERPASS_CLEARANCE, ROAD_CONFIG } from './roadConfig';
import {
  GpsInstruction,
  GpsTurnDirection,
  MinimapNodeMarker,
  MinimapPoint,
  MinimapRoadEdge,
  NodeKind,
  RoadType,
} from './types';

export interface RoadNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  z: number;
  /** Physical radius of the intersection/roundabout junction */
  radius: number;
  /** Trim distance for incoming non-continuous edges so markings stop cleanly before the plaza/ring */
  trimRadius: number;
  hasTrafficLight: boolean;
  /** Primary road tangent angle (radians) used to orient 4-way / T-junction plaza geometry */
  plazaYaw: number;
  /** Connected edge IDs */
  edgeIds: string[];
}

export interface RoadEdgeSample {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  norm: THREE.Vector3;
  y: number;
  s: number;
  halfWidth: number;
  bankRad: number;
  yOffset: number;
}

export interface RoadEdge {
  id: string;
  name: string;
  zoneLabel: string;
  type: RoadType;
  width: number;
  lanes: number;
  speedLimitKmh: number;
  fromNodeId: string;
  toNodeId: string;
  hasGuardrailLeft: boolean;
  hasGuardrailRight: boolean;
  hasSidewalk: boolean;
  isCircuit: boolean;
  /** Whether continuous centerline keeps drawing through endpoint nodes (used for outer circuit highways/ramps) */
  continuousStart: boolean;
  continuousEnd: boolean;
  length: number;
  samples: RoadEdgeSample[];
  cumDist: Float32Array;
  segmentStep: number;
}

export interface DirectionSignSpec {
  id: string;
  arrow: '➡' | '⬅' | '⬆' | '↗' | '↖';
  destination: string;
  distanceText: string;
  secondaryArrow?: '➡' | '⬅' | '⬆' | '↗' | '↖';
  secondaryDestination?: string;
  isGantry: boolean;
  roadWidth: number;
  x: number;
  y: number;
  z: number;
  /** Facing direction (world yaw of sign front normal toward oncoming traffic) */
  yaw: number;
}

export interface StreetSignSpec {
  name: string;
  roadWidth: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SpeedLimitSignSpec {
  limitText: string;
  roadWidth: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ChevronSignSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface TrafficSignalSpec {
  nodeId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Phase group 0 (N-S / primary axis) or 1 (E-W / cross axis) */
  phaseGroup: 0 | 1;
}

export interface CrosswalkSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
}

export interface LaneArrowSpec {
  kind: 'straight' | 'left' | 'right' | 'straight_right' | 'straight_left';
  roadWidth: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface NetworkNearestSample {
  edge: RoadEdge;
  sampleIndex: number;
  dist: number;
  halfWidth: number;
  onPavedSurface: boolean;
  onDirtSurface: boolean;
  groundY: number;
  slope: number;
  bankRad: number;
  tanX: number;
  tanZ: number;
  normX: number;
  normZ: number;
  lat: number;
  node: RoadNode | null;
  distToNode: number;
  zoneLabel: string | null;
}

export interface GpsRouteResult {
  worldPoints: THREE.Vector3[];
  minimapPoints: MinimapPoint[];
  instruction: GpsInstruction | null;
  totalMeters: number;
}

export interface RoadOverlapConflict {
  edgeAId: string;
  edgeBId: string;
  minDist: number;
  requiredDist: number;
  verticalClearance: number;
  worldX: number;
  worldZ: number;
}

export interface RoadNetwork {
  nodes: RoadNode[];
  nodeMap: Map<string, RoadNode>;
  edges: RoadEdge[];
  edgeMap: Map<string, RoadEdge>;
  overlapConflicts: RoadOverlapConflict[];
  /** Ordered closed-loop outer perimeter circuit spine for the 3-lap Race mode */
  circuitPoints: THREE.Vector3[];
  circuitTangents: THREE.Vector3[];
  circuitNormals: THREE.Vector3[];
  circuitYs: Float32Array;
  circuitWidths: Float32Array;
  circuitBanks: Float32Array;
  circuitCumDist: Float32Array;
  circuitTotalLength: number;
  circuitSegmentStep: number;
  circuitCount: number;
  tunnelRange: [number, number];
  bridgeIndex: number;
  bridgeFlatCount: number;
  bridgeRampCount: number;
  bridgeHeight: number;
  highwayRange: [number, number];
  mountainRange: [number, number];
  coastalRange: [number, number];
  offroadRange: [number, number];
  cityRange: [number, number];
  roundaboutRadius: number;
  roundaboutInnerRadius: number;
  directionSigns: DirectionSignSpec[];
  streetSigns: StreetSignSpec[];
  speedSigns: SpeedLimitSignSpec[];
  chevronSigns: ChevronSignSpec[];
  trafficSignals: TrafficSignalSpec[];
  crosswalks: CrosswalkSpec[];
  laneArrows: LaneArrowSpec[];
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number; spanMax: number };
  distToAnyRoadEdge: (x: number, z: number) => number;
  distToAnyRoadCenter: (x: number, z: number) => number;
  nearestOnNetwork: (x: number, z: number) => NetworkNearestSample;
  nearestCircuitIndex: (x: number, z: number, hintIdx: number) => { idx: number; dist: number };
  sampleCircuitAtDistance: (
    s: number,
    outPos: THREE.Vector3,
    outTan: THREE.Vector3,
    outNorm: THREE.Vector3,
  ) => number;
  circuitSlopeAt: (idx: number) => number;
  circuitZoneOf: (idx: number) => string | null;
  computeGpsRoute: (
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    worldToMinimap: (x: number, z: number) => { nx: number; ny: number },
  ) => GpsRouteResult;
  buildMinimapEdgesAndNodes: (
    worldToMinimap: (x: number, z: number) => { nx: number; ny: number },
  ) => { networkEdges: MinimapRoadEdge[]; networkNodes: MinimapNodeMarker[] };
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function recomputeEdgeKinematics(
  samples: RoadEdgeSample[],
  cumDist: Float32Array,
  fromNode: RoadNode,
  toNode: RoadNode,
  type: RoadType,
  isTunnelSample?: (samp: RoadEdgeSample) => boolean,
): { length: number; segmentStep: number } {
  const n = samples.length;
  const cfg = ROAD_CONFIG[type];
  let length = 0;
  cumDist[0] = 0;
  samples[0].s = 0;
  for (let i = 1; i < n; i++) {
    length += Math.hypot(
      samples[i].pos.x - samples[i - 1].pos.x,
      samples[i].pos.z - samples[i - 1].pos.z,
    );
    cumDist[i] = length;
    samples[i].s = length;
  }
  const safeLen = Math.max(1, length);

  for (let i = 0; i < n; i++) {
    const prev = samples[Math.max(0, i - 1)].pos;
    const next = samples[Math.min(n - 1, i + 1)].pos;
    const tan = samples[i].tan;
    tan.set(next.x - prev.x, 0, next.z - prev.z);
    if (tan.lengthSq() < 1e-6) tan.set(0, 0, 1);
    else tan.normalize();
    samples[i].norm.set(-tan.z, 0, tan.x);
  }

  const win = 5;
  const startFlatDist = fromNode.radius + 20;
  const endFlatDist = toNode.radius + 20;
  const blendLen = 18;
  const seamStartDist = Math.max(4, fromNode.trimRadius + 14);
  const seamEndDist = Math.max(4, toNode.trimRadius + 14);

  for (let i = 0; i < n; i++) {
    const samp = samples[i];
    const s = samp.s;
    const dEnd = safeLen - s;

    // Smooth vertical yOffset blend to JUNCTION_Y_OFFSET near shared nodes so intersections never step/z-fight
    const sWeight = smoothstep01((s - Math.max(0, fromNode.trimRadius - 2)) / Math.max(4, seamStartDist));
    const eWeight = smoothstep01((dEnd - Math.max(0, toNode.trimRadius - 2)) / Math.max(4, seamEndDist));
    const interiorFactor = Math.min(sWeight, eWeight);
    samp.yOffset = JUNCTION_Y_OFFSET + (cfg.yOffset - JUNCTION_Y_OFFSET) * interiorFactor;

    // Smooth lateral curve banking (superelevation) damped cleanly at flat junctions, bridges & tunnels
    if (cfg.maxBankRad <= 0 || samp.y > 0.25 || (isTunnelSample && isTunnelSample(samp))) {
      samp.bankRad = 0;
    } else {
      const i0 = Math.max(0, i - win);
      const i1 = Math.min(n - 1, i + win);
      const t0 = samples[i0].tan;
      const t1 = samples[i1].tan;
      const arc = Math.max(4, samples[i1].s - samples[i0].s);
      // Signed turn curvature: positive crossY means right turn (+norm is outside -> raise +norm)
      const crossY = t0.x * t1.z - t0.z * t1.x;
      const kappa = crossY / arc;
      const rawBank = THREE.MathUtils.clamp(kappa * 8.5, -cfg.maxBankRad, cfg.maxBankRad);
      const flatStart = smoothstep01((s - startFlatDist) / blendLen);
      const flatEnd = smoothstep01((dEnd - endFlatDist) / blendLen);
      samp.bankRad = rawBank * Math.min(flatStart, flatEnd);
    }
  }

  return {
    length: safeLen,
    segmentStep: safeLen / Math.max(1, n - 1),
  };
}

function buildEdgeSamples(
  curvePoints: THREE.Vector3[],
  yArr: Float32Array | null,
  sampleCount: number,
  fromNode: RoadNode,
  toNode: RoadNode,
  type: RoadType,
): { samples: RoadEdgeSample[]; cumDist: Float32Array; length: number; segmentStep: number } {
  const cfg = ROAD_CONFIG[type];
  const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.45);
  const raw = curve.getSpacedPoints(sampleCount);
  const n = raw.length;
  const cumDist = new Float32Array(n);
  const samples: RoadEdgeSample[] = [];
  for (let i = 0; i < n; i++) {
    const y = yArr ? yArr[Math.min(yArr.length - 1, i)] : raw[i].y;
    const p = raw[i].clone();
    p.y = y;
    samples.push({
      pos: p,
      tan: new THREE.Vector3(0, 0, 1),
      norm: new THREE.Vector3(-1, 0, 0),
      y,
      s: 0,
      halfWidth: cfg.width * 0.5,
      bankRad: 0,
      yOffset: cfg.yOffset,
    });
  }
  const kin = recomputeEdgeKinematics(samples, cumDist, fromNode, toNode, type);
  return {
    samples,
    cumDist,
    length: kin.length,
    segmentStep: kin.segmentStep,
  };
}

/**
 * Checks every non-junction road pair for overlap (< halfWidth A + halfWidth B) without vertical grade separation (>= 8m).
 */
export function detectRoadOverlapConflicts(
  edges: RoadEdge[],
  nodeMap: Map<string, RoadNode>,
): RoadOverlapConflict[] {
  const conflicts: RoadOverlapConflict[] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      const sharedNodes = [a.fromNodeId, a.toNodeId].filter(
        (id) => id === b.fromNodeId || id === b.toNodeId,
      );
      const req = a.width * 0.5 + b.width * 0.5;
      let minDist = Infinity;
      let bestDy = 0;
      let bestX = 0;
      let bestZ = 0;

      const strideA = Math.max(1, Math.round(2.5 / a.segmentStep));
      const strideB = Math.max(1, Math.round(2.5 / b.segmentStep));
      const junctionBuffer = Math.max(a.width, b.width) * 0.75 + 10;

      for (let ia = 0; ia < a.samples.length; ia += strideA) {
        const sa = a.samples[ia];
        let skipA = false;
        for (const nid of sharedNodes) {
          const n = nodeMap.get(nid);
          if (n && Math.hypot(sa.pos.x - n.x, sa.pos.z - n.z) < n.radius + junctionBuffer) {
            skipA = true;
            break;
          }
        }
        if (skipA) continue;

        for (let ib = 0; ib < b.samples.length; ib += strideB) {
          const sb = b.samples[ib];
          let skipB = false;
          for (const nid of sharedNodes) {
            const n = nodeMap.get(nid);
            if (n && Math.hypot(sb.pos.x - n.x, sb.pos.z - n.z) < n.radius + junctionBuffer) {
              skipB = true;
              break;
            }
          }
          if (skipB) continue;

          const dy = Math.abs(sa.y - sb.y);
          if (dy >= MIN_OVERPASS_CLEARANCE) continue;

          const d = Math.hypot(sa.pos.x - sb.pos.x, sa.pos.z - sb.pos.z);
          if (d < minDist) {
            minDist = d;
            bestDy = dy;
            bestX = (sa.pos.x + sb.pos.x) * 0.5;
            bestZ = (sa.pos.z + sb.pos.z) * 0.5;
          }
        }
      }

      if (minDist < req) {
        conflicts.push({
          edgeAId: a.id,
          edgeBId: b.id,
          minDist,
          requiredDist: req,
          verticalClearance: bestDy,
          worldX: bestX,
          worldZ: bestZ,
        });
      }
    }
  }
  return conflicts;
}

export function buildRoadNetwork(): RoadNetwork {
  // ================= 1. Base Outer Circuit Spine (Preserves Classic 3-Lap Race Route) =================
  const CIRCUIT_SEGMENTS = 1800;
  const ctrl: THREE.Vector3[] = [];
  const baseR = 420;
  const nCtrl = 20;
  for (let i = 0; i < nCtrl; i++) {
    const a = (i / nCtrl) * Math.PI * 2;
    const r =
      baseR *
      (1 + 0.34 * Math.sin(a * 3 + 0.5) + 0.18 * Math.cos(a * 2 - 0.4) + 0.09 * Math.sin(a * 5));
    let px = Math.cos(a) * r * 1.28;
    const pz = Math.sin(a) * r;
    if (i === 19 || i === 0 || i === 1) {
      px = baseR * 1.38 * 1.28;
    }
    ctrl.push(new THREE.Vector3(px, 0, pz));
  }

  const baseCurve = new THREE.CatmullRomCurve3(ctrl, true, 'catmullrom', 0.5);
  const circuitPoints = baseCurve.getSpacedPoints(CIRCUIT_SEGMENTS);
  circuitPoints.pop();
  const circuitCount = circuitPoints.length;

  const circuitTangents = circuitPoints.map((_p, i) =>
    circuitPoints[(i + 1) % circuitCount]
      .clone()
      .sub(circuitPoints[(i - 1 + circuitCount) % circuitCount])
      .normalize(),
  );
  const circuitNormals = circuitTangents.map((t) => new THREE.Vector3(-t.z, 0, t.x));

  const circuitCumDist = new Float32Array(circuitCount);
  let circuitTotalLength = 0;
  for (let i = 1; i < circuitCount; i++) {
    circuitTotalLength += circuitPoints[i].distanceTo(circuitPoints[i - 1]);
    circuitCumDist[i] = circuitTotalLength;
  }
  circuitTotalLength += circuitPoints[0].distanceTo(circuitPoints[circuitCount - 1]);
  const circuitSegmentStep = circuitTotalLength / circuitCount;

  const center = circuitPoints
    .reduce((acc, p) => acc.add(p), new THREE.Vector3())
    .multiplyScalar(1 / circuitCount);

  const circDist = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, circuitCount - d);
  };

  // Biome ranges on the outer circuit
  const HW0 = Math.floor(circuitCount * 0.92);
  const HW1 = Math.floor(circuitCount * 0.13);
  const MT0 = Math.floor(circuitCount * 0.13);
  const MT1 = Math.floor(circuitCount * 0.34);
  const T0 = Math.floor(circuitCount * 0.18);
  const T1 = Math.floor(circuitCount * 0.27);
  const CO0 = Math.floor(circuitCount * 0.34);
  const CO1 = Math.floor(circuitCount * 0.56);
  const RB = (() => {
    let best = Math.floor(circuitCount * 0.45);
    let bestCurve = 1e9;
    const cStart = Math.floor(circuitCount * 0.4);
    const cEnd = Math.floor(circuitCount * 0.52);
    for (let c = cStart; c <= cEnd; c++) {
      let w = 0;
      for (let o = -110; o <= 110; o += 10) {
        w = Math.max(w, 1 - circuitTangents[(c + o + circuitCount) % circuitCount].dot(circuitTangents[c]));
      }
      if (w < bestCurve) {
        bestCurve = w;
        best = c;
      }
    }
    return best;
  })();
  const OR0 = Math.floor(circuitCount * 0.56);
  const OR1 = Math.floor(circuitCount * 0.74);
  const C0 = Math.floor(circuitCount * 0.74);
  const C1 = Math.floor(circuitCount * 0.92);

  const BF = Math.ceil(42 / circuitSegmentStep);
  const BR = Math.ceil(115 / circuitSegmentStep);
  const BH = 8.5;
  const circuitYs = new Float32Array(circuitCount);
  for (let i = 0; i < circuitCount; i++) {
    const d = circDist(i, RB);
    circuitYs[i] = d <= BF ? BH : d < BF + BR ? BH * (1 - smoothstep01((d - BF) / BR)) : 0;
  }

  const circuitSlopeAt = (idx: number): number => {
    const iNext = (idx + 1) % circuitCount;
    const iPrev = (idx - 1 + circuitCount) % circuitCount;
    return (circuitYs[iNext] - circuitYs[iPrev]) / (2 * circuitSegmentStep);
  };

  const circuitZoneOf = (idx: number): string | null => {
    if (idx >= T0 && idx <= T1) return 'MOUNTAIN TUNNEL';
    if (idx >= MT0 && idx <= MT1) return 'MOUNTAIN PASS';
    if (circDist(idx, RB) <= BF + BR) return 'COASTAL BRIDGE';
    if (idx >= CO0 && idx <= CO1) return 'COASTAL ROAD';
    if (idx >= OR0 && idx <= OR1) return 'OFF-ROAD CANYON';
    if (idx >= C0 && idx <= C1) return 'CITY DISTRICT';
    if (idx >= HW0 || idx <= HW1) return 'EXPRESS HIGHWAY';
    return null;
  };

  // ================= 2. Define Junction Nodes Along Circuit & Interior Grid =================
  // Perimeter Node Indices (all safely on flat y = 0 ground, outside tunnel & bridge)
  const IDX_HW_SOUTH = 162; // South Highway Exit
  const IDX_MT_JCT = 262; // Mountain Pass Junction before tunnel
  const IDX_COAST_RDB = 640; // Bayshore Coastal Roundabout (before bridge)
  const IDX_CANYON_SOUTH = 1020; // South Canyon Trailhead
  const IDX_CANYON_EAST = 1245; // Canyon Interior Connector
  const IDX_CITY_WEST = 1385; // City West Ave / Circuit Crossing
  const IDX_CITY_EAST = 1580; // City East / Apex Blvd Crossing
  const IDX_HW_NORTH = 1692; // North Highway Exit

  const ROUNDABOUT_RADIUS = 24;
  const ROUNDABOUT_INNER_RADIUS = 13;

  const nodes: RoadNode[] = [];
  const nodeMap = new Map<string, RoadNode>();
  const addNode = (n: Omit<RoadNode, 'edgeIds'>): RoadNode => {
    const full: RoadNode = { ...n, edgeIds: [] };
    nodes.push(full);
    nodeMap.set(full.id, full);
    return full;
  };

  const ptYaw = (idx: number) => Math.atan2(circuitTangents[idx].x, circuitTangents[idx].z);

  const nHwSouth = addNode({
    id: 'n_hw_south',
    label: 'South Highway Exit',
    kind: 'highway_exit',
    x: circuitPoints[IDX_HW_SOUTH].x,
    y: 0,
    z: circuitPoints[IDX_HW_SOUTH].z,
    radius: 15,
    trimRadius: 12,
    hasTrafficLight: false,
    plazaYaw: ptYaw(IDX_HW_SOUTH),
  });

  const nMtJct = addNode({
    id: 'n_mt_jct',
    label: 'Mountain Pass Junction',
    kind: 't_junction',
    x: circuitPoints[IDX_MT_JCT].x,
    y: 0,
    z: circuitPoints[IDX_MT_JCT].z,
    radius: 12,
    trimRadius: 9,
    hasTrafficLight: false,
    plazaYaw: ptYaw(IDX_MT_JCT),
  });

  const nCoastRdb = addNode({
    id: 'n_coast_rdb',
    label: 'Bayshore Roundabout',
    kind: 'roundabout',
    x: circuitPoints[IDX_COAST_RDB].x,
    y: 0,
    z: circuitPoints[IDX_COAST_RDB].z,
    radius: ROUNDABOUT_RADIUS,
    trimRadius: ROUNDABOUT_RADIUS - 1,
    hasTrafficLight: false,
    plazaYaw: ptYaw(IDX_COAST_RDB),
  });

  const nCanyonSouth = addNode({
    id: 'n_canyon_south',
    label: 'Canyon South Trailhead',
    kind: 't_junction',
    x: circuitPoints[IDX_CANYON_SOUTH].x,
    y: 0,
    z: circuitPoints[IDX_CANYON_SOUTH].z,
    radius: 12,
    trimRadius: 9,
    hasTrafficLight: false,
    plazaYaw: ptYaw(IDX_CANYON_SOUTH),
  });

  const nCanyonEast = addNode({
    id: 'n_canyon_east',
    label: 'Canyon Ridge Gate',
    kind: 't_junction',
    x: circuitPoints[IDX_CANYON_EAST].x,
    y: 0,
    z: circuitPoints[IDX_CANYON_EAST].z,
    radius: 12,
    trimRadius: 9,
    hasTrafficLight: false,
    plazaYaw: ptYaw(IDX_CANYON_EAST),
  });

  const nCityWest = addNode({
    id: 'n_city_west',
    label: 'Harbor St Crossing',
    kind: '4way',
    x: circuitPoints[IDX_CITY_WEST].x,
    y: 0,
    z: circuitPoints[IDX_CITY_WEST].z,
    radius: 12,
    trimRadius: 9.5,
    hasTrafficLight: true,
    plazaYaw: ptYaw(IDX_CITY_WEST),
  });

  const nCityEast = addNode({
    id: 'n_city_east',
    label: 'Apex Blvd Crossing',
    kind: '4way',
    x: circuitPoints[IDX_CITY_EAST].x,
    y: 0,
    z: circuitPoints[IDX_CITY_EAST].z,
    radius: 12,
    trimRadius: 9.5,
    hasTrafficLight: true,
    plazaYaw: ptYaw(IDX_CITY_EAST),
  });

  const nHwNorth = addNode({
    id: 'n_hw_north',
    label: 'North Highway Exit',
    kind: 'highway_exit',
    x: circuitPoints[IDX_HW_NORTH].x,
    y: 0,
    z: circuitPoints[IDX_HW_NORTH].z,
    radius: 15,
    trimRadius: 12,
    hasTrafficLight: false,
    plazaYaw: ptYaw(IDX_HW_NORTH),
  });

  // Interior City Grid (placed cleanly south of the northern perimeter corridor so zero roads overlap) & Valley Crossroads
  const nCityNw = addNode({
    id: 'n_city_nw',
    label: 'Harbor & Civic',
    kind: '4way',
    x: 215,
    y: 0,
    z: -35,
    radius: 10,
    trimRadius: 8,
    hasTrafficLight: true,
    plazaYaw: 0,
  });

  const nCityNe = addNode({
    id: 'n_city_ne',
    label: 'Apex & Civic',
    kind: '4way',
    x: 430,
    y: 0,
    z: -25,
    radius: 10,
    trimRadius: 8,
    hasTrafficLight: true,
    plazaYaw: 0,
  });

  const nCitySw = addNode({
    id: 'n_city_sw',
    label: 'Harbor & Metro',
    kind: '4way',
    x: 215,
    y: 0,
    z: 105,
    radius: 10,
    trimRadius: 8,
    hasTrafficLight: true,
    plazaYaw: 0,
  });

  const nCitySe = addNode({
    id: 'n_city_se',
    label: 'Apex & Metro',
    kind: '4way',
    x: 430,
    y: 0,
    z: 105,
    radius: 10,
    trimRadius: 8,
    hasTrafficLight: true,
    plazaYaw: 0,
  });

  const nCentralCross = addNode({
    id: 'n_central_cross',
    label: 'Valley Crossroads',
    kind: '4way',
    x: 25,
    y: 0,
    z: 145,
    radius: 12,
    trimRadius: 9,
    hasTrafficLight: false,
    plazaYaw: 0,
  });

  // Outward Canyon Dirt Camp node
  const outNormalAt = (idx: number) => {
    const p = circuitPoints[idx];
    const n = circuitNormals[idx].clone();
    if (n.dot(center.clone().sub(p)) > 0) n.negate();
    return n;
  };
  const midCanyonIdx = Math.floor((IDX_CANYON_SOUTH + IDX_CANYON_EAST) / 2);
  const campPos = circuitPoints[midCanyonIdx].clone().addScaledVector(outNormalAt(midCanyonIdx), 155);
  const nDirtCamp = addNode({
    id: 'n_dirt_camp',
    label: 'Canyon Outpost',
    kind: 't_junction',
    x: campPos.x,
    y: 0,
    z: campPos.z,
    radius: 11,
    trimRadius: 8.5,
    hasTrafficLight: false,
    plazaYaw: 0,
  });

  // ================= 3. Build All Connected Road Edges (Driven by Shared ROAD_CONFIG) =================
  const edges: RoadEdge[] = [];
  const edgeMap = new Map<string, RoadEdge>();

  const registerEdge = (edge: RoadEdge) => {
    edges.push(edge);
    edgeMap.set(edge.id, edge);
    nodeMap.get(edge.fromNodeId)?.edgeIds.push(edge.id);
    nodeMap.get(edge.toNodeId)?.edgeIds.push(edge.id);
  };

  // Helper: slice outer circuit cleanly between two perimeter indices (handling wrap-around)
  const sliceCircuitEdge = (
    id: string,
    name: string,
    zoneLabel: string,
    type: RoadType,
    startIdx: number,
    endIdx: number,
    fromNode: RoadNode,
    toNode: RoadNode,
    opts: {
      speedLimitKmh?: number;
      hasGuardrailLeft?: boolean;
      hasGuardrailRight?: boolean;
      hasSidewalk?: boolean;
      continuousStart?: boolean;
      continuousEnd?: boolean;
    } = {},
  ) => {
    const cfg = ROAD_CONFIG[type];
    const span = endIdx >= startIdx ? endIdx - startIdx : circuitCount - startIdx + endIdx;
    const samples: RoadEdgeSample[] = [];
    const cumDist = new Float32Array(span + 1);
    const circuitIndices: number[] = [];
    for (let s = 0; s <= span; s++) {
      const k = (startIdx + s) % circuitCount;
      circuitIndices.push(k);
      const p = circuitPoints[k].clone();
      p.y = circuitYs[k];
      samples.push({
        pos: p,
        tan: circuitTangents[k].clone(),
        norm: circuitNormals[k].clone(),
        y: circuitYs[k],
        s: 0,
        halfWidth: cfg.width * 0.5,
        bankRad: 0,
        yOffset: cfg.yOffset,
      });
    }
    const kin = recomputeEdgeKinematics(
      samples,
      cumDist,
      fromNode,
      toNode,
      type,
      (samp) => {
        const dx = samp.pos.x - circuitPoints[T0].x;
        const dz = samp.pos.z - circuitPoints[T0].z;
        void dx;
        void dz;
        return false;
      },
    );
    // Disable curve banking inside the mountain tunnel range [T0..T1]
    for (let s = 0; s <= span; s++) {
      const k = circuitIndices[s];
      if (k >= T0 - 4 && k <= T1 + 4) {
        samples[s].bankRad = 0;
      }
    }
    registerEdge({
      id,
      name,
      zoneLabel,
      type,
      width: cfg.width,
      lanes: cfg.lanes,
      speedLimitKmh: opts.speedLimitKmh ?? cfg.speedLimitKmh,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      hasGuardrailLeft: opts.hasGuardrailLeft ?? cfg.hasGuardrails,
      hasGuardrailRight: opts.hasGuardrailRight ?? cfg.hasGuardrails,
      hasSidewalk: opts.hasSidewalk ?? cfg.hasSidewalk,
      isCircuit: true,
      continuousStart: opts.continuousStart ?? true,
      continuousEnd: opts.continuousEnd ?? true,
      length: kin.length,
      samples,
      cumDist,
      segmentStep: kin.segmentStep,
    });
  };

  // 3A. The 8 Perimeter Circuit Edges (forming a seamless loop)
  sliceCircuitEdge(
    'e_hw_main',
    'Express Highway',
    'EXPRESS HIGHWAY',
    'highway',
    IDX_HW_NORTH,
    IDX_HW_SOUTH,
    nHwNorth,
    nHwSouth,
    { speedLimitKmh: 120, continuousStart: true, continuousEnd: true },
  );
  sliceCircuitEdge(
    'e_hw_south_link',
    'South Ridge Highway',
    'EXPRESS HIGHWAY',
    'highway',
    IDX_HW_SOUTH,
    IDX_MT_JCT,
    nHwSouth,
    nMtJct,
    { speedLimitKmh: 110, continuousStart: true, continuousEnd: true },
  );
  sliceCircuitEdge(
    'e_mountain_pass',
    'Mountain Tunnel Pass',
    'MOUNTAIN PASS',
    'mountain',
    IDX_MT_JCT,
    IDX_COAST_RDB,
    nMtJct,
    nCoastRdb,
    { speedLimitKmh: 80, continuousStart: true, continuousEnd: false },
  );
  sliceCircuitEdge(
    'e_coastal_bridge',
    'Coastal Bay Bridge',
    'COASTAL BRIDGE',
    'coastal',
    IDX_COAST_RDB,
    IDX_CANYON_SOUTH,
    nCoastRdb,
    nCanyonSouth,
    { speedLimitKmh: 90, hasGuardrailLeft: true, hasGuardrailRight: true, continuousStart: false, continuousEnd: true },
  );
  sliceCircuitEdge(
    'e_canyon_west',
    'Canyon Coast Road',
    'OFF-ROAD CANYON',
    'main',
    IDX_CANYON_SOUTH,
    IDX_CANYON_EAST,
    nCanyonSouth,
    nCanyonEast,
    { speedLimitKmh: 90, hasGuardrailLeft: false, hasGuardrailRight: false, continuousStart: true, continuousEnd: true },
  );
  sliceCircuitEdge(
    'e_canyon_north',
    'Canyon North Road',
    'OFF-ROAD CANYON',
    'main',
    IDX_CANYON_EAST,
    IDX_CITY_WEST,
    nCanyonEast,
    nCityWest,
    { speedLimitKmh: 90, hasGuardrailLeft: false, hasGuardrailRight: false, continuousStart: true, continuousEnd: false },
  );
  sliceCircuitEdge(
    'e_city_boulevard',
    'Civic Ring Ave',
    'CITY DISTRICT',
    'city',
    IDX_CITY_WEST,
    IDX_CITY_EAST,
    nCityWest,
    nCityEast,
    { speedLimitKmh: 70, hasGuardrailLeft: false, hasGuardrailRight: false, hasSidewalk: true, continuousStart: false, continuousEnd: false },
  );
  sliceCircuitEdge(
    'e_city_hw_ramp',
    'North Highway Link',
    'EXPRESS HIGHWAY',
    'highway',
    IDX_CITY_EAST,
    IDX_HW_NORTH,
    nCityEast,
    nHwNorth,
    { speedLimitKmh: 110, continuousStart: false, continuousEnd: true },
  );

  // Taper halfWidth smoothly across continuous circuit width transitions (e.g. 16m highway -> 8m mountain)
  for (const node of nodes) {
    if (node.kind === 'roundabout' || node.kind === '4way') continue;
    const connectedCircuit = node.edgeIds
      .map((id) => edgeMap.get(id)!)
      .filter((e) => e && e.isCircuit);
    if (connectedCircuit.length !== 2) continue;
    const [eA, eB] = connectedCircuit;
    if (Math.abs(eA.width - eB.width) < 0.5) continue;
    const midHalfW = (eA.width + eB.width) * 0.25;
    const taperLen = 22;
    for (const ce of connectedCircuit) {
      const atStart = ce.fromNodeId === node.id;
      const baseHalfW = ce.width * 0.5;
      for (const samp of ce.samples) {
        const dist = atStart ? samp.s : ce.length - samp.s;
        if (dist < taperLen) {
          const t = smoothstep01(dist / taperLen);
          samp.halfWidth = midHalfW + (baseHalfW - midHalfW) * t;
        }
      }
    }
  }

  // Helper: build smooth spline branch edge connecting two RoadNodes
  const addSplineEdge = (
    id: string,
    name: string,
    zoneLabel: string,
    type: RoadType,
    fromNode: RoadNode,
    toNode: RoadNode,
    waypoints: THREE.Vector3[],
    opts: {
      speedLimitKmh?: number;
      hasGuardrailLeft?: boolean;
      hasGuardrailRight?: boolean;
      hasSidewalk?: boolean;
      hillPeak?: number;
      sampleStepMeters?: number;
    } = {},
  ) => {
    const cfg = ROAD_CONFIG[type];
    const rawPts = [
      new THREE.Vector3(fromNode.x, 0, fromNode.z),
      ...waypoints,
      new THREE.Vector3(toNode.x, 0, toNode.z),
    ];
    let approxLen = 0;
    for (let i = 1; i < rawPts.length; i++) {
      approxLen += rawPts[i].distanceTo(rawPts[i - 1]);
    }
    const step = opts.sampleStepMeters ?? 2.6;
    const count = Math.max(24, Math.ceil(approxLen / step));
    const yArr = new Float32Array(count + 1);
    if (opts.hillPeak) {
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        yArr[i] = opts.hillPeak * Math.sin(t * Math.PI) ** 1.6;
      }
    }
    const built = buildEdgeSamples(rawPts, yArr, count, fromNode, toNode, type);
    registerEdge({
      id,
      name,
      zoneLabel,
      type,
      width: cfg.width,
      lanes: cfg.lanes,
      speedLimitKmh: opts.speedLimitKmh ?? cfg.speedLimitKmh,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      hasGuardrailLeft: opts.hasGuardrailLeft ?? cfg.hasGuardrails,
      hasGuardrailRight: opts.hasGuardrailRight ?? cfg.hasGuardrails,
      hasSidewalk: opts.hasSidewalk ?? cfg.hasSidewalk,
      isCircuit: false,
      continuousStart: false,
      continuousEnd: false,
      length: built.length,
      samples: built.samples,
      cumDist: built.cumDist,
      segmentStep: built.segmentStep,
    });
  };

  // 3B. City District Grid Streets (4-way crossings, sidewalks, crosswalks, traffic signals)
  // Harbor St (North-South West City Street): nCityWest -> nCityNw -> nCitySw
  addSplineEdge(
    'e_harbor_north',
    'Harbor St',
    'CITY DISTRICT',
    'city',
    nCityWest,
    nCityNw,
    [
      new THREE.Vector3(145, 0, -240),
      new THREE.Vector3(200, 0, -135),
    ],
    { hasSidewalk: true },
  );
  addSplineEdge(
    'e_harbor_south',
    'Harbor St',
    'CITY DISTRICT',
    'city',
    nCityNw,
    nCitySw,
    [new THREE.Vector3(215, 0, 35)],
    { hasSidewalk: true },
  );

  // Apex Blvd (North-South East City Street): nCityEast -> nCityNe -> nCitySe
  addSplineEdge(
    'e_apex_north',
    'Apex Blvd',
    'CITY DISTRICT',
    'city',
    nCityEast,
    nCityNe,
    [new THREE.Vector3(414, 0, -85)],
    { hasSidewalk: true },
  );
  addSplineEdge(
    'e_apex_south',
    'Apex Blvd',
    'CITY DISTRICT',
    'city',
    nCityNe,
    nCitySe,
    [new THREE.Vector3(430, 0, 40)],
    { hasSidewalk: true },
  );

  // Civic Ave (East-West Upper City Street): nCityNw -> nCityNe -> Highway North Exit Ramp
  addSplineEdge(
    'e_civic_ave',
    'Civic Ave',
    'CITY DISTRICT',
    'city',
    nCityNw,
    nCityNe,
    [new THREE.Vector3(322, 0, -30)],
    { hasSidewalk: true },
  );
  addSplineEdge(
    'e_ramp_hw_north',
    'North Exit Ramp',
    'EXPRESS HIGHWAY',
    'city',
    nCityNe,
    nHwNorth,
    [
      new THREE.Vector3(545, 0, -20),
      new THREE.Vector3(615, 0, -55),
    ],
    { speedLimitKmh: 80, hasSidewalk: false, hasGuardrailLeft: true, hasGuardrailRight: true },
  );

  // Metro Way (East-West Lower City Street) & South Highway Ramp
  addSplineEdge(
    'e_metro_way',
    'Metro Way',
    'CITY DISTRICT',
    'city',
    nCitySw,
    nCitySe,
    [new THREE.Vector3(322, 0, 105)],
    { hasSidewalk: true },
  );
  addSplineEdge(
    'e_ramp_hw_south',
    'South Exit Ramp',
    'EXPRESS HIGHWAY',
    'city',
    nCitySe,
    nHwSouth,
    [
      new THREE.Vector3(530, 0, 135),
      new THREE.Vector3(605, 0, 210),
    ],
    { speedLimitKmh: 80, hasSidewalk: false, hasGuardrailLeft: true, hasGuardrailRight: true },
  );

  // 3C. Cross-Map Coastal & Mountain Interior Roads
  // Bayshore Blvd (Coastal Roundabout -> Valley Crossroads -> Harbor & Metro)
  addSplineEdge(
    'e_bayshore_west',
    'Bayshore Blvd',
    'COASTAL ROAD',
    'coastal',
    nCoastRdb,
    nCentralCross,
    [
      new THREE.Vector3(-303, 0, 289),
      new THREE.Vector3(-220, 0, 222),
      new THREE.Vector3(-105, 0, 175),
    ],
    { speedLimitKmh: 80, hasGuardrailLeft: false, hasGuardrailRight: false },
  );
  addSplineEdge(
    'e_bayshore_east',
    'Bayshore Blvd',
    'CITY DISTRICT',
    'city',
    nCentralCross,
    nCitySw,
    [new THREE.Vector3(120, 0, 125)],
    { speedLimitKmh: 70, hasSidewalk: true },
  );

  // Summit Ridge Mountain Road (Mountain Pass Junction -> Scenic North Ridge -> Valley Crossroads, cleanly clear of Tunnel & Pass)
  addSplineEdge(
    'e_summit_pass',
    'Summit Ridge Rd',
    'MOUNTAIN PASS',
    'mountain',
    nMtJct,
    nCentralCross,
    [
      new THREE.Vector3(355, 0, 225),
      new THREE.Vector3(225, 0, 195),
      new THREE.Vector3(115, 0, 180),
    ],
    { speedLimitKmh: 70, hasGuardrailLeft: true, hasGuardrailRight: true, hillPeak: 7.5 },
  );

  // 3D. Unpaved Off-Road Dirt Roads (No Markings)
  // 1. Canyon Dirt Trail (loop outside the canyon road through Canyon Outpost)
  addSplineEdge(
    'e_dirt_canyon_west',
    'Canyon Dirt Trail',
    'OFF-ROAD CANYON',
    'dirt',
    nCanyonSouth,
    nDirtCamp,
    [
      new THREE.Vector3(nCanyonSouth.x - 65, 0, nCanyonSouth.z - 75),
      new THREE.Vector3(campPos.x - 80, 0, campPos.z + 45),
    ],
  );
  addSplineEdge(
    'e_dirt_canyon_east',
    'Canyon Dirt Trail',
    'OFF-ROAD CANYON',
    'dirt',
    nDirtCamp,
    nCanyonEast,
    [
      new THREE.Vector3(campPos.x + 80, 0, campPos.z - 20),
      new THREE.Vector3(nCanyonEast.x - 20, 0, nCanyonEast.z - 80),
    ],
  );

  // 2. Mesa Dirt Shortcut (Canyon Ridge Gate -> Valley Crossroads across the central valley!)
  addSplineEdge(
    'e_dirt_mesa',
    'Mesa Dirt Trail',
    'OFF-ROAD CANYON',
    'dirt',
    nCanyonEast,
    nCentralCross,
    [
      new THREE.Vector3(nCanyonEast.x - 10, 0, nCanyonEast.z + 95),
      new THREE.Vector3(45, 0, -145),
      new THREE.Vector3(15, 0, -25),
    ],
  );

  // ================= 3E. Automated Road Overlap Detection & Resolution =================
  const PRIORITY: Record<RoadType, number> = {
    highway: 6,
    main: 5,
    coastal: 4,
    city: 3,
    mountain: 2,
    dirt: 1,
  };
  const edgePriority = (e: RoadEdge) => (e.isCircuit ? 100 : 0) + PRIORITY[e.type];

  const overlapConflicts = detectRoadOverlapConflicts(edges, nodeMap);
  if (overlapConflicts.length > 0) {
    for (const conflict of overlapConflicts) {
      console.warn(
        `[RoadNetwork] Road overlap detected between "${conflict.edgeAId}" and "${conflict.edgeBId}" ` +
          `(distance=${conflict.minDist.toFixed(2)}m < required=${conflict.requiredDist.toFixed(2)}m, ` +
          `dy=${conflict.verticalClearance.toFixed(2)}m) near (${conflict.worldX.toFixed(1)}, ${conflict.worldZ.toFixed(1)})`,
      );
    }

    // Attempt lateral relocation first; delete redundant/unresolvable lower-priority edge if overlap remains
    let remaining = [...overlapConflicts];
    for (let pass = 0; pass < 2 && remaining.length > 0; pass++) {
      const c = remaining[0];
      const eA = edgeMap.get(c.edgeAId);
      const eB = edgeMap.get(c.edgeBId);
      if (!eA || !eB) break;

      const victim = edgePriority(eA) >= edgePriority(eB) ? eB : eA;
      const anchor = victim === eA ? eB : eA;
      let resolvedByMove = false;

      if (!victim.isCircuit) {
        const req = anchor.width * 0.5 + victim.width * 0.5 + 4.0;
        const fromN = nodeMap.get(victim.fromNodeId)!;
        const toN = nodeMap.get(victim.toNodeId)!;
        const sharedIds = new Set(
          [anchor.fromNodeId, anchor.toNodeId].filter(
            (id) => id === victim.fromNodeId || id === victim.toNodeId,
          ),
        );

        let movedAny = false;
        const nSamp = victim.samples.length;
        for (let idx = 2; idx < nSamp - 2; idx++) {
          const vs = victim.samples[idx];
          let nearShared = false;
          for (const nid of sharedIds) {
            const nd = nodeMap.get(nid);
            if (nd && Math.hypot(vs.pos.x - nd.x, vs.pos.z - nd.z) < nd.radius + 18) {
              nearShared = true;
              break;
            }
          }
          if (nearShared) continue;

          let bestSq = Infinity;
          let bestAx = 0;
          let bestAz = 0;
          for (let j = 0; j < anchor.samples.length; j += 2) {
            const as = anchor.samples[j];
            if (Math.abs(as.y - vs.y) >= MIN_OVERPASS_CLEARANCE) continue;
            const dx = vs.pos.x - as.pos.x;
            const dz = vs.pos.z - as.pos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < bestSq) {
              bestSq = dSq;
              bestAx = as.pos.x;
              bestAz = as.pos.z;
            }
          }
          const d = Math.sqrt(bestSq);
          if (d < req) {
            const push = req - d;
            const ux = d > 0.05 ? (vs.pos.x - bestAx) / d : vs.norm.x;
            const uz = d > 0.05 ? (vs.pos.z - bestAz) / d : vs.norm.z;
            // Smooth falloff so spline endpoints stay anchored
            const edgeFade = Math.min(idx / 8, (nSamp - 1 - idx) / 8, 1);
            vs.pos.x += ux * push * edgeFade;
            vs.pos.z += uz * push * edgeFade;
            movedAny = true;
          }
        }
        if (movedAny) {
          recomputeEdgeKinematics(victim.samples, victim.cumDist, fromN, toN, victim.type);
          const checkPair = detectRoadOverlapConflicts([anchor, victim], nodeMap);
          if (checkPair.length === 0) resolvedByMove = true;
        }
      }

      if (!resolvedByMove && !victim.isCircuit) {
        const idx = edges.indexOf(victim);
        if (idx >= 0) edges.splice(idx, 1);
        edgeMap.delete(victim.id);
        for (const nid of [victim.fromNodeId, victim.toNodeId]) {
          const nd = nodeMap.get(nid);
          if (nd) nd.edgeIds = nd.edgeIds.filter((id) => id !== victim.id);
        }
      }
      remaining = detectRoadOverlapConflicts(edges, nodeMap);
    }
  }

  // Compute closed-loop circuit width & bank arrays synced to final perimeter edges
  const circuitWidths = new Float32Array(circuitCount);
  const circuitBanks = new Float32Array(circuitCount);
  for (let i = 0; i < circuitCount; i++) {
    circuitWidths[i] = ROAD_CONFIG.main.width;
    circuitBanks[i] = 0;
  }
  const perimeterMap: Array<[string, number, number]> = [
    ['e_hw_main', IDX_HW_NORTH, IDX_HW_SOUTH],
    ['e_hw_south_link', IDX_HW_SOUTH, IDX_MT_JCT],
    ['e_mountain_pass', IDX_MT_JCT, IDX_COAST_RDB],
    ['e_coastal_bridge', IDX_COAST_RDB, IDX_CANYON_SOUTH],
    ['e_canyon_west', IDX_CANYON_SOUTH, IDX_CANYON_EAST],
    ['e_canyon_north', IDX_CANYON_EAST, IDX_CITY_WEST],
    ['e_city_boulevard', IDX_CITY_WEST, IDX_CITY_EAST],
    ['e_city_hw_ramp', IDX_CITY_EAST, IDX_HW_NORTH],
  ];
  for (const [eid, startIdx, endIdx] of perimeterMap) {
    const edge = edgeMap.get(eid);
    if (!edge) continue;
    const span = endIdx >= startIdx ? endIdx - startIdx : circuitCount - startIdx + endIdx;
    for (let s = 0; s <= span && s < edge.samples.length; s++) {
      const k = (startIdx + s) % circuitCount;
      circuitWidths[k] = edge.samples[s].halfWidth * 2;
      circuitBanks[k] = edge.samples[s].bankRad;
    }
  }

  // ================= 4. Compute Bounds & Spatial Grid for Zero-Clearance Checking =================
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const edge of edges) {
    for (const s of edge.samples) {
      if (s.pos.x < minX) minX = s.pos.x;
      if (s.pos.x > maxX) maxX = s.pos.x;
      if (s.pos.z < minZ) minZ = s.pos.z;
      if (s.pos.z > maxZ) maxZ = s.pos.z;
    }
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const spanMax = Math.max(spanX, spanZ);

  const CELL = 36;
  interface GridRoadPoint {
    edgeIdx: number;
    sampleIdx: number;
    x: number;
    z: number;
    halfW: number;
  }
  const roadGrid = new Map<string, GridRoadPoint[]>();
  const addGridPt = (gp: GridRoadPoint) => {
    const cx = Math.floor(gp.x / CELL);
    const cz = Math.floor(gp.z / CELL);
    const key = `${cx},${cz}`;
    let arr = roadGrid.get(key);
    if (!arr) {
      arr = [];
      roadGrid.set(key, arr);
    }
    arr.push(gp);
  };

  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    for (let si = 0; si < e.samples.length; si++) {
      const samp = e.samples[si];
      addGridPt({
        edgeIdx: ei,
        sampleIdx: si,
        x: samp.pos.x,
        z: samp.pos.z,
        halfW: samp.halfWidth,
      });
    }
  }

  function distToAnyRoadEdge(x: number, z: number): number {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let bestEdgeDist = Infinity;

    // Check roundabout ring & central island plaza
    for (const n of nodes) {
      const dn = Math.hypot(x - n.x, z - n.z) - (n.kind === 'roundabout' ? n.radius + 6 : n.radius);
      if (dn < bestEdgeDist) bestEdgeDist = dn;
    }

    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const arr = roadGrid.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const g = arr[i];
          const d = Math.hypot(g.x - x, g.z - z) - g.halfW;
          if (d < bestEdgeDist) bestEdgeDist = d;
        }
      }
    }
    if (bestEdgeDist < Infinity) return bestEdgeDist;

    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      const hw = e.width * 0.5;
      for (let si = 0; si < e.samples.length; si += 3) {
        const p = e.samples[si].pos;
        const d = Math.hypot(p.x - x, p.z - z) - hw;
        if (d < bestEdgeDist) bestEdgeDist = d;
      }
    }
    return bestEdgeDist;
  }

  function distToAnyRoadCenter(x: number, z: number): number {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let bestSq = Infinity;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const arr = roadGrid.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const g = arr[i];
          const ddx = g.x - x;
          const ddz = g.z - z;
          const dSq = ddx * ddx + ddz * ddz;
          if (dSq < bestSq) bestSq = dSq;
        }
      }
    }
    if (bestSq < Infinity) return Math.sqrt(bestSq);
    for (const e of edges) {
      for (let si = 0; si < e.samples.length; si += 2) {
        const p = e.samples[si].pos;
        const dSq = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (dSq < bestSq) bestSq = dSq;
      }
    }
    return Math.sqrt(bestSq);
  }

  function nearestOnNetwork(x: number, z: number): NetworkNearestSample {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let bestEdge = edges[0];
    let bestSampleIdx = 0;
    let bestScore = Infinity;
    let bestDist = Infinity;

    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const arr = roadGrid.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const g = arr[i];
          const d = Math.hypot(g.x - x, g.z - z);
          const marginDist = d - g.halfW;
          if (marginDist < bestScore) {
            bestScore = marginDist;
            bestDist = d;
            bestEdge = edges[g.edgeIdx];
            bestSampleIdx = g.sampleIdx;
          }
        }
      }
    }

    if (bestScore === Infinity) {
      for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        const hw = e.width * 0.5;
        for (let si = 0; si < e.samples.length; si += 2) {
          const p = e.samples[si].pos;
          const d = Math.hypot(p.x - x, p.z - z);
          const marginDist = d - hw;
          if (marginDist < bestScore) {
            bestScore = marginDist;
            bestDist = d;
            bestEdge = e;
            bestSampleIdx = si;
          }
        }
      }
    }

    // Check proximity to junction nodes / roundabouts
    let nearestNode: RoadNode | null = null;
    let distToNode = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(x - n.x, z - n.z);
      if (d < distToNode) {
        distToNode = d;
        nearestNode = n;
      }
    }

    const sArr = bestEdge.samples;
    const samp = sArr[bestSampleIdx];
    const iPrev = Math.max(0, bestSampleIdx - 1);
    const iNext = Math.min(sArr.length - 1, bestSampleIdx + 1);
    const ds = Math.max(0.5, sArr[iNext].s - sArr[iPrev].s);
    const slope = (sArr[iNext].y - sArr[iPrev].y) / ds;

    const halfW = samp.halfWidth ?? bestEdge.width * 0.5;
    const lat = (x - samp.pos.x) * samp.norm.x + (z - samp.pos.z) * samp.norm.z;

    const inPlaza = nearestNode !== null && distToNode < nearestNode.radius + 1.5;
    const inRoundaboutRing =
      nearestNode !== null &&
      nearestNode.kind === 'roundabout' &&
      distToNode >= ROUNDABOUT_INNER_RADIUS - 0.5 &&
      distToNode <= ROUNDABOUT_RADIUS + 6;

    const onDirtEdge = bestEdge.type === 'dirt';
    const onPaved =
      inRoundaboutRing ||
      (inPlaza && nearestNode?.kind !== 'roundabout') ||
      (!onDirtEdge && bestDist < halfW + 1.4);
    const onDirt = onDirtEdge && bestDist < halfW + 1.5 && !inPlaza;
    const clampedLatForBank = THREE.MathUtils.clamp(lat, -halfW, halfW);
    const bankLift = samp.bankRad !== 0 ? clampedLatForBank * Math.sin(samp.bankRad) : 0;

    return {
      edge: bestEdge,
      sampleIndex: bestSampleIdx,
      dist: bestDist,
      halfWidth: halfW,
      onPavedSurface: onPaved,
      onDirtSurface: onDirt,
      groundY: bestDist < halfW + 4.5 ? samp.y + bankLift : 0,
      slope: bestDist < halfW + 4.5 ? slope : 0,
      bankRad: bestDist < halfW + 4.5 ? samp.bankRad : 0,
      tanX: samp.tan.x,
      tanZ: samp.tan.z,
      normX: samp.norm.x,
      normZ: samp.norm.z,
      lat,
      node: nearestNode,
      distToNode,
      zoneLabel: bestEdge.zoneLabel,
    };
  }

  function nearestCircuitIndex(x: number, z: number, hintIdx: number): { idx: number; dist: number } {
    let bestSq = 1e12;
    let bestIdx = hintIdx;

    for (let o = -55; o <= 55; o++) {
      const i = (hintIdx + o + circuitCount) % circuitCount;
      const dx = circuitPoints[i].x - x;
      const dz = circuitPoints[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestSq) {
        bestSq = d;
        bestIdx = i;
      }
    }

    if (bestSq > 70 * 70) {
      bestSq = 1e12;
      for (let i = 0; i < circuitCount; i++) {
        const dx = circuitPoints[i].x - x;
        const dz = circuitPoints[i].z - z;
        const d = dx * dx + dz * dz;
        if (d < bestSq) {
          bestSq = d;
          bestIdx = i;
        }
      }
    }

    return { idx: bestIdx, dist: Math.sqrt(bestSq) };
  }

  function sampleCircuitAtDistance(
    s: number,
    outPos: THREE.Vector3,
    outTan: THREE.Vector3,
    outNorm: THREE.Vector3,
  ): number {
    let wrapped = s % circuitTotalLength;
    if (wrapped < 0) wrapped += circuitTotalLength;

    let lo = 0;
    let hi = circuitCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (circuitCumDist[mid] <= wrapped) lo = mid;
      else hi = mid - 1;
    }

    const next = (lo + 1) % circuitCount;
    const segStart = circuitCumDist[lo];
    const segEnd = next === 0 ? circuitTotalLength : circuitCumDist[next];
    const segLen = Math.max(0.0001, segEnd - segStart);
    const alpha = THREE.MathUtils.clamp((wrapped - segStart) / segLen, 0, 1);

    outPos.lerpVectors(circuitPoints[lo], circuitPoints[next], alpha);
    outPos.y = circuitYs[lo] + (circuitYs[next] - circuitYs[lo]) * alpha;
    outTan.lerpVectors(circuitTangents[lo], circuitTangents[next], alpha).normalize();
    outNorm.set(-outTan.z, 0, outTan.x);
    return lo;
  }

  // ================= 5. Signs, Crosswalks, Lane Arrows, Traffic Lights =================
  const directionSigns: DirectionSignSpec[] = [];
  const streetSigns: StreetSignSpec[] = [];
  const speedSigns: SpeedLimitSignSpec[] = [];
  const chevronSigns: ChevronSignSpec[] = [];
  const trafficSignals: TrafficSignalSpec[] = [];
  const crosswalks: CrosswalkSpec[] = [];
  const laneArrows: LaneArrowSpec[] = [];

  const getEdgeOutgoingDirAtNode = (edge: RoadEdge, nodeId: string): THREE.Vector3 => {
    if (edge.fromNodeId === nodeId) {
      return edge.samples[Math.min(4, edge.samples.length - 1)].tan.clone();
    }
    const idx = Math.max(0, edge.samples.length - 5);
    return edge.samples[idx].tan.clone().negate();
  };

  const formatDist = (m: number): string => {
    const rounded = Math.max(50, Math.round(m / 50) * 50);
    return `${rounded} m`;
  };

  // Destination label hints along edges
  const destLabelFor = (edge: RoadEdge, fromNodeId: string): string => {
    const otherId = edge.fromNodeId === fromNodeId ? edge.toNodeId : edge.fromNodeId;
    if (edge.id.includes('hw') || edge.id.includes('ramp')) return 'Highway';
    if (edge.id.includes('bayshore') || edge.id.includes('coastal')) return 'Coast Road';
    if (edge.id.includes('summit') || edge.id.includes('mountain')) return 'Mountain Pass';
    if (edge.id.includes('dirt') || edge.id.includes('canyon')) return 'Canyon Trail';
    if (edge.id.includes('city') || edge.id.includes('harbor') || edge.id.includes('apex') || edge.id.includes('civic') || edge.id.includes('metro')) {
      return 'City Center';
    }
    return nodeMap.get(otherId)?.label ?? edge.name;
  };

  const classifyTurnArrow = (
    incomingTan: THREE.Vector3,
    outgoingTan: THREE.Vector3,
  ): '➡' | '⬅' | '⬆' | '↗' | '↖' => {
    const dot = THREE.MathUtils.clamp(incomingTan.dot(outgoingTan), -1, 1);
    // In XZ plane: +norm = (-tan.z, 0, tan.x). Wait: let's check left vs right in world space!
    // Heading f = (sin(h), cos(h)), Right = (-cos(h), sin(h))? Wait: in engine.ts:
    // fx = sin(h), fz = cos(h); rx = cos(h), rz = -sin(h) -> camera looks toward +f, so right-hand screen side has rx = cos(h), rz = -sin(h) -> Wait:
    // Let's check cross product in Three.js Y-up: f x up = (fz, 0, -fx). Wait: for h=0 (f=(0,0,1)), screen right is -X!
    // Wait: in engine.ts line 1689: rx = cos(h), rz = -sin(h). At h=0, rx=+1 (which is LEFT when camera behind looking toward +Z!).
    // Wait: let's double check! At h=0, target = (0, 3, -8) looking at (0, 1, +6.5). Up is +Y. Cross(forward(0,0,1), up(0,1,0)) = (-1, 0, 0).
    // That means in Three.js camera space looking along tan = (tx, 0, tz):
    // SCREEN RIGHT vector is (-tz, 0, tx), which equals our `norm` vector (-t.z, 0, t.x)!!
    // Let's verify: t = (0, 0, 1) -> norm = (-1, 0, 0) = SCREEN RIGHT! Yes!!
    const norm = new THREE.Vector3(-incomingTan.z, 0, incomingTan.x);
    const rightness = outgoingTan.dot(norm);
    if (dot > 0.78) return '⬆';
    if (rightness > 0.25) return dot > 0.25 ? '↗' : '➡';
    if (rightness < -0.25) return dot > 0.25 ? '↖' : '⬅';
    return rightness >= 0 ? '↗' : '↖';
  };

  // Place roadside / gantry direction signs, crosswalks, lane arrows, and traffic signals around every junction
  for (const edge of edges) {
    // Check both arrival ends of each edge (drivers can drive both ways on non-highway/all roads)
    const endpoints: Array<{ arrivalAtTo: boolean; node: RoadNode }> = [
      { arrivalAtTo: true, node: nodeMap.get(edge.toNodeId)! },
      { arrivalAtTo: false, node: nodeMap.get(edge.fromNodeId)! },
    ];

    for (const ep of endpoints) {
      const node = ep.node;
      if (!node || node.edgeIds.length < 2) continue;

      // Sample along this edge approaching `node`
      const approachDist = node.kind === 'roundabout' ? 78 : 68;
      const targetS = ep.arrivalAtTo ? Math.max(24, edge.length - approachDist) : Math.min(edge.length - 24, approachDist);

      // Find nearest sample to targetS
      let sIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < edge.samples.length; i++) {
        const d = Math.abs(edge.samples[i].s - targetS);
        if (d < bestDiff) {
          bestDiff = d;
          sIdx = i;
        }
      }

      const samp = edge.samples[sIdx];
      // Approach travel tangent (pointing toward node)
      const travelTan = ep.arrivalAtTo ? samp.tan.clone() : samp.tan.clone().negate();
      // Right-hand side vector in screen space (forward x up = (-tz, 0, tx))
      const rightVec = new THREE.Vector3(-travelTan.z, 0, travelTan.x);

      // Collect outgoing branch choices at `node` (excluding self)
      const otherEdges = node.edgeIds
        .filter((id) => id !== edge.id)
        .map((id) => edgeMap.get(id)!)
        .filter(Boolean);

      if (otherEdges.length > 0 && edge.type !== 'dirt') {
        // Pick primary and secondary destination labels
        const ranked = otherEdges
          .map((oe) => {
            const outDir = getEdgeOutgoingDirAtNode(oe, node.id);
            return {
              edge: oe,
              arrow: classifyTurnArrow(travelTan, outDir),
              dest: destLabelFor(oe, node.id),
              straightScore: travelTan.dot(outDir),
            };
          })
          .sort((a, b) => b.straightScore - a.straightScore);

        const primary = ranked[0];
        const secondary = ranked.find((r) => r.dest !== primary.dest && r.arrow !== primary.arrow) ?? ranked[1];

        const distBeforeNode = ep.arrivalAtTo ? edge.length - samp.s : samp.s;
        const isGantry =
          edge.type === 'highway' &&
          (node.kind === 'highway_exit' || edge.width >= ROAD_CONFIG.highway.width);

        const latOffset = isGantry ? 0 : edge.width * 0.5 + 2.6;
        const sx = samp.pos.x + rightVec.x * latOffset;
        const sz = samp.pos.z + rightVec.z * latOffset;

        // Ensure roadside sign itself clears all roads cleanly
        if (isGantry || distToAnyRoadEdge(sx, sz) >= 2.2) {
          // Face oncoming traffic (front face +Z rotated by yaw -> points -travelTan)
          const signYaw = Math.atan2(-travelTan.x, -travelTan.z);
          directionSigns.push({
            id: `sign_${edge.id}_${node.id}`,
            arrow: primary.arrow,
            destination: primary.dest,
            distanceText: formatDist(distBeforeNode),
            secondaryArrow: secondary?.arrow,
            secondaryDestination: secondary?.dest,
            isGantry,
            roadWidth: edge.width,
            x: sx,
            y: samp.y,
            z: sz,
            yaw: signYaw,
          });
        }
      }

      // Crosswalks & Lane Arrows right before city / 4-way / T-junction / roundabout entries
      if (edge.type !== 'dirt' && node.kind !== 'highway_exit') {
        const stopBack = node.trimRadius + 2.8;
        const stopTargetS = ep.arrivalAtTo ? edge.length - stopBack : stopBack;
        if (stopTargetS > 12 && stopTargetS < edge.length - 12) {
          let cwIdx = 0;
          let cwDiff = Infinity;
          for (let i = 0; i < edge.samples.length; i++) {
            const d = Math.abs(edge.samples[i].s - stopTargetS);
            if (d < cwDiff) {
              cwDiff = d;
              cwIdx = i;
            }
          }
          const cwS = edge.samples[cwIdx];
          const yaw = Math.atan2(travelTan.x, travelTan.z);
          if (node.hasTrafficLight || edge.type === 'city') {
            crosswalks.push({
              x: cwS.pos.x,
              y: cwS.y,
              z: cwS.pos.z,
              yaw,
              width: edge.width - 1.2,
            });
          }

          // Lane Turn Arrow painted ~16m before crosswalk on right-hand approach lane
          const arrowBack = node.trimRadius + 18;
          const arrowTargetS = ep.arrivalAtTo ? edge.length - arrowBack : arrowBack;
          if (arrowTargetS > 10 && arrowTargetS < edge.length - 10) {
            let arIdx = 0;
            let arDiff = Infinity;
            for (let i = 0; i < edge.samples.length; i++) {
              const d = Math.abs(edge.samples[i].s - arrowTargetS);
              if (d < arDiff) {
                arDiff = d;
                arIdx = i;
              }
            }
            const arS = edge.samples[arIdx];
            const laneShift = edge.width * 0.24;
            let hasLeft = false;
            let hasRight = false;
            let hasStraight = false;
            for (const oe of otherEdges) {
              const outDir = getEdgeOutgoingDirAtNode(oe, node.id);
              const arr = classifyTurnArrow(travelTan, outDir);
              if (arr === '⬆') hasStraight = true;
              else if (arr === '⬅' || arr === '↖') hasLeft = true;
              else if (arr === '➡' || arr === '↗') hasRight = true;
            }
            const arrowKind: LaneArrowSpec['kind'] =
              hasStraight && hasRight
                ? 'straight_right'
                : hasStraight && hasLeft
                  ? 'straight_left'
                  : hasRight && !hasStraight && !hasLeft
                    ? 'right'
                    : hasLeft && !hasStraight && !hasRight
                      ? 'left'
                      : 'straight';

            laneArrows.push({
              kind: arrowKind,
              roadWidth: edge.width,
              x: arS.pos.x + rightVec.x * laneShift,
              y: arS.y,
              z: arS.pos.z + rightVec.z * laneShift,
              yaw,
            });
          }
        }
      }
    }

    // Highway speed limit signs every ~320m on highway edges
    if (edge.type === 'highway') {
      for (let s = 140; s < edge.length - 100; s += 320) {
        let idx = 0;
        let bd = Infinity;
        for (let i = 0; i < edge.samples.length; i++) {
          const d = Math.abs(edge.samples[i].s - s);
          if (d < bd) {
            bd = d;
            idx = i;
          }
        }
        const sp = edge.samples[idx];
        const rightV = new THREE.Vector3(-sp.tan.z, 0, sp.tan.x);
        const sx = sp.pos.x + rightV.x * (edge.width * 0.5 + 2.6);
        const sz = sp.pos.z + rightV.z * (edge.width * 0.5 + 2.6);
        if (distToAnyRoadEdge(sx, sz) >= 2.2) {
          speedSigns.push({
            limitText: String(edge.speedLimitKmh),
            roadWidth: edge.width,
            x: sx,
            y: sp.y,
            z: sz,
            yaw: Math.atan2(-sp.tan.x, -sp.tan.z),
          });
        }
      }
    }

    // Yellow Chevron curve signs (`>>>`) on sharp bends of paved edges
    if (edge.type !== 'dirt') {
      const n = edge.samples.length;
      for (let i = 10; i < n - 10; i += 20) {
        const s0 = edge.samples[Math.max(0, i - 6)];
        const s1 = edge.samples[Math.min(n - 1, i + 6)];
        const crossY = s0.tan.x * s1.tan.z - s0.tan.z * s1.tan.x;
        if (Math.abs(crossY) > 0.12) {
          const sp = edge.samples[i];
          const outerSide = crossY > 0 ? 1 : -1;
          const lat = edge.width * 0.5 + 3.2;
          const sx = sp.pos.x + sp.norm.x * outerSide * lat;
          const sz = sp.pos.z + sp.norm.z * outerSide * lat;
          if (distToAnyRoadEdge(sx, sz) >= 2.8) {
            chevronSigns.push({
              x: sx,
              y: sp.y,
              z: sz,
              yaw: Math.atan2(sp.tan.x, sp.tan.z) + (outerSide < 0 ? Math.PI : 0),
            });
          }
        }
      }
    }
  }

  // City Traffic Lights & Corner Street Name Plates
  for (const node of nodes) {
    if (!node.hasTrafficLight) continue;
    const cornerOff = node.radius - 1.5;
    const cYaw = node.plazaYaw;
    const corners = [
      { dx: cornerOff, dz: cornerOff, yaw: cYaw + Math.PI, phaseGroup: 0 as const },
      { dx: -cornerOff, dz: -cornerOff, yaw: cYaw, phaseGroup: 0 as const },
      { dx: -cornerOff, dz: cornerOff, yaw: cYaw + Math.PI * 0.5, phaseGroup: 1 as const },
      { dx: cornerOff, dz: -cornerOff, yaw: cYaw - Math.PI * 0.5, phaseGroup: 1 as const },
    ];
    for (const c of corners) {
      const cosY = Math.cos(cYaw);
      const sinY = Math.sin(cYaw);
      const wx = node.x + c.dx * cosY + c.dz * sinY;
      const wz = node.z - c.dx * sinY + c.dz * cosY;
      trafficSignals.push({
        nodeId: node.id,
        x: wx,
        y: node.y,
        z: wz,
        yaw: c.yaw,
        phaseGroup: c.phaseGroup,
      });
    }

    // Place 2 readable street name signs per city crossing
    const firstEdge = edgeMap.get(node.edgeIds[0]);
    const secondEdge = edgeMap.get(node.edgeIds[1]);
    if (firstEdge) {
      streetSigns.push({
        name: firstEdge.name,
        roadWidth: firstEdge.width,
        x: node.x + cornerOff,
        y: node.y,
        z: node.z + cornerOff,
        yaw: cYaw,
      });
    }
    if (secondEdge && secondEdge.name !== firstEdge?.name) {
      streetSigns.push({
        name: secondEdge.name,
        roadWidth: secondEdge.width,
        x: node.x - cornerOff,
        y: node.y,
        z: node.z - cornerOff,
        yaw: cYaw + Math.PI * 0.5,
      });
    }
  }

  // ================= 6. Dijkstra Shortest-Path GPS Router =================
  interface VirtualEdgeProj {
    edge: RoadEdge;
    sampleIdx: number;
    s: number;
    point: THREE.Vector3;
  }

  const projectOntoNetworkEdge = (x: number, z: number): VirtualEdgeProj => {
    let bestEdge = edges[0];
    let bestIdx = 0;
    let bestSq = Infinity;
    for (const e of edges) {
      for (let i = 0; i < e.samples.length; i += 2) {
        const p = e.samples[i].pos;
        const dSq = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (dSq < bestSq) {
          bestSq = dSq;
          bestEdge = e;
          bestIdx = i;
        }
      }
    }
    const samp = bestEdge.samples[bestIdx];
    return {
      edge: bestEdge,
      sampleIdx: bestIdx,
      s: samp.s,
      point: samp.pos.clone(),
    };
  };

  function computeGpsRoute(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    worldToMinimap: (x: number, z: number) => { nx: number; ny: number },
  ): GpsRouteResult {
    const straightDist = Math.hypot(toX - fromX, toZ - fromZ);
    if (straightDist < 28) {
      return {
        worldPoints: [new THREE.Vector3(fromX, 0.2, fromZ), new THREE.Vector3(toX, 0.2, toZ)],
        minimapPoints: [],
        instruction: {
          direction: 'arrive',
          text: 'Arrived at destination',
          distanceMeters: Math.round(straightDist),
          roadName: '',
        },
        totalMeters: straightDist,
      };
    }

    const startProj = projectOntoNetworkEdge(fromX, fromZ);
    const endProj = projectOntoNetworkEdge(toX, toZ);

    // Build transient adjacency graph with virtual '__start__' and '__end__' vertices
    interface AdjLink {
      to: string;
      cost: number;
      physLen: number;
      edgeId: string;
      reverse: boolean;
      startIdx: number;
      endIdx: number;
    }
    const adj = new Map<string, AdjLink[]>();
    const addLink = (from: string, link: AdjLink) => {
      let arr = adj.get(from);
      if (!arr) {
        arr = [];
        adj.set(from, arr);
      }
      arr.push(link);
    };

    for (const e of edges) {
      const weightMult = e.type === 'dirt' ? 1.35 : e.type === 'highway' ? 0.92 : 1.0;
      const c = e.length * weightMult;
      const last = e.samples.length - 1;
      addLink(e.fromNodeId, {
        to: e.toNodeId,
        cost: c,
        physLen: e.length,
        edgeId: e.id,
        reverse: false,
        startIdx: 0,
        endIdx: last,
      });
      addLink(e.toNodeId, {
        to: e.fromNodeId,
        cost: c,
        physLen: e.length,
        edgeId: e.id,
        reverse: true,
        startIdx: last,
        endIdx: 0,
      });
    }

    // Same-edge direct connection if start & end share the exact same edge
    if (startProj.edge.id === endProj.edge.id) {
      const e = startProj.edge;
      const d = Math.abs(endProj.s - startProj.s);
      addLink('__start__', {
        to: '__end__',
        cost: d,
        physLen: d,
        edgeId: e.id,
        reverse: endProj.sampleIdx < startProj.sampleIdx,
        startIdx: startProj.sampleIdx,
        endIdx: endProj.sampleIdx,
      });
    }

    // Connect '__start__' to both ends of startProj.edge
    {
      const e = startProj.edge;
      const last = e.samples.length - 1;
      const dTo = e.length - startProj.s;
      const dFrom = startProj.s;
      addLink('__start__', {
        to: e.toNodeId,
        cost: dTo,
        physLen: dTo,
        edgeId: e.id,
        reverse: false,
        startIdx: startProj.sampleIdx,
        endIdx: last,
      });
      addLink('__start__', {
        to: e.fromNodeId,
        cost: dFrom,
        physLen: dFrom,
        edgeId: e.id,
        reverse: true,
        startIdx: startProj.sampleIdx,
        endIdx: 0,
      });
    }

    // Connect both ends of endProj.edge to '__end__'
    {
      const e = endProj.edge;
      const last = e.samples.length - 1;
      const dFromStart = endProj.s;
      const dFromEnd = e.length - endProj.s;
      addLink(e.fromNodeId, {
        to: '__end__',
        cost: dFromStart,
        physLen: dFromStart,
        edgeId: e.id,
        reverse: false,
        startIdx: 0,
        endIdx: endProj.sampleIdx,
      });
      addLink(e.toNodeId, {
        to: '__end__',
        cost: dFromEnd,
        physLen: dFromEnd,
        edgeId: e.id,
        reverse: true,
        startIdx: last,
        endIdx: endProj.sampleIdx,
      });
    }

    // Run Dijkstra
    const distMap = new Map<string, number>();
    const prevLink = new Map<string, { from: string; link: AdjLink }>();
    const visited = new Set<string>();
    distMap.set('__start__', 0);

    const allVertices = ['__start__', '__end__', ...nodes.map((n) => n.id)];
    for (let iter = 0; iter < allVertices.length; iter++) {
      let u: string | null = null;
      let uDist = Infinity;
      for (const v of allVertices) {
        if (visited.has(v)) continue;
        const d = distMap.get(v) ?? Infinity;
        if (d < uDist) {
          uDist = d;
          u = v;
        }
      }
      if (!u || u === '__end__' || uDist === Infinity) break;
      visited.add(u);

      const neighbors = adj.get(u) ?? [];
      for (const link of neighbors) {
        const alt = uDist + link.cost;
        if (alt < (distMap.get(link.to) ?? Infinity)) {
          distMap.set(link.to, alt);
          prevLink.set(link.to, { from: u, link });
        }
      }
    }

    // Reconstruct path
    const chosenLinks: AdjLink[] = [];
    let cur = '__end__';
    while (cur !== '__start__') {
      const step = prevLink.get(cur);
      if (!step) break;
      chosenLinks.push(step.link);
      cur = step.from;
    }
    chosenLinks.reverse();

    if (chosenLinks.length === 0) {
      return {
        worldPoints: [new THREE.Vector3(fromX, 0.2, fromZ), new THREE.Vector3(toX, 0.2, toZ)],
        minimapPoints: [
          { x: worldToMinimap(fromX, fromZ).nx * 100, y: worldToMinimap(fromX, fromZ).ny * 100 },
          { x: worldToMinimap(toX, toZ).nx * 100, y: worldToMinimap(toX, toZ).ny * 100 },
        ],
        instruction: {
          direction: 'straight',
          text: `Head toward pin (${Math.round(straightDist)} m)`,
          distanceMeters: Math.round(straightDist),
          roadName: '',
        },
        totalMeters: straightDist,
      };
    }

    const worldPoints: THREE.Vector3[] = [];
    let totalMeters = 0;
    for (const link of chosenLinks) {
      totalMeters += link.physLen;
      const e = edgeMap.get(link.edgeId)!;
      const stepDir = link.endIdx >= link.startIdx ? 1 : -1;
      for (let i = link.startIdx; ; i += stepDir) {
        const samp = e.samples[i];
        worldPoints.push(new THREE.Vector3(samp.pos.x, samp.y + 0.14, samp.pos.z));
        if (i === link.endIdx) break;
      }
    }

    const minimapPoints: MinimapPoint[] = [];
    const stride = Math.max(1, Math.floor(worldPoints.length / 64));
    for (let i = 0; i < worldPoints.length; i += stride) {
      const m = worldToMinimap(worldPoints[i].x, worldPoints[i].z);
      minimapPoints.push({ x: m.nx * 100, y: m.ny * 100 });
    }
    if (worldPoints.length > 0) {
      const lastP = worldPoints[worldPoints.length - 1];
      const m = worldToMinimap(lastP.x, lastP.z);
      minimapPoints.push({ x: m.nx * 100, y: m.ny * 100 });
    }

    // Derive next-turn prompt from chosenLinks
    let instruction: GpsInstruction;
    if (chosenLinks.length === 1) {
      const mDist = Math.max(10, Math.round(chosenLinks[0].physLen / 10) * 10);
      const roadName = edgeMap.get(chosenLinks[0].edgeId)?.name ?? 'Road';
      instruction = {
        direction: 'straight',
        text: mDist <= 35 ? 'Arriving at destination' : `Continue on ${roadName} (${mDist} m)`,
        distanceMeters: mDist,
        roadName,
      };
    } else {
      // Find the first junction turn where road name or tangent noticeably changes
      const l0 = chosenLinks[0];
      const l1 = chosenLinks[1];
      const e0 = edgeMap.get(l0.edgeId)!;
      const e1 = edgeMap.get(l1.edgeId)!;
      const t0 = e0.samples[l0.endIdx].tan.clone().multiplyScalar(l0.reverse ? -1 : 1);
      const t1 = e1.samples[l1.startIdx].tan.clone().multiplyScalar(l1.reverse ? -1 : 1);
      const nodeAtTurn = nodeMap.get(l0.reverse ? e0.fromNodeId : e0.toNodeId);
      const mDist = Math.max(10, Math.round(l0.physLen / 10) * 10);

      let dir: GpsTurnDirection = 'straight';
      let verb = 'Continue straight';
      if (nodeAtTurn?.kind === 'roundabout') {
        dir = 'roundabout';
        verb = `Enter roundabout onto ${e1.name}`;
      } else {
        const arr = classifyTurnArrow(t0, t1);
        if (arr === '➡') {
          dir = 'right';
          verb = `Turn right onto ${e1.name}`;
        } else if (arr === '↗') {
          dir = 'slight_right';
          verb = `Bear right onto ${e1.name}`;
        } else if (arr === '⬅') {
          dir = 'left';
          verb = `Turn left onto ${e1.name}`;
        } else if (arr === '↖') {
          dir = 'slight_left';
          verb = `Bear left onto ${e1.name}`;
        } else {
          dir = 'straight';
          verb = `Keep straight onto ${e1.name}`;
        }
      }

      instruction = {
        direction: dir,
        text: `${verb} in ${mDist} m`,
        distanceMeters: mDist,
        roadName: e1.name,
      };
    }

    return { worldPoints, minimapPoints, instruction, totalMeters };
  }

  function buildMinimapEdgesAndNodes(
    worldToMinimap: (x: number, z: number) => { nx: number; ny: number },
  ): { networkEdges: MinimapRoadEdge[]; networkNodes: MinimapNodeMarker[] } {
    const networkEdges: MinimapRoadEdge[] = edges.map((e) => {
      const pts: MinimapPoint[] = [];
      const stride = Math.max(1, Math.floor(e.samples.length / 26));
      for (let i = 0; i < e.samples.length; i += stride) {
        const m = worldToMinimap(e.samples[i].pos.x, e.samples[i].pos.z);
        pts.push({ x: m.nx * 100, y: m.ny * 100 });
      }
      const last = e.samples[e.samples.length - 1].pos;
      const lm = worldToMinimap(last.x, last.z);
      pts.push({ x: lm.nx * 100, y: lm.ny * 100 });
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        width: e.width,
        points: pts,
      };
    });

    const networkNodes: MinimapNodeMarker[] = nodes.map((n) => {
      const m = worldToMinimap(n.x, n.z);
      return {
        id: n.id,
        x: m.nx * 100,
        y: m.ny * 100,
        kind: n.kind,
        radiusNorm: (n.radius / spanMax) * 80,
        label: n.label,
      };
    });

    return { networkEdges, networkNodes };
  }

  return {
    nodes,
    nodeMap,
    edges,
    edgeMap,
    overlapConflicts,
    circuitPoints,
    circuitTangents,
    circuitNormals,
    circuitYs,
    circuitWidths,
    circuitBanks,
    circuitCumDist,
    circuitTotalLength,
    circuitSegmentStep,
    circuitCount,
    tunnelRange: [T0, T1],
    bridgeIndex: RB,
    bridgeFlatCount: BF,
    bridgeRampCount: BR,
    bridgeHeight: BH,
    highwayRange: [HW0, HW1],
    mountainRange: [MT0, MT1],
    coastalRange: [CO0, CO1],
    offroadRange: [OR0, OR1],
    cityRange: [C0, C1],
    roundaboutRadius: ROUNDABOUT_RADIUS,
    roundaboutInnerRadius: ROUNDABOUT_INNER_RADIUS,
    directionSigns,
    streetSigns,
    speedSigns,
    chevronSigns,
    trafficSignals,
    crosswalks,
    laneArrows,
    worldBounds: { minX, maxX, minZ, maxZ, spanMax },
    distToAnyRoadEdge,
    distToAnyRoadCenter,
    nearestOnNetwork,
    nearestCircuitIndex,
    sampleCircuitAtDistance,
    circuitSlopeAt,
    circuitZoneOf,
    computeGpsRoute,
    buildMinimapEdgesAndNodes,
  };
}
