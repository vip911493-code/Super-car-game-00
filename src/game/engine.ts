import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RaceAudio } from './audio';
import { CarRig, createCarRig } from './car';
import { CircleCollisionHit } from './colliders';
import { ROAD_CONFIG } from './roadConfig';
import { RoadEdge, RoadNetwork } from './roadNetwork';
import { calculateRaceRewards, DEFAULT_GARAGE_STATE } from './storage';
import { createSmokeTexture } from './textures';
import { buildTrackAndScenery, SurfaceType, TrackData } from './track';
import { TrafficVehicleFactory, TrafficVehicleKind, TrafficVehicleRig } from './vehicles';
import {
  CAR_LIVERIES,
  CameraMode,
  CarLivery,
  GameMode,
  GamePhase,
  GarageState,
  GraphicsQuality,
  GpsInstruction,
  HudSnapshot,
  MinimapPoint,
  MinimapRacerDot,
  MinimapWorldData,
  RaceSummary,
  TimeOfDayMode,
  TouchControlKey,
  UpgradeLevel,
  WeatherMode,
} from './types';

// Pre-allocated scratch helpers (zero GC in render loop)
const _camTarget = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _sunDir = new THREE.Vector3(0.55, 0.56, 0.42).normalize();
const _todZenith = new THREE.Color();
const _todHorizon = new THREE.Color();
const _todSunGlow = new THREE.Color();
const _todCloudLight = new THREE.Color();
const _todCloudShadow = new THREE.Color();
const _todSunColor = new THREE.Color();
const _todHemiSky = new THREE.Color();
const _todHemiGround = new THREE.Color();
const _nightZenith = new THREE.Color(0x030713);
const _nightHorizon = new THREE.Color(0x0c172e);
const _nightSunGlow = new THREE.Color(0x5d7ca8);
const _nightCloudLight = new THREE.Color(0x1b2b48);
const _nightCloudShadow = new THREE.Color(0x070d1c);
const _nightSunColor = new THREE.Color(0x5273a6);
const _nightHemiSky = new THREE.Color(0x1f3056);
const _nightHemiGround = new THREE.Color(0x090d16);
const _rainZenith = new THREE.Color(0x3a4a5e);
const _rainHorizon = new THREE.Color(0x748498);
const _fogHorizon = new THREE.Color(0xbfc8d4);
const _roadDryColor = new THREE.Color(0xffffff);
const _roadWetColor = new THREE.Color(0x6d7787);
const _aiPos = new THREE.Vector3();
const _aiTan = new THREE.Vector3();
const _aiNorm = new THREE.Vector3();
const _aiLookPos = new THREE.Vector3();
const _aiLookTan = new THREE.Vector3();
const _aiLookNorm = new THREE.Vector3();
const _aiAheadTan = new THREE.Vector3();
const _aiAheadPos = new THREE.Vector3();
const _aiAheadNorm = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _frustumPt = new THREE.Vector3();
const _colHit: CircleCollisionHit = {
  hit: false,
  dx: 0,
  dz: 0,
  nx: 0,
  nz: 0,
  penetration: 0,
};

const TOTAL_LAPS = 3;
const TOTAL_RACERS = 4;
const FIXED_AI_DT = 1 / 60;
const BASE_MAX_SPEED = 88; // m/s (~317 km/h) — highest top speed & accel of all racers
const GEARS = [0, 18, 35, 53, 71, 90];
const PLAYER_LANE_OFFSET = -5.2;
const WP_ACCEPT_RADIUS = 8.0;
const TURN_WP_ACCEPT_RADIUS = 6.5;
const TURN_WP_CAPACITY = 6;

const SMOKE_POOL_SIZE = 104;
const DUST_POOL_SIZE = 104;
const SPARK_POOL_SIZE = 72;
const SKID_POOL_SIZE = 960;
const SPEEDLINE_POOL_SIZE = 32;
const RAIN_MAX_COUNT = 820;
const STREET_LIGHT_POOL_SIZE = 3;
const MAX_TRAFFIC_COUNT = 35;
const GPS_MARKER_POOL_SIZE = 96;

interface DayKeyFrame {
  sunDir: THREE.Vector3;
  zenith: THREE.Color;
  horizon: THREE.Color;
  sunGlow: THREE.Color;
  cloudLight: THREE.Color;
  cloudShadow: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  cityEmissive: number;
  headlightIntensity: number;
  exposure: number;
}

const DAY_KEYFRAMES: DayKeyFrame[] = [
  // 0: Crisp Golden Morning
  {
    sunDir: new THREE.Vector3(0.76, 0.38, 0.52).normalize(),
    zenith: new THREE.Color(0x2864b4),
    horizon: new THREE.Color(0xf0cba8),
    sunGlow: new THREE.Color(0xffe0ad),
    cloudLight: new THREE.Color(0xfff1dc),
    cloudShadow: new THREE.Color(0x889cb8),
    sunColor: new THREE.Color(0xffdcb0),
    sunIntensity: 2.25,
    hemiSky: new THREE.Color(0xcce2ff),
    hemiGround: new THREE.Color(0x3a522a),
    hemiIntensity: 0.66,
    cityEmissive: 0.62,
    headlightIntensity: 2.9,
    exposure: 1.06,
  },
  // 1: Bright Clear Noon
  {
    sunDir: new THREE.Vector3(0.32, 0.86, 0.39).normalize(),
    zenith: new THREE.Color(0x1f62bc),
    horizon: new THREE.Color(0xc5e3f8),
    sunGlow: new THREE.Color(0xfff7dc),
    cloudLight: new THREE.Color(0xffffff),
    cloudShadow: new THREE.Color(0x9ab6d2),
    sunColor: new THREE.Color(0xfff5e0),
    sunIntensity: 2.45,
    hemiSky: new THREE.Color(0xd2e9ff),
    hemiGround: new THREE.Color(0x3d622d),
    hemiIntensity: 0.74,
    cityEmissive: 0.25,
    headlightIntensity: 2.4,
    exposure: 1.05,
  },
  // 2: Warm Sunset
  {
    sunDir: new THREE.Vector3(-0.78, 0.2, 0.59).normalize(),
    zenith: new THREE.Color(0x1c2854),
    horizon: new THREE.Color(0xf08354),
    sunGlow: new THREE.Color(0xff9f59),
    cloudLight: new THREE.Color(0xffc38c),
    cloudShadow: new THREE.Color(0x573f64),
    sunColor: new THREE.Color(0xff9b54),
    sunIntensity: 2.15,
    hemiSky: new THREE.Color(0xffb58d),
    hemiGround: new THREE.Color(0x2b2434),
    hemiIntensity: 0.58,
    cityEmissive: 1.55,
    headlightIntensity: 4.1,
    exposure: 1.12,
  },
];

const RadialMotionBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      if (uStrength <= 0.0005) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 dir = vUv - vec2(0.5);
      float dist = length(dir);
      float edgeMask = smoothstep(0.18, 0.72, dist);
      vec2 stepVec = dir * (uStrength * edgeMask);
      vec4 acc = texture2D(tDiffuse, vUv) * 0.25;
      acc += texture2D(tDiffuse, vUv - stepVec * 0.22) * 0.2;
      acc += texture2D(tDiffuse, vUv - stepVec * 0.48) * 0.2;
      acc += texture2D(tDiffuse, vUv - stepVec * 0.74) * 0.18;
      acc += texture2D(tDiffuse, vUv - stepVec * 1.0) * 0.17;
      gl_FragColor = acc;
    }
  `,
};

interface AiCarSpec {
  name: string;
  livery: CarLivery;
  laneOffset: number;
  laneRatio: number;
  baseMaxSpeed: number;
  weaveFreq: number;
  weavePhase: number;
}

const AI_SPECS: AiCarSpec[] = [
  {
    name: 'Blue',
    livery: {
      id: 'ai-blue',
      name: 'Blue',
      paintHex: 0x2563eb,
      cssColor: '#3b82f6',
      stripeHex: 0xf8fafc,
      stripeCss: '#f8fafc',
    },
    laneOffset: -2.08,
    laneRatio: -0.26,
    baseMaxSpeed: 70,
    weaveFreq: 0.55,
    weavePhase: 0.4,
  },
  {
    name: 'Yellow',
    livery: {
      id: 'ai-yellow',
      name: 'Yellow',
      paintHex: 0xeab308,
      cssColor: '#eab308',
      stripeHex: 0x111827,
      stripeCss: '#111827',
    },
    laneOffset: 2.08,
    laneRatio: 0.26,
    baseMaxSpeed: 74,
    weaveFreq: 0.68,
    weavePhase: 2.3,
  },
  {
    name: 'Green',
    livery: {
      id: 'ai-green',
      name: 'Green',
      paintHex: 0x16a34a,
      cssColor: '#22c55e',
      stripeHex: 0xfef08a,
      stripeCss: '#fef08a',
    },
    laneOffset: 4.96,
    laneRatio: 0.62,
    baseMaxSpeed: 77.5,
    weaveFreq: 0.48,
    weavePhase: 4.1,
  },
];

interface AiCarState {
  spec: AiCarSpec;
  rig: CarRig;
  wpIdx: number;
  lap: number;
  s: number;
  speed: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  prevHeading: number;
  prevPitch: number;
  prevRoll: number;
  steerAngle: number;
  braking: boolean;
  lane: number;
  laneTarget: number;
  avoidLat: number;
  yieldTimer: number;
  hitCooldown: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  stuckOriginX: number;
  stuckOriginZ: number;
  stuckTimer: number;
  hardStuckTimer: number;
}

interface TurnWaypoint {
  x: number;
  y: number;
  z: number;
}

interface TrafficCarState {
  kind: TrafficVehicleKind;
  rig: TrafficVehicleRig;
  edge: RoadEdge;
  sampleIdx: number;
  dir: 1 | -1;
  speed: number;
  maxSpeed: number;
  radius: number;
  laneBiasRatio: number;
  busStopTimer: number;
  busStopCooldown: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  prevHeading: number;
  prevPitch: number;
  prevRoll: number;
  steerAngle: number;
  braking: boolean;
  hitCooldown: number;
  avoidLat: number;
  yieldTimer: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  dotColor: string;
  turning: boolean;
  turnWaypoints: TurnWaypoint[];
  turnWpCount: number;
  turnWpIdx: number;
  nextEdge: RoadEdge | null;
  nextDir: 1 | -1;
  nextSampleIdx: number;
  intentionalStop: boolean;
  stuckOriginX: number;
  stuckOriginZ: number;
  stuckTimer: number;
  hardStuckTimer: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onRaceFinish: (summary: RaceSummary) => void;
  onMuteChange: (muted: boolean) => void;
}

function createAtmosphericSkyDome(): {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
} {
  const geo = new THREE.SphereGeometry(3200, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: _sunDir.clone() },
      uZenith: { value: new THREE.Color(0x2864b4) },
      uHorizon: { value: new THREE.Color(0xf0cba8) },
      uSunGlow: { value: new THREE.Color(0xffe0ad) },
      uCloudLight: { value: new THREE.Color(0xfff1dc) },
      uCloudShadow: { value: new THREE.Color(0x889cb8) },
      uTime: { value: 0 },
      uNightFactor: { value: 0 },
      uOvercast: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldDir;
      uniform vec3 uSunDir;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunGlow;
      uniform vec3 uCloudLight;
      uniform vec3 uCloudShadow;
      uniform float uTime;
      uniform float uNightFactor;
      uniform float uOvercast;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float hash31(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p = p * 2.07 + vec2(13.1, 7.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.52));

        vec3 sunD = normalize(uSunDir);
        float sunAmt = max(dot(dir, sunD), 0.0);
        float sunDiscScale = mix(1.0, 0.25, uNightFactor) * (1.0 - 0.72 * uOvercast);
        col += uSunGlow * (pow(sunAmt, 10.0) * 0.34 + pow(sunAmt, 420.0) * 2.1) * sunDiscScale;

        // Crisp procedural starry sky at Night
        if (uNightFactor > 0.01 && dir.y > 0.02) {
          vec3 grid1 = floor(dir * 260.0);
          vec3 grid2 = floor(dir * 420.0);
          float s1 = smoothstep(0.991, 0.999, hash31(grid1));
          float s2 = smoothstep(0.994, 0.9995, hash31(grid2)) * 0.65;
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.4 + hash31(grid1) * 40.0);
          float elevMask = smoothstep(0.02, 0.28, dir.y);
          float starBright = (s1 + s2) * twinkle * elevMask * uNightFactor * (1.0 - 0.85 * uOvercast);
          col += vec3(0.88, 0.93, 1.0) * starBright * 1.65;
        }

        if (dir.y > 0.015) {
          vec2 cloudUv = dir.xz / (dir.y + 0.16) * 0.55 + vec2(uTime * 0.008, uTime * 0.003);
          float c1 = fbm(cloudUv * 1.4);
          float c2 = fbm(cloudUv * 2.9 - vec2(uTime * 0.005, 0.0));
          float cloudThresh = mix(0.46, 0.22, uOvercast);
          float density = smoothstep(cloudThresh, 0.78, c1 * 0.72 + c2 * 0.28);
          float horizonFade = smoothstep(0.015, 0.22, dir.y);
          density *= horizonFade * mix(0.84, 0.95, uOvercast);

          float cloudLit = clamp(0.35 + 0.65 * sunAmt + (1.0 - c2) * 0.2, 0.0, 1.0);
          vec3 cloudCol = mix(uCloudShadow, uCloudLight, cloudLit);
          cloudCol += uSunGlow * pow(sunAmt, 6.0) * 0.26 * (1.0 - uNightFactor * 0.7);
          col = mix(col, cloudCol, density);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

export class TurboDriftEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private motionBlurPass: ShaderPass | null = null;
  private useComposer = false;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private skyDome: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private fog: THREE.Fog;
  private hemiLight: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private tunnelLight: THREE.PointLight;
  private isSoftwareGl: boolean;
  private quality: GraphicsQuality;

  // Day-time cycle & Weather
  private timeOfDayMode: TimeOfDayMode = 'auto';
  private weatherMode: WeatherMode = 'clear';
  private timeCyclePhase = 0.25;
  private atmosphereElapsed = 0;
  private baseFogNear = 340;
  private baseFogFar = 1120;
  private nightMix = 0;
  private streetLights: THREE.PointLight[] = [];

  // Reflections (static PMREM + live CubeCamera probe on High quality)
  private baseEnvMap: THREE.Texture;
  private cubeRenderTarget: THREE.WebGLCubeRenderTarget;
  private cubeCamera: THREE.CubeCamera;
  private envFrameCounter = 0;

  private track: TrackData;
  private car: CarRig;
  private aiCars: AiCarState[] = [];
  private trafficFactory = new TrafficVehicleFactory();
  private trafficCars: TrafficCarState[] = [];
  private audio = new RaceAudio();

  // GPS Waypoint & 3D Route Chevrons
  private gpsTargetWorld: { x: number; z: number } | null = null;
  private gpsWorldPoints: THREE.Vector3[] = [];
  private gpsMinimapPoints: MinimapPoint[] = [];
  private gpsInstruction: GpsInstruction | null = null;
  private lastGpsComputeMs = 0;
  private gpsMarkerMesh: THREE.InstancedMesh;

  // Garage Upgrade Levels & Nitro state
  private engineLevel: UpgradeLevel = DEFAULT_GARAGE_STATE.engineLevel;
  private tiresLevel: UpgradeLevel = DEFAULT_GARAGE_STATE.tiresLevel;
  private nitroLevel: UpgradeLevel = DEFAULT_GARAGE_STATE.nitroLevel;
  private nitro = 1.0;
  private isBoosting = false;

  // Pooled VFX (Tire Smoke + Off-Road Dust + Collision Sparks + Skid Marks + High-Speed Wind Lines + Rain)
  private smokeMesh: THREE.InstancedMesh;
  private smokePos = new Float32Array(SMOKE_POOL_SIZE * 3);
  private smokeVel = new Float32Array(SMOKE_POOL_SIZE * 3);
  private smokeLife = new Float32Array(SMOKE_POOL_SIZE);
  private smokeMaxLife = new Float32Array(SMOKE_POOL_SIZE);
  private smokeCursor = 0;

  private dustMesh: THREE.InstancedMesh;
  private dustPos = new Float32Array(DUST_POOL_SIZE * 3);
  private dustVel = new Float32Array(DUST_POOL_SIZE * 3);
  private dustLife = new Float32Array(DUST_POOL_SIZE);
  private dustMaxLife = new Float32Array(DUST_POOL_SIZE);
  private dustCursor = 0;
  private dustAccum = 0;

  private sparkMesh: THREE.InstancedMesh;
  private sparkPos = new Float32Array(SPARK_POOL_SIZE * 3);
  private sparkVel = new Float32Array(SPARK_POOL_SIZE * 3);
  private sparkLife = new Float32Array(SPARK_POOL_SIZE);
  private sparkMaxLife = new Float32Array(SPARK_POOL_SIZE);
  private sparkCursor = 0;

  private skidMesh: THREE.InstancedMesh;
  private skidCursor = 0;
  private skidAccum = 0;

  private speedLineMesh: THREE.InstancedMesh;
  private speedLineMat: THREE.MeshBasicMaterial;
  private speedLineAngle = new Float32Array(SPEEDLINE_POOL_SIZE);
  private speedLineRad = new Float32Array(SPEEDLINE_POOL_SIZE);
  private speedLineZ = new Float32Array(SPEEDLINE_POOL_SIZE);
  private speedLineLen = new Float32Array(SPEEDLINE_POOL_SIZE);

  private rainMesh: THREE.InstancedMesh;
  private rainRelPos = new Float32Array(RAIN_MAX_COUNT * 3);
  private rainSpeed = new Float32Array(RAIN_MAX_COUNT);
  private activeRainCount = 360;

  // Input state
  private heldKeys: Record<string, boolean> = {};
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();
  private lastHudEmitMs = 0;
  private lastChunkX = 99999;
  private lastChunkZ = 99999;

  // Game & Physics state
  private phase: GamePhase = 'title';
  private gameMode: GameMode = 'race';
  private x = 0;
  private y = 0;
  private z = 0;
  private heading = 0;
  private pitch = 0;
  private vx = 0;
  private vz = 0;
  private steer = 0;
  private analogSteer = 0;
  private trackIdx = 0;
  private prevTrackIdx = 0;
  private playerLat = PLAYER_LANE_OFFSET;
  private onRoad = true;
  private surfaceType: SurfaceType = 'asphalt';
  private surfaceDriveScale = 1.0;
  private surfaceGrip = 8.8;
  private surfaceDrag = 0.0;
  private staticCrashCooldown = 0;
  private camMode: CameraMode = 0;
  private shake = 0;
  private titleAngle = 0.55;
  private tunnelFactor = 0;

  // Countdown, Lap & Scoring state
  private countdownRemaining = 0;
  private countdownStage = 0;
  private raceElapsedSec = 0;
  private lap = 1;
  private checkpointStage = 0;
  private playerPosition = 1;
  private leaderGapText: string | null = null;
  private currentZone: string | null = null;
  private zoneBannerTimer = 0;
  private raceStartMs = 0;
  private lapStartMs = 0;
  private pauseStartedMs = 0;
  private lapTimesSec: number[] = [];
  private bestLapSec: number | null = null;
  private topSpeedKmh = 0;
  private driftScore = 0;
  private activeDriftPoints = 0;
  private driftGraceTimer = 0;

  private bannerText: string | null = null;
  private bannerTone: 'info' | 'best' | 'finish' | 'countdown' = 'info';
  private bannerTimer = 0;

  private gearNum = 1;
  private rpm = 0.15;
  private aiAccum = 0;
  private aiWinnerState: AiCarState | null = null;
  private aiDebugEnabled = false;
  private stuckRespawnCount = 0;
  private aiDebugLines: THREE.LineSegments;
  private aiDebugPos: Float32Array;
  private aiDebugCol: Float32Array;

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    initialQuality: GraphicsQuality = 'med',
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.quality = initialQuality;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(width, height);

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc5e1f8);
    this.fog = new THREE.Fog(0xc5e1f8, 340, 1120);
    this.scene.fog = this.fog;

    const sky = createAtmosphericSkyDome();
    this.skyDome = sky.mesh;
    this.skyMat = sky.material;
    this.scene.add(this.skyDome);

    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.15, 1240);
    this.scene.add(this.camera);

    // Post-processing pipeline (subtle bloom on HDR lights/sparks + high-speed radial motion blur)
    if (!this.isSoftwareGl) {
      const composer = new EffectComposer(this.renderer);
      composer.setSize(width, height);
      const renderPass = new RenderPass(this.scene, this.camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2))),
        0.34, // subtle strength
        0.32, // tight radius
        0.96, // high threshold so only headlights, brake lights, sparks & sun glow
      );
      const motionBlurPass = new ShaderPass(RadialMotionBlurShader);
      const outputPass = new OutputPass();

      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.addPass(motionBlurPass);
      composer.addPass(outputPass);

      this.composer = composer;
      this.bloomPass = bloomPass;
      this.motionBlurPass = motionBlurPass;
    }

    // Procedural Studio Environment Map for crisp clearcoat car reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.baseEnvMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.baseEnvMap;
    pmremGenerator.dispose();

    // Live CubeCamera for real-time car reflections in High quality mode
    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(128, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCamera = new THREE.CubeCamera(0.8, 1200, this.cubeRenderTarget);
    this.scene.add(this.cubeCamera);

    // Warm/cool contrast lighting rig
    this.hemiLight = new THREE.HemisphereLight(0xc7e2ff, 0x3b5c2b, 0.68);
    this.scene.add(this.hemiLight);

    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 3.5;
    const sc = this.sun.shadow.camera;
    sc.left = -64;
    sc.right = 64;
    sc.top = 64;
    sc.bottom = -64;
    sc.near = 1;
    sc.far = 290;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target);

    const maxAniso = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    this.track = buildTrackAndScenery(this.scene, maxAniso);

    this.car = createCarRig(CAR_LIVERIES[0], true);
    this.tunnelLight = new THREE.PointLight(0xffe2a8, 0, 52, 1.5);
    this.tunnelLight.position.set(0, 4.5, -2);
    this.car.root.add(this.tunnelLight);
    this.scene.add(this.car.root);

    for (let i = 0; i < STREET_LIGHT_POOL_SIZE; i++) {
      const sl = new THREE.PointLight(0xffcb7a, 0, 48, 1.45);
      this.scene.add(sl);
      this.streetLights.push(sl);
    }

    this.aiCars = AI_SPECS.map((spec) => {
      const rig = createCarRig(spec.livery);
      this.scene.add(rig.root);
      return {
        spec,
        rig,
        wpIdx: 0,
        lap: 0,
        s: 0,
        speed: 0,
        x: 0,
        y: 0,
        z: 0,
        heading: 0,
        pitch: 0,
        roll: 0,
        prevX: 0,
        prevY: 0,
        prevZ: 0,
        prevHeading: 0,
        prevPitch: 0,
        prevRoll: 0,
        steerAngle: 0,
        braking: false,
        lane: spec.laneOffset,
        laneTarget: spec.laneOffset,
        avoidLat: 0,
        yieldTimer: 0,
        hitCooldown: 0,
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        stuckOriginX: 0,
        stuckOriginZ: 0,
        stuckTimer: 0,
        hardStuckTimer: 0,
      };
    });

    const particleTex = createSmokeTexture();

    // Pooled Tire Drift Smoke InstancedMesh
    const smokeGeo = new THREE.SphereGeometry(0.45, 8, 6);
    const smokeMat = new THREE.MeshBasicMaterial({
      map: particleTex,
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE_POOL_SIZE);
    this.smokeMesh.frustumCulled = false;
    this.initParticlePool(this.smokeMesh, SMOKE_POOL_SIZE);
    this.scene.add(this.smokeMesh);

    // Pooled Off-Road Dust Plume InstancedMesh
    const dustMat = new THREE.MeshBasicMaterial({
      map: particleTex,
      color: 0xc29563,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    this.dustMesh = new THREE.InstancedMesh(smokeGeo, dustMat, DUST_POOL_SIZE);
    this.dustMesh.frustumCulled = false;
    this.initParticlePool(this.dustMesh, DUST_POOL_SIZE);
    this.scene.add(this.dustMesh);

    // Pooled Collision Sparks InstancedMesh (HDR bright orange-gold streaks)
    const sparkGeo = new THREE.BoxGeometry(0.055, 0.055, 0.55);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3.8, 1.9, 0.35),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_POOL_SIZE);
    this.sparkMesh.frustumCulled = false;
    this.initParticlePool(this.sparkMesh, SPARK_POOL_SIZE);
    this.scene.add(this.sparkMesh);

    // Pooled Skid Mark InstancedMesh (persistent road tire marks)
    const skidGeo = new THREE.PlaneGeometry(0.38, 1.05);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x090a0c,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, SKID_POOL_SIZE);
    this.skidMesh.frustumCulled = false;
    this.initParticlePool(this.skidMesh, SKID_POOL_SIZE);
    this.scene.add(this.skidMesh);

    // Camera-attached High-Speed Peripheral Wind/Speed Lines
    const speedLineGeo = new THREE.PlaneGeometry(0.028, 2.8);
    speedLineGeo.rotateX(Math.PI / 2);
    this.speedLineMat = new THREE.MeshBasicMaterial({
      color: 0xeef8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.speedLineMesh = new THREE.InstancedMesh(
      speedLineGeo,
      this.speedLineMat,
      SPEEDLINE_POOL_SIZE,
    );
    this.speedLineMesh.frustumCulled = false;
    this.speedLineMesh.visible = false;
    for (let i = 0; i < SPEEDLINE_POOL_SIZE; i++) {
      this.speedLineAngle[i] = (i / SPEEDLINE_POOL_SIZE) * Math.PI * 2 + Math.random() * 0.2;
      this.speedLineRad[i] = 3.2 + Math.random() * 2.8;
      this.speedLineZ[i] = -Math.random() * 24;
      this.speedLineLen[i] = 0.7 + Math.random() * 1.1;
    }
    this.camera.add(this.speedLineMesh);

    // Quality-aware Rain Streak InstancedMesh
    const rainGeo = new THREE.BoxGeometry(0.025, 1.85, 0.025);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xcbe4ff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_MAX_COUNT);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    for (let i = 0; i < RAIN_MAX_COUNT; i++) {
      const p3 = i * 3;
      this.rainRelPos[p3] = (Math.random() - 0.5) * 96;
      this.rainRelPos[p3 + 1] = Math.random() * 34;
      this.rainRelPos[p3 + 2] = (Math.random() - 0.5) * 96;
      this.rainSpeed[i] = 34 + Math.random() * 14;
    }
    this.scene.add(this.rainMesh);

    // 3D Glowing Cyan GPS Route Guide Chevrons along the road
    {
      const chevronShape = new THREE.Shape();
      chevronShape.moveTo(0, 0.95);
      chevronShape.lineTo(0.85, -0.35);
      chevronShape.lineTo(0.42, -0.55);
      chevronShape.lineTo(0, 0.2);
      chevronShape.lineTo(-0.42, -0.55);
      chevronShape.lineTo(-0.85, -0.35);
      chevronShape.closePath();
      const gpsGeo = new THREE.ShapeGeometry(chevronShape);
      gpsGeo.rotateX(-Math.PI / 2);
      const gpsMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.25, 1.85, 2.3),
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
      });
      this.gpsMarkerMesh = new THREE.InstancedMesh(gpsGeo, gpsMat, GPS_MARKER_POOL_SIZE);
      this.gpsMarkerMesh.frustumCulled = false;
      this.gpsMarkerMesh.visible = false;
      this.scene.add(this.gpsMarkerMesh);
    }

    // Debug 3D Target Waypoint Lines (hidden until toggled via G or DBG button)
    {
      const maxDebugLines = AI_SPECS.length + MAX_TRAFFIC_COUNT;
      this.aiDebugPos = new Float32Array(maxDebugLines * 2 * 3);
      this.aiDebugCol = new Float32Array(maxDebugLines * 2 * 3);
      const dbgGeo = new THREE.BufferGeometry();
      dbgGeo.setAttribute('position', new THREE.BufferAttribute(this.aiDebugPos, 3));
      dbgGeo.setAttribute('color', new THREE.BufferAttribute(this.aiDebugCol, 3));
      dbgGeo.setDrawRange(0, 0);
      const dbgMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
      });
      this.aiDebugLines = new THREE.LineSegments(dbgGeo, dbgMat);
      this.aiDebugLines.frustumCulled = false;
      this.aiDebugLines.visible = false;
      this.scene.add(this.aiDebugLines);
    }

    // Spawn Ambient Road-Network Traffic Cars
    this.initAmbientTraffic();

    this.resetCarToStart();
    this.resetAiGrid();
    this.syncCarTransform();
    this.applyQualitySettings(this.quality);
    this.updateAtmosphere(0);
    this.track.updateChunks(this.x, this.z, this.quality, true);
    this.updateCamera(0.016, true);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud(true);
    this.scheduleNextFrame();
  }

  private initParticlePool(mesh: THREE.InstancedMesh, count: number): void {
    for (let i = 0; i < count; i++) {
      _dummy.position.set(0, -60, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  public setTimeOfDay(mode: TimeOfDayMode): void {
    this.timeOfDayMode = mode;
    if (mode === 'morning') this.timeCyclePhase = 0;
    else if (mode === 'noon') this.timeCyclePhase = 1;
    else if (mode === 'sunset') this.timeCyclePhase = 2;
    this.updateAtmosphere(0);
  }

  public setWeatherMode(mode: WeatherMode): void {
    this.weatherMode = mode;
    this.updateAtmosphere(0);
  }

  public applyGarageState(garage: GarageState): void {
    this.car.setCustomColors(garage.bodyColor, garage.stripeColor);
    this.car.setRimStyle(garage.rimStyle);
    this.car.setSpoiler(garage.spoilerEnabled, garage.spoilerStyle);
    this.car.setWindowTint(garage.windowTint);
    this.engineLevel = garage.engineLevel;
    this.tiresLevel = garage.tiresLevel;
    this.nitroLevel = garage.nitroLevel;
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.applyQualitySettings(quality);
    this.track.updateChunks(this.x, this.z, quality, true);
  }

  private applyQualitySettings(quality: GraphicsQuality): void {
    const dpr = window.devicePixelRatio || 1;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    let drawDist = 1240;

    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      this.useComposer = false;
      this.car.setEnvMap(this.baseEnvMap);
      drawDist = 920;
      this.baseFogNear = 250;
      this.baseFogFar = 840;
      this.activeRainCount = 180;
    } else if (quality === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      this.useComposer = false;
      drawDist = 840;
      this.baseFogNear = 210;
      this.baseFogFar = 760;
      this.activeRainCount = 160;
      this.car.setEnvMap(null);
      for (const ai of this.aiCars) ai.rig.setEnvMap(null);
      this.trafficFactory.setEnvMap(null);
    } else if (quality === 'med') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.shadowMap.needsUpdate = true;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.useComposer = false;
      drawDist = 1240;
      this.baseFogNear = 340;
      this.baseFogFar = 1120;
      this.activeRainCount = 360;
      this.car.setEnvMap(this.baseEnvMap);
      for (const ai of this.aiCars) ai.rig.setEnvMap(this.baseEnvMap);
      this.trafficFactory.setEnvMap(null);
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.needsUpdate = true;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.useComposer = !!this.composer;
      drawDist = 1720;
      this.baseFogNear = 480;
      this.baseFogFar = 1560;
      this.activeRainCount = RAIN_MAX_COUNT;
      this.car.setEnvMap(this.cubeRenderTarget.texture);
      for (const ai of this.aiCars) ai.rig.setEnvMap(this.baseEnvMap);
      this.trafficFactory.setEnvMap(this.baseEnvMap);
    }

    const trafficLimit = this.getTrafficLimit();
    for (let i = 0; i < this.trafficCars.length; i++) {
      this.trafficCars[i].rig.root.visible = i < trafficLimit;
    }

    this.rainMesh.count = this.activeRainCount;

    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
      this.bloomPass?.resolution.set(
        Math.max(1, Math.floor(width / 2)),
        Math.max(1, Math.floor(height / 2)),
      );
    }

    this.camera.far = drawDist;
    this.camera.updateProjectionMatrix();
    this.skyDome.scale.setScalar((drawDist * 0.85) / 3200);
    this.updateAtmosphere(0);
  }

  public getMinimapPoints(): MinimapPoint[] {
    return this.track.minimapPoints;
  }

  public getMinimapWorldData(): MinimapWorldData {
    return this.track.minimapWorld;
  }

  public setLivery(livery: CarLivery): void {
    this.car.setLivery(livery);
  }

  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
    this.emitHud(true);
  }

  public setGpsWaypointMinimap(pt: MinimapPoint | null): void {
    if (!pt) {
      this.gpsTargetWorld = null;
      this.gpsWorldPoints = [];
      this.gpsMinimapPoints = [];
      this.gpsInstruction = null;
      this.gpsMarkerMesh.visible = false;
      this.emitHud(true);
      return;
    }
    const { minX, minZ, spanMax } = this.track.minimapWorld.worldBounds;
    const wPos = this.track.worldToMinimap(minX, minZ);
    // Invert worldToMinimap transform accurately
    const padMinN = wPos; // (minX, minZ) maps to (0.1 + padX/spanMax*0.8, 0.1 + padZ/spanMax*0.8)
    const padOffsetNx = padMinN.nx - 0.1;
    const padOffsetNy = padMinN.ny - 0.1;
    const wx = ((pt.x / 100 - 0.1 - padOffsetNx) / 0.8) * spanMax + minX;
    const wz = ((pt.y / 100 - 0.1 - padOffsetNy) / 0.8) * spanMax + minZ;
    this.gpsTargetWorld = { x: wx, z: wz };
    this.recomputeGpsRoute(true);
    this.emitHud(true);
  }

  public startRace(mode?: GameMode): void {
    if (mode) this.gameMode = mode;
    this.audio.init();
    this.resetRaceState();
    this.phase = 'playing';
    this.raceElapsedSec = 0;
    this.raceStartMs = performance.now();
    this.lapStartMs = this.raceStartMs;

    if (this.gameMode === 'freeRoam') {
      this.countdownRemaining = 0;
      this.countdownStage = 0;
      for (const ai of this.aiCars) ai.rig.root.visible = false;
      this.flashBanner('FREE ROAM', 'info', 1.6);
    } else {
      for (const ai of this.aiCars) ai.rig.root.visible = true;
      this.countdownRemaining = 3.0;
      this.countdownStage = 3;
      this.flashBanner('3', 'countdown', 1.0);
      this.audio.playCountdownBeep(false);
    }
    this.callbacks.onPhaseChange('playing');
    this.emitHud(true);
  }

  public pauseRace(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.pauseStartedMs = performance.now();
    this.clearHeldKeys();
    this.isBoosting = false;
    this.car.setNitroFlame(false, this.atmosphereElapsed);
    this.audio.update({
      rpm: 0,
      gear: 1,
      speedMs: 0,
      throttle: false,
      brakingHard: false,
      driftIntensity: 0,
      onRoad: true,
      isBoosting: false,
      tunnelFactor: this.tunnelFactor,
      weather: this.weatherMode,
      active: false,
    });
    this.callbacks.onPhaseChange('paused');
  }

  public resumeRace(): void {
    if (this.phase !== 'paused') return;
    this.audio.init();
    const pausedDelta = performance.now() - this.pauseStartedMs;
    this.raceStartMs += pausedDelta;
    this.lapStartMs += pausedDelta;
    this.phase = 'playing';
    this.aiAccum = 0;
    this.lastTimeMs = performance.now();
    this.callbacks.onPhaseChange('playing');
  }

  public returnToTitle(): void {
    this.clearHeldKeys();
    this.resetRaceState();
    this.phase = 'title';
    this.audio.update({
      rpm: 0,
      gear: 1,
      speedMs: 0,
      throttle: false,
      brakingHard: false,
      driftIntensity: 0,
      onRoad: true,
      isBoosting: false,
      tunnelFactor: 0,
      weather: this.weatherMode,
      active: false,
    });
    this.callbacks.onPhaseChange('title');
    this.emitHud(true);
  }

  public cycleCamera(): void {
    this.camMode = ((this.camMode + 1) % 3) as CameraMode;
    const labels = ['CHASE CAM', 'HOOD CAM', 'FAR CAM'];
    this.flashBanner(labels[this.camMode], 'info', 1.0);
    this.emitHud(true);
  }

  public resetCarPosition(): void {
    if (this.phase !== 'playing') return;
    const net = this.track.network.nearestOnNetwork(this.x, this.z);
    if (this.gameMode === 'freeRoam' || net.dist < 40) {
      const samp = net.edge.samples[net.sampleIndex];
      this.x = samp.pos.x;
      this.y = samp.y;
      this.z = samp.pos.z;
      this.heading = Math.atan2(samp.tan.x, samp.tan.z);
      this.pitch = -Math.atan(net.slope);
      this.vx = 0;
      this.vz = 0;
      this.steer = 0;
      this.analogSteer = 0;
      this.onRoad = true;
      this.surfaceType = net.edge.type === 'dirt' ? 'dirt' : 'asphalt';
      this.surfaceDriveScale = this.surfaceType === 'dirt' ? 0.88 : 1.0;
      this.surfaceGrip = this.surfaceType === 'dirt' ? 5.4 : 8.8;
      this.surfaceDrag = this.surfaceType === 'dirt' ? 0.16 : 0.0;
    } else {
      this.resetCarToPoint(this.trackIdx);
    }
    this.track.updateChunks(this.x, this.z, this.quality, true);
    this.flashBanner('RESET', 'info', 0.9);
  }

  public toggleMute(): boolean {
    this.audio.init();
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    this.callbacks.onMuteChange(next);
    return next;
  }

  public setTouchKey(key: TouchControlKey, pressed: boolean): void {
    if (pressed) this.audio.init();
    this.heldKeys[key] = pressed;
  }

  public toggleAiDebug(): boolean {
    this.aiDebugEnabled = !this.aiDebugEnabled;
    this.aiDebugLines.visible = this.aiDebugEnabled;
    if (!this.aiDebugEnabled) {
      this.aiDebugLines.geometry.setDrawRange(0, 0);
    } else {
      this.updateAiDebugLines(this.getTrafficLimit(), this.gameMode === 'race');
    }
    this.emitHud(true);
    return this.aiDebugEnabled;
  }

  private resetRaceState(): void {
    this.resetCarToStart();
    this.resetAiGrid();
    this.clearSkidMarks();
    this.countdownRemaining = 0;
    this.countdownStage = 0;
    this.raceElapsedSec = 0;
    this.lap = 1;
    this.checkpointStage = 0;
    this.playerPosition = 1;
    this.leaderGapText = null;
    this.currentZone = null;
    this.zoneBannerTimer = 0;
    this.tunnelFactor = 0;
    this.nitro = 1.0;
    this.isBoosting = false;
    this.car.setNitroFlame(false, this.atmosphereElapsed);
    this.lapTimesSec = [];
    this.bestLapSec = null;
    this.topSpeedKmh = 0;
    this.driftScore = 0;
    this.activeDriftPoints = 0;
    this.driftGraceTimer = 0;
    this.bannerText = null;
    this.bannerTimer = 0;
    this.gearNum = 1;
    this.rpm = 0.15;
    this.shake = 0;
    this.aiAccum = 0;
    this.aiWinnerState = null;
    this.stuckRespawnCount = 0;
    this.syncCarTransform();
    this.track.updateChunks(this.x, this.z, this.quality, true);

    // Cleanly reset/relocate any ambient traffic cars that drifted into unloaded chunks or near the grid
    for (const tc of this.trafficCars) {
      const dx = tc.x - this.x;
      const dz = tc.z - this.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 65 * 65 || dSq > 680 * 680 || !this.track.isChunkLoaded(tc.x, tc.z)) {
        tc.turning = false;
        tc.nextEdge = null;
        tc.turnWpCount = 0;
        tc.turnWpIdx = 0;
        tc.busStopTimer = 0;
        tc.avoidLat = 0;
        tc.yieldTimer = 0;
        this.relocateTrafficNearPlayer(tc, false);
      }
    }
  }

  private resetCarToStart(): void {
    const p = this.track.points[0];
    const t = this.track.tangents[0];
    const n = this.track.normals[0];
    this.x = p.x + n.x * PLAYER_LANE_OFFSET;
    this.y = this.track.ys[0];
    this.z = p.z + n.z * PLAYER_LANE_OFFSET;
    this.heading = Math.atan2(t.x, t.z);
    this.pitch = -Math.atan(this.track.slopeAt(0));
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.analogSteer = 0;
    this.trackIdx = 0;
    this.prevTrackIdx = 0;
    this.playerLat = PLAYER_LANE_OFFSET;
    this.onRoad = true;
    this.surfaceType = 'asphalt';
    this.surfaceDriveScale = 1.0;
    this.surfaceGrip = 8.8;
    this.surfaceDrag = 0.0;
    this.staticCrashCooldown = 0;
  }

  private resetAiGrid(): void {
    const nCount = this.track.count;
    const p = this.track.points[0];
    const t = this.track.tangents[0];
    const n = this.track.normals[0];
    const startHeading = Math.atan2(t.x, t.z);
    const startPitch = -Math.atan(this.track.slopeAt(0));
    const startY = this.track.ys[0];
    const startWpIdx = Math.min(nCount - 1, Math.max(1, Math.round(14 / this.track.segmentStep)));
    const lookIdx = Math.min(nCount - 1, startWpIdx + 2);
    const lp = this.track.points[lookIdx];
    const ln = this.track.normals[lookIdx];
    const ly = this.track.ys[lookIdx];

    for (const ai of this.aiCars) {
      ai.wpIdx = startWpIdx;
      ai.lap = 0;
      ai.s = 0;
      ai.speed = 0;
      ai.lane = ai.spec.laneOffset;
      ai.laneTarget = ai.spec.laneOffset;
      ai.avoidLat = 0;
      ai.yieldTimer = 0;
      ai.roll = 0;
      ai.pitch = startPitch;
      ai.steerAngle = 0;
      ai.braking = false;
      ai.hitCooldown = 0;
      ai.x = p.x + n.x * ai.spec.laneOffset;
      ai.y = startY;
      ai.z = p.z + n.z * ai.spec.laneOffset;
      ai.heading = startHeading;
      ai.targetX = lp.x + ln.x * ai.spec.laneOffset;
      ai.targetY = ly;
      ai.targetZ = lp.z + ln.z * ai.spec.laneOffset;
      ai.prevX = ai.x;
      ai.prevY = ai.y;
      ai.prevZ = ai.z;
      ai.prevHeading = ai.heading;
      ai.prevPitch = ai.pitch;
      ai.prevRoll = 0;
      ai.stuckOriginX = ai.x;
      ai.stuckOriginZ = ai.z;
      ai.stuckTimer = 0;
      ai.hardStuckTimer = 0;
      ai.rig.root.position.set(ai.x, ai.y, ai.z);
      ai.rig.root.rotation.set(ai.pitch, ai.heading, 0);
      ai.rig.body.rotation.set(0, 0, 0);
      ai.rig.setBraking(false);
      ai.rig.root.visible = this.gameMode === 'race';
    }
  }

  private getTrafficLimit(): number {
    if (this.quality === 'low') return 10;
    if (this.quality === 'med') return 20;
    return MAX_TRAFFIC_COUNT;
  }

  private getVehicleLateralHalfWidth(kind: TrafficVehicleKind): number {
    switch (kind) {
      case 'city_bus':
        return 1.24;
      case 'truck':
        return 1.20;
      case 'van':
      case 'ambulance':
        return 1.08;
      case 'suv':
        return 1.05;
      case 'sedan':
      case 'taxi':
      case 'police':
        return 0.98;
      default:
        return 0.45;
    }
  }

  private getTrafficLaneOffset(
    edge: RoadEdge,
    dir: 1 | -1,
    bias: number,
    kind?: TrafficVehicleKind,
  ): number {
    const halfW = edge.width * 0.5;
    const vehHalfW = kind ? this.getVehicleLateralHalfWidth(kind) : 1.05;
    const isTwoWheeler = bias > 1.15;
    const isHeavy = kind === 'truck' || kind === 'van' || kind === 'city_bus';

    let laneCenter: number;
    switch (edge.type) {
      case 'highway':
        laneCenter = isTwoWheeler ? 6.1 : isHeavy ? 5.65 : 2.15;
        break;
      case 'main':
      case 'coastal':
        laneCenter = isTwoWheeler ? 4.65 : isHeavy ? 4.25 : 1.55;
        break;
      case 'city':
      case 'mountain':
        laneCenter = isTwoWheeler ? 2.75 : 1.95;
        break;
      case 'dirt':
      default:
        laneCenter = isTwoWheeler ? 1.95 : 1.45;
        break;
    }

    const clamped = Math.min(Math.max(0.4, halfW - vehHalfW - 0.3), laneCenter);
    return dir * clamped;
  }

  private computeTrafficMaxSpeed(rig: TrafficVehicleRig, edge: RoadEdge): number {
    const roadMult = edge.type === 'highway' ? 1.28 : edge.type === 'dirt' ? 0.65 : 1.0;
    return rig.maxCruiseSpeed * roadMult;
  }

  private initAmbientTraffic(): void {
    const roster: TrafficVehicleKind[] = [
      'sedan', 'taxi', 'city_bus', 'police', 'truck', 'suv', 'motorbike', 'ambulance', 'bicycle', 'scooter',
      'van', 'sedan', 'taxi', 'suv', 'truck', 'motorbike', 'scooter', 'van', 'police', 'bicycle',
      'sedan', 'taxi', 'city_bus', 'ambulance', 'suv', 'truck', 'van', 'sedan', 'motorbike', 'scooter',
      'sedan', 'suv', 'taxi', 'truck', 'van',
    ];
    const dotPalette: Record<TrafficVehicleKind, string> = {
      sedan: '#94a3b8',
      suv: '#94a3b8',
      taxi: '#facc15',
      van: '#cbd5e1',
      truck: '#a8a29e',
      city_bus: '#38bdf8',
      motorbike: '#c084fc',
      scooter: '#c084fc',
      bicycle: '#a78bfa',
      ambulance: '#f87171',
      police: '#3b82f6',
    };

    const spawnEdges = this.track.network.edges.filter((e) => e.id !== 'e_hw_main');
    const cityEdges = spawnEdges.filter((e) => e.type === 'city');

    for (let i = 0; i < MAX_TRAFFIC_COUNT; i++) {
      const kind = roster[i % roster.length];
      const rig = this.trafficFactory.createVehicle(kind, i);
      rig.root.visible = i < this.getTrafficLimit();
      this.scene.add(rig.root);

      const pool = kind === 'city_bus' && cityEdges.length > 0 ? cityEdges : spawnEdges;
      const edge = pool[(i * 3 + (i % 5)) % pool.length];
      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const frac = 0.16 + ((i * 0.19) % 0.68);
      const sampleIdx = THREE.MathUtils.clamp(
        Math.floor((edge.samples.length - 1) * frac),
        2,
        Math.max(2, edge.samples.length - 3),
      );
      const samp = edge.samples[sampleIdx];
      const laneOff = this.getTrafficLaneOffset(edge, dir, rig.laneBiasRatio, kind);
      const tx = samp.pos.x + samp.norm.x * laneOff;
      const tz = samp.pos.z + samp.norm.z * laneOff;
      const heading = Math.atan2(samp.tan.x * dir, samp.tan.z * dir);
      const maxSpeed = this.computeTrafficMaxSpeed(rig, edge);
      const lookIdx = THREE.MathUtils.clamp(sampleIdx + dir * 3, 0, edge.samples.length - 1);
      const ls = edge.samples[lookIdx];

      const turnWaypoints: TurnWaypoint[] = [];
      for (let w = 0; w < TURN_WP_CAPACITY; w++) {
        turnWaypoints.push({ x: tx, y: samp.y, z: tz });
      }

      rig.root.position.set(tx, samp.y, tz);
      rig.root.rotation.set(0, heading, 0);

      this.trafficCars.push({
        kind,
        rig,
        edge,
        sampleIdx,
        dir,
        speed: maxSpeed * 0.85,
        maxSpeed,
        radius: rig.collisionRadius,
        laneBiasRatio: rig.laneBiasRatio,
        busStopTimer: 0,
        busStopCooldown: 0,
        x: tx,
        y: samp.y,
        z: tz,
        heading,
        pitch: 0,
        roll: 0,
        prevX: tx,
        prevY: samp.y,
        prevZ: tz,
        prevHeading: heading,
        prevPitch: 0,
        prevRoll: 0,
        steerAngle: 0,
        braking: false,
        hitCooldown: 0,
        avoidLat: 0,
        yieldTimer: 0,
        targetX: ls.pos.x + ls.norm.x * laneOff,
        targetY: ls.y,
        targetZ: ls.pos.z + ls.norm.z * laneOff,
        dotColor: dotPalette[kind],
        turning: false,
        turnWaypoints,
        turnWpCount: 0,
        turnWpIdx: 0,
        nextEdge: null,
        nextDir: 1,
        nextSampleIdx: 0,
        intentionalStop: false,
        stuckOriginX: tx,
        stuckOriginZ: tz,
        stuckTimer: 0,
        hardStuckTimer: 0,
      });
    }
  }

  private shortestAngleDelta(from: number, to: number): number {
    let diff = to - from;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  private updateCameraFrustum(): void {
    this.camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    _frustum.setFromProjectionMatrix(_projScreenMatrix);
  }

  private isSpawnSpotClear(
    wx: number,
    wz: number,
    excludeTraffic: TrafficCarState | null,
    excludeAi: AiCarState | null,
  ): boolean {
    const minSq = 12 * 12;
    const limit = this.getTrafficLimit();
    for (let i = 0; i < limit; i++) {
      const other = this.trafficCars[i];
      if (other === excludeTraffic) continue;
      const dx = other.x - wx;
      const dz = other.z - wz;
      if (dx * dx + dz * dz < minSq) return false;
    }
    if (this.gameMode === 'race') {
      for (const ai of this.aiCars) {
        if (ai === excludeAi) continue;
        const dx = ai.x - wx;
        const dz = ai.z - wz;
        if (dx * dx + dz * dz < minSq) return false;
      }
    }
    return true;
  }

  private relocateTrafficNearPlayer(tc: TrafficCarState, countAsStuck = false): void {
    this.updateCameraFrustum();
    const edges = this.track.network.edges;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);

    let bestEdge: RoadEdge | null = null;
    let bestIdx = 0;
    let bestScore = Infinity;

    let fallbackEdge: RoadEdge | null = null;
    let fallbackIdx = 0;
    let fallbackScore = Infinity;

    for (const candidate of edges) {
      if (candidate.samples.length < 8) continue;
      if (tc.kind === 'city_bus' && candidate.type !== 'city') continue;

      for (let i = 3; i < candidate.samples.length - 3; i += 3) {
        const sp = candidate.samples[i].pos;
        const dx = sp.x - this.x;
        const dz = sp.z - this.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < 105 * 105 || dSq > 620 * 620) continue;
        if (!this.track.isChunkLoaded(sp.x, sp.z)) continue;
        if (!this.isSpawnSpotClear(sp.x, sp.z, tc, null)) continue;

        const aheadDot = dx * fx + dz * fz;
        _frustumPt.set(sp.x, candidate.samples[i].y + 1.2, sp.z);
        const inView = _frustum.containsPoint(_frustumPt);
        const outOfView = !inView || dSq >= 280 * 280;

        if (aheadDot > 0 && outOfView) {
          if (dSq < bestScore) {
            bestScore = dSq;
            bestEdge = candidate;
            bestIdx = i;
          }
        } else if (outOfView) {
          if (dSq < fallbackScore) {
            fallbackScore = dSq;
            fallbackEdge = candidate;
            fallbackIdx = i;
          }
        }
      }
    }

    // If city_bus had no loaded city road ahead out of view, allow any road edge
    if (!bestEdge && !fallbackEdge) {
      for (const candidate of edges) {
        if (candidate.samples.length < 8) continue;
        for (let i = 3; i < candidate.samples.length - 3; i += 4) {
          const sp = candidate.samples[i].pos;
          const dx = sp.x - this.x;
          const dz = sp.z - this.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < 105 * 105 || dSq > 650 * 650) continue;
          if (!this.track.isChunkLoaded(sp.x, sp.z)) continue;
          _frustumPt.set(sp.x, candidate.samples[i].y + 1.2, sp.z);
          if (_frustum.containsPoint(_frustumPt) && dSq < 280 * 280) continue;
          const aheadDot = dx * fx + dz * fz;
          if (aheadDot > 0 && dSq < bestScore) {
            bestScore = dSq;
            bestEdge = candidate;
            bestIdx = i;
          } else if (dSq < fallbackScore) {
            fallbackScore = dSq;
            fallbackEdge = candidate;
            fallbackIdx = i;
          }
        }
      }
    }

    const chosenEdge = bestEdge ?? fallbackEdge;
    const chosenIdx = bestEdge ? bestIdx : fallbackIdx;
    if (!chosenEdge) return;

    const samp = chosenEdge.samples[chosenIdx];
    const alignDot = samp.tan.x * fx + samp.tan.z * fz;
    const dir: 1 | -1 = alignDot >= 0 ? 1 : -1;
    const laneOff = this.getTrafficLaneOffset(chosenEdge, dir, tc.laneBiasRatio, tc.kind);
    const lookIdx = THREE.MathUtils.clamp(
      chosenIdx + dir * 3,
      0,
      chosenEdge.samples.length - 1,
    );
    const ls = chosenEdge.samples[lookIdx];

    tc.edge = chosenEdge;
    tc.dir = dir;
    tc.sampleIdx = chosenIdx;
    tc.turning = false;
    tc.nextEdge = null;
    tc.turnWpCount = 0;
    tc.turnWpIdx = 0;
    tc.busStopTimer = 0;
    tc.busStopCooldown = 8;
    tc.avoidLat = 0;
    tc.yieldTimer = 0;
    tc.hitCooldown = 0;
    tc.maxSpeed = this.computeTrafficMaxSpeed(tc.rig, chosenEdge);
    tc.speed = Math.min(tc.maxSpeed * 0.72, 16);
    tc.x = samp.pos.x + samp.norm.x * laneOff;
    tc.y = samp.y;
    tc.z = samp.pos.z + samp.norm.z * laneOff;
    tc.heading = Math.atan2(samp.tan.x * dir, samp.tan.z * dir);
    tc.targetX = ls.pos.x + ls.norm.x * laneOff;
    tc.targetY = ls.y;
    tc.targetZ = ls.pos.z + ls.norm.z * laneOff;
    tc.pitch = 0;
    tc.roll = 0;
    tc.prevX = tc.x;
    tc.prevY = tc.y;
    tc.prevZ = tc.z;
    tc.prevHeading = tc.heading;
    tc.prevPitch = 0;
    tc.prevRoll = 0;
    tc.stuckOriginX = tc.x;
    tc.stuckOriginZ = tc.z;
    tc.stuckTimer = 0;
    tc.hardStuckTimer = 0;
    if (countAsStuck) {
      this.stuckRespawnCount++;
    }
  }

  private respawnRaceAiAheadOutOfView(ai: AiCarState, playerProgress: number): void {
    this.updateCameraFrustum();
    const n = this.track.count;
    const totalLen = this.track.totalLength;
    const finishDist = TOTAL_LAPS * totalLen;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);

    let bestIdx = -1;
    let bestScore = Infinity;
    let fallbackIdx = -1;
    let fallbackScore = Infinity;

    for (let offset = 12; offset < n - 12; offset += 2) {
      const idx = (this.trackIdx + offset) % n;
      const p = this.track.points[idx];
      const py = this.track.ys[idx];
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 110 * 110) continue;
      if (!this.isSpawnSpotClear(p.x, p.z, null, ai)) continue;

      const aheadDot = dx * fx + dz * fz;
      _frustumPt.set(p.x, py + 1.2, p.z);
      const outOfView = !_frustum.containsPoint(_frustumPt) || dSq >= 270 * 270;

      if (aheadDot > 0 && outOfView) {
        if (dSq < bestScore) {
          bestScore = dSq;
          bestIdx = idx;
        }
      } else if (outOfView) {
        if (dSq < fallbackScore) {
          fallbackScore = dSq;
          fallbackIdx = idx;
        }
      }
    }

    const chosenIdx =
      bestIdx >= 0
        ? bestIdx
        : fallbackIdx >= 0
          ? fallbackIdx
          : (this.trackIdx + Math.round(280 / this.track.segmentStep)) % n;

    const p = this.track.points[chosenIdx];
    const t = this.track.tangents[chosenIdx];
    const norm = this.track.normals[chosenIdx];
    const py = this.track.ys[chosenIdx];

    const chosenHalfW =
      (this.track.network.circuitWidths[chosenIdx] ?? ROAD_CONFIG.main.width) * 0.5;
    const maxRespawnLat = Math.max(1.8, chosenHalfW - 1.25);
    const initLane = THREE.MathUtils.clamp(
      ai.spec.laneRatio * chosenHalfW,
      -maxRespawnLat,
      maxRespawnLat,
    );
    ai.wpIdx = (chosenIdx + 2) % n;
    ai.lane = initLane;
    ai.laneTarget = initLane;
    ai.avoidLat = 0;
    ai.yieldTimer = 0;
    ai.hitCooldown = 0;
    ai.speed = Math.max(22, ai.spec.baseMaxSpeed * 0.68);
    ai.x = p.x + norm.x * ai.lane;
    ai.y = py;
    ai.z = p.z + norm.z * ai.lane;
    ai.heading = Math.atan2(t.x, t.z);
    ai.pitch = -Math.atan(this.track.slopeAt(chosenIdx));
    ai.roll = 0;
    const lookIdx = (ai.wpIdx + 3) % n;
    const lp = this.track.points[lookIdx];
    const ln = this.track.normals[lookIdx];
    ai.targetX = lp.x + ln.x * ai.lane;
    ai.targetY = this.track.ys[lookIdx];
    ai.targetZ = lp.z + ln.z * ai.lane;

    // Keep race lap progress fair and monotonic near current player/AI progress
    const baseDist = this.track.cumDist[chosenIdx];
    let lap = Math.max(0, Math.min(TOTAL_LAPS - 1, ai.lap));
    let newS = lap * totalLen + baseDist;
    while (newS < playerProgress + 60 && lap < TOTAL_LAPS - 1) {
      lap++;
      newS += totalLen;
    }
    while (lap > 0 && newS - totalLen > Math.max(ai.s, playerProgress + 80)) {
      lap--;
      newS -= totalLen;
    }
    ai.lap = lap;
    ai.s = Math.min(newS, finishDist - 60);

    ai.prevX = ai.x;
    ai.prevY = ai.y;
    ai.prevZ = ai.z;
    ai.prevHeading = ai.heading;
    ai.prevPitch = ai.pitch;
    ai.prevRoll = 0;
    ai.stuckOriginX = ai.x;
    ai.stuckOriginZ = ai.z;
    ai.stuckTimer = 0;
    ai.hardStuckTimer = 0;
    this.stuckRespawnCount++;
  }

  private queryTrafficAheadSpeed(
    x: number,
    y: number,
    z: number,
    heading: number,
    myTargetSpeed: number,
    selfTraffic: TrafficCarState | null,
    selfAi: AiCarState | null,
    maxLookDist: number,
  ): { minDist: number; aheadSpeed: number } {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);

    let minDist = Infinity;
    let aheadSpeed = 999;

    const checkOther = (ox: number, oy: number, oz: number, oh: number, ospeed: number) => {
      if (Math.abs(oy - y) > 2.4) return;
      const dx = ox - x;
      const dz = oz - z;
      const dSq = dx * dx + dz * dz;
      if (dSq > maxLookDist * maxLookDist || dSq < 0.04) return;

      // Forward distance & narrow forward cone (ignore vehicles behind or beside)
      const fwd = dx * fx + dz * fz;
      if (fwd <= 1.5 || fwd > maxLookDist) return;
      const dist = Math.sqrt(dSq);
      if (fwd / dist < 0.86) return;

      // Same-lane lateral corridor check
      const lat = Math.abs(dx * rx + dz * rz);
      if (lat > 1.85) return;

      // Same-direction travel check (ignore oncoming or perpendicular cross traffic)
      const ofx = Math.sin(oh);
      const ofz = Math.cos(oh);
      const sameDir = fx * ofx + fz * ofz;
      if (sameDir < 0.72) return;

      // Ignore vehicles pulling away faster than us at safe following distance
      const otherFwdSpeed = (ofx * fx + ofz * fz) * ospeed;
      if (otherFwdSpeed > myTargetSpeed + 1.5 && fwd > 8.5) return;

      if (fwd < minDist) {
        minDist = fwd;
        aheadSpeed = Math.max(0, otherFwdSpeed);
      }
    };

    const limit = this.getTrafficLimit();
    for (let i = 0; i < limit; i++) {
      const other = this.trafficCars[i];
      if (other === selfTraffic) continue;
      checkOther(other.x, other.y, other.z, other.heading, other.speed);
    }

    if (this.gameMode === 'race') {
      for (let i = 0; i < this.aiCars.length; i++) {
        const ai = this.aiCars[i];
        if (ai === selfAi) continue;
        checkOther(ai.x, ai.y, ai.z, ai.heading, ai.speed);
      }
    }

    if (this.phase === 'playing') {
      const pSpeed = Math.hypot(this.vx, this.vz);
      checkOther(this.x, this.y, this.z, this.heading, pSpeed);
    }

    return { minDist, aheadSpeed };
  }

  private updateAiFixedSteps(dt: number, playerProgress: number, includeRaceAi: boolean): void {
    const safeDt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.05) : 0;
    const prevAccum = Number.isFinite(this.aiAccum) ? this.aiAccum : 0;
    this.aiAccum = Math.min(0.1, prevAccum + safeDt);
    const limit = this.getTrafficLimit();

    while (this.aiAccum >= FIXED_AI_DT) {
      if (includeRaceAi) {
        for (const ai of this.aiCars) {
          ai.prevX = ai.x;
          ai.prevY = ai.y;
          ai.prevZ = ai.z;
          ai.prevHeading = ai.heading;
          ai.prevPitch = ai.pitch;
          ai.prevRoll = ai.roll;
        }
        const winner = this.stepAiCarsFixed(FIXED_AI_DT, playerProgress);
        if (winner && !this.aiWinnerState) {
          this.aiWinnerState = winner;
        }
      }

      for (let i = 0; i < limit; i++) {
        const tc = this.trafficCars[i];
        tc.prevX = tc.x;
        tc.prevY = tc.y;
        tc.prevZ = tc.z;
        tc.prevHeading = tc.heading;
        tc.prevPitch = tc.pitch;
        tc.prevRoll = tc.roll;
      }
      this.stepAmbientTrafficFixed(FIXED_AI_DT, limit);
      this.resolveVehiclePairOverlapsFixed(includeRaceAi, limit);
      this.aiAccum -= FIXED_AI_DT;
    }

    const alpha = THREE.MathUtils.clamp(this.aiAccum / FIXED_AI_DT, 0, 1);
    this.interpolateAiAndTrafficVisuals(alpha, safeDt, includeRaceAi, limit);
    if (this.aiDebugEnabled) {
      this.updateAiDebugLines(limit, includeRaceAi);
    }
  }

  private enterIntersectionTurn(tc: TrafficCarState, targetNode: ReturnType<RoadNetwork['nodeMap']['get']>): void {
    if (!targetNode || targetNode.edgeIds.length === 0) {
      tc.dir = tc.dir === 1 ? -1 : 1;
      tc.sampleIdx = THREE.MathUtils.clamp(tc.sampleIdx, 2, tc.edge.samples.length - 3);
      return;
    }

    const candidates = targetNode.edgeIds.filter((id) => id !== tc.edge.id);
    const cityCandidates =
      tc.kind === 'city_bus'
        ? candidates.filter((id) => this.track.network.edgeMap.get(id)?.type === 'city')
        : [];
    const pickPool =
      cityCandidates.length > 0
        ? cityCandidates
        : candidates.length > 0
          ? candidates
          : [tc.edge.id];
    const nextId = pickPool[Math.floor(Math.random() * pickPool.length)];
    const nextEdge = this.track.network.edgeMap.get(nextId) ?? tc.edge;

    if (nextEdge.fromNodeId !== targetNode.id && nextEdge.toNodeId !== targetNode.id) {
      tc.dir = tc.dir === 1 ? -1 : 1;
      tc.sampleIdx = THREE.MathUtils.clamp(tc.sampleIdx, 2, tc.edge.samples.length - 3);
      return;
    }

    const nextDir: 1 | -1 = nextEdge.fromNodeId === targetNode.id ? 1 : -1;
    const exitMargin = Math.min(nextEdge.length * 0.28, targetNode.radius + 2.0);
    const exitOffsetSamples = Math.max(2, Math.round(exitMargin / nextEdge.segmentStep));
    const exSIdx =
      nextDir === 1
        ? THREE.MathUtils.clamp(exitOffsetSamples, 1, nextEdge.samples.length - 2)
        : THREE.MathUtils.clamp(nextEdge.samples.length - 1 - exitOffsetSamples, 1, nextEdge.samples.length - 2);

    const curSIdx = THREE.MathUtils.clamp(tc.sampleIdx, 0, tc.edge.samples.length - 1);
    const curSamp = tc.edge.samples[curSIdx];
    const p0x = tc.x;
    const p0y = tc.y;
    const p0z = tc.z;

    const exitLaneOff = this.getTrafficLaneOffset(nextEdge, nextDir, tc.laneBiasRatio, tc.kind);
    const exSamp = nextEdge.samples[exSIdx];
    const p2x = exSamp.pos.x + exSamp.norm.x * exitLaneOff;
    const p2y = exSamp.y;
    const p2z = exSamp.pos.z + exSamp.norm.z * exitLaneOff;

    const wpCount = 5;
    if (targetNode.kind === 'roundabout') {
      const rStart = Math.hypot(p0x - targetNode.x, p0z - targetNode.z);
      const rEnd = Math.hypot(p2x - targetNode.x, p2z - targetNode.z);
      const angStart = Math.atan2(p0z - targetNode.z, p0x - targetNode.x);
      const angEnd = Math.atan2(p2z - targetNode.z, p2x - targetNode.x);
      let dAng = angEnd - angStart;
      while (dAng > 0) dAng -= Math.PI * 2;
      while (dAng <= -Math.PI * 2) dAng += Math.PI * 2;
      if (Math.abs(dAng) < 0.25) dAng = -Math.PI * 2;
      const ringR = this.track.network.roundaboutRadius + 1.4;

      for (let k = 0; k < wpCount; k++) {
        const t = (k + 1) / wpCount;
        const ang = angStart + dAng * t;
        const rBlend = THREE.MathUtils.lerp(rStart, rEnd, t);
        const r = THREE.MathUtils.lerp(rBlend, ringR, Math.sin(t * Math.PI) * 0.85);
        tc.turnWaypoints[k].x = targetNode.x + Math.cos(ang) * r;
        tc.turnWaypoints[k].y = THREE.MathUtils.lerp(p0y, p2y, t);
        tc.turnWaypoints[k].z = targetNode.z + Math.sin(ang) * r;
      }
    } else {
      const chord = Math.hypot(p2x - p0x, p2z - p0z);
      const fwdX = curSamp.tan.x * tc.dir;
      const fwdZ = curSamp.tan.z * tc.dir;
      const projX = p0x + fwdX * chord * 0.45;
      const projZ = p0z + fwdZ * chord * 0.45;
      const p1x = projX * 0.55 + targetNode.x * 0.45;
      const p1z = projZ * 0.55 + targetNode.z * 0.45;

      for (let k = 0; k < wpCount; k++) {
        const t = (k + 1) / wpCount;
        const omt = 1 - t;
        tc.turnWaypoints[k].x = omt * omt * p0x + 2 * omt * t * p1x + t * t * p2x;
        tc.turnWaypoints[k].y = THREE.MathUtils.lerp(p0y, p2y, t);
        tc.turnWaypoints[k].z = omt * omt * p0z + 2 * omt * t * p1z + t * t * p2z;
      }
    }

    tc.turning = true;
    tc.turnWpCount = wpCount;
    tc.turnWpIdx = 0;
    tc.nextEdge = nextEdge;
    tc.nextDir = nextDir;
    tc.nextSampleIdx = exSIdx;
  }

  private stepAmbientTrafficFixed(dt: number, limit: number): void {
    const rail = this.track.railway;
    const crossingActive = rail.isCrossingActive();

    for (let tcIdx = 0; tcIdx < limit; tcIdx++) {
      const tc = this.trafficCars[tcIdx];

      // NaN / Infinity safety guard
      if (
        !Number.isFinite(tc.x) ||
        !Number.isFinite(tc.y) ||
        !Number.isFinite(tc.z) ||
        !Number.isFinite(tc.speed) ||
        !Number.isFinite(tc.heading) ||
        !tc.edge ||
        tc.edge.samples.length < 4
      ) {
        this.relocateTrafficNearPlayer(tc, false);
        continue;
      }

      tc.hitCooldown = Math.max(0, tc.hitCooldown - dt);
      tc.busStopCooldown = Math.max(0, tc.busStopCooldown - dt);
      tc.yieldTimer = Math.max(0, tc.yieldTimer - dt);
      tc.avoidLat *= Math.exp(-3.0 * dt);
      tc.intentionalStop = false;

      // Chunk unload / far distance cleanup: recycle cars cleanly when outside active area
      if (this.phase === 'playing') {
        const pdSq = (tc.x - this.x) * (tc.x - this.x) + (tc.z - this.z) * (tc.z - this.z);
        if (pdSq > 720 * 720 || !this.track.isChunkLoaded(tc.x, tc.z)) {
          tc.turning = false;
          tc.nextEdge = null;
          tc.turnWpCount = 0;
          tc.turnWpIdx = 0;
          this.relocateTrafficNearPlayer(tc, false);
          continue;
        }
      }

      const fx = Math.sin(tc.heading);
      const fz = Math.cos(tc.heading);
      let atSignalOrCrossing = false;
      let curveScale = 1.0;
      let baseDesiredSpeed = tc.maxSpeed;

      if (tc.turning) {
        // Advance turn waypoints using radius <= 6.5 OR passed-it dot product check
        while (tc.turnWpIdx < tc.turnWpCount) {
          const wp = tc.turnWaypoints[tc.turnWpIdx];
          const dx = wp.x - tc.x;
          const dz = wp.z - tc.z;
          const dSq = dx * dx + dz * dz;
          const passed = dx * fx + dz * fz <= 0;
          if (dSq <= TURN_WP_ACCEPT_RADIUS * TURN_WP_ACCEPT_RADIUS || passed) {
            tc.turnWpIdx++;
          } else {
            break;
          }
        }

        if (tc.turnWpIdx >= tc.turnWpCount && tc.nextEdge) {
          tc.edge = tc.nextEdge;
          tc.dir = tc.nextDir;
          tc.sampleIdx = THREE.MathUtils.clamp(
            tc.nextSampleIdx,
            0,
            tc.edge.samples.length - 1,
          );
          tc.maxSpeed = this.computeTrafficMaxSpeed(tc.rig, tc.edge);
          tc.turning = false;
          tc.nextEdge = null;
          tc.turnWpCount = 0;
          tc.turnWpIdx = 0;
        } else {
          const lookWpIdx = Math.min(tc.turnWpCount - 1, tc.turnWpIdx + 1);
          const lookWp = tc.turnWaypoints[lookWpIdx];
          tc.targetX = lookWp.x;
          tc.targetY = lookWp.y;
          tc.targetZ = lookWp.z;
          baseDesiredSpeed = Math.min(tc.maxSpeed, 13.5);
        }
      }

      if (!tc.turning) {
        const samples = tc.edge.samples;
        const maxIdx = samples.length - 1;
        tc.sampleIdx = THREE.MathUtils.clamp(tc.sampleIdx, 0, maxIdx);

        const curSamp = samples[tc.sampleIdx];
        const localHalfW = curSamp.halfWidth ?? tc.edge.width * 0.5;
        const vehHalfW = this.getVehicleLateralHalfWidth(tc.kind);
        const maxLatLimit = Math.max(0.5, localHalfW - vehHalfW - 0.3);
        const laneOff = THREE.MathUtils.clamp(
          this.getTrafficLaneOffset(tc.edge, tc.dir, tc.laneBiasRatio, tc.kind) + tc.avoidLat,
          -maxLatLimit,
          maxLatLimit,
        );

        const targetNodeId = tc.dir === 1 ? tc.edge.toNodeId : tc.edge.fromNodeId;
        const targetNode = this.track.network.nodeMap.get(targetNodeId);
        const enterMargin = targetNode
          ? Math.min(tc.edge.length * 0.26, targetNode.radius + 2.0)
          : 4.0;
        const arrivalOffset = Math.max(2, Math.round(enterMargin / tc.edge.segmentStep));
        const arrivalIdx =
          tc.dir === 1 ? Math.max(2, maxIdx - arrivalOffset) : Math.min(maxIdx - 2, arrivalOffset);

        // Advance sample waypoint index if within accept radius (8 units) or passed
        let enteredTurn = false;
        for (let step = 0; step < 5; step++) {
          const wpSamp = samples[tc.sampleIdx];
          const wx = wpSamp.pos.x + wpSamp.norm.x * laneOff;
          const wz = wpSamp.pos.z + wpSamp.norm.z * laneOff;
          const dx = wx - tc.x;
          const dz = wz - tc.z;
          const dSq = dx * dx + dz * dz;
          const segTanX = wpSamp.tan.x * tc.dir;
          const segTanZ = wpSamp.tan.z * tc.dir;
          const passed = dx * segTanX + dz * segTanZ <= 0;

          if (dSq <= WP_ACCEPT_RADIUS * WP_ACCEPT_RADIUS || passed) {
            if (
              (tc.dir === 1 && tc.sampleIdx >= arrivalIdx) ||
              (tc.dir === -1 && tc.sampleIdx <= arrivalIdx)
            ) {
              this.enterIntersectionTurn(tc, targetNode);
              enteredTurn = tc.turning;
              break;
            }
            const nextIdx = tc.sampleIdx + tc.dir;
            if (nextIdx < 0 || nextIdx > maxIdx) {
              this.enterIntersectionTurn(tc, targetNode);
              enteredTurn = tc.turning;
              break;
            }
            tc.sampleIdx = nextIdx;
          } else {
            break;
          }
        }

        if (enteredTurn) {
          const lookWp = tc.turnWaypoints[Math.min(tc.turnWpCount - 1, 1)];
          tc.targetX = lookWp.x;
          tc.targetY = lookWp.y;
          tc.targetZ = lookWp.z;
          baseDesiredSpeed = Math.min(tc.maxSpeed, 13.5);
        } else {
          const idx = THREE.MathUtils.clamp(tc.sampleIdx, 0, maxIdx);
          const samp = samples[idx];

          // Look ahead for target point (~12m ahead) and curve angle slowdown
          const lookSteps = Math.max(2, Math.round(12 / tc.edge.segmentStep));
          const lookIdx = THREE.MathUtils.clamp(idx + tc.dir * lookSteps, 0, maxIdx);
          const ls = samples[lookIdx];
          tc.targetX = ls.pos.x + ls.norm.x * laneOff;
          tc.targetY = ls.y;
          tc.targetZ = ls.pos.z + ls.norm.z * laneOff;

          const cIdx1 = THREE.MathUtils.clamp(idx + tc.dir * 6, 0, maxIdx);
          const cIdx2 = THREE.MathUtils.clamp(idx + tc.dir * 13, 0, maxIdx);
          const dot1 = THREE.MathUtils.clamp(samp.tan.dot(samples[cIdx1].tan), -1, 1);
          const dot2 = THREE.MathUtils.clamp(samp.tan.dot(samples[cIdx2].tan), -1, 1);
          const curveAngle = Math.acos(Math.min(dot1, dot2));
          curveScale = 1 - THREE.MathUtils.clamp((curveAngle / 1.15) * 0.56, 0, 0.56);

          // Traffic light red/amber stop check
          const distToEnd = tc.dir === 1 ? tc.edge.length - samp.s : samp.s;
          if (
            targetNode &&
            targetNode.hasTrafficLight &&
            distToEnd < targetNode.radius + 22 &&
            distToEnd > targetNode.radius + 1.2
          ) {
            if (this.track.isRedLight(targetNode.id, samp.tan.x * tc.dir, samp.tan.z * tc.dir)) {
              atSignalOrCrossing = true;
              tc.intentionalStop = true;
            }
          }

          // Railway crossing barrier stop check
          if (!atSignalOrCrossing && crossingActive && tc.edge.id === rail.crossingEdgeId) {
            const signedApproach = (rail.crossingEdgeS - samp.s) * tc.dir;
            if (signedApproach > 6.5 && signedApproach < 36) {
              atSignalOrCrossing = true;
              tc.intentionalStop = true;
            }
          }

          // Brief City Bus Stop dwell (< 2.5s so normal stops stay under 5s hard stuck limit)
          if (tc.kind === 'city_bus') {
            if (tc.busStopTimer > 0) {
              tc.busStopTimer -= dt;
              tc.intentionalStop = true;
            } else if (tc.busStopCooldown <= 0) {
              for (const bs of this.track.busStops) {
                if (bs.edgeId === tc.edge.id && Math.abs(samp.s - bs.s) < 6) {
                  tc.busStopTimer = 2.2;
                  tc.busStopCooldown = 24;
                  tc.intentionalStop = true;
                  break;
                }
              }
            }
          }
        }
      }

      let desiredSpeed =
        tc.intentionalStop
          ? 0
          : baseDesiredSpeed *
            curveScale *
            (tc.hitCooldown > 0 ? 0.65 : 1) *
            (tc.yieldTimer > 0 ? 0.72 : 1);

      const ahead = this.queryTrafficAheadSpeed(
        tc.x,
        tc.y,
        tc.z,
        tc.heading,
        desiredSpeed,
        tc,
        null,
        tc.turning ? 18 : 24,
      );
      if (ahead.minDist < (tc.turning ? 18 : 24)) {
        const gapScale = THREE.MathUtils.clamp((ahead.minDist - 5.5) / 13.0, 0, 1);
        desiredSpeed = Math.min(desiredSpeed, Math.max(0, ahead.aheadSpeed * gapScale));
        if (ahead.minDist < 6.8 || (ahead.aheadSpeed < 1.2 && ahead.minDist < 11.0)) {
          desiredSpeed = 0;
        }
      }

      const prevSpeed = tc.speed;
      const speedAlpha = 1 - Math.exp(-(desiredSpeed < tc.speed ? 5.2 : 2.6) * dt);
      tc.speed = THREE.MathUtils.lerp(tc.speed, desiredSpeed, speedAlpha);
      tc.braking = tc.intentionalStop || tc.speed - prevSpeed < -0.14 || desiredSpeed < 1.5;

      // Smooth steering toward look-ahead target point
      const toTgtX = tc.targetX - tc.x;
      const toTgtZ = tc.targetZ - tc.z;
      const targetHeading =
        toTgtX * toTgtX + toTgtZ * toTgtZ > 0.09 ? Math.atan2(toTgtX, toTgtZ) : tc.heading;
      const hDiff = this.shortestAngleDelta(tc.heading, targetHeading);
      tc.heading += hDiff * Math.min(1, dt * 8.5);
      tc.steerAngle = THREE.MathUtils.clamp(hDiff * 1.8, -0.45, 0.45);

      // Integrate position smoothly (zero centerline snap-back)
      const moveFx = Math.sin(tc.heading);
      const moveFz = Math.cos(tc.heading);
      tc.x += moveFx * tc.speed * dt;
      tc.z += moveFz * tc.speed * dt;

      let bankRoll = 0;
      if (!tc.turning) {
        const curSamp = tc.edge.samples[THREE.MathUtils.clamp(tc.sampleIdx, 0, tc.edge.samples.length - 1)];
        const localHalfW = curSamp.halfWidth ?? tc.edge.width * 0.5;
        const vehHalfW = this.getVehicleLateralHalfWidth(tc.kind);
        const maxLatLimit = Math.max(0.5, localHalfW - vehHalfW - 0.3);
        const targetLaneOff = THREE.MathUtils.clamp(
          this.getTrafficLaneOffset(tc.edge, tc.dir, tc.laneBiasRatio, tc.kind) + tc.avoidLat,
          -maxLatLimit,
          maxLatLimit,
        );
        const curLat =
          (tc.x - curSamp.pos.x) * curSamp.norm.x + (tc.z - curSamp.pos.z) * curSamp.norm.z;
        const clampedLat = THREE.MathUtils.clamp(curLat, -maxLatLimit, maxLatLimit);
        const desiredLat = THREE.MathUtils.lerp(clampedLat, targetLaneOff, 1 - Math.exp(-2.4 * dt));
        const corr = desiredLat - curLat;
        tc.x += curSamp.norm.x * corr;
        tc.z += curSamp.norm.z * corr;

        const clampedBankLat = THREE.MathUtils.clamp(desiredLat, -localHalfW, localHalfW);
        const bankLift = curSamp.bankRad !== 0 ? clampedBankLat * Math.sin(curSamp.bankRad) : 0;
        tc.y += (curSamp.y + bankLift - tc.y) * Math.min(1, dt * 10);
        const nextSamp =
          tc.edge.samples[Math.min(tc.edge.samples.length - 1, tc.sampleIdx + 1)];
        const prevSamp = tc.edge.samples[Math.max(0, tc.sampleIdx - 1)];
        const slope =
          ((nextSamp.y - prevSamp.y) / Math.max(0.5, tc.edge.segmentStep * 2)) * tc.dir;
        tc.pitch = THREE.MathUtils.damp(tc.pitch, -Math.atan(slope), 8, dt);
        if (curSamp.bankRad !== 0) {
          bankRoll =
            (Math.cos(tc.heading) * curSamp.norm.x - Math.sin(tc.heading) * curSamp.norm.z) *
            curSamp.bankRad;
        }
      } else {
        tc.y += (tc.targetY - tc.y) * Math.min(1, dt * 8);
        tc.pitch = THREE.MathUtils.damp(tc.pitch, 0, 8, dt);
      }

      const targetRoll = THREE.MathUtils.clamp(-hDiff * tc.speed * 0.035 + bankRoll, -0.14, 0.14);
      tc.roll = THREE.MathUtils.damp(tc.roll, targetRoll, 7, dt);

      // Stuck recovery: < 1 unit in 2s (excluding red lights / railway crossings / brief bus dwell) + 5s hard limit ALWAYS respawns
      const movedSq =
        (tc.x - tc.stuckOriginX) * (tc.x - tc.stuckOriginX) +
        (tc.z - tc.stuckOriginZ) * (tc.z - tc.stuckOriginZ);
      if (movedSq >= 1.0) {
        tc.stuckOriginX = tc.x;
        tc.stuckOriginZ = tc.z;
        tc.stuckTimer = 0;
        tc.hardStuckTimer = 0;
      } else {
        tc.hardStuckTimer += dt;
        if (!atSignalOrCrossing && tc.busStopTimer <= 0) {
          tc.stuckTimer += dt;
        }
        if (tc.stuckTimer >= 2.0 || tc.hardStuckTimer >= 5.0) {
          this.relocateTrafficNearPlayer(tc, true);
        }
      }
    }
  }

  private resetCarToPoint(idx: number): void {
    const p = this.track.points[idx];
    const t = this.track.tangents[idx];
    this.x = p.x;
    this.y = this.track.ys[idx];
    this.z = p.z;
    this.heading = Math.atan2(t.x, t.z);
    this.pitch = -Math.atan(this.track.slopeAt(idx));
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.analogSteer = 0;
    this.trackIdx = idx;
    this.playerLat = 0;
    this.onRoad = true;
    this.surfaceType = 'asphalt';
    this.surfaceDriveScale = 1.0;
    this.surfaceGrip = 8.8;
    this.surfaceDrag = 0.0;
    this.staticCrashCooldown = 0;
  }

  private clearSkidMarks(): void {
    this.initParticlePool(this.skidMesh, SKID_POOL_SIZE);
    this.skidCursor = 0;
  }

  private flashBanner(
    text: string,
    tone: 'info' | 'best' | 'finish' | 'countdown',
    duration = 1.6,
  ): void {
    this.bannerText = text;
    this.bannerTone = tone;
    this.bannerTimer = duration;
  }

  public clearHeldKeys = (): void => {
    for (const k of Object.keys(this.heldKeys)) {
      this.heldKeys[k] = false;
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.audio.init();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }

    const wasHeld = !!this.heldKeys[e.code];
    this.heldKeys[e.code] = true;

    if (wasHeld) return;

    if (e.code === 'Escape') {
      if (this.phase === 'playing') this.pauseRace();
      else if (this.phase === 'paused') this.resumeRace();
      return;
    }

    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.phase === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
      this.startRace();
      return;
    }

    if (this.phase === 'finished' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) {
      this.startRace();
      return;
    }

    if (this.phase === 'playing') {
      if (e.code === 'KeyC') this.cycleCamera();
      if (e.code === 'KeyR' && this.countdownRemaining <= 0) this.resetCarPosition();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys[e.code] = false;
  };

  private getEffectivePixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    if (this.isSoftwareGl || this.quality === 'low') return 1;
    if (this.quality === 'med') return Math.min(dpr, 1.5);
    return Math.min(dpr, 2);
  }

  private onResize = (): void => {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    const pixelRatio = this.getEffectivePixelRatio();

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);
      this.bloomPass?.resolution.set(
        Math.max(1, Math.floor(width / 2)),
        Math.max(1, Math.floor(height / 2)),
      );
    }
  };

  private onOrientationChange = (): void => {
    this.clearHeldKeys();
    this.onResize();
    window.setTimeout(this.onResize, 120);
    window.setTimeout(this.onResize, 300);
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearHeldKeys();
    } else {
      this.lastTimeMs = performance.now();
      this.aiAccum = 0;
    }
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearHeldKeys);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onOrientationChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private spawnSmokePuff(wx: number, wy: number, wz: number, vx: number, vz: number): void {
    const i = this.smokeCursor;
    this.smokeCursor = (this.smokeCursor + 1) % SMOKE_POOL_SIZE;

    const p3 = i * 3;
    this.smokePos[p3] = wx + (Math.random() - 0.5) * 0.25;
    this.smokePos[p3 + 1] = wy;
    this.smokePos[p3 + 2] = wz + (Math.random() - 0.5) * 0.25;

    this.smokeVel[p3] = vx * 0.22 + (Math.random() - 0.5) * 1.6;
    this.smokeVel[p3 + 1] = 1.2 + Math.random() * 1.1;
    this.smokeVel[p3 + 2] = vz * 0.22 + (Math.random() - 0.5) * 1.6;

    const maxL = 0.55 + Math.random() * 0.35;
    this.smokeLife[i] = maxL;
    this.smokeMaxLife[i] = maxL;
  }

  private spawnDustPuff(wx: number, wy: number, wz: number, vx: number, vz: number): void {
    const i = this.dustCursor;
    this.dustCursor = (this.dustCursor + 1) % DUST_POOL_SIZE;

    const p3 = i * 3;
    this.dustPos[p3] = wx + (Math.random() - 0.5) * 0.45;
    this.dustPos[p3 + 1] = wy;
    this.dustPos[p3 + 2] = wz + (Math.random() - 0.5) * 0.45;

    this.dustVel[p3] = vx * 0.18 + (Math.random() - 0.5) * 2.2;
    this.dustVel[p3 + 1] = 1.5 + Math.random() * 1.4;
    this.dustVel[p3 + 2] = vz * 0.18 + (Math.random() - 0.5) * 2.2;

    const maxL = 0.65 + Math.random() * 0.4;
    this.dustLife[i] = maxL;
    this.dustMaxLife[i] = maxL;
  }

  private stampSkidMark(wx: number, wy: number, wz: number, yaw: number): void {
    const i = this.skidCursor;
    this.skidCursor = (this.skidCursor + 1) % SKID_POOL_SIZE;
    _dummy.position.set(wx, wy + 0.056, wz);
    _dummy.rotation.set(0, yaw, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    this.skidMesh.setMatrixAt(i, _dummy.matrix);
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  private updatePool(
    dt: number,
    mesh: THREE.InstancedMesh,
    poolSize: number,
    pos: Float32Array,
    vel: Float32Array,
    lifeArr: Float32Array,
    maxLifeArr: Float32Array,
    maxScale: number,
  ): void {
    let anyUpdated = false;
    for (let i = 0; i < poolSize; i++) {
      const life = lifeArr[i];
      if (life <= 0) continue;
      anyUpdated = true;
      const nextLife = life - dt;
      lifeArr[i] = nextLife;

      if (nextLife <= 0) {
        _dummy.position.set(0, -60, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const p3 = i * 3;
      pos[p3] += vel[p3] * dt;
      pos[p3 + 1] += vel[p3 + 1] * dt;
      pos[p3 + 2] += vel[p3 + 2] * dt;

      const t = 1 - nextLife / maxLifeArr[i];
      const scale = 0.55 + t * maxScale;
      _dummy.position.set(pos[p3], pos[p3 + 1], pos[p3 + 2]);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.setScalar(scale * (1 - t * 0.4));
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }

    if (anyUpdated) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private spawnSparkBurst(wx: number, wy: number, wz: number, baseVx: number, baseVz: number, count = 12): void {
    for (let s = 0; s < count; s++) {
      const i = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL_SIZE;
      const p3 = i * 3;
      this.sparkPos[p3] = wx + (Math.random() - 0.5) * 0.4;
      this.sparkPos[p3 + 1] = wy + 0.3 + Math.random() * 0.45;
      this.sparkPos[p3 + 2] = wz + (Math.random() - 0.5) * 0.4;

      const spread = 8 + Math.random() * 11;
      const ang = Math.random() * Math.PI * 2;
      this.sparkVel[p3] = baseVx * 0.35 + Math.cos(ang) * spread;
      this.sparkVel[p3 + 1] = 2.8 + Math.random() * 5.2;
      this.sparkVel[p3 + 2] = baseVz * 0.35 + Math.sin(ang) * spread;

      const maxL = 0.24 + Math.random() * 0.26;
      this.sparkLife[i] = maxL;
      this.sparkMaxLife[i] = maxL;
    }
  }

  private updateSparks(dt: number): void {
    let anyUpdated = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const life = this.sparkLife[i];
      if (life <= 0) continue;
      anyUpdated = true;
      const nextLife = life - dt;
      this.sparkLife[i] = nextLife;

      if (nextLife <= 0) {
        _dummy.position.set(0, -60, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const p3 = i * 3;
      this.sparkVel[p3 + 1] -= 18 * dt;
      this.sparkPos[p3] += this.sparkVel[p3] * dt;
      this.sparkPos[p3 + 1] += this.sparkVel[p3 + 1] * dt;
      this.sparkPos[p3 + 2] += this.sparkVel[p3 + 2] * dt;

      if (this.sparkPos[p3 + 1] < this.y + 0.08 && this.sparkVel[p3 + 1] < 0) {
        this.sparkPos[p3 + 1] = this.y + 0.08;
        this.sparkVel[p3 + 1] *= -0.45;
      }

      const t = nextLife / this.sparkMaxLife[i];
      _dummy.position.set(this.sparkPos[p3], this.sparkPos[p3 + 1], this.sparkPos[p3 + 2]);
      _dummy.rotation.set(
        -Math.atan2(this.sparkVel[p3 + 1], Math.hypot(this.sparkVel[p3], this.sparkVel[p3 + 2]) + 0.01),
        Math.atan2(this.sparkVel[p3], this.sparkVel[p3 + 2]),
        0,
      );
      _dummy.scale.set(0.8 * t, 0.8 * t, 0.7 + 0.8 * t);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
    }

    if (anyUpdated) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateSpeedLines(dt: number, speedMs: number): void {
    const baseRatio = THREE.MathUtils.clamp((speedMs - 38) / (BASE_MAX_SPEED - 38), 0, 1);
    const speedRatio = this.isBoosting ? Math.max(baseRatio, 0.72) : baseRatio;
    if (this.phase !== 'playing' || speedRatio <= 0.02 || (this.camMode === 1 && speedRatio < 0.1)) {
      this.speedLineMesh.visible = false;
      return;
    }
    this.speedLineMesh.visible = true;
    this.speedLineMat.opacity = speedRatio * (this.isBoosting ? 0.56 : 0.42);
    this.speedLineMat.color.setHex(this.isBoosting ? 0xbae6fd : 0xeef8ff);

    const travel = (28 + speedRatio * 55 + (this.isBoosting ? 24 : 0)) * dt;
    for (let i = 0; i < SPEEDLINE_POOL_SIZE; i++) {
      this.speedLineZ[i] += travel;
      if (this.speedLineZ[i] > -1.2) {
        this.speedLineZ[i] = -24 - Math.random() * 8;
        this.speedLineAngle[i] = Math.random() * Math.PI * 2;
        this.speedLineRad[i] = 3.1 + Math.random() * 2.9;
      }
      const a = this.speedLineAngle[i];
      const r = this.speedLineRad[i];
      _dummy.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.72, this.speedLineZ[i]);
      _dummy.rotation.set(0, 0, a);
      _dummy.scale.set(1, 1, this.speedLineLen[i] * (0.6 + speedRatio * 1.1));
      _dummy.updateMatrix();
      this.speedLineMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.speedLineMesh.instanceMatrix.needsUpdate = true;
  }

  private updateRain(dt: number): void {
    const showRain = this.weatherMode === 'rain' && this.tunnelFactor < 0.72;
    this.rainMesh.visible = showRain;
    if (!showRain) return;

    const count = this.activeRainCount;
    const slantX = -0.14 - THREE.MathUtils.clamp(this.vx * 0.004, -0.25, 0.25);
    const slantZ = 0.08 - THREE.MathUtils.clamp(this.vz * 0.004, -0.25, 0.25);

    for (let i = 0; i < count; i++) {
      const p3 = i * 3;
      this.rainRelPos[p3 + 1] -= this.rainSpeed[i] * dt;
      this.rainRelPos[p3] += slantX * 12 * dt;
      this.rainRelPos[p3 + 2] += slantZ * 12 * dt;

      if (this.rainRelPos[p3 + 1] < -1.5) {
        this.rainRelPos[p3 + 1] = 31 + Math.random() * 6;
        this.rainRelPos[p3] = (Math.random() - 0.5) * 96;
        this.rainRelPos[p3 + 2] = (Math.random() - 0.5) * 96;
      }
      if (this.rainRelPos[p3] > 48) this.rainRelPos[p3] -= 96;
      else if (this.rainRelPos[p3] < -48) this.rainRelPos[p3] += 96;
      if (this.rainRelPos[p3 + 2] > 48) this.rainRelPos[p3 + 2] -= 96;
      else if (this.rainRelPos[p3 + 2] < -48) this.rainRelPos[p3 + 2] += 96;

      _dummy.position.set(
        this.x + this.rainRelPos[p3],
        this.y + this.rainRelPos[p3 + 1],
        this.z + this.rainRelPos[p3 + 2],
      );
      _dummy.rotation.set(slantZ * 0.5, 0, -slantX * 0.5);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  private updateParticles(dt: number): void {
    this.updatePool(
      dt,
      this.smokeMesh,
      SMOKE_POOL_SIZE,
      this.smokePos,
      this.smokeVel,
      this.smokeLife,
      this.smokeMaxLife,
      2.2,
    );
    this.updatePool(
      dt,
      this.dustMesh,
      DUST_POOL_SIZE,
      this.dustPos,
      this.dustVel,
      this.dustLife,
      this.dustMaxLife,
      2.6,
    );
    this.updateSparks(dt);
  }

  private getPlayerTotalProgress(): number {
    const n = this.track.count;
    const totalLen = this.track.totalLength;
    let lapPos = this.track.cumDist[this.trackIdx];
    if (this.checkpointStage === 0 && this.trackIdx > n * 0.85) {
      lapPos -= totalLen;
    }
    return (this.lap - 1) * totalLen + lapPos;
  }

  private finishRace(didWin: boolean, winnerName: string | null): void {
    if (this.phase === 'finished') return;
    if (this.activeDriftPoints > 0) {
      this.driftScore += Math.round(this.activeDriftPoints);
      this.activeDriftPoints = 0;
    }

    const now = performance.now();
    const totalTimeSec = Math.max(0, (now - this.raceStartMs) / 1000);
    const finalPos = didWin ? 1 : Math.max(2, this.playerPosition);
    const resultHeadline = didWin ? 'YOU WIN!' : `YOU LOSE - ${winnerName ?? 'AI'} car won`;
    const rewards = calculateRaceRewards(finalPos, this.driftScore);

    this.phase = 'finished';
    this.clearHeldKeys();
    this.isBoosting = false;
    this.car.setNitroFlame(false, this.atmosphereElapsed);
    this.audio.playChime(didWin ? 'finish' : 'lose');
    this.audio.update({
      rpm: 0,
      gear: 1,
      speedMs: 0,
      throttle: false,
      brakingHard: false,
      driftIntensity: 0,
      onRoad: true,
      isBoosting: false,
      tunnelFactor: this.tunnelFactor,
      weather: this.weatherMode,
      active: false,
    });
    this.flashBanner(resultHeadline, 'finish', 3.0);

    this.callbacks.onPhaseChange('finished');
    this.callbacks.onRaceFinish({
      didWin,
      resultHeadline,
      position: finalPos,
      totalTimeSec,
      lapTimesSec: [...this.lapTimesSec],
      bestLapSec: this.bestLapSec,
      topSpeedKmh: this.topSpeedKmh,
      driftScore: this.driftScore,
      coinsEarned: rewards.totalCoins,
      racePrizeCoins: rewards.racePrizeCoins,
      driftBonusCoins: rewards.driftBonusCoins,
    });
  }

  private stepAiCarsFixed(dt: number, playerProgress: number): AiCarState | null {
    const n = this.track.count;
    const totalLen = this.track.totalLength;
    const finishDist = TOTAL_LAPS * totalLen;
    let winner: AiCarState | null = null;
    const lookSteps = Math.max(2, Math.round(16 / this.track.segmentStep));
    const curveStep1 = Math.max(4, Math.round(32 / this.track.segmentStep));
    const curveStep2 = Math.max(8, Math.round(64 / this.track.segmentStep));

    for (const ai of this.aiCars) {
      // NaN / Infinity self-heal guard
      if (
        !Number.isFinite(ai.x) ||
        !Number.isFinite(ai.y) ||
        !Number.isFinite(ai.z) ||
        !Number.isFinite(ai.speed) ||
        !Number.isFinite(ai.heading)
      ) {
        this.respawnRaceAiAheadOutOfView(ai, playerProgress);
        continue;
      }

      ai.hitCooldown = Math.max(0, ai.hitCooldown - dt);
      ai.yieldTimer = Math.max(0, ai.yieldTimer - dt);
      ai.avoidLat *= Math.exp(-3.2 * dt);

      // Wrap waypoint index cleanly inside [0, n - 1]
      ai.wpIdx = ((ai.wpIdx % n) + n) % n;

      const localHalfW =
        (this.track.network.circuitWidths[ai.wpIdx] ?? ROAD_CONFIG.main.width) * 0.5;
      const maxLatLimit = Math.max(1.8, localHalfW - 1.25);
      const baseLane = THREE.MathUtils.clamp(
        ai.spec.laneRatio * localHalfW,
        -maxLatLimit,
        maxLatLimit,
      );

      // Advance waypoint when within accept radius (8 units) or passed along track tangent
      const desiredLaneClamped = THREE.MathUtils.clamp(ai.lane + ai.avoidLat, -maxLatLimit, maxLatLimit);
      for (let step = 0; step < 6; step++) {
        const wpP = this.track.points[ai.wpIdx];
        const wpT = this.track.tangents[ai.wpIdx];
        const wpN = this.track.normals[ai.wpIdx];
        const wx = wpP.x + wpN.x * desiredLaneClamped;
        const wz = wpP.z + wpN.z * desiredLaneClamped;
        const dx = wx - ai.x;
        const dz = wz - ai.z;
        const dSq = dx * dx + dz * dz;
        const passed = dx * wpT.x + dz * wpT.z <= 0;
        if (dSq <= WP_ACCEPT_RADIUS * WP_ACCEPT_RADIUS || passed) {
          const prevIdx = ai.wpIdx;
          ai.wpIdx = (ai.wpIdx + 1) % n;
          if (ai.wpIdx < prevIdx) {
            ai.lap += 1;
          }
        } else {
          break;
        }
      }

      // Curve slowdown from angle to upcoming track waypoints
      const curTan = this.track.tangents[ai.wpIdx];
      const tan1 = this.track.tangents[(ai.wpIdx + curveStep1) % n];
      const tan2 = this.track.tangents[(ai.wpIdx + curveStep2) % n];
      const minDot = Math.min(
        THREE.MathUtils.clamp(curTan.dot(tan1), -1, 1),
        THREE.MathUtils.clamp(curTan.dot(tan2), -1, 1),
      );
      const curveAngle = Math.acos(minDot);
      const cornerSlowdown = 1 - THREE.MathUtils.clamp((curveAngle / 1.15) * 0.45, 0, 0.45);

      const gap = ai.s - playerProgress;
      const rubber = THREE.MathUtils.clamp(1 - gap / 800, 0.94, 1.06);
      const bumpScale = ai.hitCooldown > 0 ? 0.85 : 1.0;
      const yieldScale = ai.yieldTimer > 0 ? 0.78 : 1.0;
      let targetSpeed = ai.spec.baseMaxSpeed * cornerSlowdown * rubber * bumpScale * yieldScale;

      // Same-lane forward-cone blocker check & smooth overtaking
      const ahead = this.queryTrafficAheadSpeed(
        ai.x,
        ai.y,
        ai.z,
        ai.heading,
        targetSpeed,
        null,
        ai,
        32,
      );
      let desiredLane = baseLane;

      const playerAheadDist = playerProgress - ai.s;
      if (playerAheadDist > 1 && playerAheadDist < 22 && Math.abs(this.playerLat - ai.lane) < 3.4) {
        const dodgeMag = Math.min(4.2, localHalfW * 0.72);
        const dodgeDir = this.playerLat > ai.lane ? -dodgeMag : dodgeMag;
        desiredLane = THREE.MathUtils.clamp(this.playerLat + dodgeDir, -maxLatLimit, maxLatLimit);
      } else if (ahead.minDist < 34) {
        // Stable overtake lane selection without flipping sign across centerline
        const wasOvertakingLeft = ai.laneTarget < baseLane - 0.85;
        const wasOvertakingRight = ai.laneTarget > baseLane + 0.85;
        const passLeft = wasOvertakingLeft || (!wasOvertakingRight && ai.lane >= 0);
        const passOffset = Math.max(1.8, localHalfW - 1.45);
        desiredLane = passLeft ? -passOffset : passOffset;
        if (ahead.minDist < 14) {
          const gapScale = THREE.MathUtils.clamp((ahead.minDist - 4.5) / 9.5, 0, 1);
          const safePassFloor = Math.max(18, ahead.aheadSpeed * 1.15);
          targetSpeed = Math.min(
            targetSpeed,
            Math.max(safePassFloor * gapScale, ahead.aheadSpeed * gapScale),
          );
        }
      }

      ai.laneTarget = desiredLane;
      const laneRate = Math.abs(desiredLane - baseLane) > 0.1 ? 5.6 : 3.2;
      ai.lane = THREE.MathUtils.damp(ai.lane, ai.laneTarget, laneRate, dt);

      const subtleLine = Math.sin(this.raceElapsedSec * ai.spec.weaveFreq + ai.spec.weavePhase) * 0.42;
      const lat = THREE.MathUtils.clamp(
        ai.lane + subtleLine + ai.avoidLat,
        -maxLatLimit,
        maxLatLimit,
      );

      // Look-ahead target waypoint in lane
      const lookIdx = (ai.wpIdx + lookSteps) % n;
      const lp = this.track.points[lookIdx];
      const ln = this.track.normals[lookIdx];
      ai.targetX = lp.x + ln.x * lat;
      ai.targetY = this.track.ys[lookIdx];
      ai.targetZ = lp.z + ln.z * lat;

      // Smooth speed lerp & steering toward look-ahead target
      const prevSpeed = ai.speed;
      const speedAlpha = 1 - Math.exp(-(targetSpeed < ai.speed ? 4.2 : 2.3) * dt);
      ai.speed = THREE.MathUtils.lerp(ai.speed, targetSpeed, speedAlpha);
      ai.braking = ai.speed - prevSpeed < -0.18 || (ahead.minDist < 14 && targetSpeed < ai.speed);

      const toTgtX = ai.targetX - ai.x;
      const toTgtZ = ai.targetZ - ai.z;
      const targetHeading =
        toTgtX * toTgtX + toTgtZ * toTgtZ > 0.09 ? Math.atan2(toTgtX, toTgtZ) : ai.heading;
      const hDiff = this.shortestAngleDelta(ai.heading, targetHeading);
      ai.heading += hDiff * Math.min(1, dt * 8.0);
      ai.steerAngle = THREE.MathUtils.clamp(hDiff * 2.0, -0.45, 0.45);

      // Smooth forward motion + road-corridor containment (never hit buildings, poles, signs)
      ai.x += Math.sin(ai.heading) * ai.speed * dt;
      ai.z += Math.cos(ai.heading) * ai.speed * dt;

      const curP = this.track.points[ai.wpIdx];
      const curN = this.track.normals[ai.wpIdx];
      const curHalfW =
        (this.track.network.circuitWidths[ai.wpIdx] ?? ROAD_CONFIG.main.width) * 0.5;
      const curMaxLat = Math.max(1.8, curHalfW - 1.25);
      const curBankRad = this.track.network.circuitBanks[ai.wpIdx] ?? 0;
      const curY = this.track.ys[ai.wpIdx];
      const curLat = (ai.x - curP.x) * curN.x + (ai.z - curP.z) * curN.z;
      const clampedLat = THREE.MathUtils.clamp(curLat, -curMaxLat, curMaxLat);
      const softLat = THREE.MathUtils.lerp(clampedLat, lat, 1 - Math.exp(-2.8 * dt));
      const latCorr = softLat - curLat;
      ai.x += curN.x * latCorr;
      ai.z += curN.z * latCorr;

      const clampedBankLat = THREE.MathUtils.clamp(softLat, -curHalfW, curHalfW);
      const bankLift = curBankRad !== 0 ? clampedBankLat * Math.sin(curBankRad) : 0;
      ai.y += (curY + bankLift - ai.y) * Math.min(1, dt * 10);
      ai.pitch = THREE.MathUtils.damp(ai.pitch, -Math.atan(this.track.slopeAt(ai.wpIdx)), 8.5, dt);
      const bankRoll =
        curBankRad !== 0
          ? (Math.cos(ai.heading) * curN.x - Math.sin(ai.heading) * curN.z) * curBankRad
          : 0;
      const targetRoll = THREE.MathUtils.clamp(-hDiff * ai.speed * 0.04 + bankRoll, -0.14, 0.14);
      ai.roll = THREE.MathUtils.damp(ai.roll, targetRoll, 6.5, dt);

      // Update continuous race progress smoothly
      const projProgress = ai.lap * totalLen + this.track.cumDist[ai.wpIdx];
      if (projProgress >= ai.s) {
        ai.s = projProgress;
      } else {
        ai.s += Math.max(0, ai.speed * dt * 0.5);
      }

      // Stuck recovery: < 1 unit moved in 2s OR hard limit > 5s
      const movedSq =
        (ai.x - ai.stuckOriginX) * (ai.x - ai.stuckOriginX) +
        (ai.z - ai.stuckOriginZ) * (ai.z - ai.stuckOriginZ);
      if (movedSq >= 1.0) {
        ai.stuckOriginX = ai.x;
        ai.stuckOriginZ = ai.z;
        ai.stuckTimer = 0;
        ai.hardStuckTimer = 0;
      } else {
        ai.stuckTimer += dt;
        ai.hardStuckTimer += dt;
        if (ai.stuckTimer >= 2.0 || ai.hardStuckTimer >= 5.0) {
          this.respawnRaceAiAheadOutOfView(ai, playerProgress);
        }
      }

      if (!winner && ai.s >= finishDist) {
        winner = ai;
      }
    }

    return winner;
  }

  private resolveVehiclePairOverlapsFixed(includeRaceAi: boolean, trafficLimit: number): void {
    const separatePair = (
      ax: number,
      ay: number,
      az: number,
      ah: number,
      ra: number,
      bx: number,
      by: number,
      bz: number,
      bh: number,
      rb: number,
    ): {
      dx: number;
      dz: number;
      aSlowFactor: number;
      bSlowFactor: number;
      aDodgeSign: number;
      bDodgeSign: number;
    } | null => {
      if (Math.abs(ay - by) > 2.4) return null;
      const dx = ax - bx;
      const dz = az - bz;
      const minD = ra + rb;
      const dSq = dx * dx + dz * dz;
      if (dSq >= minD * minD) return null;

      const dist = Math.sqrt(dSq);
      const nx = dist > 1e-3 ? dx / dist : 1;
      const nz = dist > 1e-3 ? dz / dist : 0;
      const pen = (minD - dist) * 0.45;

      // Determine rear vehicle so only the rear car slows down (never lock together)
      const abX = bx - ax;
      const abZ = bz - az;
      const afX = Math.sin(ah);
      const afZ = Math.cos(ah);
      const bfX = Math.sin(bh);
      const bfZ = Math.cos(bh);
      const aBehindScore = abX * afX + abZ * afZ;
      const bBehindScore = -abX * bfX - abZ * bfZ;

      let aSlowFactor = 1.0;
      let bSlowFactor = 1.0;
      if (aBehindScore > bBehindScore + 0.15) {
        aSlowFactor = 0.72;
      } else if (bBehindScore > aBehindScore + 0.15) {
        bSlowFactor = 0.72;
      }

      // Lateral push direction in each car's right vector so dodge stays smooth
      const arX = Math.cos(ah);
      const arZ = -Math.sin(ah);
      const brX = Math.cos(bh);
      const brZ = -Math.sin(bh);
      const aDodgeSign = nx * arX + nz * arZ >= 0 ? 1 : -1;
      const bDodgeSign = -nx * brX - nz * brZ >= 0 ? 1 : -1;

      return { dx: nx * pen, dz: nz * pen, aSlowFactor, bSlowFactor, aDodgeSign, bDodgeSign };
    };

    // Traffic-vs-Traffic
    for (let i = 0; i < trafficLimit; i++) {
      const a = this.trafficCars[i];
      for (let j = i + 1; j < trafficLimit; j++) {
        const b = this.trafficCars[j];
        const res = separatePair(
          a.x, a.y, a.z, a.heading, a.radius,
          b.x, b.y, b.z, b.heading, b.radius,
        );
        if (res) {
          a.x += res.dx;
          a.z += res.dz;
          b.x -= res.dx;
          b.z -= res.dz;
          a.avoidLat = THREE.MathUtils.clamp(a.avoidLat + res.aDodgeSign * 0.25, -2.0, 2.0);
          b.avoidLat = THREE.MathUtils.clamp(b.avoidLat + res.bDodgeSign * 0.25, -2.0, 2.0);
          if (res.aSlowFactor < 1) {
            a.speed = Math.min(a.speed, Math.max(1.5, b.speed * res.aSlowFactor));
            a.yieldTimer = Math.max(a.yieldTimer, 0.35);
          }
          if (res.bSlowFactor < 1) {
            b.speed = Math.min(b.speed, Math.max(1.5, a.speed * res.bSlowFactor));
            b.yieldTimer = Math.max(b.yieldTimer, 0.35);
          }
        }
      }
    }

    if (!includeRaceAi) return;

    // AI-vs-AI
    for (let i = 0; i < this.aiCars.length; i++) {
      const a = this.aiCars[i];
      for (let j = i + 1; j < this.aiCars.length; j++) {
        const b = this.aiCars[j];
        const res = separatePair(
          a.x, a.y, a.z, a.heading, 1.32,
          b.x, b.y, b.z, b.heading, 1.32,
        );
        if (res) {
          a.x += res.dx;
          a.z += res.dz;
          b.x -= res.dx;
          b.z -= res.dz;
          a.avoidLat = THREE.MathUtils.clamp(a.avoidLat + res.aDodgeSign * 0.3, -2.4, 2.4);
          b.avoidLat = THREE.MathUtils.clamp(b.avoidLat + res.bDodgeSign * 0.3, -2.4, 2.4);
          if (res.aSlowFactor < 1) {
            a.speed = Math.min(a.speed, Math.max(4, b.speed * 0.85));
            a.yieldTimer = Math.max(a.yieldTimer, 0.25);
          }
          if (res.bSlowFactor < 1) {
            b.speed = Math.min(b.speed, Math.max(4, a.speed * 0.85));
            b.yieldTimer = Math.max(b.yieldTimer, 0.25);
          }
        }
      }
    }

    // AI-vs-Traffic
    for (const ai of this.aiCars) {
      for (let i = 0; i < trafficLimit; i++) {
        const tc = this.trafficCars[i];
        const res = separatePair(
          ai.x, ai.y, ai.z, ai.heading, 1.32,
          tc.x, tc.y, tc.z, tc.heading, tc.radius,
        );
        if (res) {
          ai.x += res.dx;
          ai.z += res.dz;
          tc.x -= res.dx;
          tc.z -= res.dz;
          ai.avoidLat = THREE.MathUtils.clamp(ai.avoidLat + res.aDodgeSign * 0.45, -2.6, 2.6);
          tc.avoidLat = THREE.MathUtils.clamp(tc.avoidLat + res.bDodgeSign * 0.35, -2.0, 2.0);
          if (res.aSlowFactor < 1) {
            ai.speed = Math.min(ai.speed, Math.max(5, tc.speed * 0.88));
            ai.yieldTimer = Math.max(ai.yieldTimer, 0.3);
          } else if (res.bSlowFactor < 1) {
            tc.speed = Math.min(tc.speed, Math.max(2, ai.speed * 0.72));
            tc.yieldTimer = Math.max(tc.yieldTimer, 0.4);
          }
          tc.hitCooldown = 0.6;
        }
      }
    }
  }

  private updateAiDebugLines(trafficLimit: number, includeRaceAi: boolean): void {
    let cursor = 0;
    const writeLine = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      r: number,
      g: number,
      b: number,
    ) => {
      const base = cursor * 3;
      this.aiDebugPos[base] = x0;
      this.aiDebugPos[base + 1] = y0 + 1.15;
      this.aiDebugPos[base + 2] = z0;
      this.aiDebugPos[base + 3] = x1;
      this.aiDebugPos[base + 4] = y1 + 1.15;
      this.aiDebugPos[base + 5] = z1;

      this.aiDebugCol[base] = r;
      this.aiDebugCol[base + 1] = g;
      this.aiDebugCol[base + 2] = b;
      this.aiDebugCol[base + 3] = r;
      this.aiDebugCol[base + 4] = g;
      this.aiDebugCol[base + 5] = b;
      cursor += 2;
    };

    if (includeRaceAi) {
      for (const ai of this.aiCars) {
        writeLine(
          ai.rig.root.position.x,
          ai.rig.root.position.y,
          ai.rig.root.position.z,
          ai.targetX,
          ai.targetY,
          ai.targetZ,
          0.13,
          0.83,
          0.93,
        );
      }
    }

    for (let i = 0; i < trafficLimit; i++) {
      const tc = this.trafficCars[i];
      if (tc.turning) {
        writeLine(
          tc.rig.root.position.x,
          tc.rig.root.position.y,
          tc.rig.root.position.z,
          tc.targetX,
          tc.targetY,
          tc.targetZ,
          0.98,
          0.35,
          0.52,
        );
      } else {
        writeLine(
          tc.rig.root.position.x,
          tc.rig.root.position.y,
          tc.rig.root.position.z,
          tc.targetX,
          tc.targetY,
          tc.targetZ,
          0.98,
          0.8,
          0.08,
        );
      }
    }

    this.aiDebugLines.geometry.setDrawRange(0, cursor);
    (this.aiDebugLines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.aiDebugLines.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  private interpolateAiAndTrafficVisuals(
    alpha: number,
    dt: number,
    includeRaceAi: boolean,
    trafficLimit: number,
  ): void {
    if (includeRaceAi) {
      for (const ai of this.aiCars) {
        const ix = THREE.MathUtils.lerp(ai.prevX, ai.x, alpha);
        const iy = THREE.MathUtils.lerp(ai.prevY, ai.y, alpha);
        const iz = THREE.MathUtils.lerp(ai.prevZ, ai.z, alpha);
        const ih = ai.prevHeading + this.shortestAngleDelta(ai.prevHeading, ai.heading) * alpha;
        const ip = THREE.MathUtils.lerp(ai.prevPitch, ai.pitch, alpha);
        const ir = THREE.MathUtils.lerp(ai.prevRoll, ai.roll, alpha);

        ai.rig.root.position.set(ix, iy, iz);
        ai.rig.root.rotation.set(ip, ih, 0);
        ai.rig.body.rotation.z = ir;
        ai.rig.setBraking(ai.braking);

        const spinDelta = (ai.speed / 0.42) * dt;
        for (const w of ai.rig.wheels) {
          w.spin.rotation.x += spinDelta;
          if (w.front) w.pivot.rotation.y = ai.steerAngle;
        }
      }
    }

    for (let i = 0; i < trafficLimit; i++) {
      const tc = this.trafficCars[i];
      const ix = THREE.MathUtils.lerp(tc.prevX, tc.x, alpha);
      const iy = THREE.MathUtils.lerp(tc.prevY, tc.y, alpha);
      const iz = THREE.MathUtils.lerp(tc.prevZ, tc.z, alpha);
      const ih = tc.prevHeading + this.shortestAngleDelta(tc.prevHeading, tc.heading) * alpha;
      const ip = THREE.MathUtils.lerp(tc.prevPitch, tc.pitch, alpha);
      const ir = THREE.MathUtils.lerp(tc.prevRoll, tc.roll, alpha);

      tc.rig.root.position.set(ix, iy, iz);
      tc.rig.root.rotation.set(ip, ih, 0);
      tc.rig.body.rotation.z = ir;
      tc.rig.setBraking(tc.braking);

      const spinDelta = (tc.speed / 0.42) * dt;
      for (const w of tc.rig.wheels) {
        w.spin.rotation.x += spinDelta;
        if (w.front) w.pivot.rotation.y = tc.steerAngle;
      }
    }
  }

  private stepSimulation(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerText = null;
      }
    }

    const up = !!(this.heldKeys.ArrowUp || this.heldKeys.KeyW);

    // 3-2-1-GO Countdown lock: nobody moves until GO
    if (this.countdownRemaining > 0) {
      this.countdownRemaining -= dt;

      const targetRpm = up ? 0.72 : 0.16;
      this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 8);
      this.audio.update({
        rpm: this.rpm,
        gear: 1,
        speedMs: 0,
        throttle: up,
        brakingHard: false,
        driftIntensity: 0,
        onRoad: true,
        isBoosting: false,
        tunnelFactor: this.tunnelFactor,
        weather: this.weatherMode,
        active: true,
      });
      this.car.setBraking(false);
      this.car.setNitroFlame(false, this.atmosphereElapsed);

      if (this.countdownRemaining > 1.0 && this.countdownRemaining <= 2.0 && this.countdownStage === 3) {
        this.countdownStage = 2;
        this.flashBanner('2', 'countdown', 1.0);
        this.audio.playCountdownBeep(false);
      } else if (this.countdownRemaining > 0 && this.countdownRemaining <= 1.0 && this.countdownStage === 2) {
        this.countdownStage = 1;
        this.flashBanner('1', 'countdown', 1.0);
        this.audio.playCountdownBeep(false);
      } else if (this.countdownRemaining <= 0) {
        this.countdownRemaining = 0;
        this.countdownStage = 0;
        this.raceStartMs = performance.now();
        this.lapStartMs = this.raceStartMs;
        this.flashBanner('GO!', 'countdown', 1.0);
        this.audio.playCountdownBeep(true);
      }

      this.syncCarTransform();
      return;
    }

    this.raceElapsedSec += dt;

    const down = !!(this.heldKeys.ArrowDown || this.heldKeys.KeyS);
    const left = !!(this.heldKeys.ArrowLeft || this.heldKeys.KeyA);
    const right = !!(this.heldKeys.ArrowRight || this.heldKeys.KeyD);
    const handbrake = !!this.heldKeys.Space;
    const nitroPressed = !!(this.heldKeys.ShiftLeft || this.heldKeys.ShiftRight);

    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let rx = Math.cos(this.heading);
    let rz = -Math.sin(this.heading);

    let vf = this.vx * fx + this.vz * fz;

    const targetSteer = (left ? 1 : 0) - (right ? 1 : 0);
    if (targetSteer !== 0) {
      const counterSteer = Math.sign(this.analogSteer) !== 0 && Math.sign(this.analogSteer) !== targetSteer;
      const rampRate = counterSteer ? 5.6 : 3.8;
      this.analogSteer = THREE.MathUtils.clamp(
        this.analogSteer + targetSteer * rampRate * dt,
        -1,
        1,
      );
    } else if (this.analogSteer !== 0) {
      const returnStep = 5.6 * dt;
      if (Math.abs(this.analogSteer) <= returnStep) {
        this.analogSteer = 0;
      } else {
        this.analogSteer -= Math.sign(this.analogSteer) * returnStep;
      }
    }
    const maxSteer = 0.58 / (1 + Math.abs(vf) * 0.038);
    this.steer = this.analogSteer * maxSteer;
    this.heading += ((this.steer * vf) / 2.75) * dt * (handbrake ? 1.38 : 1.0);

    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    rx = Math.cos(this.heading);
    rz = -Math.sin(this.heading);

    vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;

    // Road Network surface lookup (covers highway, city grid streets, mountain pass, coastal bridge, dirt trails)
    const net = this.track.network.nearestOnNetwork(this.x, this.z);
    const nearest = this.track.nearestIndex(this.x, this.z, this.trackIdx);
    this.trackIdx = nearest.idx;
    this.surfaceType = net.onPavedSurface
      ? 'asphalt'
      : net.onDirtSurface
        ? 'dirt'
        : this.track.surfaceAt(this.x, this.z, nearest.dist);
    this.onRoad = this.surfaceType === 'asphalt' || this.surfaceType === 'dirt';

    // Nitro boost activation & drain
    const canBoost = nitroPressed && vf >= -1.0 && this.nitro > (this.isBoosting ? 0.005 : 0.08);
    this.isBoosting = canBoost;
    if (this.isBoosting) {
      const drainRate = 0.27 - this.nitroLevel * 0.032;
      this.nitro = Math.max(0, this.nitro - drainRate * dt);
      if (this.nitro <= 0.002) this.isBoosting = false;
    }

    const engineTopSpeed = BASE_MAX_SPEED + this.engineLevel * 3.0;
    const boostTopBonus = this.isBoosting ? 13 + this.nitroLevel * 4.0 : 0;
    const effectiveMaxSpeed = engineTopSpeed + boostTopBonus;
    const engineAccel = 46.0 + this.engineLevel * 3.2;

    // Smooth surface targets: moderate off-road slowdown, smooth ~1s recovery back onto asphalt
    const tireGripBonus = 1 + this.tiresLevel * 0.1;
    const targetSurfaceDrive =
      this.surfaceType === 'asphalt'
        ? 1.0
        : this.surfaceType === 'dirt'
          ? 0.88 + this.tiresLevel * 0.03
          : this.surfaceType === 'sand'
            ? 0.80 + this.tiresLevel * 0.03
            : 0.75 + this.tiresLevel * 0.03;
    const targetSurfaceGrip =
      (this.surfaceType === 'asphalt'
        ? 8.8
        : this.surfaceType === 'dirt'
          ? 5.4
          : this.surfaceType === 'sand'
            ? 4.0
            : 4.3) * tireGripBonus;
    const targetSurfaceDrag =
      this.surfaceType === 'asphalt'
        ? 0.0
        : this.surfaceType === 'dirt'
          ? 0.16
          : this.surfaceType === 'sand'
            ? 0.30
            : 0.42;

    const driveAlpha = 1 - Math.exp(-(targetSurfaceDrive > this.surfaceDriveScale ? 3.0 : 5.5) * dt);
    const gripAlpha = 1 - Math.exp(-(targetSurfaceGrip > this.surfaceGrip ? 3.0 : 5.5) * dt);
    const dragAlpha = 1 - Math.exp(-(targetSurfaceDrag < this.surfaceDrag ? 3.0 : 5.5) * dt);
    this.surfaceDriveScale += (targetSurfaceDrive - this.surfaceDriveScale) * driveAlpha;
    this.surfaceGrip += (targetSurfaceGrip - this.surfaceGrip) * gripAlpha;
    this.surfaceDrag += (targetSurfaceDrag - this.surfaceDrag) * dragAlpha;

    const rainTractionScale = this.weatherMode === 'rain' ? 0.92 : 1.0;
    const driveScale = this.surfaceDriveScale * rainTractionScale;

    if (up || this.isBoosting) {
      const throttleForce = up ? engineAccel : engineAccel * 0.45;
      const boostThrust = this.isBoosting ? 28.0 + this.nitroLevel * 4.5 : 0;
      vf +=
        (throttleForce + boostThrust) *
        driveScale *
        Math.max(0.14, 1 - Math.max(0, vf) / (effectiveMaxSpeed * 1.12)) *
        dt *
        (vf < 0 ? 2.0 : 1.0);
    }
    if (down) {
      vf -= (vf > 1 ? 64 : 22) * dt;
      if (vf < -16) vf = -16;
    }
    if (!up && !down && !this.isBoosting) {
      vf -= vf * 0.22 * dt + Math.sign(vf) * 1.45 * dt;
      if (Math.abs(vf) < 0.08) vf = 0;
    }

    vf -= vf * Math.abs(vf) * (this.isBoosting ? 0.00055 : 0.0008) * dt;
    if (this.surfaceDrag > 0.001) {
      vf -= vf * this.surfaceDrag * dt;
    }
    if (vf > effectiveMaxSpeed) {
      vf -= (vf - effectiveMaxSpeed) * Math.min(1, dt * 3.5);
    }
    if (handbrake) {
      vf -= vf * 0.85 * dt;
    }

    if (this.surfaceType !== 'asphalt') {
      const rumbleScale = this.surfaceType === 'dirt' ? 48 : 34;
      this.shake = Math.max(this.shake * Math.exp(-8 * dt), Math.min(0.45, Math.abs(vf) / rumbleScale));
    } else {
      this.shake *= Math.exp(-8 * dt);
    }

    const rainGripScale = this.weatherMode === 'rain' ? 0.74 : 1.0;
    const grip = handbrake ? 1.55 * rainGripScale : this.surfaceGrip * rainGripScale;
    vl *= Math.exp(-grip * dt);

    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;

    this.staticCrashCooldown = Math.max(0, this.staticCrashCooldown - dt);
    const moveDist = Math.hypot(this.vx, this.vz) * dt;
    const subSteps = moveDist > 0.8 ? Math.min(4, Math.ceil(moveDist / 0.8)) : 1;
    const subDt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      this.x += this.vx * subDt;
      this.z += this.vz * subDt;

      // Resolve against SpatialColliderGrid & Railway Train/Barriers (front axle, rear axle & center circles)
      let stepImpact = 0;
      let impX = this.x;
      let impZ = this.z;
      for (const offset of [1.12, -1.12, 0]) {
        const cx = this.x + fx * offset;
        const cz = this.z + fz * offset;
        const rad = offset === 0 ? 1.18 : 1.02;
        if (
          this.track.colliders.resolveCircle(cx, this.y, cz, rad, _colHit) ||
          this.track.railway.resolvePlayerCollision(cx, this.y, cz, rad, _colHit)
        ) {
          this.x += _colHit.dx;
          this.z += _colHit.dz;
          const vn = this.vx * _colHit.nx + this.vz * _colHit.nz;
          if (vn < 0) {
            this.vx -= _colHit.nx * vn * 1.38;
            this.vz -= _colHit.nz * vn * 1.38;
            this.vx *= 0.84;
            this.vz *= 0.84;
            if (-vn > stepImpact) {
              stepImpact = -vn;
              impX = cx - _colHit.nx * rad;
              impZ = cz - _colHit.nz * rad;
            }
          } else {
            this.vx *= 0.96;
            this.vz *= 0.96;
          }
        }
      }

      if (stepImpact > 2.2) {
        this.shake = Math.max(this.shake, Math.min(1.0, 0.25 + stepImpact * 0.032));
        if (this.staticCrashCooldown <= 0) {
          this.staticCrashCooldown = 0.2;
          this.audio.playCollision(Math.min(1, 0.32 + stepImpact * 0.035));
          this.spawnSparkBurst(impX, this.y + 0.42, impZ, this.vx, this.vz, 12);
        }
      }
    }

    // Update AI race opponents (Race mode only) & Ambient Road-Graph Traffic at fixed 60Hz timestep with interpolation
    const playerProgressBeforeFinish = this.getPlayerTotalProgress();
    this.updateAiFixedSteps(dt, playerProgressBeforeFinish, this.gameMode === 'race');
    const aiWinner = this.gameMode === 'race' ? this.aiWinnerState : null;

    // Car-to-car collision with Race AI opponents
    if (this.gameMode === 'race') {
      for (const ai of this.aiCars) {
        if (Math.abs(this.y - ai.y) > 2.4) continue;
        const dx = this.x - ai.x;
        const dz = this.z - ai.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 2.65;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const gn = this.track.normals[this.trackIdx];
          const nx = dist > 0.001 ? dx / dist : gn.x;
          const nz = dist > 0.001 ? dz / dist : gn.z;
          const overlap = minDist - dist;

          this.x += nx * overlap * 0.85;
          this.z += nz * overlap * 0.85;

          const pushLatSign = -(nx * gn.x + nz * gn.z);
          ai.avoidLat = THREE.MathUtils.clamp(ai.avoidLat + pushLatSign * overlap * 0.5, -2.5, 2.5);

          this.vx += nx * 7.5;
          this.vz += nz * 7.5;
          this.vx *= 0.88;
          this.vz *= 0.88;
          ai.speed *= 0.88;
          ai.hitCooldown = 0.6;
          this.shake = Math.max(this.shake, 0.45);
          this.audio.playCollision(0.72);
          this.spawnSparkBurst((this.x + ai.x) * 0.5, this.y + 0.4, (this.z + ai.z) * 0.5, this.vx, this.vz, 12);
        }
      }
    }

    // Car-to-car collision with active Traffic vehicles
    const activeTrafficLimit = this.getTrafficLimit();
    for (let i = 0; i < activeTrafficLimit; i++) {
      const tc = this.trafficCars[i];
      if (Math.abs(this.y - tc.y) > 2.4) continue;
      const dx = this.x - tc.x;
      const dz = this.z - tc.z;
      const dSq = dx * dx + dz * dz;
      const minDist = 1.32 + tc.radius;
      if (dSq < minDist * minDist) {
        const dist = Math.sqrt(dSq);
        const nx = dist > 0.001 ? dx / dist : 1;
        const nz = dist > 0.001 ? dz / dist : 0;
        const overlap = minDist - dist;
        this.x += nx * overlap * 0.88;
        this.z += nz * overlap * 0.88;
        this.vx = this.vx * 0.8 + nx * 6.5;
        this.vz = this.vz * 0.8 + nz * 6.5;
        tc.speed *= 0.4;
        tc.hitCooldown = 1.4;
        this.shake = Math.max(this.shake, 0.48);
        this.audio.playCollision(0.68);
        this.spawnSparkBurst((this.x + tc.x) * 0.5, this.y + 0.4, (this.z + tc.z) * 0.5, this.vx, this.vz, 10);
      }
    }

    // Track circuit lateral offset for AI dodging
    {
      const gp = this.track.points[this.trackIdx];
      const gn = this.track.normals[this.trackIdx];
      this.playerLat = (this.x - gp.x) * gn.x + (this.z - gp.z) * gn.z;
    }

    // Smart Road-Network Guardrail Collision (open at all junctions, exits, city streets & dirt trails)
    {
      const netAfter = this.track.network.nearestOnNetwork(this.x, this.z);
      const fromNode = this.track.network.nodeMap.get(netAfter.edge.fromNodeId);
      const toNode = this.track.network.nodeMap.get(netAfter.edge.toNodeId);
      const sEdge = netAfter.edge.samples[netAfter.sampleIndex].s;
      const clearOfStart = !fromNode || sEdge > fromNode.radius + 7.5;
      const clearOfEnd = !toNode || sEdge < netAfter.edge.length - (toNode.radius + 7.5);
      const latSign = Math.sign(netAfter.lat) || 1;
      const sideHasRail =
        latSign > 0 ? netAfter.edge.hasGuardrailRight : netAfter.edge.hasGuardrailLeft;

      const railCfg = ROAD_CONFIG[netAfter.edge.type];
      const lim = netAfter.halfWidth + railCfg.guardrailGap - 0.85;
      if (
        sideHasRail &&
        clearOfStart &&
        clearOfEnd &&
        Math.abs(netAfter.lat) > lim &&
        Math.abs(netAfter.lat) < netAfter.halfWidth + railCfg.guardrailGap + 3.5
      ) {
        this.x -= netAfter.normX * (Math.abs(netAfter.lat) - lim) * latSign;
        this.z -= netAfter.normZ * (Math.abs(netAfter.lat) - lim) * latSign;
        const vn = this.vx * netAfter.normX + this.vz * netAfter.normZ;
        if (vn * latSign > 0) {
          this.vx -= netAfter.normX * vn * 1.5;
          this.vz -= netAfter.normZ * vn * 1.5;
          this.vx *= 0.85;
          this.vz *= 0.85;
          this.shake = 1;
          this.audio.playCollision(Math.min(1, 0.35 + Math.abs(vn) * 0.035));
          this.spawnSparkBurst(
            this.x + netAfter.normX * latSign * 0.9,
            this.y + 0.42,
            this.z + netAfter.normZ * latSign * 0.9,
            this.vx,
            this.vz,
            14,
          );
        }
      }

      // Coastal Roundabout central landscaped island collision barrier
      if (netAfter.node && netAfter.node.kind === 'roundabout') {
        const islandLim = this.track.network.roundaboutInnerRadius + 1.1;
        const dx = this.x - netAfter.node.x;
        const dz = this.z - netAfter.node.z;
        const rDist = Math.hypot(dx, dz);
        if (rDist < islandLim && rDist > 0.01) {
          const rxN = dx / rDist;
          const rzN = dz / rDist;
          this.x = netAfter.node.x + rxN * islandLim;
          this.z = netAfter.node.z + rzN * islandLim;
          const vRad = this.vx * rxN + this.vz * rzN;
          if (vRad < 0) {
            this.vx -= rxN * vRad * 1.45;
            this.vz -= rzN * vRad * 1.45;
            this.vx *= 0.86;
            this.vz *= 0.86;
            this.shake = Math.max(this.shake, 0.65);
            this.audio.playCollision(0.55);
          }
        }
      }

      // Smooth ground elevation & pitch across bridges, hills, and flat city/highway/dirt roads
      this.y += (netAfter.groundY - this.y) * Math.min(1, dt * 10);
      const targetPitch = -Math.atan(netAfter.slope);
      this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 8);
    }

    // Speed & Gear Calculation
    const speedMs = Math.hypot(this.vx, this.vz);
    const speedKmh = Math.round(speedMs * 3.6);
    if (speedKmh > this.topSpeedKmh) {
      this.topSpeedKmh = speedKmh;
    }

    let gear = 1;
    for (let g = 1; g < GEARS.length; g++) {
      if (speedMs >= GEARS[g - 1]) gear = g;
    }
    this.gearNum = gear;
    const gMin = GEARS[gear - 1];
    const gMax = GEARS[gear];
    const targetRpm =
      speedMs < 0.8
        ? up
          ? 0.68
          : 0.14
        : THREE.MathUtils.clamp((speedMs - gMin) / (gMax - gMin), 0.22, 1.0);
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 10);

    // Drift detection, scoring & Nitro refill (passive + drift bonus)
    const slipSpeed = Math.abs(vl);
    const driftIntensity = speedMs > 8 ? THREE.MathUtils.clamp((slipSpeed - 3.2) / 14, 0, 1) : 0;
    const isActivelyDrifting = driftIntensity > 0.16 && this.onRoad;

    if (!this.isBoosting) {
      const passiveRefill = 0.042 + this.nitroLevel * 0.009;
      const driftRefill = isActivelyDrifting ? driftIntensity * (0.145 + this.nitroLevel * 0.025) : 0;
      this.nitro = Math.min(1, this.nitro + (passiveRefill + driftRefill) * dt);
    }

    if (isActivelyDrifting) {
      this.driftGraceTimer = 0.65;
      this.activeDriftPoints += driftIntensity * speedMs * 4.5 * dt;
    } else if (this.driftGraceTimer > 0) {
      this.driftGraceTimer -= dt;
      if (this.driftGraceTimer <= 0 && this.activeDriftPoints > 0) {
        this.driftScore += Math.round(this.activeDriftPoints);
        this.activeDriftPoints = 0;
      }
    }

    // Tire skid marks + Drift Smoke (asphalt) + Off-Road Dust Plumes (dirt/sand/grass)
    const rearZ = -1.46;
    const brakingHard = (down && vf > 12) || (handbrake && speedMs > 10);
    if ((driftIntensity > 0.22 || brakingHard) && this.surfaceType === 'asphalt') {
      this.skidAccum += dt;
      if (this.skidAccum >= 0.026) {
        this.skidAccum = 0;
        const travelYaw = Math.atan2(this.vx, this.vz);
        for (const s of [-1, 1]) {
          const wx = this.x + fx * rearZ + rx * (s * 1.02);
          const wz = this.z + fz * rearZ + rz * (s * 1.02);
          this.stampSkidMark(wx, this.y, wz, travelYaw);
          this.spawnSmokePuff(wx, this.y + 0.22, wz, -this.vx, -this.vz);
        }
      }
    } else if (this.surfaceType !== 'asphalt' && speedMs > 7) {
      this.dustAccum += dt;
      const dustRate = driftIntensity > 0.2 ? 0.025 : 0.055;
      if (this.dustAccum >= dustRate) {
        this.dustAccum = 0;
        for (const s of [-1, 1]) {
          const wx = this.x + fx * rearZ + rx * (s * 1.02);
          const wz = this.z + fz * rearZ + rz * (s * 1.02);
          this.spawnDustPuff(wx, this.y + 0.24, wz, -this.vx, -this.vz);
        }
      }
    }

    // Speed & High-Speed Rumble + Radial Motion Blur + Wind Speed Lines + Exhaust Flames
    if (speedMs > 50 && this.surfaceType === 'asphalt') {
      const rumble = ((speedMs - 50) / (BASE_MAX_SPEED - 50)) * 0.16;
      this.shake = Math.max(this.shake, rumble);
    }
    if (this.isBoosting) {
      this.shake = Math.max(this.shake, 0.11);
    }
    if (this.motionBlurPass) {
      const blurFactor = this.phase === 'playing'
        ? Math.max(
            THREE.MathUtils.clamp((speedMs - 38) / (BASE_MAX_SPEED - 38), 0, 1),
            this.isBoosting ? 0.85 : 0,
          )
        : 0;
      this.motionBlurPass.uniforms.uStrength.value = blurFactor * 0.024;
    }
    this.car.setNitroFlame(this.isBoosting, this.atmosphereElapsed, 1 + this.nitroLevel * 0.25);
    this.updateSpeedLines(dt, speedMs);

    this.updateParticles(dt);

    // Update chunk streaming around player
    if (Math.hypot(this.x - this.lastChunkX, this.z - this.lastChunkZ) > 25) {
      this.lastChunkX = this.x;
      this.lastChunkZ = this.z;
      this.track.updateChunks(this.x, this.z, this.quality, false);
    }

    // Audio synth update
    this.audio.update({
      rpm: this.rpm,
      gear: this.gearNum,
      speedMs,
      throttle: up || this.isBoosting,
      brakingHard,
      driftIntensity,
      onRoad: this.onRoad,
      isBoosting: this.isBoosting,
      tunnelFactor: this.tunnelFactor,
      weather: this.weatherMode,
      active: true,
    });

    // Recompute GPS shortest path periodically when a destination pin is set
    if (this.gpsTargetWorld && performance.now() - this.lastGpsComputeMs > 260) {
      this.recomputeGpsRoute(false);
    }

    // Sequential Checkpoint Lap & Finish logic (Race mode only)
    let playerFinished = false;
    if (this.gameMode === 'race') {
      const n = this.track.count;
      const progress = this.trackIdx / n;
      if (this.checkpointStage === 0 && progress >= 0.18 && progress <= 0.38) {
        this.checkpointStage = 1;
      } else if (this.checkpointStage === 1 && progress >= 0.42 && progress <= 0.64) {
        this.checkpointStage = 2;
      } else if (this.checkpointStage === 2 && progress >= 0.68 && progress <= 0.88) {
        this.checkpointStage = 3;
      }

      if (this.checkpointStage === 3 && this.trackIdx < n * 0.12 && this.prevTrackIdx > n * 0.82) {
        this.checkpointStage = 0;
        const now = performance.now();
        const lapSec = (now - this.lapStartMs) / 1000;
        this.lapStartMs = now;
        this.lapTimesSec.push(lapSec);

        const isNewBest = this.bestLapSec === null || lapSec < this.bestLapSec;
        if (isNewBest) {
          this.bestLapSec = lapSec;
        }

        if (this.lap >= TOTAL_LAPS) {
          playerFinished = true;
        } else {
          this.lap += 1;
          this.audio.playChime(isNewBest ? 'best' : 'lap');
          this.flashBanner(
            isNewBest ? 'NEW BEST LAP' : `LAP ${this.lap} / ${TOTAL_LAPS}`,
            isNewBest ? 'best' : 'info',
            1.8,
          );
        }
      }
      this.prevTrackIdx = this.trackIdx;

      // Live position rank (1..4) & leader gap
      const currentPlayerProgress = this.getPlayerTotalProgress();
      let rank = 1;
      let leaderAi = this.aiCars[0];
      for (const ai of this.aiCars) {
        if (ai.s > currentPlayerProgress) rank++;
        if (ai.s > leaderAi.s) leaderAi = ai;
      }
      this.playerPosition = rank;
      if (rank > 1 && leaderAi) {
        const gapMeters = Math.max(0, Math.round(leaderAi.s - currentPlayerProgress));
        this.leaderGapText = `${leaderAi.spec.name} +${gapMeters} m`;
      } else {
        this.leaderGapText = null;
      }
    } else {
      this.playerPosition = 1;
      this.leaderGapText = null;
    }

    // Zone banner detection across the entire open-world road network
    if (this.zoneBannerTimer > 0) {
      this.zoneBannerTimer = Math.max(0, this.zoneBannerTimer - dt);
    }
    const [t0, t1] = this.track.tunnelRange;
    const circuitZone =
      nearest.dist < 22 && this.trackIdx >= t0 && this.trackIdx <= t1
        ? 'MOUNTAIN TUNNEL'
        : net.zoneLabel;
    if (circuitZone !== this.currentZone) {
      this.currentZone = circuitZone;
      this.zoneBannerTimer = circuitZone ? 2.8 : 0;
    }

    // Car mesh suspension & wheel animation
    this.syncCarTransform();
    const roadBankRoll =
      net.bankRad !== 0 ? (rx * net.normX + rz * net.normZ) * net.bankRad : 0;
    const roll = THREE.MathUtils.clamp(
      -vl * 0.013 - this.steer * vf * 0.0032 + roadBankRoll,
      -0.16,
      0.16,
    );
    this.car.body.rotation.z += (roll - this.car.body.rotation.z) * Math.min(1, dt * 6.5);
    const pitchTarget = up ? -0.016 : down && vf > 1 ? 0.032 : 0;
    this.car.body.rotation.x += (pitchTarget - this.car.body.rotation.x) * Math.min(1, dt * 5.5);
    this.car.body.position.y = this.shake * Math.sin(performance.now() * 0.05) * 0.045;

    this.car.setBraking(down || handbrake);

    const spinDelta = (vf / 0.42) * dt;
    for (const w of this.car.wheels) {
      w.spin.rotation.x += spinDelta;
      if (w.front) {
        w.pivot.rotation.y = this.steer * 0.72;
      }
    }

    if (this.gameMode === 'race') {
      if (playerFinished) {
        this.finishRace(true, null);
      } else if (aiWinner) {
        this.finishRace(false, aiWinner.spec.name);
      }
    }
  }

  private syncCarTransform(): void {
    this.car.root.position.set(this.x, this.y, this.z);
    this.car.root.rotation.set(this.pitch, this.heading, 0);
    this.skyDome.position.set(this.x, 0, this.z);
  }

  private updateCamera(dt: number, snap = false): void {
    if (this.phase === 'title') {
      this.titleAngle += dt * 0.22;
      const radius = 8.4;
      const cx = this.x + Math.sin(this.titleAngle) * radius;
      const cz = this.z + Math.cos(this.titleAngle) * radius;
      _camTarget.set(cx, 2.75 + Math.sin(this.titleAngle * 0.7) * 0.35, cz);
      _camLook.set(this.x, 0.95, this.z);

      this.camera.position.copy(_camTarget);
      this.camera.lookAt(_camLook);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 4, dt);
      this.camera.updateProjectionMatrix();
    } else {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const rx = Math.cos(this.heading);
      const rz = -Math.sin(this.heading);
      const speed = Math.hypot(this.vx, this.vz);
      const velAngle = speed > 2 ? Math.atan2(this.vx, this.vz) : this.heading;

      if (this.camMode === 1) {
        _camTarget.set(this.x + fx * 0.75, this.y + 1.38, this.z + fz * 0.75);
        _camLook.set(this.x + fx * 22, this.y + 1.15, this.z + fz * 22);
        this.camera.position.copy(_camTarget);
        this.camera.lookAt(_camLook);
      } else {
        const dist = this.camMode === 2 ? 12.4 : 7.8;
        const height = this.camMode === 2 ? 4.5 : 2.95;

        let diff = velAngle - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const camYaw = this.heading + diff * 0.32;

        const bx = Math.sin(camYaw);
        const bz = Math.cos(camYaw);

        const shakeX = this.shake * (Math.random() - 0.5) * 0.18;
        const shakeY = this.shake * (Math.random() - 0.5) * 0.12;

        _camTarget.set(
          this.x - bx * dist + rx * shakeX,
          this.y + height + shakeY,
          this.z - bz * dist + rz * shakeX,
        );
        _camLook.set(this.x + fx * 6.5, this.y + 1.15, this.z + fz * 6.5);

        if (snap) {
          this.camera.position.copy(_camTarget);
        } else {
          const factor = 1 - Math.exp(-9.5 * dt);
          this.camera.position.lerp(_camTarget, factor);
        }
        this.camera.lookAt(_camLook);
      }

      const targetFov =
        60 +
        THREE.MathUtils.clamp((speed / BASE_MAX_SPEED) * 14, 0, 15) +
        (this.isBoosting ? 7.5 : 0);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }

    this.sun.position.set(
      this.x + _sunDir.x * 120,
      this.y + _sunDir.y * 120,
      this.z + _sunDir.z * 120,
    );
    this.sun.target.position.set(this.x, this.y, this.z);
    this.sun.target.updateMatrixWorld();
  }

  private recomputeGpsRoute(force: boolean): void {
    void force;
    if (!this.gpsTargetWorld) return;
    this.lastGpsComputeMs = performance.now();
    const res = this.track.network.computeGpsRoute(
      this.x,
      this.z,
      this.gpsTargetWorld.x,
      this.gpsTargetWorld.z,
      this.track.worldToMinimap,
    );
    this.gpsWorldPoints = res.worldPoints;
    this.gpsMinimapPoints = res.minimapPoints;
    this.gpsInstruction = res.instruction;

    // Update 3D glowing chevron guide markers along the active route on the road ahead
    if (this.gpsWorldPoints.length >= 2) {
      let placed = 0;
      let accum = 0;
      const nextStepMeters = 10;
      let nextTarget = 6;
      for (let i = 1; i < this.gpsWorldPoints.length && placed < GPS_MARKER_POOL_SIZE; i++) {
        const a = this.gpsWorldPoints[i - 1];
        const b = this.gpsWorldPoints[i];
        const seg = Math.hypot(b.x - a.x, b.z - a.z);
        accum += seg;
        if (accum >= nextTarget) {
          nextTarget += nextStepMeters;
          const dFromPlayer = Math.hypot(b.x - this.x, b.z - this.z);
          if (dFromPlayer > 280) break;
          _dummy.position.set(b.x, b.y + 0.06, b.z);
          _dummy.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
          _dummy.scale.set(1.35, 1, 1.35);
          _dummy.updateMatrix();
          this.gpsMarkerMesh.setMatrixAt(placed++, _dummy.matrix);
        }
      }
      this.gpsMarkerMesh.count = placed;
      this.gpsMarkerMesh.visible = placed > 0;
      this.gpsMarkerMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.gpsMarkerMesh.visible = false;
    }
  }

  private buildGpsRouteAhead(): MinimapPoint[] {
    if (this.gpsTargetWorld && this.gpsMinimapPoints.length > 0) {
      return this.gpsMinimapPoints;
    }
    if (this.gameMode === 'freeRoam') return [];
    const out: MinimapPoint[] = [];
    const n = this.track.count;
    const steps = 16;
    const stepStride = 10;
    for (let s = 0; s <= steps; s++) {
      const idx = (this.trackIdx + s * stepStride) % n;
      const p = this.track.points[idx];
      const m = this.track.worldToMinimap(p.x, p.z);
      out.push({ x: m.nx * 100, y: m.ny * 100 });
    }
    return out;
  }

  private emitHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmitMs < 50) return;
    this.lastHudEmitMs = now;

    const speedMs = Math.hypot(this.vx, this.vz);
    const speedKmh = Math.round(speedMs * 3.6);
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const vf = this.vx * fx + this.vz * fz;

    let gearLabel = 'N';
    if (vf < -0.5) gearLabel = 'R';
    else if (speedMs > 0.6 || this.heldKeys.ArrowUp || this.heldKeys.KeyW) {
      gearLabel = String(this.gearNum);
    }

    const { nx, ny } = this.track.worldToMinimap(this.x, this.z);
    const aiDots: MinimapRacerDot[] =
      this.gameMode === 'race'
        ? this.aiCars.map((ai) => {
            const m = this.track.worldToMinimap(ai.x, ai.z);
            return {
              name: ai.spec.name,
              x: m.nx * 100,
              y: m.ny * 100,
              color: ai.spec.livery.cssColor,
            };
          })
        : [];

    const trafficLimit = this.getTrafficLimit();
    const trafficDots: MinimapRacerDot[] = [];
    for (let i = 0; i < trafficLimit; i++) {
      const tc = this.trafficCars[i];
      const m = this.track.worldToMinimap(tc.x, tc.z);
      trafficDots.push({
        name: `T${i}`,
        x: m.nx * 100,
        y: m.ny * 100,
        color: tc.dotColor,
      });
    }

    const lapTimeSec =
      this.phase === 'playing' && this.countdownRemaining <= 0
        ? Math.max(0, (now - this.lapStartMs) / 1000)
        : 0;

    this.callbacks.onHudUpdate({
      gameMode: this.gameMode,
      speedKmh,
      gearLabel,
      rpmRatio: this.rpm,
      nitroRatio: this.nitro,
      isBoosting: this.isBoosting,
      lap: this.lap,
      totalLaps: TOTAL_LAPS,
      position: this.playerPosition,
      totalRacers: TOTAL_RACERS,
      leaderGapText: this.leaderGapText,
      zoneLabel: this.zoneBannerTimer > 0 ? this.currentZone : null,
      lapTimeSec,
      bestLapSec: this.bestLapSec,
      driftScore: this.driftScore,
      activeDriftPoints: Math.round(this.activeDriftPoints),
      isDrifting: this.driftGraceTimer > 0 && this.activeDriftPoints > 5,
      onRoad: this.onRoad,
      surfaceType: this.surfaceType,
      cameraMode: this.camMode,
      bannerText: this.bannerText,
      bannerTone: this.bannerTone,
      playerNormX: nx * 100,
      playerNormY: ny * 100,
      playerHeading: this.heading,
      gpsRoutePoints: this.buildGpsRouteAhead(),
      gpsInstruction: this.gpsInstruction,
      aiDots,
      trafficDots,
      aiDebugEnabled: this.aiDebugEnabled,
      stuckRespawnCount: this.stuckRespawnCount,
    });
  }

  private updateAtmosphere(dt: number): void {
    this.atmosphereElapsed += dt;
    this.skyMat.uniforms.uTime.value = this.atmosphereElapsed;

    if (this.timeOfDayMode === 'auto') {
      this.timeCyclePhase = (this.timeCyclePhase + dt * 0.024) % 3;
    } else {
      const target =
        this.timeOfDayMode === 'morning' ? 0 : this.timeOfDayMode === 'noon' ? 1 : 2;
      let diff = target - this.timeCyclePhase;
      if (diff > 1.5) diff -= 3;
      if (diff < -1.5) diff += 3;
      this.timeCyclePhase = (this.timeCyclePhase + diff * Math.min(1, dt * 3.5) + 3) % 3;
    }

    const i0 = Math.floor(this.timeCyclePhase) % 3;
    const i1 = (i0 + 1) % 3;
    const alpha = this.timeCyclePhase - Math.floor(this.timeCyclePhase);
    const k0 = DAY_KEYFRAMES[i0];
    const k1 = DAY_KEYFRAMES[i1];

    _sunDir.lerpVectors(k0.sunDir, k1.sunDir, alpha).normalize();
    _todZenith.lerpColors(k0.zenith, k1.zenith, alpha);
    _todHorizon.lerpColors(k0.horizon, k1.horizon, alpha);
    _todSunGlow.lerpColors(k0.sunGlow, k1.sunGlow, alpha);
    _todCloudLight.lerpColors(k0.cloudLight, k1.cloudLight, alpha);
    _todCloudShadow.lerpColors(k0.cloudShadow, k1.cloudShadow, alpha);
    _todSunColor.lerpColors(k0.sunColor, k1.sunColor, alpha);
    _todHemiSky.lerpColors(k0.hemiSky, k1.hemiSky, alpha);
    _todHemiGround.lerpColors(k0.hemiGround, k1.hemiGround, alpha);

    // Smooth blend into Night, Rain, or Heavy Fog weather states
    const targetNight = this.weatherMode === 'night' ? 1 : 0;
    this.nightMix += (targetNight - this.nightMix) * (dt > 0 ? Math.min(1, dt * 4.5) : 1);
    const night = this.nightMix;

    const isRain = this.weatherMode === 'rain';
    const isFog = this.weatherMode === 'fog';
    const overcast = isRain ? 0.92 : isFog ? 0.65 : 0;

    if (night > 0.001) {
      _todZenith.lerp(_nightZenith, night);
      _todHorizon.lerp(_nightHorizon, night);
      _todSunGlow.lerp(_nightSunGlow, night);
      _todCloudLight.lerp(_nightCloudLight, night);
      _todCloudShadow.lerp(_nightCloudShadow, night);
      _todSunColor.lerp(_nightSunColor, night);
      _todHemiSky.lerp(_nightHemiSky, night);
      _todHemiGround.lerp(_nightHemiGround, night);
    }
    if (isRain) {
      _todZenith.lerp(_rainZenith, 0.72);
      _todHorizon.lerp(_rainHorizon, 0.76);
      _todCloudLight.lerp(_rainHorizon, 0.65);
      _todCloudShadow.lerp(_rainZenith, 0.7);
    } else if (isFog) {
      _todZenith.lerp(_fogHorizon, 0.62);
      _todHorizon.lerp(_fogHorizon, 0.8);
    }

    this.skyMat.uniforms.uSunDir.value.copy(_sunDir);
    (this.skyMat.uniforms.uZenith.value as THREE.Color).copy(_todZenith);
    (this.skyMat.uniforms.uHorizon.value as THREE.Color).copy(_todHorizon);
    (this.skyMat.uniforms.uSunGlow.value as THREE.Color).copy(_todSunGlow);
    (this.skyMat.uniforms.uCloudLight.value as THREE.Color).copy(_todCloudLight);
    (this.skyMat.uniforms.uCloudShadow.value as THREE.Color).copy(_todCloudShadow);
    this.skyMat.uniforms.uNightFactor.value = night;
    this.skyMat.uniforms.uOvercast.value = overcast;

    // Match distance fog & background color seamlessly to horizon sky color + weather density
    this.fog.color.copy(_todHorizon);
    (this.scene.background as THREE.Color).copy(_todHorizon);
    if (isFog) {
      this.fog.near = 38;
      this.fog.far = this.quality === 'low' ? 230 : this.quality === 'med' ? 290 : 350;
    } else if (isRain) {
      this.fog.near = Math.min(this.baseFogNear, 120);
      this.fog.far = Math.min(this.baseFogFar, 560);
    } else if (night > 0.5) {
      this.fog.near = Math.min(this.baseFogNear, 220);
      this.fog.far = Math.min(this.baseFogFar, 880);
    } else {
      this.fog.near = this.baseFogNear;
      this.fog.far = this.baseFogFar;
    }

    // Dynamic tunnel ambient transition mixed with day-time / weather lighting
    const [t0, t1] = this.track.tunnelRange;
    const inTunnel = this.trackIdx >= t0 && this.trackIdx <= t1 ? 1 : 0;
    this.tunnelFactor += (inTunnel - this.tunnelFactor) * (dt > 0 ? Math.min(1, dt * 4) : 1);

    const sunIntBase = THREE.MathUtils.lerp(k0.sunIntensity, k1.sunIntensity, alpha);
    const hemiIntBase = THREE.MathUtils.lerp(k0.hemiIntensity, k1.hemiIntensity, alpha);
    const exposureBase = THREE.MathUtils.lerp(k0.exposure, k1.exposure, alpha);
    const cityEmissiveBase = THREE.MathUtils.lerp(k0.cityEmissive, k1.cityEmissive, alpha);
    const headBase = THREE.MathUtils.lerp(k0.headlightIntensity, k1.headlightIntensity, alpha);

    const weatherSunScale = isRain ? 0.42 : isFog ? 0.58 : 1.0;
    const sunNightScale = THREE.MathUtils.lerp(sunIntBase * weatherSunScale, 0.34, night);
    const hemiNightScale = THREE.MathUtils.lerp(
      hemiIntBase * (isRain ? 0.78 : 1.0),
      0.42,
      night,
    );

    this.sun.color.copy(_todSunColor);
    this.sun.intensity = sunNightScale * (1 - 0.82 * this.tunnelFactor);
    this.hemiLight.color.copy(_todHemiSky);
    this.hemiLight.groundColor.copy(_todHemiGround);
    this.hemiLight.intensity = hemiNightScale * (1 - 0.65 * this.tunnelFactor);
    this.tunnelLight.intensity = 3.1 * this.tunnelFactor;
    this.renderer.toneMappingExposure =
      THREE.MathUtils.lerp(exposureBase, 1.02, night) - 0.12 * this.tunnelFactor;

    // Wet darker reflective roads in Rain vs dry asphalt across all road classes
    const targetWet = isRain ? 1 : 0;
    for (const roadMat of this.track.asphaltMaterials) {
      roadMat.color.lerpColors(_roadDryColor, _roadWetColor, targetWet);
      roadMat.roughness = THREE.MathUtils.lerp(0.86, 0.2, targetWet);
      roadMat.clearcoat = THREE.MathUtils.lerp(0.0, 0.85, targetWet);
      roadMat.envMapIntensity = THREE.MathUtils.lerp(1.0, 1.85, targetWet);
    }

    // Lit city windows, glowing street lamp heads, headlights & taillights at Night / Tunnel
    this.track.cityFacadeMaterial.emissiveIntensity =
      Math.max(cityEmissiveBase, isRain ? 1.15 : 0) + night * 1.9;
    const lampGlow = 0.6 + night * 2.2 + (isRain ? 0.65 : 0);
    this.track.lampHeadMaterial.color.setRGB(lampGlow * 1.1, lampGlow * 0.9, lampGlow * 0.5);

    const headIntensity = headBase + this.tunnelFactor * 1.4 + night * 2.2 + (isRain ? 0.8 : 0);
    const tailIdleIntensity = 1.35 + night * 1.35 + (isRain ? 0.45 : 0);
    const headSpotIntensity =
      this.phase === 'title' ? night * 5.0 : night * 18.0 + this.tunnelFactor * 9.5 + (isRain ? 3.5 : 0);

    this.car.setLightingState(headIntensity, tailIdleIntensity, headSpotIntensity);
    for (const ai of this.aiCars) {
      ai.rig.setLightingState(headIntensity, tailIdleIntensity, 0);
    }
    this.trafficFactory.setLightingState(headIntensity, tailIdleIntensity);

    // Dynamic nearest street PointLights illuminating the road & car at Night
    const lampActive = night > 0.15;
    if (lampActive && this.track.lampPositions.length > 0) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const targetX = this.x + fx * 18;
      const targetZ = this.z + fz * 18;
      const lamps = this.track.lampPositions;

      let best0 = -1;
      let best1 = -1;
      let best2 = -1;
      let d0 = 4200;
      let d1 = 4200;
      let d2 = 4200;

      for (let i = 0; i < lamps.length; i++) {
        const lp = lamps[i];
        const dx = lp.x - targetX;
        const dz = lp.z - targetZ;
        const dSq = dx * dx + dz * dz;
        if (dSq < d0) {
          d2 = d1; best2 = best1;
          d1 = d0; best1 = best0;
          d0 = dSq; best0 = i;
        } else if (dSq < d1) {
          d2 = d1; best2 = best1;
          d1 = dSq; best1 = i;
        } else if (dSq < d2) {
          d2 = dSq; best2 = i;
        }
      }

      const picks = [best0, best1, best2];
      for (let k = 0; k < STREET_LIGHT_POOL_SIZE; k++) {
        const sl = this.streetLights[k];
        const idx = picks[k];
        if (idx >= 0) {
          sl.position.copy(lamps[idx]);
          sl.intensity = 34 * night;
        } else {
          sl.intensity = 0;
        }
      }
    } else {
      for (const sl of this.streetLights) {
        sl.intensity = 0;
      }
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = Number.isFinite(rawDt) ? Math.min(Math.max(rawDt, 0.001), 0.05) : FIXED_AI_DT;

    if (this.phase === 'playing') {
      this.stepSimulation(dt);
      this.track.railway.update(dt, this.x, this.z, (dist) => this.audio.playTrainHorn(dist));
      this.track.updateLivingDetails(dt, this.atmosphereElapsed, this.x, this.z);
      this.updateCamera(dt, false);
      this.emitHud(false);
    } else if (this.phase === 'title') {
      this.updateAiFixedSteps(dt, 0, false);
      this.track.railway.update(dt, this.x, this.z, () => {});
      this.track.updateLivingDetails(dt, this.atmosphereElapsed, this.x, this.z);
      this.updateCamera(dt, false);
      this.speedLineMesh.visible = false;
      this.car.setNitroFlame(false, this.atmosphereElapsed);
      if (this.motionBlurPass) this.motionBlurPass.uniforms.uStrength.value = 0;
    } else if (this.phase === 'finished') {
      this.updateParticles(dt);
      this.updateCamera(dt, false);
      this.emitHud(false);
      this.speedLineMesh.visible = false;
      this.car.setNitroFlame(false, this.atmosphereElapsed);
      if (this.motionBlurPass) this.motionBlurPass.uniforms.uStrength.value = 0;
    }

    this.trafficFactory.updateSharedAnimations(this.atmosphereElapsed);
    this.track.updateTrafficLights(this.atmosphereElapsed);
    this.updateAtmosphere(dt);
    this.updateRain(dt);
    if (this.phase !== 'playing') {
      this.audio.update({
        rpm: 0,
        gear: 1,
        speedMs: 0,
        throttle: false,
        brakingHard: false,
        driftIntensity: 0,
        onRoad: true,
        isBoosting: false,
        tunnelFactor: this.tunnelFactor,
        weather: this.weatherMode,
        active: false,
      });
    }

    for (const wTex of this.track.waterTextures) {
      wTex.offset.y -= dt * 0.05;
    }

    // Live CubeCamera reflection update on High quality GPU
    if (this.quality === 'high' && !this.isSoftwareGl) {
      this.envFrameCounter = (this.envFrameCounter + 1) % 4;
      if (this.envFrameCounter === 0) {
        this.car.root.visible = false;
        this.cubeCamera.position.set(this.x, this.y + 1.2, this.z);
        this.cubeCamera.update(this.renderer, this.scene);
        this.car.root.visible = true;
      }
    }

    if (this.useComposer && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = window.requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearHeldKeys);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onOrientationChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.audio.dispose();
    this.composer?.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.baseEnvMap.dispose();
    this.cubeRenderTarget.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
