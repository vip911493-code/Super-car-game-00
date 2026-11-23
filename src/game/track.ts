import * as THREE from 'three';
import { buildRoadNetwork, LaneArrowSpec, RoadEdge, RoadNetwork } from './roadNetwork';
import {
  createAsphaltMaps,
  createChevronSignTexture,
  createCityFacadeTextures,
  createCityPavementTexture,
  createCityRoadTexture,
  createCrosswalkTexture,
  createCurbTexture,
  createDirectionSignTexture,
  createDirtRoadTextures,
  createFinishLineTexture,
  createGrassTextures,
  createHighwayTexture,
  createLaneArrowTexture,
  createMountainRoadTexture,
  createRoadTexture,
  createRockTextures,
  createSpeedLimitTexture,
  createStreetNameTexture,
  createTunnelLiningTextures,
  createWaterTexture,
} from './textures';
import { SpatialColliderGrid } from './colliders';
import { buildRailwaySystem, RailwaySystem } from './railway';
import { JUNCTION_Y_OFFSET, ROAD_CONFIG } from './roadConfig';
import { GraphicsQuality, MinimapPoint, MinimapWorldData, MinimapZoneMarker } from './types';

export const ROAD_WIDTH = ROAD_CONFIG.main.width;
export const GUARDRAIL_OFFSET = ROAD_CONFIG.main.width / 2 + ROAD_CONFIG.main.guardrailGap;
export const PROP_ROAD_CLEARANCE = ROAD_CONFIG.main.width + 6;
export const TRACK_SEGMENTS = 1800;

export type SurfaceType = 'asphalt' | 'dirt' | 'sand' | 'grass';

export interface BusStopSpec {
  edgeId: string;
  s: number;
  x: number;
  y: number;
  z: number;
}

export interface TrackData {
  network: RoadNetwork;
  colliders: SpatialColliderGrid;
  railway: RailwaySystem;
  busStops: BusStopSpec[];
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  normals: THREE.Vector3[];
  ys: Float32Array;
  cumDist: Float32Array;
  totalLength: number;
  segmentStep: number;
  count: number;
  tunnelRange: [number, number];
  offroadRange: [number, number];
  waterTextures: THREE.CanvasTexture[];
  roadMaterial: THREE.MeshPhysicalMaterial;
  asphaltMaterials: THREE.MeshPhysicalMaterial[];
  cityFacadeMaterial: THREE.MeshStandardMaterial;
  tunnelWetRoadMaterial: THREE.MeshPhysicalMaterial;
  lampHeadMaterial: THREE.MeshBasicMaterial;
  lampPositions: THREE.Vector3[];
  minimapPoints: MinimapPoint[];
  minimapWorld: MinimapWorldData;
  slopeAt: (idx: number) => number;
  zoneOf: (idx: number) => string | null;
  surfaceAt: (x: number, z: number, nearestRoadDist: number) => SurfaceType;
  guardrailLimitAt: (idx: number, lat: number) => number;
  worldToMinimap: (x: number, z: number) => { nx: number; ny: number };
  nearestIndex: (x: number, z: number, hintIdx: number) => { idx: number; dist: number };
  sampleAtDistance: (
    s: number,
    outPos: THREE.Vector3,
    outTan: THREE.Vector3,
    outNorm: THREE.Vector3,
  ) => number;
  updateChunks: (px: number, pz: number, quality: GraphicsQuality, forceAll?: boolean) => void;
  isChunkLoaded: (x: number, z: number) => boolean;
  updateTrafficLights: (timeSec: number) => void;
  isRedLight: (nodeId: string, approachTanX: number, approachTanZ: number) => boolean;
  updateLivingDetails: (dt: number, timeSec: number, px: number, pz: number) => void;
}

interface PropPlacement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  color: number;
}

interface LampPlacement {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  s: number;
}

interface SignPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  kind: 'direction' | 'gantry' | 'speed' | 'street';
  roadWidth: number;
  mat: THREE.Material;
}

interface ChevronPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface SignalPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  phaseGroup: 0 | 1;
}

interface LaneArrowPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roadWidth: number;
  kind: LaneArrowSpec['kind'];
}

interface ChunkBucket {
  pines: PropPlacement[];
  roundTrees: PropPlacement[];
  palms: PropPlacement[];
  bushes: PropPlacement[];
  smallRocks: PropPlacement[];
  largeRocks: PropPlacement[];
  buildings: PropPlacement[];
  lamps: LampPlacement[];
  signs: SignPlacement[];
  chevrons: ChevronPlacement[];
  signals: SignalPlacement[];
  laneArrows: LaneArrowPlacement[];
}

interface WorldChunk {
  cx: number;
  cz: number;
  centerX: number;
  centerZ: number;
  bucket: ChunkBucket;
  vegState: 'unloaded' | 'mid' | 'high';
  vegGroup: THREE.Group | null;
  landmarkState: 'unloaded' | 'mid' | 'high';
  landmarkGroup: THREE.Group | null;
}

