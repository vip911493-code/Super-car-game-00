import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Camera,
  CloudFog,
  CloudRain,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  RotateCcw,
  RotateCw,
  SunMedium,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatRaceTime } from '../game/format';
import { subscribeFullscreenChange, toggleFullscreen } from '../game/fullscreen';
import { ROAD_CONFIG } from '../game/roadConfig';
import {
  ControlButtonSize,
  ControlsSettings,
  GpsTurnDirection,
  GraphicsQuality,
  HudSnapshot,
  MinimapPoint,
  MinimapWorldData,
  RoadType,
  TouchControlKey,
  WeatherMode,
} from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  minimapWorld: MinimapWorldData | null;
  waypoint: MinimapPoint | null;
  quality: GraphicsQuality;
  weather: WeatherMode;
  controlsSettings: ControlsSettings;
  controlsActive: boolean;
  muted: boolean;
  onCycleQuality: () => void;
  onCycleWeather: () => void;
  onOpenFullMap: () => void;
  onToggleMute: () => void;
  onToggleAiDebug: () => void;
  onCycleCamera: () => void;
  onResetCar: () => void;
  onPause: () => void;
  onTouchKey: (key: TouchControlKey, pressed: boolean) => void;
  onReleaseAllKeys: () => void;
}

const SIZE_SCALE_MAP: Record<ControlButtonSize, number> = {
  M: 1.0,
  L: 1.12,
  XL: 1.24,
};

function pointsToPath(pts: MinimapPoint[], closed = false): string {
  if (pts.length === 0) return '';
  const body = pts
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  return closed ? `${body} Z` : body;
}

function computeEffectiveScale(
  buttonSize: ControlButtonSize,
  vw: number,
  vh: number,
): number {
  const requested = SIZE_SCALE_MAP[buttonSize];
  // Guarantee no edge clipping or overlap with center speedometer on compact phone viewports
  const widthBudgetScale = Math.max(0.76, (vw - 156) / 456);
  const heightBudgetScale = Math.max(0.76, (vh - 74) / 230);
  return Math.min(requested, widthBudgetScale, heightBudgetScale);
}

const RADAR_ROAD_STYLE: Record<RoadType, { stroke: string; width: number; dash?: string }> = {
  highway: {
    stroke: ROAD_CONFIG.highway.minimapStroke,
    width: ROAD_CONFIG.highway.radarWidth,
    dash: ROAD_CONFIG.highway.minimapDash,
  },
  main: {
    stroke: ROAD_CONFIG.main.minimapStroke,
    width: ROAD_CONFIG.main.radarWidth,
    dash: ROAD_CONFIG.main.minimapDash,
  },
  coastal: {
    stroke: ROAD_CONFIG.coastal.minimapStroke,
    width: ROAD_CONFIG.coastal.radarWidth,
    dash: ROAD_CONFIG.coastal.minimapDash,
  },
  mountain: {
    stroke: ROAD_CONFIG.mountain.minimapStroke,
    width: ROAD_CONFIG.mountain.radarWidth,
    dash: ROAD_CONFIG.mountain.minimapDash,
  },
  city: {
    stroke: ROAD_CONFIG.city.minimapStroke,
    width: ROAD_CONFIG.city.radarWidth,
    dash: ROAD_CONFIG.city.minimapDash,
  },
  dirt: {
    stroke: ROAD_CONFIG.dirt.minimapStroke,
    width: ROAD_CONFIG.dirt.radarWidth,
    dash: ROAD_CONFIG.dirt.minimapDash,
  },
};

function renderGpsTurnIcon(direction: GpsTurnDirection) {
  const cls = 'w-3.5 h-3.5 text-cyan-300 shrink-0';
  switch (direction) {
    case 'left':
      return <CornerUpLeft className={cls} />;
    case 'right':
      return <CornerUpRight className={cls} />;
    case 'slight_left':
      return <ArrowUpLeft className={cls} />;
    case 'slight_right':
      return <ArrowUpRight className={cls} />;
    case 'roundabout':
      return <RotateCw className={cls} />;
    case 'arrive':
      return <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    default:
      return <ArrowUp className={cls} />;
  }
}

