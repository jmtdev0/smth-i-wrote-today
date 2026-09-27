const DEFAULT_FADE_SECONDS = 2.5;

export function fadeVolume(elapsedSeconds, maxVolume, fadeSeconds = DEFAULT_FADE_SECONDS) {
  if (fadeSeconds <= 0) return maxVolume;
  return Math.min(maxVolume, Math.max(0, elapsedSeconds / fadeSeconds * maxVolume));
}

export function createLoopingAudio(src, { maxVolume = .18, fadeInSeconds = DEFAULT_FADE_SECONDS } = {}) {
  const audio = new Audio(src);
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