function hash3(a: number, b: number, c: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function createSeededRng(initialSeed = 48271) {
  let seed = initialSeed;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function buildTrackAndScenery(scene: THREE.Scene, maxAnisotropy: number): TrackData {
  const rnd = createSeededRng(48271);
  const network = buildRoadNetwork();
  const colliders = new SpatialColliderGrid(32);

  const {
    circuitPoints: points,
    circuitTangents: tangents,
    circuitNormals: normals,
    circuitYs: ys,
    circuitCumDist: cumDist,
    circuitTotalLength: totalLength,
    circuitSegmentStep: segmentStep,
    circuitCount: count,
    tunnelRange: [T0, T1],
    bridgeIndex: RB,
    bridgeFlatCount: BF,
    bridgeRampCount: BR,
    highwayRange: [HW0, HW1],
    mountainRange: [MT0, MT1],
    coastalRange: [CO0, CO1],
    offroadRange: [OR0, OR1],
    cityRange: [C0, C1],
    roundaboutRadius: RDB_R,
    roundaboutInnerRadius: RDB_INNER_R,
  } = network;

  const center = points
    .reduce((acc, p) => acc.add(p), new THREE.Vector3())
    .multiplyScalar(1 / count);

  const circDist = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, count - d);
  };

  const outNormal = (idx: number) => {
    const p = points[idx];
    const n = normals[idx].clone();
    if (n.dot(center.clone().sub(p)) > 0) n.negate();
    return n;
  };

  // ================= 1. Biome Terrain (Vertex-Colored PBR Ground + Ocean Bay) =================
  const cityAnchor = new THREE.Vector3(360, 0, -40);
  const canyonAnchor = points[Math.floor(count * 0.65)];
  const offroadAnchor = canyonAnchor.clone().addScaledVector(outNormal(Math.floor(count * 0.65)), 110);
  const mountainAnchor = points[Math.floor(count * 0.23)];
  const coastAnchor = points[Math.floor(count * 0.44)];

  const coastOutNorm = outNormal(Math.floor(count * 0.44));
  const OCEAN_R = 460;
  const oceanCenter = coastAnchor.clone().addScaledVector(coastOutNorm, OCEAN_R + 36);

  for (let step = 0; step < 8; step++) {
    let minLowDist = Infinity;
    for (let i = 0; i < count; i += 4) {
      if (ys[i] >= 3.5) continue;
      const d = Math.hypot(points[i].x - oceanCenter.x, points[i].z - oceanCenter.z);
      if (d < minLowDist) minLowDist = d;
    }
    if (minLowDist >= OCEAN_R + GUARDRAIL_OFFSET + 16) break;
    oceanCenter.addScaledVector(coastOutNorm, 18);
  }

  // Vertex-colored PBR terrain across the entire 6x world (6000x6000m, 360x360 grid for crisp road corridor lowering)
  let groundGeoRef: THREE.PlaneGeometry;
  {
    const { map: groundTex, normalMap: groundNormal } = createGrassTextures(maxAnisotropy);
    const groundGeo = new THREE.PlaneGeometry(6000, 6000, 360, 360);
    groundGeo.rotateX(-Math.PI / 2);
    groundGeoRef = groundGeo;

    const posAttr = groundGeo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const cGrassDeep = new THREE.Color(0x28781f);
    const cGrassMid = new THREE.Color(0x3a942c);
    const cGrassMeadow = new THREE.Color(0x56ad36);
    const cGrassVerge = new THREE.Color(0x2f8725);
    const cDirtPatch = new THREE.Color(0x88673e);
    const cCity = new THREE.Color(0x6c727a);
    const cOffroad = new THREE.Color(0xb4844e);
    const cSand = new THREE.Color(0xdcc088);
    const cMountain = new THREE.Color(0x4b6e3c);
    const cMix = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const gx = posAttr.getX(i);
      const gz = posAttr.getZ(i);

      const n1 = Math.sin(gx * 0.011 + 0.4) * Math.cos(gz * 0.013 - 0.7);
      const n2 = Math.sin((gx + gz) * 0.029) * 0.5 + 0.5;
      const dirtNoise = Math.sin(gx * 0.019 - 1.1) * Math.sin(gz * 0.017 + 0.8);
      cMix.copy(cGrassMid);
      cMix.lerp(cGrassDeep, smoothstep01((-n1 + 0.6) * 0.65) * 0.65);
      cMix.lerp(cGrassMeadow, smoothstep01(n2) * 0.48);

      const roadEdgeDist = network.distToAnyRoadEdge(gx, gz);
      if (dirtNoise > 0.42 && roadEdgeDist > 20) {
        cMix.lerp(cDirtPatch, smoothstep01((dirtNoise - 0.42) * 2.2) * 0.68);
      }
      if (roadEdgeDist < 75) {
        cMix.lerp(cGrassVerge, smoothstep01(1 - roadEdgeDist / 75) * 0.52);
      }

      const dCity = Math.hypot(gx - cityAnchor.x, gz - cityAnchor.z);
      if (dCity < 330) {
        cMix.lerp(cCity, smoothstep01(1 - dCity / 330) * 0.82);
      }

      const dOff = Math.hypot(gx - offroadAnchor.x, gz - offroadAnchor.z);
      if (dOff < 340) {
        cMix.lerp(cOffroad, smoothstep01(1 - dOff / 340) * 0.82);
      }

      const dMount = Math.hypot(gx - mountainAnchor.x, gz - mountainAnchor.z);
      if (dMount < 380) {
        cMix.lerp(cMountain, smoothstep01(1 - dMount / 380) * 0.62);
      }

      const dOcean = Math.hypot(gx - oceanCenter.x, gz - oceanCenter.z);
      if (dOcean < OCEAN_R + 75) {
        cMix.lerp(cSand, smoothstep01(1 - (dOcean - OCEAN_R) / 75));
      }

      colors[i * 3] = cMix.r;
      colors[i * 3 + 1] = cMix.g;
      colors[i * 3 + 2] = cMix.b;
    }

    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      normalMap: groundNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ================= 2. Multi-Type Roadway Network, Intersections, Roundabout & Guardrails =================
  const { normalMap: roadNormal, roughnessMap: roadRough } = createAsphaltMaps(maxAnisotropy);
  const roadTex = createRoadTexture(maxAnisotropy);
  const highwayTex = createHighwayTexture(maxAnisotropy);
  const cityRoadTex = createCityRoadTexture(maxAnisotropy);
  const mountainRoadTex = createMountainRoadTexture(maxAnisotropy);
  const { map: dirtTex, normalMap: dirtNormal } = createDirtRoadTextures(maxAnisotropy);

  const makeAsphaltMaterial = (
    tex: THREE.CanvasTexture | null,
    yFactor: number,
    baseColor = 0xffffff,
  ) =>
    new THREE.MeshPhysicalMaterial({
      map: tex,
      normalMap: roadNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: roadRough,
      color: baseColor,
      roughness: 0.86,
      metalness: 0.06,
      clearcoat: 0.0,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.0,
      polygonOffset: true,
      polygonOffsetFactor: yFactor,
      polygonOffsetUnits: yFactor,
    });

  const roadMat = makeAsphaltMaterial(roadTex, ROAD_CONFIG.main.polygonOffsetFactor);
  const highwayMat = makeAsphaltMaterial(highwayTex, ROAD_CONFIG.highway.polygonOffsetFactor);
  const cityRoadMat = makeAsphaltMaterial(cityRoadTex, ROAD_CONFIG.city.polygonOffsetFactor);
  const mountainRoadMat = makeAsphaltMaterial(mountainRoadTex, ROAD_CONFIG.mountain.polygonOffsetFactor);
  const junctionPlazaMat = makeAsphaltMaterial(null, -4, 0x262930);
  const asphaltMaterials = [
    roadMat,
    highwayMat,
    cityRoadMat,
    mountainRoadMat,
    junctionPlazaMat,
  ];

  const dirtMat = new THREE.MeshStandardMaterial({
    map: dirtTex,
    normalMap: dirtNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.94,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: ROAD_CONFIG.dirt.polygonOffsetFactor,
    polygonOffsetUnits: ROAD_CONFIG.dirt.polygonOffsetFactor,
  });

  const sidewalkTex = createCityPavementTexture(maxAnisotropy, 1, 14);
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: sidewalkTex,
    color: 0xa2a9b4,
    roughness: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  function buildEdgeRibbon(
    edge: RoadEdge,
    width: number,
    yOffset: number,
    mat: THREE.Material,
    vScaleMeters: number,
    lateralOffset = 0,
    trimStartMeters = 0,
    trimEndMeters = 0,
    thickness = 0,
    options?: {
      useSampleWidth?: boolean;
      useSampleYOffset?: boolean;
      applyBank?: boolean;
      edgeAnchorSign?: -1 | 1 | 0;
    },
  ): THREE.Mesh | null {
    const startS = trimStartMeters;
    const endS = edge.length - trimEndMeters;
    if (endS <= startS + 2) return null;

    const chosen: RoadEdge['samples'] = [];
    for (let i = 0; i < edge.samples.length; i++) {
      const samp = edge.samples[i];
      if (samp.s >= startS && samp.s <= endS) {
        chosen.push(samp);
      }
    }
    if (chosen.length < 2) return null;

    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const l = new THREE.Vector3();
    const r = new THREE.Vector3();
    const useSampleW = options?.useSampleWidth ?? false;
    const useSampleYOff = options?.useSampleYOffset ?? false;
    const applyBank = options?.applyBank ?? false;
    const edgeAnchorSign = options?.edgeAnchorSign ?? 0;

    for (let i = 0; i < chosen.length; i++) {
      const samp = chosen[i];
      const p = samp.pos;
      const n = samp.norm;
      const sampHalfW = samp.halfWidth ?? width * 0.5;
      const halfRibW = useSampleW ? sampHalfW : width * 0.5;
      const centerLat =
        edgeAnchorSign !== 0 ? edgeAnchorSign * (sampHalfW + width * 0.5) : lateralOffset;
      const leftLat = centerLat + halfRibW;
      const rightLat = centerLat - halfRibW;
      const baseH = samp.y + (useSampleYOff ? samp.yOffset : yOffset) + thickness;
      const bankSin = applyBank ? Math.sin(samp.bankRad) : 0;
      const hL = baseH + leftLat * bankSin;
      const hR = baseH + rightLat * bankSin;

      l.copy(p).addScaledVector(n, leftLat);
      r.copy(p).addScaledVector(n, rightLat);
      pos.push(l.x, hL, l.z, r.x, hR, r.z);
      const v = (samp.s - startS) / vScaleMeters;
      uv.push(0, v, 1, v);
      if (i < chosen.length - 1) {
        const q = i * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (mat === roadMat || mat === highwayMat || mat === cityRoadMat || mat === mountainRoadMat || mat === dirtMat) {
      geo.computeTangents();
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildCircuitSubRibbon(
    i0: number,
    i1: number,
    width: number,
    yOffset: number,
    mat: THREE.Material,
    vRepeat: number,
    lateralOffset = 0,
  ): THREE.Mesh {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const l = new THREE.Vector3();
    const r = new THREE.Vector3();
    for (let i = i0; i <= i1; i++) {
      const k = ((i % count) + count) % count;
      const p = points[k];
      const n = normals[k];
      const h = ys[k];
      l.copy(p).addScaledVector(n, lateralOffset + width / 2);
      r.copy(p).addScaledVector(n, lateralOffset - width / 2);
      pos.push(l.x, yOffset + h, l.z, r.x, yOffset + h, r.z);
      const v = (i / count) * vRepeat;
      uv.push(0, v, 1, v);
      if (i < i1) {
        const q = (i - i0) * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeTangents();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  // Render every RoadEdge in the open-world network with clean intersection trimming, banking & shared config dimensions
  for (const edge of network.edges) {
    const cfg = ROAD_CONFIG[edge.type];
    const fromNode = network.nodeMap.get(edge.fromNodeId)!;
    const toNode = network.nodeMap.get(edge.toNodeId)!;
    const trimStart = edge.continuousStart ? 0 : Math.max(0, fromNode.trimRadius - 2.2);
    const trimEnd = edge.continuousEnd ? 0 : Math.max(0, toNode.trimRadius - 2.2);

    const mat =
      edge.type === 'highway'
        ? highwayMat
        : edge.type === 'city'
          ? cityRoadMat
          : edge.type === 'mountain'
            ? mountainRoadMat
            : edge.type === 'dirt'
              ? dirtMat
              : roadMat;

    const roadMesh = buildEdgeRibbon(
      edge,
      cfg.width,
      cfg.yOffset,
      mat,
      cfg.tileLengthMeters,
      0,
      trimStart,
      trimEnd,
      0,
      {
        useSampleWidth: true,
        useSampleYOffset: true,
        applyBank: true,
      },
    );
    if (roadMesh) scene.add(roadMesh);

    // Raised concrete sidewalks on City Streets
    if (edge.hasSidewalk && cfg.sidewalkWidth > 0) {
      const swWidth = cfg.sidewalkWidth;
      for (const s of [-1, 1] as const) {
        const sw = buildEdgeRibbon(
          edge,
          swWidth,
          cfg.yOffset + 0.14,
          sidewalkMat,
          6,
          0,
          fromNode.radius,
          toNode.radius,
          0,
          {
            useSampleWidth: false,
            useSampleYOffset: false,
            applyBank: false,
            edgeAnchorSign: s,
          },
        );
        if (sw) scene.add(sw);
      }
    }
  }

  // Wet reflective tunnel surface overlay (matched precisely to 8m mountain road width)
  const tunnelWetRoadMaterial = new THREE.MeshPhysicalMaterial({
    map: mountainRoadTex,
    normalMap: roadNormal,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughnessMap: roadRough,
    color: 0xd9e4f0,
    roughness: 0.16,
    metalness: 0.22,
    clearcoat: 0.78,
    clearcoatRoughness: 0.09,
    envMapIntensity: 1.65,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  scene.add(
    buildCircuitSubRibbon(
      Math.max(0, T0 - 3),
      Math.min(count - 1, T1 + 3),
      ROAD_CONFIG.mountain.width - 0.1,
      ROAD_CONFIG.mountain.yOffset + 0.015,
      tunnelWetRoadMaterial,
      240,
    ),
  );

  // Red & White Racing Curbs along circuit high-speed corners (tracking sample edge width & banking)
  {
    const curbMat = new THREE.MeshStandardMaterial({
      map: createCurbTexture(maxAnisotropy),
      roughness: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const edge of network.edges) {
      if (!edge.isCircuit || edge.type === 'city' || edge.type === 'dirt') continue;
      if (edge.id === 'e_canyon_west' || edge.id === 'e_canyon_north') continue;
      const fromNode = network.nodeMap.get(edge.fromNodeId)!;
      const toNode = network.nodeMap.get(edge.toNodeId)!;
      const tStart = fromNode.radius + 4;
      const tEnd = toNode.radius + 4;
      for (const s of [-1, 1] as const) {
        const curb = buildEdgeRibbon(
          edge,
          0.9,
          ROAD_CONFIG[edge.type].yOffset + 0.014,
          curbMat,
          2.2,
          0,
          tStart,
          tEnd,
          0,
          {
            useSampleWidth: false,
            useSampleYOffset: true,
            applyBank: true,
            edgeAnchorSign: s,
          },
        );
        if (curb) scene.add(curb);
      }
    }
  }

  // Intersection Plazas (4-way & T-junctions) + Coastal Roundabout Ring & Island + Crosswalks
  {
    const cwMat = new THREE.MeshStandardMaterial({
      map: createCrosswalkTexture(maxAnisotropy),
      transparent: true,
      alphaTest: 0.15,
      roughness: 0.78,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const cwGeo = new THREE.PlaneGeometry(1, 3.6);
    cwGeo.rotateX(-Math.PI / 2);

    for (const cw of network.crosswalks) {
      const m = new THREE.Mesh(cwGeo, cwMat);
      m.position.set(cw.x, cw.y + JUNCTION_Y_OFFSET + 0.024, cw.z);
      m.rotation.y = cw.yaw;
      m.scale.set(cw.width, 1, 1);
      m.receiveShadow = true;
      scene.add(m);
    }

    const islandGrassMat = new THREE.MeshStandardMaterial({ color: 0x2e8028, roughness: 0.94 });
    const islandCurbMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, roughness: 0.8 });
    const ringLineMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });

    for (const node of network.nodes) {
      if (node.kind === 'roundabout') {
        const ringGeo = new THREE.RingGeometry(RDB_INNER_R - 0.3, RDB_R + 6.0, 48);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMesh = new THREE.Mesh(ringGeo, junctionPlazaMat);
        ringMesh.position.set(node.x, node.y + JUNCTION_Y_OFFSET + 0.004, node.z);
        ringMesh.receiveShadow = true;
        scene.add(ringMesh);

        // Outer & inner painted guide rings
        for (const rr of [RDB_INNER_R + 0.7, RDB_R + 4.8]) {
          const lGeo = new THREE.RingGeometry(rr - 0.18, rr + 0.18, 48);
          lGeo.rotateX(-Math.PI / 2);
          const lMesh = new THREE.Mesh(lGeo, ringLineMat);
          lMesh.position.set(node.x, node.y + JUNCTION_Y_OFFSET + 0.014, node.z);
          scene.add(lMesh);
        }

        // Raised concrete curb island with green landscaping
        const curbMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(RDB_INNER_R, RDB_INNER_R + 0.5, 0.48, 36),
          islandCurbMat,
        );
        curbMesh.position.set(node.x, node.y + 0.24, node.z);
        curbMesh.receiveShadow = true;
        scene.add(curbMesh);
        colliders.addCylinder(node.x, node.z, RDB_INNER_R + 0.35, node.y - 1, node.y + 4);

        const grassCap = new THREE.Mesh(
          new THREE.CylinderGeometry(RDB_INNER_R - 0.8, RDB_INNER_R - 0.8, 0.52, 36),
          islandGrassMat,
        );
        grassCap.position.set(node.x, node.y + 0.26, node.z);
        grassCap.receiveShadow = true;
        scene.add(grassCap);
      } else if (node.kind === '4way' || node.kind === 't_junction') {
        const size = node.radius * 2 + 1.5;
        const plazaGeo = new THREE.PlaneGeometry(size, size);
        plazaGeo.rotateX(-Math.PI / 2);
        const plaza = new THREE.Mesh(plazaGeo, junctionPlazaMat);
        plaza.position.set(node.x, node.y + JUNCTION_Y_OFFSET + 0.004, node.z);
        plaza.rotation.y = node.plazaYaw;
        plaza.receiveShadow = true;
        scene.add(plaza);
      }
    }
  }

  // Metal Guardrails (respecting all intersections, highway exits, city streets & open canyon off-road)
  {
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xc2cbd4,
      metalness: 0.82,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    const railPostGeo = new THREE.BoxGeometry(0.15, 1.1, 0.15);
    const railPostMat = new THREE.MeshStandardMaterial({
      color: 0x3b4149,
      roughness: 0.55,
      metalness: 0.45,
    });

    const postMatrices: THREE.Matrix4[] = [];
    const rd = new THREE.Object3D();

    for (const edge of network.edges) {
      if (!edge.hasGuardrailLeft && !edge.hasGuardrailRight) continue;
      const cfg = ROAD_CONFIG[edge.type];
      const fromNode = network.nodeMap.get(edge.fromNodeId)!;
      const toNode = network.nodeMap.get(edge.toNodeId)!;
      const openMarginStart = fromNode.radius + 7;
      const openMarginEnd = edge.length - (toNode.radius + 7);

      for (const s of [-1, 1]) {
        if (s === 1 && !edge.hasGuardrailRight) continue;
        if (s === -1 && !edge.hasGuardrailLeft) continue;

        const pos: number[] = [];
        const idx: number[] = [];
        let segs = 0;

        for (let i = 0; i < edge.samples.length; i++) {
          const samp = edge.samples[i];
          if (samp.s < openMarginStart || samp.s > openMarginEnd) continue;
          const latOffset = samp.halfWidth + cfg.guardrailGap;
          const x = samp.pos.x + samp.norm.x * s * latOffset;
          const z = samp.pos.z + samp.norm.z * s * latOffset;
          const bankLift = s * samp.halfWidth * Math.sin(samp.bankRad);
          const h = samp.y + bankLift;

          // Never place a guardrail post directly across another connected road
          if (network.distToAnyRoadEdge(x, z) < 0.9) continue;

          pos.push(x, h + 0.55, z, x, h + 1.0, z);
          if (segs > 0) {
            const prevA = (segs - 1) * 2;
            const prevX = pos[prevA * 3];
            const prevZ = pos[prevA * 3 + 2];
            const spanDist = Math.hypot(x - prevX, z - prevZ);
            if (spanDist < 12) {
              idx.push(prevA, prevA + 1, prevA + 2, prevA + 1, prevA + 3, prevA + 2);
              const railYaw = Math.atan2(x - prevX, z - prevZ);
              colliders.addObb(
                (x + prevX) * 0.5,
                (z + prevZ) * 0.5,
                0.35,
                spanDist * 0.55,
                railYaw,
                h - 0.5,
                h + 2.6,
              );
            }
          }
          if (i % 5 === 0) {
            rd.position.set(x, h + 0.55, z);
            rd.rotation.set(0, Math.atan2(samp.tan.x, samp.tan.z), 0);
            rd.updateMatrix();
            postMatrices.push(rd.matrix.clone());
          }
          segs++;
        }

        if (idx.length > 0) {
          const railGeo = new THREE.BufferGeometry();
          railGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          railGeo.setIndex(idx);
          railGeo.computeVertexNormals();
          const railMesh = new THREE.Mesh(railGeo, railMat);
          railMesh.castShadow = true;
          railMesh.receiveShadow = true;
          scene.add(railMesh);
        }
      }
    }

    if (postMatrices.length > 0) {
      const railPosts = new THREE.InstancedMesh(railPostGeo, railPostMat, postMatrices.length);
      for (let i = 0; i < postMatrices.length; i++) {
        railPosts.setMatrixAt(i, postMatrices[i]);
      }
      railPosts.castShadow = true;
      railPosts.receiveShadow = true;
      railPosts.computeBoundingSphere();
      scene.add(railPosts);
    }
  }

  // Start / Finish Checkered Line & Gantry (spans 16m Express Highway cleanly)
  {
    const HW_WIDTH = ROAD_CONFIG.highway.width;
    const finishTex = createFinishLineTexture(maxAnisotropy);
    const finishLine = new THREE.Mesh(
      new THREE.PlaneGeometry(HW_WIDTH, 3.6),
      new THREE.MeshStandardMaterial({
        map: finishTex,
        roughness: 0.78,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    const p = points[0];
    const tg = tangents[0];
    finishLine.position.set(p.x, ys[0] + ROAD_CONFIG.highway.yOffset + 0.02, p.z);
    finishLine.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.atan2(tg.x, tg.z),
    );
    finishLine.quaternion.premultiply(yawQ);
    finishLine.receiveShadow = true;
    scene.add(finishLine);

    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(p.x, ys[0], p.z);
    gantryGroup.rotation.y = Math.atan2(tg.x, tg.z);

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e242c,
      metalness: 0.75,
      roughness: 0.32,
    });
    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      emissive: 0x450a18,
      roughness: 0.38,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });

    for (const s of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), steelMat);
      base.position.set(s * (HW_WIDTH / 2 + 2.4), 0.25, 0);
      base.castShadow = true;
      gantryGroup.add(base);

      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.55, 8.2, 0.55), steelMat);
      pole.position.set(s * (HW_WIDTH / 2 + 2.4), 4.1, 0);
      pole.castShadow = true;
      gantryGroup.add(pole);

      const gantryLegOff = s * (HW_WIDTH / 2 + 2.4);
      colliders.addCylinder(
        p.x + normals[0].x * gantryLegOff,
        p.z + normals[0].z * gantryLegOff,
        0.65,
        ys[0] - 0.5,
        ys[0] + 8.5,
      );
    }

    const beam = new THREE.Mesh(new THREE.BoxGeometry(HW_WIDTH + 6.0, 1.5, 0.65), bannerMat);
    beam.position.set(0, 7.8, 0);
    beam.castShadow = true;
    gantryGroup.add(beam);

    const topCap = new THREE.Mesh(new THREE.BoxGeometry(HW_WIDTH + 6.2, 0.22, 0.78), trimMat);
    topCap.position.set(0, 8.65, 0);
    gantryGroup.add(topCap);

    const podMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.5 });
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 2.0,
    });
    for (let i = -2; i <= 2; i++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.3), podMat);
      pod.position.set(i * 1.4, 6.75, 0.25);
      gantryGroup.add(pod);

      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 14), lightMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(i * 1.4, 6.75, 0.42);
      gantryGroup.add(lamp);
    }
    scene.add(gantryGroup);
  }

  // ================= 3. Coastal Ocean Bay + River + Dual Terminal Lakes + Bridge =================
  const riverPoint = points[RB];
  const riverNormal = normals[RB].clone();
  if (riverNormal.dot(center.clone().sub(riverPoint)) < 0) {
    riverNormal.negate();
  }
  const RIVER_W = 54;
  const BANK_W = 6;
  const LAKE_R = 55;

  function isClearOfLowRoad(q: THREE.Vector3, radius: number): boolean {
    // Check ALL network roads so river & terminal lakes never flood interior streets
    const margin = radius + 6;
    for (const e of network.edges) {
      const hw = e.width * 0.5;
      for (let i = 0; i < e.samples.length; i += 2) {
        const samp = e.samples[i];
        if (samp.y >= 4) continue;
        const dx = samp.pos.x - q.x;
        const dz = samp.pos.z - q.z;
        if (dx * dx + dz * dz < (margin + hw) * (margin + hw)) return false;
      }
    }
    return true;
  }

  function riverReach(dir: number, maxDist: number): number {
    let reach = 0;
    for (let d = 0; d <= maxDist; d += 10) {
      const q = riverPoint.clone().addScaledVector(riverNormal, d * dir);
      if (!isClearOfLowRoad(q, RIVER_W / 2 + BANK_W)) break;
      if (isClearOfLowRoad(q, LAKE_R + BANK_W)) reach = d;
    }
    return Math.max(reach, 85);
  }

  const inLen = riverReach(1, 560);
  const outLen = riverReach(-1, 640);

  function nearWater(x: number, z: number, margin = 0): boolean {
    const dx = x - riverPoint.x;
    const dz = z - riverPoint.z;
    const t = dx * riverNormal.x + dz * riverNormal.z;
    const lat = Math.abs(-dx * riverNormal.z + dz * riverNormal.x);
    if (t > -outLen && t < inLen && lat < RIVER_W / 2 + BANK_W + margin) return true;
    const dIn = Math.hypot(dx - riverNormal.x * inLen, dz - riverNormal.z * inLen);
    const dOut = Math.hypot(dx + riverNormal.x * outLen, dz + riverNormal.z * outLen);
    if (dIn < LAKE_R + BANK_W + margin || dOut < LAKE_R + BANK_W + margin) return true;
    const dOcean = Math.hypot(x - oceanCenter.x, z - oceanCenter.z);
    return dOcean < OCEAN_R + 10 + margin;
  }

  // Lower terrain slightly under every ground-level road & junction corridor so ground never pokes through roads or banked curves
  {
    const gPos = groundGeoRef.attributes.position;
    for (let i = 0; i < gPos.count; i++) {
      const gx = gPos.getX(i);
      const gz = gPos.getZ(i);
      if (nearWater(gx, gz, 0)) continue;
      const net = network.nearestOnNetwork(gx, gz);
      if (net.groundY > 1.5) continue;
      const roadEdgeDist = net.dist - net.halfWidth;
      const nodeEdgeDist = net.node
        ? net.distToNode - (net.node.kind === 'roundabout' ? net.node.radius + 6 : net.node.radius)
        : Infinity;
      const corridorEdgeDist = Math.min(roadEdgeDist, nodeEdgeDist);
      if (corridorEdgeDist < 12) {
        const bankDrop = Math.abs(Math.sin(net.bankRad)) * net.halfWidth;
        const targetDrop = Math.max(0.35, bankDrop + 0.28);
        const blend = corridorEdgeDist <= 2.5 ? 1 : 1 - smoothstep01((corridorEdgeDist - 2.5) / 9.5);
        gPos.setY(i, -targetDrop * blend);
      }
    }
    gPos.needsUpdate = true;
    groundGeoRef.computeVertexNormals();
  }

  const riverLen = inLen + outLen;
  const riverWaterTex = createWaterTexture(maxAnisotropy, RIVER_W / 30, riverLen / 30);
  const lakeWaterTex = createWaterTexture(maxAnisotropy, 4, 4);
  const oceanWaterTex = createWaterTexture(maxAnisotropy, 18, 18);
  const waterTextures = [riverWaterTex, lakeWaterTex, oceanWaterTex];

  const riverMid = riverPoint.clone().addScaledVector(riverNormal, (inLen - outLen) / 2);
  const bankMat = new THREE.MeshStandardMaterial({
    color: 0x7a6642,
    roughness: 1.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const sharedWaterProps = {
    roughness: 0.36,
    metalness: 0.12,
    envMapIntensity: 0.65,
    transparent: true,
    opacity: 0.94,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  };

  const riverAngle = Math.atan2(riverNormal.x, riverNormal.z);
  const bankGeo = new THREE.PlaneGeometry(RIVER_W + BANK_W * 2, riverLen);
  bankGeo.rotateX(-Math.PI / 2);
  const bankMesh = new THREE.Mesh(bankGeo, bankMat);
  bankMesh.position.set(riverMid.x, 0.04, riverMid.z);
  bankMesh.rotation.y = riverAngle;
  bankMesh.receiveShadow = true;
  scene.add(bankMesh);

  const waterGeo = new THREE.PlaneGeometry(RIVER_W, riverLen);
  waterGeo.rotateX(-Math.PI / 2);
  const riverWaterMesh = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({ ...sharedWaterProps, map: riverWaterTex }),
  );
  riverWaterMesh.position.set(riverMid.x, 0.09, riverMid.z);
  riverWaterMesh.rotation.y = riverAngle;
  scene.add(riverWaterMesh);

  const lakeWorldCenters = [
    riverPoint.clone().addScaledVector(riverNormal, inLen),
    riverPoint.clone().addScaledVector(riverNormal, -outLen),
  ];
  const lakeWaterMat = new THREE.MeshStandardMaterial({ ...sharedWaterProps, map: lakeWaterTex });
  for (const lc of lakeWorldCenters) {
    const lakeBankGeo = new THREE.CircleGeometry(LAKE_R + BANK_W, 44);
    lakeBankGeo.rotateX(-Math.PI / 2);
    const lakeBankMesh = new THREE.Mesh(lakeBankGeo, bankMat);
    lakeBankMesh.position.set(lc.x, 0.04, lc.z);
    lakeBankMesh.receiveShadow = true;
    scene.add(lakeBankMesh);

    const lakeWaterGeo = new THREE.CircleGeometry(LAKE_R, 44);
    lakeWaterGeo.rotateX(-Math.PI / 2);
    const lakeWaterMesh = new THREE.Mesh(lakeWaterGeo, lakeWaterMat);
    lakeWaterMesh.position.set(lc.x, 0.09, lc.z);
    scene.add(lakeWaterMesh);
  }

  {
    const oceanGeo = new THREE.CircleGeometry(OCEAN_R, 64);
    oceanGeo.rotateX(-Math.PI / 2);
    const oceanMesh = new THREE.Mesh(
      oceanGeo,
      new THREE.MeshStandardMaterial({
        ...sharedWaterProps,
        map: oceanWaterTex,
        color: 0x38bdf8,
      }),
    );
    oceanMesh.position.set(oceanCenter.x, 0.08, oceanCenter.z);
    scene.add(oceanMesh);
  }

  // Coastal Bay Bridge Deck Slabs, Piers & Red-Orange Steel Arches (matched to 12m Coastal Road)
  {
    const bridgeW = ROAD_CONFIG.coastal.width;
    const bridgeRailOff = bridgeW * 0.5 + ROAD_CONFIG.coastal.guardrailGap;
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.88 });
    const r0 = RB - BF - BR;
    const r1 = RB + BF + BR;
    const slabs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      concreteMat,
      Math.ceil((r1 - r0) / 2) + 6,
    );
    const pillars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      concreteMat,
      Math.ceil((r1 - r0) / 10) + 6,
    );

    let slabCount = 0;
    let pillarCount = 0;
    const dummy = new THREE.Object3D();
    dummy.rotation.order = 'YXZ';

    for (let i = r0; i <= r1; i += 2) {
      const k = ((i % count) + count) % count;
      if (ys[k] < 0.25) continue;
      const p = points[k];
      const ang = Math.atan2(tangents[k].x, tangents[k].z);
      dummy.position.set(p.x, ys[k] - 0.57, p.z);
      dummy.rotation.set(-Math.atan(network.circuitSlopeAt(k)), ang, 0);
      dummy.scale.set(bridgeRailOff * 2 + 1.2, 0.9, segmentStep * 2 + 0.5);
      dummy.updateMatrix();
      slabs.setMatrixAt(slabCount++, dummy.matrix);

      for (const s of [-1, 1]) {
        colliders.addObb(
          p.x + normals[k].x * s * (bridgeRailOff + 0.25),
          p.z + normals[k].z * s * (bridgeRailOff + 0.25),
          0.55,
          segmentStep * 1.15,
          ang,
          ys[k] - 1.2,
          ys[k] + 4.0,
        );
      }

      if (i % 10 === 0 && ys[k] > 1.2) {
        dummy.position.set(p.x, (ys[k] - 0.9) / 2, p.z);
        dummy.rotation.set(0, ang, 0);
        dummy.scale.set(bridgeW * 0.55, ys[k] - 0.9, 2.0);
        dummy.updateMatrix();
        pillars.setMatrixAt(pillarCount++, dummy.matrix);
        colliders.addObb(p.x, p.z, bridgeW * 0.28, 1.1, ang, -1, ys[k] - 1.0);
      }
    }

    slabs.count = slabCount;
    pillars.count = pillarCount;
    slabs.castShadow = true;
    slabs.receiveShadow = true;
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    slabs.computeBoundingSphere();
    pillars.computeBoundingSphere();
    scene.add(slabs, pillars);

    const archSteelMat = new THREE.MeshStandardMaterial({
      color: 0xe2562a,
      metalness: 0.55,
      roughness: 0.36,
    });
    const archGeo = new THREE.TorusGeometry(bridgeW / 2 + 2.0, 0.36, 8, 24, Math.PI);
    const arches = new THREE.InstancedMesh(archGeo, archSteelMat, Math.ceil((BF * 2) / 10) + 4);
    let archCount = 0;
    for (let i = RB - BF; i <= RB + BF; i += 10) {
      const k = ((i % count) + count) % count;
      const p = points[k];
      dummy.position.set(p.x, ys[k], p.z);
      dummy.rotation.set(0, Math.atan2(tangents[k].x, tangents[k].z), 0);
      dummy.scale.set(1, 0.64, 1);
      dummy.updateMatrix();
      arches.setMatrixAt(archCount++, dummy.matrix);
    }
    arches.count = archCount;
    arches.castShadow = true;
    arches.computeBoundingSphere();
    scene.add(arches);
  }

  // ================= 4. Mountain Pass Hollow Tunnel Shell (matched to 8m Mountain Road) =================
  const { map: rockColorMap, normalMap: rockNormalMap } = createRockTextures(maxAnisotropy);
  const TW = ROAD_CONFIG.mountain.width * 0.5 + 2.0;
  const TH = 6.4;
  const HW = 24;
  {
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x7a7369,
      map: rockColorMap,
      normalMap: rockNormalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.96,
      side: THREE.DoubleSide,
    });
    const COLS = 15;
    const lp: number[] = [];
    const lu: number[] = [];
    const li: number[] = [];
    const hp: number[] = [];
    const hu: number[] = [];
    const hi: number[] = [];

    for (let i = T0; i <= T1; i++) {
      const p = points[i];
      const n = normals[i];
      const wob = 1 + 0.1 * Math.sin(i * 0.09) + 0.06 * Math.sin(i * 0.25 + 1.3);
      const hy = 16 + 4.5 * Math.sin(i * 0.07 + 0.5) + 2.2 * Math.sin(i * 0.22);
      for (let j = 0; j < COLS; j++) {
        const a = (j / (COLS - 1)) * Math.PI;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        lp.push(p.x + n.x * ca * TW, sa * TH, p.z + n.z * ca * TW);
        lu.push((j / (COLS - 1)) * 3, ((i - T0) * segmentStep) / 6);
        const e = j > 0 && j < COLS - 1 ? 1 + (hash3(i, j, 7) - 0.5) * 0.22 : 1;
        hp.push(p.x + n.x * ca * HW * wob * e, sa * hy * e, p.z + n.z * ca * HW * wob * e);
        hu.push((j / (COLS - 1)) * 4, ((i - T0) * segmentStep) / 24);
      }
      if (i < T1) {
        const r = (i - T0) * COLS;
        for (let j = 0; j < COLS - 1; j++) {
          const a = r + j;
          const b = a + 1;
          const c = a + COLS;
          const d = a + COLS + 1;
          li.push(a, c, b, b, c, d);
          hi.push(a, c, b, b, c, d);
        }
      }
    }

    const addInnerRing = (idx: number): number => {
      const p = points[idx];
      const n = normals[idx];
      const base = hp.length / 3;
      for (let j = 0; j < COLS; j++) {
        const a = (j / (COLS - 1)) * Math.PI;
        hp.push(p.x + n.x * Math.cos(a) * TW, Math.sin(a) * TH, p.z + n.z * Math.cos(a) * TW);
        hu.push((j / (COLS - 1)) * 2, 0);
      }
      return base;
    };

    const bA = addInnerRing(T0);
    const bB = addInnerRing(T1);
    const lastRow = (T1 - T0) * COLS;
    for (let j = 0; j < COLS - 1; j++) {
      hi.push(j, bA + j, j + 1, j + 1, bA + j, bA + j + 1);
      hi.push(lastRow + j, bB + j, lastRow + j + 1, lastRow + j + 1, bB + j, bB + j + 1);
    }

    const hullGeo = new THREE.BufferGeometry();
    hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    hullGeo.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2));
    hullGeo.setIndex(hi);
    hullGeo.computeVertexNormals();
    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    scene.add(hullMesh);

    const { map: tunnelMap, normalMap: tunnelNormal } = createTunnelLiningTextures(maxAnisotropy);
    const tunnelGeo = new THREE.BufferGeometry();
    tunnelGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    tunnelGeo.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
    tunnelGeo.setIndex(li);
    tunnelGeo.computeVertexNormals();
    const tunnelMat = new THREE.MeshStandardMaterial({
      map: tunnelMap,
      normalMap: tunnelNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.92,
      side: THREE.DoubleSide,
      emissive: 0x1d1a16,
    });
    const tunnelMesh = new THREE.Mesh(tunnelGeo, tunnelMat);
    tunnelMesh.receiveShadow = true;
    scene.add(tunnelMesh);

    const portalMat = new THREE.MeshStandardMaterial({ color: 0xaaa59c, roughness: 0.78 });
    const portalGeo = new THREE.TorusGeometry(TW + 0.5, 0.9, 8, 28, Math.PI);
    for (const i of [T0, T1]) {
      const p = points[i];
      const portal = new THREE.Mesh(portalGeo, portalMat);
      portal.scale.y = TH / TW;
      portal.position.set(p.x, 0, p.z);
      portal.rotation.y = Math.atan2(tangents[i].x, tangents[i].z);
      portal.castShadow = true;
      scene.add(portal);
    }

    const ceilingLights = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.4, 0.12, 3.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.3) }),
      Math.ceil((T1 - T0) / 8) + 2,
    );
    let lightIdx = 0;
    const ld = new THREE.Object3D();
    for (let i = T0 + 4; i < T1; i += 8) {
      const p = points[i];
      ld.position.set(p.x, TH - 0.25, p.z);
      ld.rotation.set(0, Math.atan2(tangents[i].x, tangents[i].z), 0);
      ld.updateMatrix();
      ceilingLights.setMatrixAt(lightIdx++, ld.matrix);
    }
    ceilingLights.count = lightIdx;
    ceilingLights.computeBoundingSphere();
    scene.add(ceilingLights);

    // Solid interior tunnel walls & exterior mountain mound shell colliders
    for (let i = T0; i <= T1; i++) {
      const p = points[i];
      const n = normals[i];
      const ang = Math.atan2(tangents[i].x, tangents[i].z);
      for (const s of [-1, 1]) {
        const innerX = p.x + n.x * s * (TW + 0.85);
        const innerZ = p.z + n.z * s * (TW + 0.85);
        colliders.addObb(innerX, innerZ, 1.1, segmentStep * 0.68, ang, -1, TH + 2);

        if (i >= T0 + 2 && i <= T1 - 2) {
          const outerX = p.x + n.x * s * (HW - 5.5);
          const outerZ = p.z + n.z * s * (HW - 5.5);
          if (network.distToAnyRoadEdge(outerX, outerZ) >= 6.0) {
            colliders.addObb(outerX, outerZ, 5.2, segmentStep * 0.72, ang, -1, 18);
          }
        }
      }
    }
  }

  // ================= 4B. Railway Track Corridor, Level Crossing & Moving Train =================
  const railway = buildRailwaySystem(scene, network, colliders);

  // ================= 5. Chunked Open-World Scenery + Signage + Traffic Lights =================
  const CHUNK_SIZE = 140;
  const buckets = new Map<string, ChunkBucket>();
  const getBucket = (x: number, z: number): ChunkBucket => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        pines: [],
        roundTrees: [],
        palms: [],
        bushes: [],
        smallRocks: [],
        largeRocks: [],
        buildings: [],
        lamps: [],
        signs: [],
        chevrons: [],
        signals: [],
        laneArrows: [],
      };
      buckets.set(key, b);
    }
    return b;
  };

  // Sign materials cache
  const signBackMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.55,
    roughness: 0.45,
  });
  const signPostMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.72,
    roughness: 0.35,
  });

  // Bucket roadside direction signs & highway gantries
  for (const ds of network.directionSigns) {
    const tex = createDirectionSignTexture(
      ds.arrow,
      ds.destination,
      ds.distanceText,
      ds.secondaryArrow,
      ds.secondaryDestination,
      ds.isGantry,
      maxAnisotropy,
    );
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.16,
    });
    getBucket(ds.x, ds.z).signs.push({
      x: ds.x,
      y: ds.y,
      z: ds.z,
      yaw: ds.yaw,
      kind: ds.isGantry ? 'gantry' : 'direction',
      roadWidth: ds.roadWidth,
      mat: faceMat,
    });
  }

  for (const sp of network.speedSigns) {
    const tex = createSpeedLimitTexture(sp.limitText, maxAnisotropy);
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.38,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
    });
    getBucket(sp.x, sp.z).signs.push({
      x: sp.x,
      y: sp.y,
      z: sp.z,
      yaw: sp.yaw,
      kind: 'speed',
      roadWidth: sp.roadWidth,
      mat: faceMat,
    });
  }

  for (const sn of network.streetSigns) {
    const tex = createStreetNameTexture(sn.name, maxAnisotropy);
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.42,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.15,
    });
    getBucket(sn.x, sn.z).signs.push({
      x: sn.x,
      y: sn.y,
      z: sn.z,
      yaw: sn.yaw,
      kind: 'street',
      roadWidth: sn.roadWidth,
      mat: faceMat,
    });
  }

  for (const ch of network.chevronSigns) {
    getBucket(ch.x, ch.z).chevrons.push(ch);
  }

  for (const sig of network.trafficSignals) {
    getBucket(sig.x, sig.z).signals.push({
      x: sig.x,
      y: sig.y,
      z: sig.z,
      yaw: sig.yaw,
      phaseGroup: sig.phaseGroup,
    });
  }

  for (const la of network.laneArrows) {
    getBucket(la.x, la.z).laneArrows.push({
      x: la.x,
      y: la.y,
      z: la.z,
      yaw: la.yaw,
      roadWidth: la.roadWidth,
      kind: la.kind,
    });
  }

  // Helper: random pine & round tree color tints
  const treeColorHelper = new THREE.Color();
  const samplePineColor = (): number => {
    const hue = 0.31 + (rnd() - 0.5) * 0.05;
    const sat = 0.52 + rnd() * 0.2;
    const lit = 0.22 + rnd() * 0.1;
    treeColorHelper.setHSL(hue, sat, lit);
    return treeColorHelper.getHex();
  };
  const sampleRoundTreeColor = (): number => {
    const hue = 0.27 + (rnd() - 0.5) * 0.06;
    const sat = 0.56 + rnd() * 0.2;
    const lit = 0.28 + rnd() * 0.12;
    treeColorHelper.setHSL(hue, sat, lit);
    return treeColorHelper.getHex();
  };

  const bushTints = [0x3b7d2c, 0x4b8f34, 0x2f6926, 0x5d9938, 0x43782c];
  const rockTints = [0x7a736a, 0x6b655e, 0x857d72, 0x65605a];

  const buildingFootprints: Array<{ x: number; z: number; r: number }> = [];
  const nearBuilding = (x: number, z: number, margin = 2): boolean => {
    for (let i = 0; i < buildingFootprints.length; i++) {
      const b = buildingFootprints[i];
      const dx = b.x - x;
      const dz = b.z - z;
      const lim = b.r + margin;
      if (dx * dx + dz * dz < lim * lim) return true;
    }
    return false;
  };

  // Strict minimum edge clearance from ANY road edge: 6 units outside road edge (+2m trunk radius safety)
  const EDGE_CLEARANCE = 7.4;

  const isNearTunnelOrBridge = (x: number, z: number): boolean => {
    for (let i = T0 - 10; i <= T1 + 10; i++) {
      const k = ((i % count) + count) % count;
      const dx = points[k].x - x;
      const dz = points[k].z - z;
      if (dx * dx + dz * dz < (HW + 8) * (HW + 8)) return true;
    }
    for (let i = RB - BF - BR; i <= RB + BF + BR; i += 2) {
      const k = ((i % count) + count) % count;
      if (ys[k] <= 0.25) continue;
      const dx = points[k].x - x;
      const dz = points[k].z - z;
      if (dx * dx + dz * dz < 26 * 26) return true;
    }
    return false;
  };

  // A. Mountain Pass Rock Mounds (strict clearance against all network roads)
  for (let i = MT0; i <= MT1; i += 14) {
    const k = i % count;
    const p = points[k];
    const n = normals[k];
    const base = k >= T0 - 16 && k <= T1 + 16 ? HW + 6 : 16;
    for (const s of [-1, 1]) {
      const r = 16 + rnd() * 20;
      const rz = r * (0.9 + rnd() * 0.35);
      const R = Math.max(r, rz);
      const hg = r * (1.1 + rnd() * 1.1);
      const off = base + R + rnd() * 18;
      const x = p.x + n.x * s * off;
      const z = p.z + n.z * s * off;
      if (network.distToAnyRoadEdge(x, z) < 6 + R) continue;
      if (nearWater(x, z, R + 4)) continue;
      if (railway.nearRail(x, z, R + 8)) continue;
      getBucket(x, z).largeRocks.push({
        x,
        y: hg * 0.32 - 2,
        z,
        sx: r,
        sy: hg,
        sz: rz,
        rotY: rnd() * Math.PI * 2,
        color: rockTints[(rnd() * rockTints.length) | 0],
      });
    }
  }

  // Off-Road Canyon Mesas & Desert Boulders
  for (let i = 0; i < 160; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 40 + rnd() * 340;
    const x = offroadAnchor.x + Math.cos(ang) * rad;
    const z = offroadAnchor.z + Math.sin(ang) * rad;
    const r = 6 + rnd() * 14;
    if (network.distToAnyRoadEdge(x, z) < 8 + r) continue;
    if (nearWater(x, z, r + 6)) continue;
    if (railway.nearRail(x, z, r + 8)) continue;
    getBucket(x, z).largeRocks.push({
      x,
      y: r * 0.25,
      z,
      sx: r,
      sy: r * (0.65 + rnd() * 0.9),
      sz: r * (0.85 + rnd() * 0.3),
      rotY: rnd() * Math.PI * 2,
      color: [0xa66e43, 0x915b34, 0xb87f50][(rnd() * 3) | 0],
    });
  }

  // B. City District Skyscrapers & Street Lights across City Boulevard + City Grid Streets!
  const buildingTints = [0xffffff, 0xdde6ee, 0xf0e6d8, 0xc9d3dc, 0xe8e0e0];
  const cityEdges = network.edges.filter((e) => e.type === 'city' && !e.id.includes('ramp'));
  for (const ce of cityEdges) {
    const stride = Math.max(6, Math.round(24 / ce.segmentStep));
    for (let i = 8; i < ce.samples.length - 8; i += stride) {
      const samp = ce.samples[i];
      const ang = Math.atan2(samp.tan.x, samp.tan.z);
      for (const s of [-1, 1]) {
        for (let row = 0; row < 2; row++) {
          if (rnd() > (row ? 0.55 : 0.84)) continue;
          const w = 13 + rnd() * 14;
          const d = 13 + rnd() * 14;
          const halfDiag = Math.hypot(w, d) * 0.5;
          const h = 20 + rnd() * rnd() * 88 + (row ? 24 : 8);
          const off = ce.width * 0.5 + 8 + halfDiag + row * (34 + rnd() * 14);
          const x = samp.pos.x + samp.norm.x * s * off;
          const z = samp.pos.z + samp.norm.z * s * off;
          if (network.distToAnyRoadEdge(x, z) < 6 + halfDiag) continue;
          if (nearWater(x, z, halfDiag + 8)) continue;
          if (railway.nearRail(x, z, halfDiag + 8)) continue;
          if (nearBuilding(x, z, halfDiag + 2)) continue;
          buildingFootprints.push({ x, z, r: halfDiag + 1.5 });
          getBucket(x, z).buildings.push({
            x,
            y: h / 2,
            z,
            sx: w,
            sy: h,
            sz: d,
            rotY: ang,
            color: buildingTints[(rnd() * buildingTints.length) | 0],
          });
        }
      }
    }
  }

  // Street Lamps across City Streets, Express Highway & Bayshore Blvd
  const lampPositions: THREE.Vector3[] = [];
  for (const edge of network.edges) {
    if (edge.type !== 'city' && edge.type !== 'highway' && edge.id !== 'e_bayshore_west') continue;
    const spacingMeters = edge.type === 'city' ? 32 : 42;
    const step = Math.max(8, Math.round(spacingMeters / edge.segmentStep));
    for (let i = 8; i < edge.samples.length - 8; i += step) {
      const samp = edge.samples[i];
      for (const s of [-1, 1]) {
        const lat = edge.width * 0.5 + 2.35;
        const x = samp.pos.x + samp.norm.x * s * lat;
        const z = samp.pos.z + samp.norm.z * s * lat;
        if (network.distToAnyRoadEdge(x, z) < 2.1) continue;
        if (railway.nearRail(x, z, 6.5)) continue;
        getBucket(x, z).lamps.push({ x, y: samp.y, z, nx: samp.norm.x, nz: samp.norm.z, s });
        lampPositions.push(new THREE.Vector3(x - samp.norm.x * s * 0.6, samp.y + 6.9, z - samp.norm.z * s * 0.6));
      }
    }
  }

  // C. Roadside Tree & Prop Clusters on BOTH Sides Along EVERY Network Edge (8-14u sampling, road half-width + 8..40)
  for (const edge of network.edges) {
    const minLat = edge.width * 0.5 + 8;
    const maxLat = edge.width * 0.5 + 40;
    const inCityEdge = edge.type === 'city' && !edge.id.includes('ramp');
    const inMountainEdge = edge.type === 'mountain';
    const inCoastEdge = edge.type === 'coastal';
    const inDirtEdge = edge.type === 'dirt';

    for (const s of [-1, 1]) {
      let distAlong = rnd() * 6;
      let clusterStepsLeft = 2 + ((rnd() * 3) | 0);
      let gapStepsLeft = 0;

      while (distAlong < edge.length) {
        const k = Math.min(edge.samples.length - 1, Math.floor(distAlong / edge.segmentStep));
        distAlong += 8 + rnd() * 6;

        const samp = edge.samples[k];
        if (samp.y > 0.35) continue;
        if (edge.isCircuit && isNearTunnelOrBridge(samp.pos.x, samp.pos.z)) continue;

        if (gapStepsLeft > 0) {
          gapStepsLeft--;
          if (!inCityEdge && rnd() > 0.68) {
            const lat = minLat + rnd() * (maxLat - minLat);
            const along = (rnd() - 0.5) * 10;
            const gx = samp.pos.x + samp.norm.x * s * lat + samp.tan.x * along;
            const gz = samp.pos.z + samp.norm.z * s * lat + samp.tan.z * along;
            if (
              network.distToAnyRoadEdge(gx, gz) >= EDGE_CLEARANCE &&
              !nearWater(gx, gz, 4) &&
              !railway.nearRail(gx, gz, 9) &&
              !isNearTunnelOrBridge(gx, gz) &&
              !nearBuilding(gx, gz, 3)
            ) {
              const sc = 0.7 + rnd() * 0.8;
              if (rnd() > 0.4) {
                getBucket(gx, gz).bushes.push({
                  x: gx,
                  y: 0,
                  z: gz,
                  sx: sc,
                  sy: sc * (0.8 + rnd() * 0.35),
                  sz: sc,
                  rotY: rnd() * Math.PI * 2,
                  color: inDirtEdge ? 0x7b7840 : bushTints[(rnd() * bushTints.length) | 0],
                });
              } else {
                getBucket(gx, gz).smallRocks.push({
                  x: gx,
                  y: sc * 0.28,
                  z: gz,
                  sx: sc * (1.0 + rnd() * 0.6),
                  sy: sc * (0.6 + rnd() * 0.5),
                  sz: sc * (1.0 + rnd() * 0.6),
                  rotY: rnd() * Math.PI * 2,
                  color: inDirtEdge ? 0x9b653c : rockTints[(rnd() * rockTints.length) | 0],
                });
              }
            }
          }
          if (gapStepsLeft === 0) {
            clusterStepsLeft = inMountainEdge ? 3 + ((rnd() * 4) | 0) : 2 + ((rnd() * 3) | 0);
          }
          continue;
        }

        clusterStepsLeft--;
        if (clusterStepsLeft <= 0) {
          gapStepsLeft = inMountainEdge ? 1 + ((rnd() * 2) | 0) : 1 + ((rnd() * 3) | 0);
        }

        const treeCount = inCityEdge
          ? rnd() > 0.72
            ? 1
            : 0
          : inDirtEdge
            ? 1 + (rnd() > 0.62 ? 1 : 0)
            : inMountainEdge
              ? 2 + ((rnd() * 3) | 0)
              : 1 + ((rnd() * 3) | 0);

        for (let m = 0; m < treeCount; m++) {
          const nearGuardrail = m === 0 && rnd() < 0.45;
          const lat = nearGuardrail ? minLat + rnd() * 6 : minLat + rnd() * (maxLat - minLat);
          const along = (rnd() - 0.5) * 11;
          const x = samp.pos.x + samp.norm.x * s * lat + samp.tan.x * along;
          const z = samp.pos.z + samp.norm.z * s * lat + samp.tan.z * along;

          if (network.distToAnyRoadEdge(x, z) < EDGE_CLEARANCE) continue;
          if (nearWater(x, z, 5)) continue;
          if (railway.nearRail(x, z, 9)) continue;
          if (isNearTunnelOrBridge(x, z)) continue;
          if (nearBuilding(x, z, 3.5)) continue;

          const sc = 0.7 + rnd() * 0.8;
          const rotY = rnd() * Math.PI * 2;
          const bucket = getBucket(x, z);

          if (inCoastEdge && rnd() > 0.35) {
            bucket.palms.push({
              x,
              y: 0,
              z,
              sx: sc,
              sy: sc,
              sz: sc,
              rotY,
              color: 0x2f8f3b,
            });
          } else if (inMountainEdge || (!inCityEdge && rnd() > 0.45)) {
            bucket.pines.push({
              x,
              y: 0,
              z,
              sx: sc,
              sy: sc * (0.95 + rnd() * 0.25),
              sz: sc,
              rotY,
              color: samplePineColor(),
            });
          } else {
            bucket.roundTrees.push({
              x,
              y: 0,
              z,
              sx: sc,
              sy: sc * (0.9 + rnd() * 0.25),
              sz: sc,
              rotY,
              color: sampleRoundTreeColor(),
            });
          }
        }
      }
    }
  }

  // D. Coastal Palm Groves around Beach Bay
  for (let i = 0; i < 280; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = OCEAN_R + 14 + rnd() * 95;
    const x = oceanCenter.x + Math.cos(ang) * rad;
    const z = oceanCenter.z + Math.sin(ang) * rad;
    if (network.distToAnyRoadEdge(x, z) < EDGE_CLEARANCE) continue;
    if (nearWater(x, z, 4)) continue;
    if (railway.nearRail(x, z, 9)) continue;
    if (nearBuilding(x, z, 4)) continue;
    const sc = 0.75 + rnd() * 0.75;
    getBucket(x, z).palms.push({
      x,
      y: 0,
      z,
      sx: sc,
      sy: sc,
      sz: sc,
      rotY: rnd() * Math.PI * 2,
      color: 0x3b8c3b,
    });
  }

  // E. Open-World Forest Backdrop (with open meadows & strict clearance from ALL network roads)
  {
    const TREE_TARGET = 1500;
    let placed = 0;
    let attempts = 0;

    while (placed < TREE_TARGET && attempts < TREE_TARGET * 18) {
      attempts++;
      const x = (rnd() - 0.5) * 2500;
      const z = (rnd() - 0.5) * 2200;

      const fieldPatch = Math.sin(x * 0.0052) * Math.cos(z * 0.0049);
      if (fieldPatch > 0.35) continue;

      const sc = 0.75 + rnd() * 0.75;
      if (network.distToAnyRoadEdge(x, z) < EDGE_CLEARANCE + 4) continue;
      if (nearWater(x, z, 16)) continue;
      if (railway.nearRail(x, z, 11)) continue;
      if (nearBuilding(x, z, 8)) continue;
      if (isNearTunnelOrBridge(x, z)) continue;
      if (Math.hypot(x - cityAnchor.x, z - cityAnchor.z) < 230) continue;
      if (Math.hypot(x - offroadAnchor.x, z - offroadAnchor.z) < 210) continue;
      if (Math.hypot(x - oceanCenter.x, z - oceanCenter.z) < OCEAN_R + 70) continue;

      if (rnd() > 0.35) {
        getBucket(x, z).pines.push({
          x,
          y: 0,
          z,
          sx: sc,
          sy: sc,
          sz: sc,
          rotY: rnd() * Math.PI * 2,
          color: samplePineColor(),
        });
      } else {
        getBucket(x, z).roundTrees.push({
          x,
          y: 0,
          z,
          sx: sc,
          sy: sc,
          sz: sc,
          rotY: rnd() * Math.PI * 2,
          color: sampleRoundTreeColor(),
        });
      }
      placed++;
    }
  }

  // Final strict clearance sweep across ALL buckets against ALL network roads, water & railway
  for (const bucket of buckets.values()) {
    bucket.pines = bucket.pines.filter(
      (p) => network.distToAnyRoadEdge(p.x, p.z) >= 6.5 && !nearWater(p.x, p.z, 3) && !railway.nearRail(p.x, p.z, 8),
    );
    bucket.roundTrees = bucket.roundTrees.filter(
      (p) => network.distToAnyRoadEdge(p.x, p.z) >= 6.5 && !nearWater(p.x, p.z, 3) && !railway.nearRail(p.x, p.z, 8),
    );
    bucket.palms = bucket.palms.filter(
      (p) => network.distToAnyRoadEdge(p.x, p.z) >= 6.5 && !nearWater(p.x, p.z, 3) && !railway.nearRail(p.x, p.z, 8),
    );
    bucket.bushes = bucket.bushes.filter(
      (b) => network.distToAnyRoadEdge(b.x, b.z) >= 6.5 && !nearWater(b.x, b.z, 2) && !railway.nearRail(b.x, b.z, 7.5),
    );
    bucket.smallRocks = bucket.smallRocks.filter(
      (r) => network.distToAnyRoadEdge(r.x, r.z) >= 6.5 && !nearWater(r.x, r.z, 2) && !railway.nearRail(r.x, r.z, 7.5),
    );
    bucket.largeRocks = bucket.largeRocks.filter(
      (r) => network.distToAnyRoadEdge(r.x, r.z) >= 6 + Math.max(r.sx, r.sz) && !railway.nearRail(r.x, r.z, 8 + Math.max(r.sx, r.sz)),
    );
    bucket.buildings = bucket.buildings.filter(
      (b) =>
        network.distToAnyRoadEdge(b.x, b.z) >= 6 + Math.hypot(b.sx, b.sz) * 0.5 &&
        !railway.nearRail(b.x, b.z, 8 + Math.hypot(b.sx, b.sz) * 0.5),
    );

    // Register solid spatial colliders for all surviving static objects in this chunk
    for (const b of bucket.buildings) {
      colliders.addObb(b.x, b.z, b.sx * 0.5, b.sz * 0.5, b.rotY, 0, b.sy + 2);
    }
    for (const r of bucket.largeRocks) {
      colliders.addObb(r.x, r.z, r.sx * 0.76, r.sz * 0.76, r.rotY, r.y - r.sy, r.y + r.sy);
    }
    for (const l of bucket.lamps) {
      colliders.addCylinder(l.x, l.z, 0.28, l.y - 0.5, l.y + 7.5);
    }
    for (const sig of bucket.signals) {
      colliders.addCylinder(sig.x, sig.z, 0.28, sig.y - 0.5, sig.y + 5.5);
    }
    for (const c of bucket.chevrons) {
      const lx = Math.cos(c.yaw) * 0.7;
      const lz = -Math.sin(c.yaw) * 0.7;
      colliders.addCylinder(c.x + lx, c.z + lz, 0.2, c.y - 0.5, c.y + 2.5);
      colliders.addCylinder(c.x - lx, c.z - lz, 0.2, c.y - 0.5, c.y + 2.5);
    }
    for (const s of bucket.signs) {
      if (s.kind === 'gantry') {
        const legOff = (s.roadWidth + 4.8) * 0.5;
        const rightX = Math.cos(s.yaw);
        const rightZ = -Math.sin(s.yaw);
        colliders.addCylinder(s.x + rightX * legOff, s.z + rightZ * legOff, 0.42, s.y - 0.5, s.y + 8);
        colliders.addCylinder(s.x - rightX * legOff, s.z - rightZ * legOff, 0.42, s.y - 0.5, s.y + 8);
      } else if (s.kind === 'direction') {
        const cosY = Math.cos(s.yaw);
        const sinY = Math.sin(s.yaw);
        colliders.addCylinder(s.x + cosY * 1.4, s.z - sinY * 1.4, 0.22, s.y - 0.5, s.y + 4.5);
        colliders.addCylinder(s.x - cosY * 1.4, s.z + sinY * 1.4, 0.22, s.y - 0.5, s.y + 4.5);
      } else {
        colliders.addCylinder(s.x, s.z, 0.22, s.y - 0.5, s.y + 4.5);
      }
    }
  }

  // ================= 6. Shared Geometries & Materials for Chunked InstancedMesh =================
  const pineTrunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 3.0, 6);
  const pineLowerGeo = new THREE.ConeGeometry(2.3, 5.0, 8);
  const pineUpperGeo = new THREE.ConeGeometry(1.65, 4.2, 8);
  const pineLodGeo = new THREE.ConeGeometry(2.2, 8.2, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3c20, roughness: 1.0 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  const pineLodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

  const roundTrunkGeo = new THREE.CylinderGeometry(0.26, 0.4, 2.8, 6);
  const roundCrownGeo = new THREE.IcosahedronGeometry(2.3, 1);
  const roundLodGeo = new THREE.IcosahedronGeometry(2.2, 0);

  const palmTrunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 6.2, 7);
  const palmCrownGeo = new THREE.ConeGeometry(2.7, 1.4, 7);
  const palmLodGeo = new THREE.ConeGeometry(2.5, 6.8, 5);
  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x7c5a3c, roughness: 0.95 });
  const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x2f8f3b, roughness: 0.88 });

  const bushGeoHigh = new THREE.DodecahedronGeometry(1.2, 1);
  const bushGeoLow = new THREE.DodecahedronGeometry(1.15, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 });

  const rockGeoHigh = new THREE.IcosahedronGeometry(1, 2);
  {
    const pa = rockGeoHigh.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const px = pa.getX(i);
      const py = pa.getY(i);
      const pz = pa.getZ(i);
      const jitter =
        1 + (hash3(Math.round(px * 200), Math.round(py * 200), Math.round(pz * 200)) - 0.5) * 0.24;
      pa.setXYZ(i, px * jitter, py * jitter, pz * jitter);
    }
    rockGeoHigh.computeVertexNormals();
  }
  const rockGeoLow = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rockColorMap,
    normalMap: rockNormalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.95,
    metalness: 0.02,
  });

  const {
    colorMap: bldgColorMap,
    emissiveMap: bldgEmissiveMap,
    normalMap: bldgNormalMap,
  } = createCityFacadeTextures(maxAnisotropy);
  const bldgHighGeo = new THREE.BoxGeometry(1, 1, 1);
  const bldgHighMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: bldgColorMap,
    normalMap: bldgNormalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    emissiveMap: bldgEmissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.42,
    metalness: 0.24,
  });
  const bldgLodMat = new THREE.MeshStandardMaterial({
    color: 0x8a939e,
    roughness: 0.68,
    metalness: 0.14,
  });
  const roofTrimMat = new THREE.MeshStandardMaterial({
    color: 0x4b525d,
    roughness: 0.8,
    metalness: 0.22,
  });
  const spireBeaconMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.6, 0.35, 0.35),
  });
  const roofUnitGeo = new THREE.BoxGeometry(1, 1, 1);
  const spireGeo = new THREE.CylinderGeometry(0.12, 0.28, 1, 6);
  const beaconGeo = new THREE.SphereGeometry(0.45, 8, 6);

  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.14, 7, 6);
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x33383f, metalness: 0.45, roughness: 0.55 });
  const lampHeadGeo = new THREE.BoxGeometry(1.4, 0.2, 0.5);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.85, 1.35) });

  // Shared Sign, Chevron, Traffic Light & Lane Arrow Geometries/Materials
  const dirBoardGeo = new THREE.PlaneGeometry(5.0, 2.5);
  const gantryBoardGeo = new THREE.PlaneGeometry(11.0, 3.2);
  const speedBoardGeo = new THREE.PlaneGeometry(1.5, 1.9);
  const streetBoardGeo = new THREE.PlaneGeometry(2.6, 0.7);
  const signLegGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6);
  const gantryLegGeo = new THREE.CylinderGeometry(0.22, 0.28, 7.6, 8);
  const gantryTrussGeo = new THREE.BoxGeometry(1, 0.45, 0.45);

  const chevronGeo = new THREE.BoxGeometry(2.4, 1.1, 0.12);
  const chevronLegGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6);
  const chevronMat = new THREE.MeshStandardMaterial({
    map: createChevronSignTexture(maxAnisotropy),
    roughness: 0.42,
  });

  // Shared animated traffic light bulb materials (cycled via updateTrafficLights)
  const sigPoleGeo = new THREE.CylinderGeometry(0.11, 0.14, 5.2, 6);
  const sigHeadGeo = new THREE.BoxGeometry(0.56, 1.55, 0.46);
  const sigHousingMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5 });
  const sigBulbGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const sigMatNS_Green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.2, 0.5) });
  const sigMatNS_Amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.2, 0.2) });
  const sigMatNS_Red = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.1, 0.1) });
  const sigMatEW_Green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.25, 0.15) });
  const sigMatEW_Amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.2, 0.2) });
  const sigMatEW_Red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.2, 0.2) });

  let currentPhaseSec = 0;
  const CYCLE_SEC = 14; // 0..5.5s NS Green, 5.5..7s NS Amber, 7..12.5s EW Green, 12.5..14s EW Amber

  function updateTrafficLights(timeSec: number): void {
    currentPhaseSec = ((timeSec % CYCLE_SEC) + CYCLE_SEC) % CYCLE_SEC;
    const nsGreen = currentPhaseSec < 5.5;
    const nsAmber = currentPhaseSec >= 5.5 && currentPhaseSec < 7.0;
    const ewGreen = currentPhaseSec >= 7.0 && currentPhaseSec < 12.5;
    const ewAmber = currentPhaseSec >= 12.5;

    sigMatNS_Green.color.setRGB(nsGreen ? 0.2 : 0.08, nsGreen ? 2.4 : 0.15, nsGreen ? 0.4 : 0.08);
    sigMatNS_Amber.color.setRGB(nsAmber ? 2.4 : 0.18, nsAmber ? 1.6 : 0.12, 0.06);
    sigMatNS_Red.color.setRGB(nsGreen || nsAmber ? 0.22 : 2.5, 0.08, 0.08);

    sigMatEW_Green.color.setRGB(ewGreen ? 0.2 : 0.08, ewGreen ? 2.4 : 0.15, ewGreen ? 0.4 : 0.08);
    sigMatEW_Amber.color.setRGB(ewAmber ? 2.4 : 0.18, ewAmber ? 1.6 : 0.12, 0.06);
    sigMatEW_Red.color.setRGB(ewGreen || ewAmber ? 0.22 : 2.5, 0.08, 0.08);
  }

  function isRedLight(nodeId: string, approachTanX: number, approachTanZ: number): boolean {
    const node = network.nodeMap.get(nodeId);
    if (!node || !node.hasTrafficLight) return false;
    const cosY = Math.cos(node.plazaYaw);
    const sinY = Math.sin(node.plazaYaw);
    // Primary (phase 0) axis aligned near plaza Z
    const localZ = Math.abs(-approachTanX * sinY + approachTanZ * cosY);
    const localX = Math.abs(approachTanX * cosY + approachTanZ * sinY);
    const isPrimaryAxis = localZ >= localX;
    if (isPrimaryAxis) {
      return currentPhaseSec >= 5.5; // Red or amber for NS
    }
    return currentPhaseSec < 7.0 || currentPhaseSec >= 12.5; // Red or amber for EW
  }

  // Lane arrow shared materials
  const laneArrowGeo = new THREE.PlaneGeometry(2.6, 3.8);
  laneArrowGeo.rotateX(-Math.PI / 2);
  const laneArrowMats: Record<LaneArrowSpec['kind'], THREE.MeshBasicMaterial> = {
    straight: new THREE.MeshBasicMaterial({
      map: createLaneArrowTexture('straight', maxAnisotropy),
      transparent: true,
      alphaTest: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    left: new THREE.MeshBasicMaterial({
      map: createLaneArrowTexture('left', maxAnisotropy),
      transparent: true,
      alphaTest: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    right: new THREE.MeshBasicMaterial({
      map: createLaneArrowTexture('right', maxAnisotropy),
      transparent: true,
      alphaTest: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    straight_right: new THREE.MeshBasicMaterial({
      map: createLaneArrowTexture('straight_right', maxAnisotropy),
      transparent: true,
      alphaTest: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    straight_left: new THREE.MeshBasicMaterial({
      map: createLaneArrowTexture('straight_left', maxAnisotropy),
      transparent: true,
      alphaTest: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  };

  const chunks: WorldChunk[] = [];
  const dummy = new THREE.Object3D();
  const colorHelper = new THREE.Color();

  for (const [key, bucket] of buckets.entries()) {
    const [cxStr, czStr] = key.split(',');
    const cx = Number(cxStr);
    const cz = Number(czStr);
    chunks.push({
      cx,
      cz,
      centerX: (cx + 0.5) * CHUNK_SIZE,
      centerZ: (cz + 0.5) * CHUNK_SIZE,
      bucket,
      vegState: 'unloaded',
      vegGroup: null,
      landmarkState: 'unloaded',
      landmarkGroup: null,
    });
  }

  function buildVegGroup(bucket: ChunkBucket, detail: 'high' | 'mid'): THREE.Group {
    const group = new THREE.Group();

    if (bucket.pines.length > 0) {
      const n = bucket.pines.length;
      if (detail === 'high') {
        const trunks = new THREE.InstancedMesh(pineTrunkGeo, trunkMat, n);
        const lowers = new THREE.InstancedMesh(pineLowerGeo, leafMat, n);
        const uppers = new THREE.InstancedMesh(pineUpperGeo, leafMat, n);
        trunks.castShadow = true;
        lowers.castShadow = true;
        uppers.castShadow = true;
        for (let i = 0; i < n; i++) {
          const p = bucket.pines[i];
          dummy.scale.set(p.sx, p.sy, p.sz);
          dummy.rotation.set(0, p.rotY, 0);
          dummy.position.set(p.x, 1.5 * p.sy, p.z);
          dummy.updateMatrix();
          trunks.setMatrixAt(i, dummy.matrix);
          dummy.position.set(p.x, 4.6 * p.sy, p.z);
          dummy.updateMatrix();
          lowers.setMatrixAt(i, dummy.matrix);
          dummy.position.set(p.x, 7.2 * p.sy, p.z);
          dummy.updateMatrix();
          uppers.setMatrixAt(i, dummy.matrix);
          colorHelper.setHex(p.color);
          lowers.setColorAt(i, colorHelper);
          colorHelper.offsetHSL(0, 0, 0.04);
          uppers.setColorAt(i, colorHelper);
        }
        trunks.computeBoundingSphere();
        lowers.computeBoundingSphere();
        uppers.computeBoundingSphere();
        if (lowers.instanceColor) lowers.instanceColor.needsUpdate = true;
        if (uppers.instanceColor) uppers.instanceColor.needsUpdate = true;
        group.add(trunks, lowers, uppers);
      } else {
        const lodCones = new THREE.InstancedMesh(pineLodGeo, pineLodMat, n);
        for (let i = 0; i < n; i++) {
          const p = bucket.pines[i];
          dummy.scale.set(p.sx, p.sy, p.sz);
          dummy.rotation.set(0, p.rotY, 0);
          dummy.position.set(p.x, 4.3 * p.sy, p.z);
          dummy.updateMatrix();
          lodCones.setMatrixAt(i, dummy.matrix);
          colorHelper.setHex(p.color);
          lodCones.setColorAt(i, colorHelper);
        }
        lodCones.computeBoundingSphere();
        if (lodCones.instanceColor) lodCones.instanceColor.needsUpdate = true;
        group.add(lodCones);
      }
    }

    if (bucket.roundTrees.length > 0) {
      const n = bucket.roundTrees.length;
      if (detail === 'high') {
        const trunks = new THREE.InstancedMesh(roundTrunkGeo, trunkMat, n);
        const crowns = new THREE.InstancedMesh(roundCrownGeo, leafMat, n);
        trunks.castShadow = true;
        crowns.castShadow = true;
        for (let i = 0; i < n; i++) {
          const p = bucket.roundTrees[i];
          dummy.scale.set(p.sx, p.sy, p.sz);
          dummy.rotation.set(0, p.rotY, 0);
          dummy.position.set(p.x, 1.4 * p.sy, p.z);
          dummy.updateMatrix();
          trunks.setMatrixAt(i, dummy.matrix);
          dummy.position.set(p.x, 4.3 * p.sy, p.z);
          dummy.updateMatrix();
          crowns.setMatrixAt(i, dummy.matrix);
          colorHelper.setHex(p.color);
          crowns.setColorAt(i, colorHelper);
        }
        trunks.computeBoundingSphere();
        crowns.computeBoundingSphere();
        if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
        group.add(trunks, crowns);
      } else {
        const lodCrowns = new THREE.InstancedMesh(roundLodGeo, leafMat, n);
        for (let i = 0; i < n; i++) {
          const p = bucket.roundTrees[i];
          dummy.scale.set(p.sx, p.sy * 1.1, p.sz);
          dummy.rotation.set(0, p.rotY, 0);
          dummy.position.set(p.x, 3.8 * p.sy, p.z);
          dummy.updateMatrix();
          lodCrowns.setMatrixAt(i, dummy.matrix);
          colorHelper.setHex(p.color);
          lodCrowns.setColorAt(i, colorHelper);
        }
        lodCrowns.computeBoundingSphere();
        if (lodCrowns.instanceColor) lodCrowns.instanceColor.needsUpdate = true;
        group.add(lodCrowns);
      }
    }

    if (bucket.palms.length > 0) {
      const n = bucket.palms.length;
      if (detail === 'high') {
        const trunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, n);
        const crowns = new THREE.InstancedMesh(palmCrownGeo, palmLeafMat, n);
        trunks.castShadow = true;
        crowns.castShadow = true;
        for (let i = 0; i < n; i++) {
          const p = bucket.palms[i];
          dummy.scale.set(p.sx, p.sy, p.sz);
          dummy.rotation.set(0.06, p.rotY, 0.04);
          dummy.position.set(p.x, 3.0 * p.sy, p.z);
          dummy.updateMatrix();
          trunks.setMatrixAt(i, dummy.matrix);
          dummy.position.set(p.x, 6.1 * p.sy, p.z);
          dummy.updateMatrix();
          crowns.setMatrixAt(i, dummy.matrix);
        }
        trunks.computeBoundingSphere();
        crowns.computeBoundingSphere();
        group.add(trunks, crowns);
      } else {
        const lodPalms = new THREE.InstancedMesh(palmLodGeo, palmLeafMat, n);
        for (let i = 0; i < n; i++) {
          const p = bucket.palms[i];
          dummy.scale.set(p.sx, p.sy, p.sz);
          dummy.rotation.set(0.06, p.rotY, 0.04);
          dummy.position.set(p.x, 3.4 * p.sy, p.z);
          dummy.updateMatrix();
          lodPalms.setMatrixAt(i, dummy.matrix);
        }
        lodPalms.computeBoundingSphere();
        group.add(lodPalms);
      }
    }

    if (bucket.bushes.length > 0) {
      const n = bucket.bushes.length;
      const bushes = new THREE.InstancedMesh(
        detail === 'high' ? bushGeoHigh : bushGeoLow,
        bushMat,
        n,
      );
      if (detail === 'high') {
        bushes.castShadow = true;
        bushes.receiveShadow = true;
      }
      for (let i = 0; i < n; i++) {
        const b = bucket.bushes[i];
        dummy.position.set(b.x, 0.68 * b.sy, b.z);
        dummy.rotation.set(0, b.rotY, 0);
        dummy.scale.set(b.sx, b.sy, b.sz);
        dummy.updateMatrix();
        bushes.setMatrixAt(i, dummy.matrix);
        colorHelper.setHex(b.color);
        bushes.setColorAt(i, colorHelper);
      }
      bushes.computeBoundingSphere();
      if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
      group.add(bushes);
    }

    if (bucket.smallRocks.length > 0) {
      const n = bucket.smallRocks.length;
      const rocks = new THREE.InstancedMesh(
        detail === 'high' ? rockGeoHigh : rockGeoLow,
        rockMat,
        n,
      );
      if (detail === 'high') {
        rocks.castShadow = true;
        rocks.receiveShadow = true;
      }
      for (let i = 0; i < n; i++) {
        const r = bucket.smallRocks[i];
        dummy.position.set(r.x, r.y, r.z);
        dummy.rotation.set(0, r.rotY, 0);
        dummy.scale.set(r.sx, r.sy, r.sz);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
        colorHelper.setHex(r.color);
        rocks.setColorAt(i, colorHelper);
      }
      rocks.computeBoundingSphere();
      if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
      group.add(rocks);
    }

    return group;
  }

  function buildLandmarkGroup(bucket: ChunkBucket, detail: 'high' | 'mid'): THREE.Group {
    const group = new THREE.Group();

    if (bucket.largeRocks.length > 0) {
      const n = bucket.largeRocks.length;
      const rocks = new THREE.InstancedMesh(
        detail === 'high' ? rockGeoHigh : rockGeoLow,
        rockMat,
        n,
      );
      if (detail === 'high') {
        rocks.castShadow = true;
        rocks.receiveShadow = true;
      }
      for (let i = 0; i < n; i++) {
        const r = bucket.largeRocks[i];
        dummy.position.set(r.x, r.y, r.z);
        dummy.rotation.set(0, r.rotY, 0);
        dummy.scale.set(r.sx, r.sy, r.sz);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
        colorHelper.setHex(r.color);
        rocks.setColorAt(i, colorHelper);
      }
      rocks.computeBoundingSphere();
      if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
      group.add(rocks);
    }

    if (bucket.buildings.length > 0) {
      const n = bucket.buildings.length;
      const bldgs = new THREE.InstancedMesh(
        bldgHighGeo,
        detail === 'high' ? bldgHighMat : bldgLodMat,
        n,
      );
      if (detail === 'high') {
        bldgs.receiveShadow = true;
        bldgs.castShadow = true;
      }

      const roofCaps = new THREE.InstancedMesh(roofUnitGeo, roofTrimMat, n);
      const roofPenthouses = new THREE.InstancedMesh(roofUnitGeo, roofTrimMat, n);

      for (let i = 0; i < n; i++) {
        const b = bucket.buildings[i];
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(0, b.rotY, 0);
        dummy.scale.set(b.sx, b.sy, b.sz);
        dummy.updateMatrix();
        bldgs.setMatrixAt(i, dummy.matrix);
        colorHelper.setHex(b.color);
        bldgs.setColorAt(i, colorHelper);

        dummy.position.set(b.x, b.sy + 0.55, b.z);
        dummy.rotation.set(0, b.rotY, 0);
        dummy.scale.set(b.sx * 1.03, 1.1, b.sz * 1.03);
        dummy.updateMatrix();
        roofCaps.setMatrixAt(i, dummy.matrix);

        const ph = 2.4 + hash3(b.x, b.z, 3) * 4.5;
        dummy.position.set(b.x, b.sy + 1.1 + ph * 0.5, b.z);
        dummy.rotation.set(0, b.rotY, 0);
        dummy.scale.set(b.sx * 0.52, ph, b.sz * 0.52);
        dummy.updateMatrix();
        roofPenthouses.setMatrixAt(i, dummy.matrix);
      }
      bldgs.computeBoundingSphere();
      roofCaps.computeBoundingSphere();
      roofPenthouses.computeBoundingSphere();
      if (bldgs.instanceColor) bldgs.instanceColor.needsUpdate = true;
      group.add(bldgs, roofCaps, roofPenthouses);

      if (detail === 'high') {
        const tall = bucket.buildings.filter((b) => b.sy > 72);
        if (tall.length > 0) {
          const spires = new THREE.InstancedMesh(spireGeo, roofTrimMat, tall.length);
          const beacons = new THREE.InstancedMesh(beaconGeo, spireBeaconMat, tall.length);
          for (let i = 0; i < tall.length; i++) {
            const b = tall[i];
            const sh = 10 + hash3(b.x, b.z, 9) * 14;
            dummy.position.set(b.x, b.sy + 4.5 + sh * 0.5, b.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, sh, 1);
            dummy.updateMatrix();
            spires.setMatrixAt(i, dummy.matrix);

            dummy.position.set(b.x, b.sy + 4.5 + sh, b.z);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            beacons.setMatrixAt(i, dummy.matrix);
          }
          spires.computeBoundingSphere();
          beacons.computeBoundingSphere();
          group.add(spires, beacons);
        }
      }
    }

    if (detail === 'high' && bucket.lamps.length > 0) {
      const n = bucket.lamps.length;
      const poles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, n);
      const heads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, n);
      poles.castShadow = true;
      for (let i = 0; i < n; i++) {
        const l = bucket.lamps[i];
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.position.set(l.x, l.y + 3.5, l.z);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);

        dummy.position.set(l.x - l.nx * l.s * 0.6, l.y + 7.1, l.z - l.nz * l.s * 0.6);
        dummy.rotation.set(0, Math.atan2(l.nx, l.nz) + Math.PI / 2, 0);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      }
      poles.computeBoundingSphere();
      heads.computeBoundingSphere();
      group.add(poles, heads);
    }

    // Yellow Chevron Curve Signs (InstancedMesh per chunk)
    if (bucket.chevrons.length > 0) {
      const n = bucket.chevrons.length;
      const boards = new THREE.InstancedMesh(chevronGeo, chevronMat, n);
      const legs = new THREE.InstancedMesh(chevronLegGeo, signPostMat, n * 2);
      for (let i = 0; i < n; i++) {
        const c = bucket.chevrons[i];
        dummy.position.set(c.x, c.y + 1.65, c.z);
        dummy.rotation.set(0, c.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        boards.setMatrixAt(i, dummy.matrix);

        const lx = Math.cos(c.yaw) * 0.7;
        const lz = -Math.sin(c.yaw) * 0.7;
        dummy.position.set(c.x + lx, c.y + 0.9, c.z + lz);
        dummy.updateMatrix();
        legs.setMatrixAt(i * 2, dummy.matrix);
        dummy.position.set(c.x - lx, c.y + 0.9, c.z - lz);
        dummy.updateMatrix();
        legs.setMatrixAt(i * 2 + 1, dummy.matrix);
      }
      boards.computeBoundingSphere();
      legs.computeBoundingSphere();
      group.add(boards, legs);
    }

    // Highway Overhead Gantries, Green Direction Signs, Speed Limit & Street Name Signs
    if (bucket.signs.length > 0) {
      const postMatrices: THREE.Matrix4[] = [];
      for (const s of bucket.signs) {
        if (s.kind === 'gantry') {
          const span = s.roadWidth + 4.8;
          const legOff = span * 0.5;
          const rightX = Math.cos(s.yaw);
          const rightZ = -Math.sin(s.yaw);

          const g = new THREE.Group();
          g.position.set(s.x, s.y, s.z);
          g.rotation.y = s.yaw;

          const truss = new THREE.Mesh(gantryTrussGeo, signPostMat);
          truss.position.set(0, 7.5, 0);
          truss.scale.set(span + 1.2, 1, 1);
          g.add(truss);

          const face = new THREE.Mesh(gantryBoardGeo, s.mat);
          face.position.set(0, 7.5, 0.25);
          g.add(face);

          const back = new THREE.Mesh(gantryBoardGeo, signBackMat);
          back.position.set(0, 7.5, -0.25);
          back.rotation.y = Math.PI;
          g.add(back);

          for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(gantryLegGeo, signPostMat);
            leg.position.set(side * legOff, 3.8, 0);
            leg.castShadow = detail === 'high';
            g.add(leg);
          }
          void rightX;
          void rightZ;
          group.add(g);
        } else if (s.kind === 'direction') {
          const g = new THREE.Group();
          g.position.set(s.x, s.y, s.z);
          g.rotation.y = s.yaw;

          const face = new THREE.Mesh(dirBoardGeo, s.mat);
          face.position.set(0, 3.25, 0.08);
          g.add(face);

          const back = new THREE.Mesh(dirBoardGeo, signBackMat);
          back.position.set(0, 3.25, -0.08);
          back.rotation.y = Math.PI;
          g.add(back);

          const cosY = Math.cos(s.yaw);
          const sinY = Math.sin(s.yaw);
          for (const side of [-1, 1]) {
            dummy.position.set(s.x + cosY * side * 1.4, s.y + 1.7, s.z - sinY * side * 1.4);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            postMatrices.push(dummy.matrix.clone());
          }
          group.add(g);
        } else if (s.kind === 'speed') {
          const g = new THREE.Group();
          g.position.set(s.x, s.y, s.z);
          g.rotation.y = s.yaw;

          const face = new THREE.Mesh(speedBoardGeo, s.mat);
          face.position.set(0, 2.8, 0.06);
          g.add(face);

          const back = new THREE.Mesh(speedBoardGeo, signBackMat);
          back.position.set(0, 2.8, -0.06);
          back.rotation.y = Math.PI;
          g.add(back);

          dummy.position.set(s.x, s.y + 1.7, s.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          postMatrices.push(dummy.matrix.clone());
          group.add(g);
        } else {
          const g = new THREE.Group();
          g.position.set(s.x, s.y, s.z);
          g.rotation.y = s.yaw;

          const face = new THREE.Mesh(streetBoardGeo, s.mat);
          face.position.set(0, 3.5, 0.05);
          g.add(face);

          const back = new THREE.Mesh(streetBoardGeo, s.mat);
          back.position.set(0, 3.5, -0.05);
          back.rotation.y = Math.PI;
          g.add(back);

          dummy.position.set(s.x, s.y + 1.7, s.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          postMatrices.push(dummy.matrix.clone());
          group.add(g);
        }
      }

      if (postMatrices.length > 0) {
        const posts = new THREE.InstancedMesh(signLegGeo, signPostMat, postMatrices.length);
        for (let i = 0; i < postMatrices.length; i++) {
          posts.setMatrixAt(i, postMatrices[i]);
        }
        posts.computeBoundingSphere();
        group.add(posts);
      }
    }

    // Animated Traffic Lights (Instanced poles + housings + phase-shared glowing bulbs)
    if (bucket.signals.length > 0) {
      const n = bucket.signals.length;
      const poles = new THREE.InstancedMesh(sigPoleGeo, signPostMat, n);
      const heads = new THREE.InstancedMesh(sigHeadGeo, sigHousingMat, n);

      const nsList = bucket.signals.filter((s) => s.phaseGroup === 0);
      const ewList = bucket.signals.filter((s) => s.phaseGroup === 1);

      for (let i = 0; i < n; i++) {
        const sig = bucket.signals[i];
        dummy.position.set(sig.x, sig.y + 2.6, sig.z);
        dummy.rotation.set(0, sig.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);

        dummy.position.set(sig.x, sig.y + 4.9, sig.z);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      }
      poles.computeBoundingSphere();
      heads.computeBoundingSphere();
      group.add(poles, heads);

      const addSignalBulbs = (
        list: SignalPlacement[],
        matR: THREE.Material,
        matA: THREE.Material,
        matG: THREE.Material,
      ) => {
        if (list.length === 0) return;
        const mR = new THREE.InstancedMesh(sigBulbGeo, matR, list.length);
        const mA = new THREE.InstancedMesh(sigBulbGeo, matA, list.length);
        const mG = new THREE.InstancedMesh(sigBulbGeo, matG, list.length);
        for (let i = 0; i < list.length; i++) {
          const sig = list[i];
          const fX = Math.sin(sig.yaw) * 0.24;
          const fZ = Math.cos(sig.yaw) * 0.24;
          dummy.rotation.set(0, sig.yaw, 0);
          dummy.scale.set(1, 1, 1);

          dummy.position.set(sig.x + fX, sig.y + 5.32, sig.z + fZ);
          dummy.updateMatrix();
          mR.setMatrixAt(i, dummy.matrix);

          dummy.position.set(sig.x + fX, sig.y + 4.9, sig.z + fZ);
          dummy.updateMatrix();
          mA.setMatrixAt(i, dummy.matrix);

          dummy.position.set(sig.x + fX, sig.y + 4.48, sig.z + fZ);
          dummy.updateMatrix();
          mG.setMatrixAt(i, dummy.matrix);
        }
        mR.computeBoundingSphere();
        mA.computeBoundingSphere();
        mG.computeBoundingSphere();
        group.add(mR, mA, mG);
      };

      addSignalBulbs(nsList, sigMatNS_Red, sigMatNS_Amber, sigMatNS_Green);
      addSignalBulbs(ewList, sigMatEW_Red, sigMatEW_Amber, sigMatEW_Green);
    }

    // Painted Lane Turn Arrows (InstancedMesh grouped by kind)
    if (detail === 'high' && bucket.laneArrows.length > 0) {
      const byKind = new Map<LaneArrowSpec['kind'], LaneArrowPlacement[]>();
      for (const la of bucket.laneArrows) {
        let arr = byKind.get(la.kind);
        if (!arr) {
          arr = [];
          byKind.set(la.kind, arr);
        }
        arr.push(la);
      }
      for (const [kind, list] of byKind.entries()) {
        const im = new THREE.InstancedMesh(laneArrowGeo, laneArrowMats[kind], list.length);
        for (let i = 0; i < list.length; i++) {
          const la = list[i];
          const arrowScale = Math.min(1, la.roadWidth / 10);
          dummy.position.set(la.x, la.y + JUNCTION_Y_OFFSET + 0.025, la.z);
          dummy.rotation.set(0, la.yaw, 0);
          dummy.scale.set(arrowScale, 1, arrowScale);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
        }
        im.computeBoundingSphere();
        group.add(im);
      }
    }

    return group;
  }

  function disposeGroup(group: THREE.Group | null): void {
    if (!group) return;
    scene.remove(group);
    group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        obj.dispose();
      }
    });
  }

  let activeChunkPx = 0;
  let activeChunkPz = 0;
  let activeChunkUnloadSq = 920 * 920;

  function isChunkLoaded(x: number, z: number): boolean {
    const dx = x - activeChunkPx;
    const dz = z - activeChunkPz;
    return dx * dx + dz * dz <= activeChunkUnloadSq;
  }

  function updateChunks(px: number, pz: number, quality: GraphicsQuality, forceAll = false): void {
    const vegLoadRadius = quality === 'low' ? 280 : quality === 'med' ? 320 : 360;
    const vegUnloadRadius = vegLoadRadius + 70;
    const vegLodRadius = 175;
    const vegLoadSq = vegLoadRadius * vegLoadRadius;
    const vegUnloadSq = vegUnloadRadius * vegUnloadRadius;
    const vegLodSq = vegLodRadius * vegLodRadius;

    const lmLoadRadius = quality === 'low' ? 620 : quality === 'med' ? 920 : 1280;
    const lmUnloadRadius = lmLoadRadius + 160;
    const lmLodRadius = quality === 'low' ? 280 : quality === 'med' ? 440 : 640;
    const lmLoadSq = lmLoadRadius * lmLoadRadius;
    const lmUnloadSq = lmUnloadRadius * lmUnloadRadius;
    const lmLodSq = lmLodRadius * lmLodRadius;

    activeChunkPx = px;
    activeChunkPz = pz;
    activeChunkUnloadSq = lmUnloadSq;

    let createdThisCall = 0;
    const maxCreatePerCall = forceAll ? 9999 : 6;

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = c.centerX - px;
      const dz = c.centerZ - pz;
      const dSq = dx * dx + dz * dz;
      const b = c.bucket;

      const hasVeg =
        b.pines.length > 0 ||
        b.roundTrees.length > 0 ||
        b.palms.length > 0 ||
        b.bushes.length > 0 ||
        b.smallRocks.length > 0;

      if (hasVeg) {
        if (dSq > vegUnloadSq) {
          if (c.vegState !== 'unloaded') {
            disposeGroup(c.vegGroup);
            c.vegGroup = null;
            c.vegState = 'unloaded';
          }
        } else if (dSq <= vegLoadSq || c.vegState !== 'unloaded') {
          const desiredVeg: 'high' | 'mid' = dSq <= vegLodSq ? 'high' : 'mid';
          if (c.vegState !== desiredVeg) {
            if (c.vegState !== 'unloaded' || createdThisCall < maxCreatePerCall) {
              disposeGroup(c.vegGroup);
              c.vegGroup = buildVegGroup(b, desiredVeg);
              scene.add(c.vegGroup);
              c.vegState = desiredVeg;
              createdThisCall++;
            }
          }
        }
      }

      const hasLandmarks =
        b.buildings.length > 0 ||
        b.largeRocks.length > 0 ||
        b.lamps.length > 0 ||
        b.signs.length > 0 ||
        b.chevrons.length > 0 ||
        b.signals.length > 0 ||
        b.laneArrows.length > 0;

      if (hasLandmarks) {
        if (dSq > lmUnloadSq) {
          if (c.landmarkState !== 'unloaded') {
            disposeGroup(c.landmarkGroup);
            c.landmarkGroup = null;
            c.landmarkState = 'unloaded';
          }
        } else if (dSq <= lmLoadSq || c.landmarkState !== 'unloaded') {
          const desiredLm: 'high' | 'mid' = dSq <= lmLodSq ? 'high' : 'mid';
          if (c.landmarkState !== desiredLm) {
            if (c.landmarkState !== 'unloaded' || createdThisCall < maxCreatePerCall) {
              disposeGroup(c.landmarkGroup);
              c.landmarkGroup = buildLandmarkGroup(b, desiredLm);
              scene.add(c.landmarkGroup);
              c.landmarkState = desiredLm;
              createdThisCall++;
            }
          }
        }
      }
    }
  }

  // Horizon Mountain Ring (far perimeter beyond 1280m)
  {
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x5c788b,
      roughness: 1.0,
      flatShading: true,
    });
    const peakGeo = new THREE.ConeGeometry(1, 1, 6);
    const peaks = new THREE.InstancedMesh(peakGeo, mountainMat, 34);
    const dummyM = new THREE.Object3D();
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2;
      const r = 1280 + rnd() * 240;
      const h = 190 + rnd() * 220;
      const rad = 180 + rnd() * 110;
      dummyM.position.set(Math.cos(a) * r, h / 2 - 10, Math.sin(a) * r);
      dummyM.rotation.set(0, rnd() * Math.PI, 0);
      dummyM.scale.set(rad, h, rad);
      dummyM.updateMatrix();
      peaks.setMatrixAt(i, dummyM.matrix);
    }
    peaks.computeBoundingSphere();
    scene.add(peaks);
  }

  // ================= 6B. City Bus Stops + Instanced Walking Pedestrians & Circling Birds =================
  const busStops: BusStopSpec[] = [];
  {
    const busEdgeIds = ['e_city_boulevard', 'e_civic_ave', 'e_metro_way', 'e_apex_south'];
    const shelterMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.35 });
    const shelterGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      roughness: 0.15,
      transparent: true,
      opacity: 0.42,
      clearcoat: 0.8,
    });
    const benchMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.72 });
    const busPoleHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.5, 2.2) });

    for (const eid of busEdgeIds) {
      const edge = network.edgeMap.get(eid);
      if (!edge) continue;
      const idx = Math.floor(edge.samples.length * 0.48);
      const samp = edge.samples[idx];
      const lat = edge.width * 0.5 + 2.05;
      const sx = samp.pos.x + samp.norm.x * lat;
      const sz = samp.pos.z + samp.norm.z * lat;
      if (railway.nearRail(sx, sz, 14)) continue;

      const yaw = Math.atan2(samp.tan.x, samp.tan.z);
      const g = new THREE.Group();
      g.position.set(sx, samp.y + ROAD_CONFIG.city.yOffset + 0.14, sz);
      g.rotation.y = yaw;

      // Canopy roof + rear glass + side posts + bench + bus stop sign
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 5.4), shelterMetalMat);
      roof.position.set(0.1, 2.65, 0);
      roof.castShadow = true;
      g.add(roof);

      const backGlass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.35, 5.0), shelterGlassMat);
      backGlass.position.set(0.95, 1.32, 0);
      g.add(backGlass);

      for (const pz of [-2.3, 2.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), shelterMetalMat);
        post.position.set(0.95, 1.3, pz);
        g.add(post);
      }

      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 3.2), benchMat);
      bench.position.set(0.42, 0.55, 0);
      g.add(bench);

      const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.1, 6), shelterMetalMat);
      signPole.position.set(-0.7, 1.55, 2.7);
      g.add(signPole);

      const signHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.12), busPoleHeadMat);
      signHead.position.set(-0.7, 2.9, 2.7);
      g.add(signHead);

      scene.add(g);
      colliders.addObb(sx + samp.norm.x * 0.4, sz + samp.norm.z * 0.4, 0.85, 2.8, yaw, samp.y - 0.5, samp.y + 3.2);
      busStops.push({
        edgeId: edge.id,
        s: samp.s,
        x: samp.pos.x,
        y: samp.y,
        z: samp.pos.z,
      });
    }
  }

  // Instanced Walking Pedestrians along City Sidewalks
  interface PedWalker {
    edge: RoadEdge;
    s: number;
    minS: number;
    maxS: number;
    dir: 1 | -1;
    side: 1 | -1;
    speed: number;
    phase: number;
    color: number;
  }
  const pedWalkers: PedWalker[] = [];
  const pedColorPalette = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0x8b5cf6, 0xf8fafc, 0x334155, 0xec4899];
  for (const edge of network.edges) {
    if (!edge.hasSidewalk) continue;
    const fromN = network.nodeMap.get(edge.fromNodeId);
    const toN = network.nodeMap.get(edge.toNodeId);
    const minS = (fromN?.radius ?? 14) + 5;
    const maxS = edge.length - ((toN?.radius ?? 14) + 5);
    if (maxS - minS < 18) continue;

    for (const side of [-1, 1] as const) {
      const walkersOnSide = 4 + ((edge.length > 220 ? 2 : 0));
      for (let w = 0; w < walkersOnSide; w++) {
        const s = minS + ((w + 0.35 + rnd() * 0.3) / walkersOnSide) * (maxS - minS);
        const samp = edge.samples[Math.min(edge.samples.length - 1, Math.floor(s / edge.segmentStep))];
        const lat = side * (edge.width * 0.5 + 1.1);
        const px = samp.pos.x + samp.norm.x * lat;
        const pz = samp.pos.z + samp.norm.z * lat;
        if (railway.nearRail(px, pz, 11)) continue;
        pedWalkers.push({
          edge,
          s,
          minS,
          maxS,
          dir: rnd() > 0.5 ? 1 : -1,
          side,
          speed: 1.35 + rnd() * 0.55,
          phase: rnd() * Math.PI * 2,
          color: pedColorPalette[(rnd() * pedColorPalette.length) | 0],
        });
      }
    }
  }

  const pedCount = pedWalkers.length;
  const pedTorsoGeo = new THREE.CylinderGeometry(0.19, 0.22, 0.95, 7);
  const pedHeadGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const pedTorsoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
  const pedHeadMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.7 });
  const pedTorsoMesh = new THREE.InstancedMesh(pedTorsoGeo, pedTorsoMat, Math.max(1, pedCount));
  const pedHeadMesh = new THREE.InstancedMesh(pedHeadGeo, pedHeadMat, Math.max(1, pedCount));
  pedTorsoMesh.frustumCulled = false;
  pedHeadMesh.frustumCulled = false;
  if (pedCount > 0) {
    const pedC = new THREE.Color();
    for (let i = 0; i < pedCount; i++) {
      pedC.setHex(pedWalkers[i].color);
      pedTorsoMesh.setColorAt(i, pedC);
    }
    if (pedTorsoMesh.instanceColor) pedTorsoMesh.instanceColor.needsUpdate = true;
    scene.add(pedTorsoMesh, pedHeadMesh);
  } else {
    pedTorsoMesh.count = 0;
    pedHeadMesh.count = 0;
  }

  // Circling Sky Birds (4 flocks, 24 birds) rendered in a single InstancedMesh
  interface SkyBird {
    cx: number;
    cz: number;
    baseY: number;
    radius: number;
    ang: number;
    angSpeed: number;
    flapPhase: number;
  }
  const flockCenters = [
    { x: oceanCenter.x - 140, z: oceanCenter.z - 120, y: 42 },
    { x: cityAnchor.x - 40, z: cityAnchor.z + 30, y: 58 },
    { x: mountainAnchor.x, z: mountainAnchor.z, y: 64 },
    { x: riverMid.x, z: riverMid.z, y: 38 },
  ];
  const birds: SkyBird[] = [];
  for (let f = 0; f < flockCenters.length; f++) {
    const fc = flockCenters[f];
    for (let b = 0; b < 6; b++) {
      birds.push({
        cx: fc.x + (rnd() - 0.5) * 40,
        cz: fc.z + (rnd() - 0.5) * 40,
        baseY: fc.y + rnd() * 14,
        radius: 26 + rnd() * 34,
        ang: rnd() * Math.PI * 2,
        angSpeed: (0.18 + rnd() * 0.1) * (f % 2 === 0 ? 1 : -1),
        flapPhase: rnd() * Math.PI * 2,
      });
    }
  }
  const birdWingGeo = new THREE.BoxGeometry(1.35, 0.08, 0.36);
  const birdMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
  const birdMesh = new THREE.InstancedMesh(birdWingGeo, birdMat, birds.length);
  birdMesh.frustumCulled = false;
  scene.add(birdMesh);

  const liveDummy = new THREE.Object3D();
  function updateLivingDetails(dt: number, timeSec: number, px: number, pz: number): void {
    // 1. Update City Sidewalk Pedestrians
    if (pedCount > 0) {
      let anyPedMoved = false;
      for (let i = 0; i < pedCount; i++) {
        const w = pedWalkers[i];
        w.s += w.dir * w.speed * dt;
        if (w.s >= w.maxS) {
          w.s = w.maxS;
          w.dir = -1;
        } else if (w.s <= w.minS) {
          w.s = w.minS;
          w.dir = 1;
        }
        const samp = w.edge.samples[Math.min(w.edge.samples.length - 1, Math.floor(w.s / w.edge.segmentStep))];
        const lat = w.side * (w.edge.width * 0.5 + 1.1);
        const wx = samp.pos.x + samp.norm.x * lat;
        const wz = samp.pos.z + samp.norm.z * lat;

        // Only update visible range around camera/player for high mobile efficiency
        const dx = wx - px;
        const dz = wz - pz;
        if (dx * dx + dz * dz > 260 * 260) {
          liveDummy.position.set(0, -100, 0);
          liveDummy.scale.setScalar(0.001);
          liveDummy.updateMatrix();
          pedTorsoMesh.setMatrixAt(i, liveDummy.matrix);
          pedHeadMesh.setMatrixAt(i, liveDummy.matrix);
          anyPedMoved = true;
          continue;
        }

        const bob = Math.abs(Math.sin(timeSec * 6.5 + w.phase)) * 0.09;
        const yaw = Math.atan2(samp.tan.x * w.dir, samp.tan.z * w.dir);
        liveDummy.rotation.set(0, yaw, 0);
        liveDummy.scale.set(1, 1, 1);

        const sidewalkTopY = samp.y + ROAD_CONFIG.city.yOffset + 0.14;
        liveDummy.position.set(wx, sidewalkTopY + 0.72 + bob, wz);
        liveDummy.updateMatrix();
        pedTorsoMesh.setMatrixAt(i, liveDummy.matrix);

        liveDummy.position.set(wx, sidewalkTopY + 1.38 + bob, wz);
        liveDummy.updateMatrix();
        pedHeadMesh.setMatrixAt(i, liveDummy.matrix);
        anyPedMoved = true;
      }
      if (anyPedMoved) {
        pedTorsoMesh.instanceMatrix.needsUpdate = true;
        pedHeadMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 2. Update Circling Sky Birds
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      b.ang += b.angSpeed * dt;
      const bx = b.cx + Math.cos(b.ang) * b.radius;
      const bz = b.cz + Math.sin(b.ang) * b.radius;
      const dirSign = b.angSpeed >= 0 ? 1 : -1;
      const tangentYaw = Math.atan2(-Math.sin(b.ang) * dirSign, Math.cos(b.ang) * dirSign);
      const wingTilt = Math.sin(timeSec * 7.2 + b.flapPhase) * 0.35;

      liveDummy.position.set(bx, b.baseY + Math.sin(timeSec * 1.4 + b.flapPhase) * 1.2, bz);
      liveDummy.rotation.set(0, tangentYaw, wingTilt);
      liveDummy.scale.set(1, 1 + Math.abs(wingTilt) * 1.8, 1);
      liveDummy.updateMatrix();
      birdMesh.setMatrixAt(i, liveDummy.matrix);
    }
    birdMesh.instanceMatrix.needsUpdate = true;
  }

  // ================= 7. Physics Surface, Guardrail & Minimap Projection =================
  function surfaceAt(x: number, z: number, _nearestCircuitDist: number): SurfaceType {
    const net = network.nearestOnNetwork(x, z);
    if (net.onPavedSurface) return 'asphalt';
    if (net.onDirtSurface) return 'dirt';
    if (Math.hypot(x - oceanCenter.x, z - oceanCenter.z) < OCEAN_R + 65) return 'sand';
    if (Math.hypot(x - offroadAnchor.x, z - offroadAnchor.z) < 300) return 'dirt';
    return 'grass';
  }

  function guardrailLimitAt(idx: number, lat: number): number {
    // Allow free exit onto the canyon & dirt trail areas or intersections
    if (idx >= OR0 + 10 && idx <= OR1 - 10) return 240;
    void lat;
    return GUARDRAIL_OFFSET - 1.2;
  }

  const { minX, maxX, minZ, maxZ, spanMax } = network.worldBounds;
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const padX = (spanMax - spanX) * 0.5;
  const padZ = (spanMax - spanZ) * 0.5;

  const worldToMinimap = (x: number, z: number) => ({
    nx: ((x - minX + padX) / spanMax) * 0.8 + 0.1,
    ny: ((z - minZ + padZ) / spanMax) * 0.8 + 0.1,
  });

  const sampleSegment = (startIdx: number, endIdx: number, step = 6): MinimapPoint[] => {
    const out: MinimapPoint[] = [];
    const totalSteps = endIdx >= startIdx ? endIdx - startIdx : count - startIdx + endIdx;
    for (let s = 0; s <= totalSteps; s += step) {
      const p = points[(startIdx + s) % count];
      const { nx, ny } = worldToMinimap(p.x, p.z);
      out.push({ x: nx * 100, y: ny * 100 });
    }
    const pLast = points[((endIdx % count) + count) % count];
    const { nx, ny } = worldToMinimap(pLast.x, pLast.z);
    out.push({ x: nx * 100, y: ny * 100 });
    return out;
  };

  const minimapPoints = sampleSegment(0, count - 1, 14);
  const { networkEdges, networkNodes } = network.buildMinimapEdgesAndNodes(worldToMinimap);

  const riverA = worldToMinimap(
    riverPoint.x + riverNormal.x * inLen,
    riverPoint.z + riverNormal.z * inLen,
  );
  const riverB = worldToMinimap(
    riverPoint.x - riverNormal.x * outLen,
    riverPoint.z - riverNormal.z * outLen,
  );
  const lakeCenters = lakeWorldCenters.map((lc) => {
    const m = worldToMinimap(lc.x, lc.z);
    return { x: m.nx * 100, y: m.ny * 100 };
  });
  const oceanM = worldToMinimap(oceanCenter.x, oceanCenter.z);

  const makeCircuitMarker = (
    idx: number,
    icon: string,
    label: string,
    biome: MinimapZoneMarker['biome'],
  ): MinimapZoneMarker => {
    const k = ((idx % count) + count) % count;
    const p = points[k];
    const n = normals[k];
    const sd = n.dot(center.clone().sub(p)) > 0 ? -1 : 1;
    const m = worldToMinimap(p.x + n.x * sd * 95, p.z + n.z * sd * 95);
    return { x: m.nx * 100, y: m.ny * 100, icon, label, biome };
  };

  const cityMidM = worldToMinimap(355, -25);
  const offroadLoopPoints: MinimapPoint[] = [];
  for (const e of network.edges) {
    if (e.id === 'e_dirt_canyon_west' || e.id === 'e_dirt_canyon_east') {
      for (let i = 0; i < e.samples.length; i += 6) {
        const m = worldToMinimap(e.samples[i].pos.x, e.samples[i].pos.z);
        offroadLoopPoints.push({ x: m.nx * 100, y: m.ny * 100 });
      }
    }
  }

  const minimapWorld: MinimapWorldData = {
    fullPoints: minimapPoints,
    highwayPoints: sampleSegment(HW0, HW1, 10),
    mountainPoints: sampleSegment(MT0, MT1, 8),
    tunnelPoints: sampleSegment(T0, T1, 6),
    coastalPoints: sampleSegment(CO0, CO1, 8),
    offroadPoints: sampleSegment(OR0, OR1, 8),
    offroadLoopPoints,
    cityPoints: sampleSegment(C0, C1, 8),
    bridgePoints: sampleSegment(RB - BF - BR, RB + BF + BR, 5),
    networkEdges,
    networkNodes,
    railPoints: railway.getMinimapPoints(worldToMinimap),
    riverStart: { x: riverA.nx * 100, y: riverA.ny * 100 },
    riverEnd: { x: riverB.nx * 100, y: riverB.ny * 100 },
    lakeCenters,
    lakeRadius: (LAKE_R / spanMax) * 80,
    oceanCenter: { x: oceanM.nx * 100, y: oceanM.ny * 100 },
    oceanRadius: (OCEAN_R / spanMax) * 80,
    zoneMarkers: [
      makeCircuitMarker(0, '🛣', 'Express Highway', 'highway'),
      makeCircuitMarker((T0 + T1) >> 1, '⛰', 'Mountain Pass', 'mountain'),
      makeCircuitMarker(RB, '🌊', 'Coastal Bridge', 'coastal'),
      makeCircuitMarker((OR0 + OR1) >> 1, '🏜', 'Off-Road Canyon', 'offroad'),
      { x: cityMidM.nx * 100, y: cityMidM.ny * 100, icon: '🏙', label: 'City District', biome: 'city' },
    ],
    worldBounds: { minX, maxX, minZ, maxZ, spanMax },
  };

  return {
    network,
    colliders,
    railway,
    busStops,
    points,
    tangents,
    normals,
    ys,
    cumDist,
    totalLength,
    segmentStep,
    count,
    tunnelRange: [T0, T1],
    offroadRange: [OR0, OR1],
    waterTextures,
    roadMaterial: roadMat,
    asphaltMaterials,
    cityFacadeMaterial: bldgHighMat,
    tunnelWetRoadMaterial,
    lampHeadMaterial: lampHeadMat,
    lampPositions,
    minimapPoints,
    minimapWorld,
    slopeAt: network.circuitSlopeAt,
    zoneOf: network.circuitZoneOf,
    surfaceAt,
    guardrailLimitAt,
    worldToMinimap,
    nearestIndex: network.nearestCircuitIndex,
    sampleAtDistance: network.sampleCircuitAtDistance,
    updateChunks,
    isChunkLoaded,
    updateTrafficLights,
    isRedLight,
    updateLivingDetails,
  };
}
