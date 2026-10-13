import { mediaUrl } from './mediaUrl.js';

export const DEFAULT_SKY_VIDEO_OPACITY = .12;
export const MAX_SKY_VIDEO_OPACITY = .30;
export const SKY_VIDEO_FADE_SECONDS = 1.8;

export function skyVideoOpacity(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_SKY_VIDEO_OPACITY, value)) : DEFAULT_SKY_VIDEO_OPACITY;
}

// The music element is the sole clock: the video follows seeks and loop wraps.
// Calibration is supplied separately so the original song is never modified.
export function videoTimeForMusic(songTime, videoDuration, { rate, offset }) {
  const target = offset + Math.max(0, songTime) * rate;
  return Math.max(0, Math.min(target, Math.max(0, videoDuration - .04)));
}

export function syncVideoToAudio(video, audio, calibration, now, state) {
  if (video.readyState < 1 || !Number.isFinite(video.duration)) return;
  const target = videoTimeForMusic(audio.currentTime, video.duration, calibration);
  const drift = target - video.currentTime;
  const looped = audio.currentTime < state.lastSongTime - .5;
  state.lastSongTime = audio.currentTime;
  if (!video.seeking && (looped || Math.abs(drift) > .18) && now - state.lastSeek > 250) {
    video.currentTime = target;
    state.lastSeek = now;
  }
  const baseRate = calibration.rate * audio.playbackRate;
  video.playbackRate = Math.max(.1, Math.min(4, baseRate + Math.max(-.025, Math.min(.025, drift * .12))));
  const atEnd = target >= video.duration - .041 && video.currentTime >= video.duration - .18;
  if (audio.paused || audio.ended || audio.seeking || audio.readyState < 3 || atEnd) {
    if (!video.paused) video.pause();
  } else if (video.paused && !state.pending && now >= state.retryAt) {
    state.pending = true;
    Promise.resolve(video.play()).catch(() => { state.retryAt = now + 1000; })
      .finally(() => { state.pending = false; });
  }
  return { target, drift };
}

// Two fixed decoders: one follows the music, the other waits at the start.
// At a music wrap, keep the outgoing clip alive while the new one fades in.
export function createSkyVideoMixer(audio, videos, calibration) {
  const states = videos.map(() => ({ lastSongTime: 0, lastSeek: -Infinity, retryAt: 0, pending: false }));
  const standbyClock = { currentTime: 0, playbackRate: 1, paused: true, ended: false, seeking: false, readyState: 4 };
  const tailCalibration = { ...calibration };
  let activeIndex = 0, lastSongTime = audio.currentTime, lastNow = null;
  let transitioning = false, elapsed = 0, blend = 1;
  const ready = video => video.readyState >= 2 && !video.seeking && !video.error;
  return {
    videos,
    get video() { return videos[activeIndex]; },
    get activeIndex() { return activeIndex; },
    get previousIndex() { return 1 - activeIndex; },
    get blend() { return blend; },
    get ready() { return ready(videos[activeIndex]) || (transitioning && ready(videos[1 - activeIndex])); },
    update(now) {
      const dt = lastNow === null ? 0 : Math.max(0, (now - lastNow) / 1000);
      lastNow = now;
      const duration = audio.duration;
      const wrapped = audio.loop !== false && Number.isFinite(duration) && duration > 1
        && lastSongTime > duration - 2.5 && audio.currentTime < 2.5
        && lastSongTime - audio.currentTime > duration / 2;
      if (wrapped) {
        activeIndex = 1 - activeIndex;
        transitioning = true; elapsed = 0; blend = 0;
        tailCalibration.offset = calibration.offset + duration * calibration.rate;
        // Neither decoder needs a seek merely because it changed roles.
        for (const state of states) state.lastSongTime = audio.currentTime;
      } else if (Math.abs(audio.currentTime - lastSongTime) > Math.max(.75, dt * audio.playbackRate + .25)) {
        // An intentional seek is not a loop: discard any unrelated tail.
        transitioning = false; blend = 1;
      }
      lastSongTime = audio.currentTime;
      const video = videos[activeIndex], previous = videos[1 - activeIndex];
      const status = syncVideoToAudio(video, audio, calibration, now, states[activeIndex]);
      if (transitioning) {
        syncVideoToAudio(previous, audio, tailCalibration, now, states[1 - activeIndex]);
        // Hold the old image if decoding/seeking is late, instead of flashing
        // the sky or a black first frame. Pausing music also pauses the fade.
        if (!wrapped && ready(video) && ready(previous) && !audio.paused && !audio.seeking
            && !audio.ended && audio.readyState >= 3) {
          elapsed += Math.min(dt, .1) * audio.playbackRate;
        }
        const progress = Math.min(1, elapsed / Math.min(SKY_VIDEO_FADE_SECONDS, duration / 2));
        blend = progress * progress * (3 - 2 * progress);
        if (progress === 1) transitioning = false;
      } else {
        standbyClock.playbackRate = audio.playbackRate;
        syncVideoToAudio(previous, standbyClock, calibration, now, states[1 - activeIndex]);
      }
      return status;
    },
  };
}

export function createSkyVideo(audio, calibration) {
  const videos = [0, 1].map(index => {
    const video = document.createElement('video');
    video.id = index === 0 ? 'heaven-sky-video' : 'heaven-sky-video-buffer';
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.hidden = true;
    video.src = mediaUrl('/video/heaven-sky.mp4', { localPath: '/heaven-sky.mp4' });
    document.body.append(video);
    return video;
  });
  const mixer = createSkyVideoMixer(audio, videos, calibration);
  const update = mixer.update;
  let disposed = false;
  mixer.update = now => {
    if (disposed) return;
    const status = update(now);
    if (import.meta.env.DEV && status) {
      const video = mixer.video;
      video.dataset.musicTime = audio.currentTime.toFixed(3);
      video.dataset.targetTime = status.target.toFixed(3);
      video.dataset.drift = status.drift.toFixed(3);
      video.dataset.blend = mixer.blend.toFixed(3);
    }
  };
  mixer.dispose = () => {
    disposed = true;
    for (const video of videos) {
      video.pause(); video.removeAttribute('src'); video.load(); video.remove();
    }
  };
  return mixer;
}
