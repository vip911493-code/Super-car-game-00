import { useCallback, useEffect, useRef, useState } from 'react';
import { FinishModal } from './components/FinishModal';
import { FullMapModal } from './components/FullMapModal';
import { GameHud } from './components/GameHud';
import { GarageModal } from './components/GarageModal';
import { PauseModal } from './components/PauseModal';
import { RotatePhoneOverlay } from './components/RotatePhoneOverlay';
import { TitleScreen } from './components/TitleScreen';
import { TurboDriftEngine } from './game/engine';
import {
  enterLandscapeFullscreen,
  isPortraitMobileViewport,
  toggleFullscreen,
} from './game/fullscreen';
import {
  loadControlsSettings,
  loadGarageState,
  loadWeatherMode,
  saveControlsSettings,
  saveGarageState,
  saveWeatherMode,
} from './game/storage';
import {
  ControlsSettings,
  GameMode,
  GamePhase,
  GarageState,
  GraphicsQuality,
  HudSnapshot,
  MinimapPoint,
  MinimapWorldData,
  RaceSummary,
  TimeOfDayMode,
  TouchControlKey,
  WeatherMode,
} from './game/types';

const QUALITY_STORAGE_KEY = 'turbo-drift-quality';

function isPhoneDevice(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const mobileUa = /Android|iPhone|iPod|Windows Phone|IEMobile|Mobile/i.test(ua);
  const coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const smallEdge =
    typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 768;
  return mobileUa || (coarsePointer && smallEdge) || window.innerWidth < 768;
}

function getInitialQuality(): GraphicsQuality {
  try {
    const saved = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (saved === 'low' || saved === 'med' || saved === 'high') return saved;
  } catch {
    // Ignore storage read restrictions
  }
  return isPhoneDevice() ? 'med' : 'high';
}

