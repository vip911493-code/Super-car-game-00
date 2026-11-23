export function isFullscreenActive(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return Boolean(
    doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement,
  );
}

async function lockLandscapeOrientation(): Promise<void> {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation?.lock) {
      await orientation.lock('landscape');
      return;
    }
  } catch {
    // Ignore orientation lock failures on desktop or unsupported browsers
  }

  try {
    const legacyScreen = screen as Screen & {
      lockOrientation?: (o: string | string[]) => boolean;
      mozLockOrientation?: (o: string | string[]) => boolean;
      msLockOrientation?: (o: string | string[]) => boolean;
    };
    const legacyLock =
      legacyScreen.lockOrientation ||
      legacyScreen.mozLockOrientation ||
      legacyScreen.msLockOrientation;
    legacyLock?.call(legacyScreen, ['landscape-primary', 'landscape-secondary', 'landscape']);
  } catch {
    // Ignore legacy orientation lock failures
  }
}

export async function enterLandscapeFullscreen(): Promise<void> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };

  try {
    if (!isFullscreenActive()) {
      const req =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;
      if (req) {
        await req.call(el);
      }
    }
  } catch {
    // Ignore if fullscreen is restricted by embed sandbox or browser
  }

  await lockLandscapeOrientation();

  window.setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
  window.setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
}

export async function toggleFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  const orientation = screen.orientation as ScreenOrientation & {
    unlock?: () => void;
  };

  try {
    if (!isFullscreenActive()) {
      await enterLandscapeFullscreen();
      return;
    } else {
      const exit =
        doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.mozCancelFullScreen ||
        doc.msExitFullscreen;
      if (exit) await exit.call(doc);
      try {
        orientation?.unlock?.();
      } catch {
        // Ignore orientation unlock failures
      }
    }
  } catch {
    // Ignore if fullscreen is restricted by embed sandbox
  }

  window.setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 150);
}

export function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Mobile/i.test(ua);
  const coarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;
  return mobileUa || coarsePointer || hasTouch;
}

export function isPortraitMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const portrait = window.innerHeight > window.innerWidth;
  return portrait && isTouchCapableDevice();
}

export function subscribeFullscreenChange(cb: (active: boolean) => void): () => void {
  const handler = () => cb(isFullscreenActive());
  handler();
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  document.addEventListener('mozfullscreenchange', handler);
  document.addEventListener('MSFullscreenChange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
    document.removeEventListener('mozfullscreenchange', handler);
    document.removeEventListener('MSFullscreenChange', handler);
  };
}
