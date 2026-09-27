"""Estimate source_video_time = offset + song_time * rate from audio envelopes.

Usage: python tools/align-sky-video.py <song> <video>
Requires ffmpeg, numpy and scipy. Prints diagnostics; never changes the media.
"""
import json
import subprocess
import sys
import numpy as np
from scipy import signal, ndimage

FPS = 100

def envelope(path):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'
    ])
    samples = np.frombuffer(raw, dtype='<f4')
    blocks = samples[:len(samples) // 80 * 80].reshape(-1, 80)
    rms = np.sqrt(np.mean(blocks * blocks, axis=1))
    values = np.log(np.maximum(rms, .0001))
    return values - ndimage.gaussian_filter1d(values, FPS * .6)

song, source = map(envelope, sys.argv[1:3])

def match(clip, rate):
    warped = signal.resample(clip, round(len(clip) * rate))
    warped -= warped.mean()
    energy = signal.correlate(source * source, np.ones(len(warped)), mode='valid', method='fft')
    dots = signal.correlate(source, warped, mode='valid', method='fft')
    score = dots / np.sqrt(np.maximum(energy * np.dot(warped, warped), 1e-12))
    index = int(np.argmax(score))
    return float(score[index]), index / FPS, float(rate)

coarse = sorted((match(song, rate) for rate in np.arange(.65, 1.101, .002)), reverse=True)
best_rate = coarse[0][2]
fine = sorted((match(song, rate) for rate in np.arange(best_rate - .002, best_rate + .00201, .0001)), reverse=True)
score, offset, rate = fine[0]
anchors = []
for start in [5, 25, 45]:
    clip = song[int(start * FPS):int((start + 15) * FPS)]
    confidence, source_start, _ = match(clip, rate)
    local_best = max(match(clip, trial) for trial in np.arange(.65, 1.101, .002))
    anchors.append({'song_time': start, 'source_time': source_start,
                    'predicted': round(offset + start * rate, 4),
                    'error_seconds': round(source_start - offset - start * rate, 4),
                    'correlation': round(confidence, 4), 'independent_match': local_best})
print(json.dumps({'rate': round(rate, 6), 'offset_seconds': offset, 'correlation': round(score, 4),
                  'song_duration': len(song) / FPS, 'source_duration': len(source) / FPS,
                  'anchors': anchors, 'coarse_best': coarse[:3]}, indent=2))