export function GameHud({
  hud,
  minimapWorld,
  waypoint,
  quality,
  weather,
  controlsSettings,
  controlsActive,
  muted,
  onCycleQuality,
  onCycleWeather,
  onOpenFullMap,
  onToggleMute,
  onToggleAiDebug,
  onCycleCamera,
  onResetCar,
  onPause,
  onTouchKey,
  onReleaseAllKeys,
}: GameHudProps) {
  const fullPath = minimapWorld ? pointsToPath(minimapWorld.fullPoints, true) : '';
  const tunnelPath = minimapWorld ? pointsToPath(minimapWorld.tunnelPoints, false) : '';
  const bridgePath = minimapWorld ? pointsToPath(minimapWorld.bridgePoints, false) : '';
  const railPath = minimapWorld?.railPoints ? pointsToPath(minimapWorld.railPoints, false) : '';
  const gpsPath = pointsToPath(hud.gpsRoutePoints, false);
  const startPt = minimapWorld?.fullPoints[0];

  const networkPaths = useMemo(
    () =>
      (minimapWorld?.networkEdges ?? []).map((edge) => ({
        id: edge.id,
        d: pointsToPath(edge.points, false),
        style: RADAR_ROAD_STYLE[edge.type],
      })),
    [minimapWorld],
  );

  const nitroPct = Math.round(Math.max(0, Math.min(1, hud.nitroRatio)) * 100);
  const qualityShort = quality === 'low' ? 'LOW' : quality === 'med' ? 'MED' : 'HI';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 900,
    h: typeof window !== 'undefined' ? window.innerHeight : 420,
  }));

  // Multi-touch pointer tracking: pointerId -> TouchControlKey
  const activePointersRef = useRef<Map<number, TouchControlKey>>(new Map());
  const [pressedMap, setPressedMap] = useState<Partial<Record<TouchControlKey, boolean>>>({});

  const syncPressedMapFromRef = useCallback(() => {
    const next: Partial<Record<TouchControlKey, boolean>> = {};
    for (const key of activePointersRef.current.values()) {
      next[key] = true;
    }
    setPressedMap(next);
  }, []);

  const releaseAllPointers = useCallback(() => {
    if (activePointersRef.current.size > 0) {
      activePointersRef.current.clear();
      setPressedMap({});
    }
    onReleaseAllKeys();
  }, [onReleaseAllKeys]);

  useEffect(() => subscribeFullscreenChange(setIsFullscreen), []);

  useEffect(() => {
    const handleViewport = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    const handleOrientation = () => {
      releaseAllPointers();
      handleViewport();
      window.setTimeout(handleViewport, 150);
    };
    const handleVisibility = () => {
      if (document.hidden) {
        releaseAllPointers();
      }
    };
    window.addEventListener('resize', handleViewport);
    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('blur', releaseAllPointers);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('resize', handleViewport);
      window.removeEventListener('orientationchange', handleOrientation);
      window.removeEventListener('blur', releaseAllPointers);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [releaseAllPointers]);

  useEffect(() => {
    if (!controlsActive) {
      releaseAllPointers();
    }
  }, [controlsActive, releaseAllPointers]);

  const handleToggleFullscreen = () => {
    void toggleFullscreen();
  };

  const handlePointerDown = (key: TouchControlKey, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!controlsActive) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported for synthetic events
    }

    let wasAlreadyHeld = false;
    for (const activeKey of activePointersRef.current.values()) {
      if (activeKey === key) {
        wasAlreadyHeld = true;
        break;
      }
    }

    activePointersRef.current.set(e.pointerId, key);
    syncPressedMapFromRef();

    if (!wasAlreadyHeld) {
      try {
        navigator.vibrate?.(10);
      } catch {
        // Ignore vibrate failures
      }
      onTouchKey(key, true);
    }
  };

  const handlePointerRelease = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const key = activePointersRef.current.get(e.pointerId);
    if (!key) return;

    activePointersRef.current.delete(e.pointerId);
    syncPressedMapFromRef();

    let stillHeld = false;
    for (const activeKey of activePointersRef.current.values()) {
      if (activeKey === key) {
        stillHeld = true;
        break;
      }
    }
    if (!stillHeld) {
      onTouchKey(key, false);
    }

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  const bindTouch = (key: TouchControlKey) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => handlePointerDown(key, e),
    onPointerUp: handlePointerRelease,
    onPointerCancel: handlePointerRelease,
    onLostPointerCapture: handlePointerRelease,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    draggable: false,
  });

  const scale = computeEffectiveScale(controlsSettings.buttonSize, viewport.w, viewport.h);
  const steerSize = Math.round(96 * scale);
  const steerGap = Math.round(24 * scale);
  const gasSize = Math.round(110 * scale);
  const subPedalSize = Math.round(88 * scale);
  const arcWidth = Math.round(216 * scale);
  const arcHeight = Math.round(218 * scale);

  const baseOpacity = controlsSettings.buttonOpacity;
  const activeOpacity = Math.min(1, baseOpacity + 0.18);

  const isPressed = (key: TouchControlKey) => Boolean(pressedMap[key]);

  return (
    <div
      className="fixed inset-0 w-[100dvw] h-[100dvh] z-10 pointer-events-none select-none flex flex-col justify-between
        pt-[max(0.45rem,env(safe-area-inset-top))] pr-[max(0.6rem,env(safe-area-inset-right))]
        pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.6rem,env(safe-area-inset-left))]
        sm:pt-[max(0.65rem,env(safe-area-inset-top))] sm:pr-[max(0.9rem,env(safe-area-inset-right))]
        sm:pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:pl-[max(0.9rem,env(safe-area-inset-left))]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Row: Compact POS/LAP/TIME/BEST on Left + Single Row of 8 Small Icon Buttons on Right */}
      <div className="flex items-start justify-between gap-2 shrink-0 min-w-0">
        {/* Top-Left: Compact Telemetry Card + GPS Next-Turn + Optional Radar on Tall Desktops */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {hud.gameMode === 'freeRoam' ? (
            <div className="px-2.5 py-1.5 rounded-xl bg-[#080d18]/86 border border-white/15 shadow-lg">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1">
                <span className="flex items-center gap-1 text-xs sm:text-sm font-black italic tracking-wider text-emerald-300 leading-none">
                  <Compass className="w-3.5 h-3.5 text-emerald-400" />
                  FREE ROAM
                </span>
                <div className="h-3 w-px bg-white/12" />
                <span className="text-[10px] font-bold tracking-wider uppercase text-slate-300 truncate max-w-[110px]">
                  {hud.zoneLabel ?? 'Open Network'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1 text-[10px] sm:text-[11px]">
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400">TIME</span>
                  <span className="font-bold tabular-nums text-white">{formatRaceTime(hud.lapTimeSec)}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400">SURF</span>
                  <span className="font-bold uppercase text-sky-300">
                    {hud.surfaceType}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-2.5 py-1.5 rounded-xl bg-[#080d18]/86 border border-white/15 shadow-lg">
              <div className="flex items-center gap-3 border-b border-white/10 pb-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400">POS</span>
                  <span className="text-sm sm:text-base font-black italic tabular-nums text-amber-400 leading-none">
                    {hud.position}
                    <span className="text-[10px] font-semibold text-slate-400 not-italic">/{hud.totalRacers}</span>
                  </span>
                  {hud.leaderGapText && (
                    <span className="text-[9px] font-bold tabular-nums text-amber-300 ml-0.5">
                      {hud.leaderGapText}
                    </span>
                  )}
                </div>

                <div className="h-3.5 w-px bg-white/12" />

                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400">LAP</span>
                  <span className="text-sm sm:text-base font-black italic tabular-nums text-white leading-none">
                    {hud.lap}
                    <span className="text-[10px] font-semibold text-slate-400 not-italic">/{hud.totalLaps}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 text-[10px] sm:text-[11px]">
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400">TIME</span>
                  <span className="font-bold tabular-nums text-white">{formatRaceTime(hud.lapTimeSec)}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400">BEST</span>
                  <span className="font-bold tabular-nums text-amber-400">
                    {hud.bestLapSec !== null ? formatRaceTime(hud.bestLapSec) : '--:--.--'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Compact Drift Score Strip */}
          <div className="px-2.5 py-0.5 rounded-lg bg-[#080d18]/82 border border-white/12 flex items-center justify-between gap-2 text-[10px]">
            <span className="font-bold tracking-wider uppercase text-slate-400">DRIFT</span>
            <div className="flex items-baseline gap-1">
              <span className="font-extrabold tabular-nums text-sky-300">
                {hud.driftScore.toLocaleString()}
              </span>
              {hud.isDrifting && (
                <span className="font-black italic tabular-nums text-amber-400">
                  +{hud.activeDriftPoints}
                </span>
              )}
            </div>
          </div>

          {/* Active GPS Next-Turn Prompt Pill */}
          {hud.gpsInstruction && (
            <button
              type="button"
              onClick={onOpenFullMap}
              title="Open GPS Map"
              className="pointer-events-auto max-w-[235px] sm:max-w-[290px] px-2.5 py-1 rounded-lg bg-[#071524]/92 border border-cyan-400/45 shadow-lg flex items-center gap-1.5 text-left cursor-pointer hover:border-cyan-300 transition-colors"
            >
              {renderGpsTurnIcon(hud.gpsInstruction.direction)}
              <span className="text-[10px] sm:text-[11px] font-bold text-cyan-100 leading-tight truncate">
                {hud.gpsInstruction.text}
              </span>
            </button>
          )}

          {/* AI Debug Stuck-Respawn Counter Pill (visible only when Debug is toggled on) */}
          {hud.aiDebugEnabled && (
            <div className="px-2.5 py-0.5 rounded-lg bg-[#091828]/92 border border-cyan-400/55 flex items-center justify-between gap-2 text-[10px] shadow-md">
              <span className="font-bold tracking-wider uppercase text-cyan-300">AI RESPAWNS</span>
              <span className="font-black tabular-nums text-amber-300">{hud.stuckRespawnCount}</span>
            </div>
          )}

          {/* Spacious Tall Desktop GPS Radar (never overlaps bottom-left steering) */}
          <button
            type="button"
            onClick={onOpenFullMap}
            title="Open Full Map (Tab)"
            className="hidden lg:block [@media(max-height:620px)]:hidden p-1.5 rounded-xl bg-[#080d18]/84 border border-white/15 shadow-lg hover:border-cyan-400/50 transition-colors cursor-pointer pointer-events-auto w-fit"
          >
            {(() => {
              const ZOOM = 3.4;
              const mapRotDeg = (hud.playerHeading * 180) / Math.PI - 180;
              const mapRotRad = hud.playerHeading - Math.PI;
              const cosR = Math.cos(mapRotRad);
              const sinR = Math.sin(mapRotRad);
              const northX = 50 + 42 * sinR;
              const northY = 50 - 42 * cosR;

              let wpEdgeX: number | null = null;
              let wpEdgeY: number | null = null;
              if (waypoint) {
                const dx = waypoint.x - hud.playerNormX;
                const dy = waypoint.y - hud.playerNormY;
                const rx = (dx * cosR - dy * sinR) * ZOOM;
                const ry = (dx * sinR + dy * cosR) * ZOOM;
                const dist = Math.hypot(rx, ry);
                if (dist > 41) {
                  wpEdgeX = 50 + (rx / dist) * 41;
                  wpEdgeY = 50 + (ry / dist) * 41;
                }
              }

              return (
                <svg viewBox="0 0 100 100" className="w-24 h-24 rounded-lg bg-[#050a14] overflow-hidden">
                  <defs>
                    <clipPath id="hud-radar-clip">
                      <rect x="2" y="2" width="96" height="96" rx="10" />
                    </clipPath>
                  </defs>
                  <g clipPath="url(#hud-radar-clip)">
                    <g
                      transform={`translate(50, 50) scale(${ZOOM}) rotate(${mapRotDeg.toFixed(1)}) translate(${(-hud.playerNormX).toFixed(2)}, ${(-hud.playerNormY).toFixed(2)})`}
                    >
                      {minimapWorld && (
                        <>
                          <circle cx={minimapWorld.oceanCenter.x} cy={minimapWorld.oceanCenter.y} r={minimapWorld.oceanRadius} fill="#0ea5e9" opacity="0.22" />
                          <line x1={minimapWorld.riverStart.x} y1={minimapWorld.riverStart.y} x2={minimapWorld.riverEnd.x} y2={minimapWorld.riverEnd.y} stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
                          {minimapWorld.lakeCenters.map((lc, idx) => (
                            <circle key={idx} cx={lc.x} cy={lc.y} r={Math.max(3.5, minimapWorld.lakeRadius)} fill="#3b82f6" opacity="0.65" />
                          ))}
                        </>
                      )}
                      {fullPath && <path d={fullPath} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.4" strokeLinejoin="round" />}
                      {networkPaths.map((np) =>
                        np.d ? (
                          <path
                            key={np.id}
                            d={np.d}
                            fill="none"
                            stroke={np.style.stroke}
                            strokeWidth={np.style.width}
                            strokeDasharray={np.style.dash}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : null,
                      )}
                      {railPath && (
                        <path
                          d={railPath}
                          fill="none"
                          stroke="#cbd5e1"
                          strokeWidth="0.7"
                          strokeDasharray="1.1 1.1"
                          strokeLinecap="round"
                        />
                      )}
                      {tunnelPath && <path d={tunnelPath} fill="none" stroke="#475569" strokeWidth="1.45" strokeLinecap="round" />}
                      {bridgePath && <path d={bridgePath} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />}
                      {minimapWorld?.networkNodes.map((node) =>
                        node.kind === 'roundabout' ? (
                          <circle
                            key={node.id}
                            cx={node.x}
                            cy={node.y}
                            r={Math.max(1.5, node.radiusNorm * 0.72)}
                            fill="#050a14"
                            stroke="#38bdf8"
                            strokeWidth="0.9"
                          />
                        ) : null,
                      )}
                      {gpsPath && <path d={gpsPath} fill="none" stroke="#22d3ee" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />}
                      {waypoint && (
                        <circle cx={waypoint.x} cy={waypoint.y} r="1.4" fill="#facc15" stroke="#080d18" strokeWidth="0.45" />
                      )}
                      {startPt && <circle cx={startPt.x} cy={startPt.y} r="1.25" fill="#f8fafc" stroke="#ef4444" strokeWidth="0.55" />}
                      {hud.trafficDots.map((dot) => (
                        <circle key={dot.name} cx={dot.x} cy={dot.y} r="0.85" fill={dot.color} opacity="0.9" />
                      ))}
                      {hud.aiDots.map((dot) => (
                        <circle key={dot.name} cx={dot.x} cy={dot.y} r="1.25" fill={dot.color} stroke="#ffffff" strokeWidth="0.45" />
                      ))}
                    </g>
                    <circle cx="50" cy="50" r="41" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
                    {wpEdgeX !== null && wpEdgeY !== null && (
                      <circle cx={wpEdgeX} cy={wpEdgeY} r="3.1" fill="#facc15" stroke="#080d18" strokeWidth="1.1" />
                    )}
                    <g transform={`translate(${northX.toFixed(1)}, ${northY.toFixed(1)})`}>
                      <circle r="4.8" fill="#080d18" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
                      <text x="0" y="0.3" textAnchor="middle" dominantBaseline="central" fill="#f87171" fontSize="5.6" fontWeight="800">N</text>
                    </g>
                    <polygon points="50,43.5 54.4,54.2 50,51.6 45.6,54.2" fill="#f97316" stroke="#ffffff" strokeWidth="1.2" />
                  </g>
                </svg>
              );
            })()}
          </button>
        </div>

        {/* Top-Right: One Single Row of 8 Small Icon Buttons (Map, Camera, Quality, Day/Night, Reset, Fullscreen, Sound, Pause) */}
        <div className="flex items-center flex-nowrap gap-1 sm:gap-1.5 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={onToggleAiDebug}
            title="AI Waypoint Debug (G)"
            aria-label="Toggle AI Debug"
            className={`h-8 sm:h-9 px-1.5 rounded-lg border flex items-center justify-center text-[9px] font-black tracking-wider cursor-pointer shrink-0 ${
              hud.aiDebugEnabled
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                : 'bg-[#080d18]/86 border-white/15 text-slate-400 hover:bg-[#131d33]'
            }`}
          >
            DBG
          </button>

          <button
            type="button"
            onClick={onOpenFullMap}
            title="Full Map (Tab)"
            aria-label="Full Map"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center text-cyan-400 hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            <MapIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onCycleCamera}
            title="Camera View (C)"
            aria-label="Cycle Camera"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center text-sky-400 hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onCycleQuality}
            title="Graphics Quality"
            aria-label="Graphics Quality"
            className="h-8 sm:h-9 min-w-[34px] px-1.5 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center text-[10px] font-black tracking-wider text-amber-300 hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            {qualityShort}
          </button>

          <button
            type="button"
            onClick={onCycleWeather}
            title="Day / Night & Weather"
            aria-label="Toggle Day Night Weather"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            {weather === 'night' ? (
              <Moon className="w-4 h-4 text-indigo-300" />
            ) : weather === 'rain' ? (
              <CloudRain className="w-4 h-4 text-sky-300" />
            ) : weather === 'fog' ? (
              <CloudFog className="w-4 h-4 text-slate-300" />
            ) : (
              <SunMedium className="w-4 h-4 text-amber-300" />
            )}
          </button>

          <button
            type="button"
            onClick={onResetCar}
            title="Reset Car (R)"
            aria-label="Reset Car"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center text-slate-100 hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Landscape Fullscreen (F)'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center text-slate-100 hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-sky-400" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            title="Sound On/Off (M)"
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            title="Pause / Settings (Esc)"
            aria-label="Pause Race"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#080d18]/86 border border-white/15 flex items-center justify-center text-slate-100 hover:bg-[#131d33] cursor-pointer shrink-0"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Viewport Band: Kept Clear for the Road (only transient Zone / 3-2-1 Countdown) */}
      <div className="flex-1 min-h-0 relative flex flex-col items-center justify-center px-4 pointer-events-none">
        {hud.zoneLabel && (
          <div className="mb-auto mt-1 px-3 py-0.5 rounded-lg bg-[#080d18]/85 border border-white/20 text-[10px] sm:text-xs font-extrabold tracking-[0.16em] uppercase text-slate-100 shadow-lg whitespace-nowrap">
            {hud.zoneLabel}
          </div>
        )}

        {hud.bannerText && (
          <div className={hud.zoneLabel ? 'my-auto text-center' : 'text-center'}>
            <div
              className={`px-6 py-2 rounded-xl font-black italic tracking-[0.14em] drop-shadow-[0_6px_20px_rgba(0,0,0,0.85)] whitespace-nowrap ${
                hud.bannerTone === 'countdown'
                  ? 'text-4xl sm:text-6xl text-amber-300 bg-[#080d18]/88 border border-amber-400/50'
                  : hud.bannerTone === 'best'
                    ? 'text-xl sm:text-4xl text-amber-300 bg-[#080d18]/85 border border-amber-400/40'
                    : hud.bannerTone === 'finish'
                      ? 'text-lg sm:text-4xl text-emerald-300 bg-[#080d18]/88 border border-emerald-400/40'
                      : 'text-lg sm:text-3xl text-white bg-[#080d18]/82 border border-white/15'
              }`}
            >
              {hud.bannerText}
            </div>
          </div>
        )}

        {hud.zoneLabel && hud.bannerText && <div className="mt-auto h-3" aria-hidden="true" />}
      </div>

      {/* Bottom Row: Left 96px Steer Buttons · Center Compact Speedo/Gear/NOS · Right Thumb-Arc Pedals */}
      <div className="relative flex items-end justify-between gap-2 shrink-0">
        {/* Bottom-Left: Steer Left & Steer Right (96px each, 24px gap at M) */}
        <div
          className="flex items-end pointer-events-auto shrink-0"
          style={{ gap: `${steerGap}px` }}
        >
          <button
            type="button"
            aria-label="Steer Left"
            {...bindTouch('ArrowLeft')}
            style={{
              width: `${steerSize}px`,
              height: `${steerSize}px`,
              opacity: isPressed('ArrowLeft') ? activeOpacity : baseOpacity,
              transform: isPressed('ArrowLeft') ? 'scale(0.92)' : 'scale(1)',
            }}
            className={`touch-control-btn rounded-full border-2 flex items-center justify-center text-3xl font-black transition-[transform,filter,opacity] duration-75 shadow-xl ${
              isPressed('ArrowLeft')
                ? 'bg-slate-600/95 border-white text-white brightness-125 shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                : 'bg-[#080d18]/90 border-white/40 text-white'
            }`}
          >
            ◀
          </button>

          <button
            type="button"
            aria-label="Steer Right"
            {...bindTouch('ArrowRight')}
            style={{
              width: `${steerSize}px`,
              height: `${steerSize}px`,
              opacity: isPressed('ArrowRight') ? activeOpacity : baseOpacity,
              transform: isPressed('ArrowRight') ? 'scale(0.92)' : 'scale(1)',
            }}
            className={`touch-control-btn rounded-full border-2 flex items-center justify-center text-3xl font-black transition-[transform,filter,opacity] duration-75 shadow-xl ${
              isPressed('ArrowRight')
                ? 'bg-slate-600/95 border-white text-white brightness-125 shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                : 'bg-[#080d18]/90 border-white/40 text-white'
            }`}
          >
            ▶
          </button>
        </div>

        {/* Bottom-Center: Compact Speedometer, Gear, and NOS Bar */}
        <div className="flex flex-col items-center px-3 py-1.5 rounded-xl bg-[#080d18]/86 border border-white/15 shadow-lg min-w-[116px] sm:min-w-[134px] mb-0.5 shrink-0">
          <div className="flex items-baseline gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-[10px] font-black italic text-amber-400 leading-none">
              {hud.gearLabel}
            </span>
            <span className="text-xl sm:text-2xl font-black italic tabular-nums leading-none text-white">
              {hud.speedKmh}
            </span>
            <span className="text-[9px] font-bold uppercase text-slate-400">km/h</span>
          </div>

          <div className="flex items-center gap-1.5 w-full mt-1">
            <span className="flex items-center gap-0.5 text-[8px] font-extrabold tracking-wider text-cyan-300">
              <Flame className="w-2.5 h-2.5" />
              NOS
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-75 ${
                  hud.isBoosting
                    ? 'bg-gradient-to-r from-cyan-400 via-sky-300 to-orange-400 shadow-[0_0_10px_rgba(34,211,238,0.85)]'
                    : 'bg-gradient-to-r from-sky-500 to-cyan-300'
                }`}
                style={{ width: `${nitroPct}%` }}
              />
            </div>
            <span className="text-[9px] font-bold tabular-nums text-slate-200 w-7 text-right">
              {nitroPct}%
            </span>
          </div>

          {hud.surfaceType !== 'asphalt' && (
            <span className="mt-0.5 text-[8px] font-bold tracking-[0.16em] uppercase text-amber-400 leading-none">
              {hud.surfaceType === 'dirt'
                ? 'DIRT'
                : hud.surfaceType === 'sand'
                  ? 'SAND'
                  : 'OFF TRACK'}
            </span>
          )}
        </div>

        {/* Bottom-Right: Thumb-Friendly Arc (GAS 110px at bottom-right, BRK 88px, DRIFT 88px, NOS 88px, >=16px gap) */}
        <div
          className="relative pointer-events-auto shrink-0"
          style={{ width: `${arcWidth}px`, height: `${arcHeight}px` }}
        >
          {/* NOS (Top-Right of arc, 88px) */}
          <button
            type="button"
            aria-label="Nitro Boost"
            {...bindTouch('ShiftLeft')}
            style={{
              width: `${subPedalSize}px`,
              height: `${subPedalSize}px`,
              right: `${Math.round(4 * scale)}px`,
              bottom: `${Math.round(130 * scale)}px`,
              opacity: isPressed('ShiftLeft') ? activeOpacity : baseOpacity,
              transform: isPressed('ShiftLeft') ? 'scale(0.92)' : 'scale(1)',
            }}
            className={`touch-control-btn absolute rounded-full border-2 flex flex-col items-center justify-center font-black tracking-wider uppercase transition-[transform,filter,opacity] duration-75 shadow-xl ${
              hud.isBoosting || isPressed('ShiftLeft')
                ? 'bg-cyan-300 border-white text-slate-950 brightness-125 shadow-[0_0_22px_rgba(34,211,238,0.9)]'
                : nitroPct >= 8
                  ? 'bg-cyan-500/90 border-cyan-200/80 text-slate-950'
                  : 'bg-cyan-950/80 border-cyan-400/35 text-cyan-200/60'
            }`}
          >
            <Flame className="w-4 h-4 mb-0.5" />
            <span className="text-xs leading-none">NOS</span>
          </button>

          {/* DRIFT (Mid-Upper arc, 88px) */}
          <button
            type="button"
            aria-label="Drift Handbrake"
            {...bindTouch('Space')}
            style={{
              width: `${subPedalSize}px`,
              height: `${subPedalSize}px`,
              right: `${Math.round(112 * scale)}px`,
              bottom: `${Math.round(114 * scale)}px`,
              opacity: isPressed('Space') ? activeOpacity : baseOpacity,
              transform: isPressed('Space') ? 'scale(0.92)' : 'scale(1)',
            }}
            className={`touch-control-btn absolute rounded-full border-2 flex items-center justify-center text-xs font-black tracking-wider uppercase transition-[transform,filter,opacity] duration-75 shadow-xl ${
              isPressed('Space')
                ? 'bg-amber-300 border-white text-slate-950 brightness-125 shadow-[0_0_20px_rgba(251,191,36,0.85)]'
                : 'bg-amber-500/90 border-amber-200/80 text-slate-950'
            }`}
          >
            DRIFT
          </button>

          {/* BRK (Bottom-Left of arc, 88px) */}
          <button
            type="button"
            aria-label="Brake or Reverse"
            {...bindTouch('ArrowDown')}
            style={{
              width: `${subPedalSize}px`,
              height: `${subPedalSize}px`,
              right: `${Math.round(128 * scale)}px`,
              bottom: `${Math.round(8 * scale)}px`,
              opacity: isPressed('ArrowDown') ? activeOpacity : baseOpacity,
              transform: isPressed('ArrowDown') ? 'scale(0.92)' : 'scale(1)',
            }}
            className={`touch-control-btn absolute rounded-full border-2 flex items-center justify-center text-xs font-black tracking-wider uppercase transition-[transform,filter,opacity] duration-75 shadow-xl ${
              isPressed('ArrowDown')
                ? 'bg-rose-400 border-white text-white brightness-125 shadow-[0_0_20px_rgba(244,63,94,0.85)]'
                : 'bg-rose-600/90 border-rose-200/75 text-white'
            }`}
          >
            BRK
          </button>

          {/* GAS (Bottom-Right anchor of arc, 110px) */}
          <button
            type="button"
            aria-label="Gas"
            {...bindTouch('ArrowUp')}
            style={{
              width: `${gasSize}px`,
              height: `${gasSize}px`,
              right: '0px',
              bottom: '0px',
              opacity: isPressed('ArrowUp') ? activeOpacity : baseOpacity,
              transform: isPressed('ArrowUp') ? 'scale(0.92)' : 'scale(1)',
            }}
            className={`touch-control-btn absolute rounded-full border-2 flex items-center justify-center text-base font-black tracking-wider uppercase transition-[transform,filter,opacity] duration-75 shadow-xl ${
              isPressed('ArrowUp')
                ? 'bg-emerald-300 border-white text-slate-950 brightness-125 shadow-[0_0_24px_rgba(52,211,153,0.9)]'
                : 'bg-emerald-500/92 border-emerald-200/85 text-slate-950'
            }`}
          >
            GAS
          </button>
        </div>
      </div>
    </div>
  );
}
