const DEFAULT_FADE_SECONDS = 2.5;

export function bindAudioUnlock(player, target = window) {
  const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  const listenerOptions = { capture: true, passive: true };
  let disposed = false;
  const removeListeners = () => {
    for (const type of events) target.removeEventListener(type, onInteraction, listenerOptions);
  };
  const start = async () => {
    if (disposed) return false;
    // Call play synchronously inside the gesture, before awaiting its result.
    const started = await player.start();
    if (started) removeListeners();
    return started;
  };
  const onInteraction = event => {
    // Touch and pen activate playback on release, not on initial contact.
    if (event.type === 'pointerdown' && event.pointerType !== 'mouse') return;
    void start();
  };
  for (const type of events) {
    target.addEventListener(type, onInteraction, listenerOptions);
  }
  return {
    start,
    dispose() {
      disposed = true;
      removeListeners();
    },
  };
}

export function fadeVolume(elapsedSeconds, maxVolume, fadeSeconds = DEFAULT_FADE_SECONDS) {
  if (fadeSeconds <= 0) return maxVolume;
  return Math.min(maxVolume, Math.max(0, elapsedSeconds / fadeSeconds * maxVolume));
}

export function createLoopingAudio(src, { maxVolume = .18, fadeInSeconds = DEFAULT_FADE_SECONDS } = {}) {
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.src = src;
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;
  maxVolume = clampVolume(maxVolume);
  let startedAt = null;
  let playRequest = null;

  const update = (now = performance.now()) => {
    if (startedAt === null || audio.paused) return;
    audio.volume = fadeVolume((now - startedAt) / 1000, maxVolume, fadeInSeconds);
  };

  const start = () => {
    if (playRequest) return playRequest;
    if (!audio.paused) return Promise.resolve(true);
    playRequest = audio.play().then(() => {
      startedAt = performance.now();
      audio.volume = 0;
      return true;
    }).catch(() => false).finally(() => {
      playRequest = null;
    });
    return playRequest;
  };

  return {
    audio,
    start,
    update,
    setVolume(volume) {
      maxVolume = clampVolume(volume);
      update();
    },
    getVolume: () => maxVolume,
  };
}

function clampVolume(volume) {
  const value = Number(volume);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}
