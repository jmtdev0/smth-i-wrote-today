"""Pitch-tolerant cross-check for align-sky-video.py; emits no media files."""
import json
import subprocess
import sys
import numpy as np
from scipy import signal, ndimage

def features(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '11000', '-f', 'f32le', '-'])
    y = np.frombuffer(raw, dtype='<f4')
    frequencies, _, stft = signal.stft(y, fs=11000, nperseg=4096, noverlap=2996)
    power = np.abs(stft) ** .7
    chroma = np.zeros((12, power.shape[1]))
    valid = np.where((frequencies > 65) & (frequencies < 4000))[0]
    pitches = np.round(69 + 12 * np.log2(frequencies[valid] / 440)).astype(int) % 12
    for pitch in range(12): chroma[pitch] = power[valid[pitches == pitch]].sum(axis=0)
    chroma /= np.maximum(np.linalg.norm(chroma, axis=0, keepdims=True), 1e-8)
    chroma = ndimage.gaussian_filter1d(chroma, .5, axis=1)
    chroma -= chroma.mean(axis=1, keepdims=True)
    return chroma

song, source = map(features, sys.argv[1:3])
print('Features ready', file=sys.stderr, flush=True)
results = []
for rate in np.arange(.65, 1.101, .002):
    warped = signal.resample(song, round(song.shape[1] * rate), axis=1)
    energy = signal.correlate(np.sum(source * source, axis=0), np.ones(warped.shape[1]), mode='valid', method='fft')
    denominator = np.sqrt(np.maximum(energy * np.sum(warped * warped), 1e-12))
    for shift in range(-4, 5):
        shifted = np.roll(warped, shift, axis=0)
        score = sum(signal.correlate(source[i], shifted[i], mode='valid', method='fft') for i in range(12)) / denominator
        index = int(np.argmax(score))
        results.append((float(score[index]), index / 10, round(float(rate), 5), shift))
print(json.dumps(sorted(results, reverse=True)[:12], indent=2))
for start in [5, 25, 45]:
    clip = song[:, start * 10:(start + 15) * 10]
    warped = np.roll(signal.resample(clip, round(clip.shape[1] * .88), axis=1), 3, axis=0)
    expected = 2.25 + start * .88
    lo = max(0, int((expected - 2) * 10))
    region = source[:, lo:int((expected + 2) * 10) + warped.shape[1]]
    energy = signal.correlate(np.sum(region * region, axis=0), np.ones(warped.shape[1]), mode='valid', method='fft')
    score = sum(signal.correlate(region[i], warped[i], mode='valid', method='fft') for i in range(12))
    score /= np.sqrt(np.maximum(energy * np.sum(warped * warped), 1e-12))
    index = int(np.argmax(score))
    print(json.dumps({'song_time': start, 'source_time': (lo + index) / 10,
                      'expected': expected, 'score': float(score[index])}))
