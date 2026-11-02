"""Prepare the seven visual studies' source excerpts and measured controls."""
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np


def main():
    base = Path('runs/dp-sts-visual-storm-v01')
    base.mkdir(exist_ok=False)
    ids = ['01-canopy-melt', '02-coral-vortex', '03-glacier-veins',
           '04-mycelium-choir', '05-mineral-memory', '06-neon-abyss', '07-acid-bloom']
    starts = [0, 70, 180, 275, 420, 180, 360]
    window = np.hanning(4096)
    freq = np.fft.rfftfreq(4096, 48000**-1)
    masks = [(freq >= a) & (freq < b) for a, b in [(30, 140), (140, 1500), (1500, 10000)]]
    for i, name in enumerate(ids):
        out = base / name
        out.mkdir()
        source = ('runs/dp-sts-bloom-audio-v01/bloom-master.wav' if i < 5
                  else 'runs/dp-sts-v01/dp-sts.wav')
        audio = out / 'audio.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-n', '-ss', str(starts[i]), '-i', source,
                        '-t', '180', '-af', 'afade=t=in:d=3,afade=t=out:st=172:d=8',
                        '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', str(audio)], check=True)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(audio), '-f', 'f32le',
                              '-ar', '48000', '-ac', '1', 'pipe:1'], check=True, capture_output=True).stdout
        pcm = np.frombuffer(raw, dtype='<f4')
        assert len(pcm) == 180 * 48000
        padded = np.pad(pcm, (2048, 2048))
        rows = []
        for k in range(4320):
            power = abs(np.fft.rfft(padded[k*2000:k*2000+4096] * window))**2
            rows.append([np.sqrt(np.mean(pcm[k*2000:(k+1)*2000]**2))] +
                        [np.sqrt(power[m].sum()) for m in masks])
        values = np.array(rows)
        values = np.clip(values / np.maximum(np.percentile(values, 98, axis=0), 1e-9), 0, 1)
        smooth = np.zeros_like(values)
        for k, row in enumerate(values):
            prev = smooth[k-1] if k else np.zeros(4)
            tau = np.where(row > prev, .08 if i >= 5 else .18, .32 if i >= 5 else 1.1)
            smooth[k] = prev + (row-prev) * (1-np.exp(-1/(24*tau)))
        (out/'audio-features.json').write_text(json.dumps({
            'sourceAudio': source, 'sourceStart': starts[i], 'duration': 180, 'fps': 24,
            'columns': ['rms', 'low30_140', 'mid140_1500', 'high1500_10000'],
            'wav_sha256': hashlib.file_digest(audio.open('rb'), 'sha256').hexdigest(),
            'frames': smooth.round(6).tolist()}))
        print(f'Prepared {name}: 180s, 4320 measured control frames', flush=True)


if __name__ == '__main__':
    main()
