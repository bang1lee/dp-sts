"""Summarize public reference playback; never copy audio into an artwork."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(args.input),
                              '-ac', '2', '-ar', '16000', '-f', 'f32le', 'pipe:1'],
                             check=True, capture_output=True).stdout
    pcm = np.frombuffer(decoded, dtype='<f4').reshape(-1, 2)
    if len(pcm) < 464*16000 or not np.isfinite(pcm).all():
        raise ValueError('Reference must be fully downloaded, finite and at least 464 seconds long')
    rows, previous = [], None
    for second in range(465):
        block = pcm[max(0, (second-1)*16000):min(len(pcm), (second+1)*16000)]
        mid, side = block.mean(axis=1), (block[:, 0]-block[:, 1])*.5
        spectrum = np.abs(np.fft.rfft(mid*np.hanning(len(mid))))
        frequency = np.fft.rfftfreq(len(mid), 1/16000)
        power = spectrum**2
        bands = [float(power[(frequency >= lo) & (frequency < hi)].sum())
                 for lo, hi in [(25, 180), (180, 1200), (1200, 8000)]]
        total = max(sum(bands), 1e-12)
        profile = np.array([float(power[(frequency >= lo) & (frequency < hi)].sum())
                            for lo, hi in zip(np.geomspace(25, 8000, 25)[:-1],
                                              np.geomspace(25, 8000, 25)[1:])])
        profile = np.log1p(profile)
        onset = 0 if previous is None else float(np.maximum(profile-previous, 0).mean())
        previous = profile
        centroid = float(np.sum(frequency*spectrum)/max(spectrum.sum(), 1e-12))
        bandwidth = float(np.sqrt(np.sum((frequency-centroid)**2*spectrum)/max(spectrum.sum(), 1e-12)))
        row = {'second': second, 'rms': float(np.sqrt(np.mean(block**2))),
               'spectral_centroid_hz': centroid, 'spectral_bandwidth_hz': bandwidth,
               'stereo_width': float(np.sqrt(np.mean(side**2))/max(np.sqrt(np.mean(mid**2)), 1e-9)),
               'onset_strength': onset,
               'band_low': bands[0]/total, 'band_mid': bands[1]/total, 'band_high': bands[2]/total}
        rows.append(row)
    maximum = max(row['rms'] for row in rows)
    for row in rows:
        row['normalized_rms'] = row['rms']/maximum
    result = {'reference': 'Aphex Twin #3',
              'spotify_url': 'https://open.spotify.com/track/7glKwbR1DyuIuE6XvZvJbQ',
              'analysis_playback_source': 'https://aphextwin.bandcamp.com/track/3',
              'duration_seconds': len(pcm)/16000, 'target_duration_seconds': 464,
              'method': 'Two-second Hann windows centered at each original-timeline second; mono spectral magnitude centroid; power ratios 25–180, 180–1200, 1200–8000Hz; side/mid RMS stereo width; positive log spectral-band differences as onset proxy.',
              'limitations': 'Mixed playback statistics, not isolated instrument stems, listening, exact chord transcription or equipment identification. The Spotify link identifies the requested track; analysis uses artist official Bandcamp playback. No reference samples in output music.',
              'analyzer_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'rows': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'rows': len(rows), 'duration': result['duration_seconds'],
                      'median_centroid_hz': float(np.median([r['spectral_centroid_hz'] for r in rows[:-5]])),
                      'median_stereo_width': float(np.median([r['stereo_width'] for r in rows[:-5]])),
                      'output': str(args.output)}))


if __name__ == '__main__':
    main()