const INITIAL_HUD: HudSnapshot = {
  gameMode: 'race',
  speedKmh: 0,
  gearLabel: 'N',
  rpmRatio: 0.15,
  nitroRatio: 1,
  isBoosting: false,
  lap: 1,
  totalLaps: 3,
  position: 1,
  totalRacers: 4,
  leaderGapText: null,
  zoneLabel: null,
  lapTimeSec: 0,
  bestLapSec: null,
  driftScore: 0,
  activeDriftPoints: 0,
  isDrifting: false,
  onRoad: true,
  surfaceType: 'asphalt',
  cameraMode: 0,
  bannerText: null,
  bannerTone: 'info',
  playerNormX: 50,
  playerNormY: 50,
  playerHeading: 0,
  gpsRoutePoints: [],
  gpsInstruction: null,
  aiDots: [],
  trafficDots: [],
  aiDebugEnabled: false,
  stuckRespawnCount: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TurboDriftEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [gameMode, setGameMode] = useState<GameMode>('race');
  const [garage, setGarage] = useState<GarageState>(loadGarageState);
  const [garageOpen, setGarageOpen] = useState(false);
  const [quality, setQuality] = useState<GraphicsQuality>(getInitialQuality);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayMode>('auto');
  const [weather, setWeather] = useState<WeatherMode>(loadWeatherMode);
  const [controlsSettings, setControlsSettings] =
    useState<ControlsSettings>(loadControlsSettings);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [minimapWorld, setMinimapWorld] = useState<MinimapWorldData | null>(null);
  const [raceSummary, setRaceSummary] = useState<RaceSummary | null>(null);
  const [muted, setMuted] = useState(false);
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const [waypoint, setWaypoint] = useState<MinimapPoint | null>(null);
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(isPortraitMobileViewport);
  const [pausedByOrientation, setPausedByOrientation] = useState(false);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;
  const fullMapOpenRef = useRef<boolean>(fullMapOpen);
  fullMapOpenRef.current = fullMapOpen;
  const pausedByOrientationRef = useRef<boolean>(pausedByOrientation);
  pausedByOrientationRef.current = pausedByOrientation;
  const initialGarageRef = useRef<GarageState>(garage);
  const initialWeatherRef = useRef<WeatherMode>(weather);
  const raceRewardCreditedRef = useRef(false);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new TurboDriftEngine(
      mountEl,
      {
        onHudUpdate: (snapshot) => setHud(snapshot),
        onPhaseChange: (nextPhase) => {
          setPhase(nextPhase);
          if (nextPhase !== 'playing') {
            setFullMapOpen(false);
          }
        },
        onRaceFinish: (summary) => {
          setRaceSummary(summary);
          if (!raceRewardCreditedRef.current && summary.coinsEarned > 0) {
            raceRewardCreditedRef.current = true;
            setGarage((prev) => {
              const next: GarageState = {
                ...prev,
                coins: prev.coins + summary.coinsEarned,
              };
              saveGarageState(next);
              return next;
            });
          }
        },
        onMuteChange: (isMuted) => setMuted(isMuted),
      },
      getInitialQuality(),
    );

    engine.applyGarageState(initialGarageRef.current);
    engine.setWeatherMode(initialWeatherRef.current);

    engineRef.current = engine;
    setMinimapWorld(engine.getMinimapWorldData());

    const checkOrientation = () => {
      const portrait = isPortraitMobileViewport();
      setIsPortraitMobile(portrait);

      if (portrait && phaseRef.current === 'playing') {
        engine.clearHeldKeys();
        pausedByOrientationRef.current = true;
        setPausedByOrientation(true);
        engine.pauseRace();
      } else if (!portrait && pausedByOrientationRef.current) {
        pausedByOrientationRef.current = false;
        setPausedByOrientation(false);
        if (phaseRef.current === 'paused') {
          engine.resumeRace();
        }
      }
    };

    const onOrientationEvent = () => {
      engine.clearHeldKeys();
      checkOrientation();
      window.setTimeout(checkOrientation, 160);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) {
        void toggleFullscreen();
      }
      if (e.code === 'KeyG' && !e.repeat) {
        e.preventDefault();
        engineRef.current?.toggleAiDebug();
      }
      if (e.code === 'Tab' && !e.repeat && phaseRef.current === 'playing') {
        e.preventDefault();
        setFullMapOpen((prev) => !prev);
      }
      if (e.code === 'Escape' && fullMapOpenRef.current) {
        e.stopPropagation();
        setFullMapOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', onOrientationEvent);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', onOrientationEvent);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleUpdateGarage = useCallback((updater: (prev: GarageState) => GarageState) => {
    setGarage((prev) => {
      const next = updater(prev);
      saveGarageState(next);
      engineRef.current?.applyGarageState(next);
      return next;
    });
  }, []);

  const handleUpdateControlsSettings = useCallback((next: ControlsSettings) => {
    setControlsSettings(next);
    saveControlsSettings(next);
  }, []);

  const handleSelectQuality = useCallback((next: GraphicsQuality) => {
    setQuality(next);
    engineRef.current?.setGraphicsQuality(next);
    try {
      window.localStorage.setItem(QUALITY_STORAGE_KEY, next);
    } catch {
      // Ignore storage write restrictions
    }
  }, []);

  const handleCycleQuality = useCallback(() => {
    const order: GraphicsQuality[] = ['low', 'med', 'high'];
    const next = order[(order.indexOf(quality) + 1) % order.length];
    handleSelectQuality(next);
  }, [quality, handleSelectQuality]);

  const handleSelectTimeOfDay = useCallback((next: TimeOfDayMode) => {
    setTimeOfDay(next);
    engineRef.current?.setTimeOfDay(next);
  }, []);

  const handleSelectWeather = useCallback((next: WeatherMode) => {
    setWeather(next);
    saveWeatherMode(next);
    engineRef.current?.setWeatherMode(next);
  }, []);

  const handleCycleWeather = useCallback(() => {
    const order: WeatherMode[] = ['clear', 'night', 'rain', 'fog'];
    const next = order[(order.indexOf(weather) + 1) % order.length];
    handleSelectWeather(next);
  }, [weather, handleSelectWeather]);

  const handleSelectGameMode = useCallback((next: GameMode) => {
    setGameMode(next);
    engineRef.current?.setGameMode(next);
  }, []);

  const handleSetWaypoint = useCallback((pt: MinimapPoint | null) => {
    setWaypoint(pt);
    engineRef.current?.setGpsWaypointMinimap(pt);
  }, []);

  const handleStart = useCallback(() => {
    raceRewardCreditedRef.current = false;
    setRaceSummary(null);
    setFullMapOpen(false);
    setGarageOpen(false);
    engineRef.current?.startRace(gameMode);

    void enterLandscapeFullscreen().then(() => {
      const portrait = isPortraitMobileViewport();
      setIsPortraitMobile(portrait);
      if (portrait) {
        engineRef.current?.clearHeldKeys();
        pausedByOrientationRef.current = true;
        setPausedByOrientation(true);
        engineRef.current?.pauseRace();
      }
    });
  }, [gameMode]);

  const handlePause = useCallback(() => {
    setFullMapOpen(false);
    pausedByOrientationRef.current = false;
    setPausedByOrientation(false);
    engineRef.current?.clearHeldKeys();
    engineRef.current?.pauseRace();
  }, []);

  const handleResume = useCallback(() => {
    pausedByOrientationRef.current = false;
    setPausedByOrientation(false);
    engineRef.current?.resumeRace();
  }, []);

  const handleReturnToTitle = useCallback(() => {
    setRaceSummary(null);
    setFullMapOpen(false);
    setGarageOpen(false);
    setWaypoint(null);
    engineRef.current?.setGpsWaypointMinimap(null);
    pausedByOrientationRef.current = false;
    setPausedByOrientation(false);
    engineRef.current?.returnToTitle();
  }, []);

  const handleReturnToGarage = useCallback(() => {
    setRaceSummary(null);
    setFullMapOpen(false);
    setWaypoint(null);
    engineRef.current?.setGpsWaypointMinimap(null);
    pausedByOrientationRef.current = false;
    setPausedByOrientation(false);
    engineRef.current?.returnToTitle();
    setGarageOpen(true);
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleToggleAiDebug = useCallback(() => {
    engineRef.current?.toggleAiDebug();
  }, []);

  const handleCycleCamera = useCallback(() => {
    engineRef.current?.cycleCamera();
  }, []);

  const handleResetCar = useCallback(() => {
    engineRef.current?.resetCarPosition();
  }, []);

  const handleTouchKey = useCallback((key: TouchControlKey, pressed: boolean) => {
    engineRef.current?.setTouchKey(key, pressed);
  }, []);

  const handleReleaseAllKeys = useCallback(() => {
    engineRef.current?.clearHeldKeys();
  }, []);

  const showRotateOverlay =
    isPortraitMobile && (phase === 'playing' || (phase === 'paused' && pausedByOrientation));

  return (
    <main className="relative w-[100dvw] h-[100dvh] overflow-hidden bg-black">
      {/* Isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="fixed inset-0 w-full h-full" />

      {phase === 'title' && !garageOpen && (
        <TitleScreen
          coins={garage.coins}
          gameMode={gameMode}
          onSelectGameMode={handleSelectGameMode}
          quality={quality}
          onSelectQuality={handleSelectQuality}
          timeOfDay={timeOfDay}
          onSelectTimeOfDay={handleSelectTimeOfDay}
          weather={weather}
          onSelectWeather={handleSelectWeather}
          controlsSettings={controlsSettings}
          onUpdateControlsSettings={handleUpdateControlsSettings}
          onOpenGarage={() => setGarageOpen(true)}
          onStart={handleStart}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {phase === 'title' && garageOpen && (
        <GarageModal
          garage={garage}
          onUpdateGarage={handleUpdateGarage}
          onClose={() => setGarageOpen(false)}
        />
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <GameHud
          hud={hud}
          minimapWorld={minimapWorld}
          waypoint={waypoint}
          quality={quality}
          weather={weather}
          controlsSettings={controlsSettings}
          controlsActive={phase === 'playing' && !showRotateOverlay && !fullMapOpen}
          muted={muted}
          onCycleQuality={handleCycleQuality}
          onCycleWeather={handleCycleWeather}
          onOpenFullMap={() => setFullMapOpen(true)}
          onToggleMute={handleToggleMute}
          onToggleAiDebug={handleToggleAiDebug}
          onCycleCamera={handleCycleCamera}
          onResetCar={handleResetCar}
          onPause={handlePause}
          onTouchKey={handleTouchKey}
          onReleaseAllKeys={handleReleaseAllKeys}
        />
      )}

      {fullMapOpen && minimapWorld && (
        <FullMapModal
          hud={hud}
          minimapWorld={minimapWorld}
          waypoint={waypoint}
          onSetWaypoint={handleSetWaypoint}
          onClose={() => setFullMapOpen(false)}
        />
      )}

      {phase === 'paused' && !showRotateOverlay && (
        <PauseModal
          gameMode={gameMode}
          quality={quality}
          onSelectQuality={handleSelectQuality}
          timeOfDay={timeOfDay}
          onSelectTimeOfDay={handleSelectTimeOfDay}
          weather={weather}
          onSelectWeather={handleSelectWeather}
          controlsSettings={controlsSettings}
          onUpdateControlsSettings={handleUpdateControlsSettings}
          onResume={handleResume}
          onRestart={handleStart}
          onTitle={handleReturnToTitle}
        />
      )}

      {phase === 'finished' && raceSummary && (
        <FinishModal
          summary={raceSummary}
          onPlayAgain={handleStart}
          onTitle={handleReturnToGarage}
        />
      )}

      {showRotateOverlay && (
        <RotatePhoneOverlay onRequestLandscape={() => void enterLandscapeFullscreen()} />
      )}
    </main>
  );
}
