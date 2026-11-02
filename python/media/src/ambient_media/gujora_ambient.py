"""Render the original Gujora ambient score and its audio-reactive controls."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.signal import butter, oaconvolve, sosfilt

SR = 48000
DURATION = 180
FPS = 24


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def smooth01(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def synthesize(event: dict) -> np.ndarray:
    """Render one oscillator voice; no borrowed recordings or instrument samples."""
    track = event['track']
    duration = float(event['duration'])
    note = float(event['note'])
    if track not in ('pad', 'bass', 'melody', 'answer') or duration <= 0 or not 0 <= note <= 127:
        raise ValueError('invalid score event')
    release = {'pad': 3.2, 'bass': 2.2, 'melody': .32, 'answer': 1.6}[track]
    attack = {'pad': 3.0, 'bass': 2.0, 'melody': .13, 'answer': .7}[track]
    attack = min(attack, max(.03, duration * .45))
    t = np.arange(round((duration + release) * SR), dtype=np.float32) / SR
    env = smooth01(t / attack) * (1 - smooth01((t-duration) / release))
    freq = 440 * 2 ** ((note - 69) / 12)
    phase = (2 * np.pi * freq * t).astype(np.float32)
    drift = .13 * np.sin(2*np.pi*.081*t + note*.17)
    if track == 'pad':
        sig = np.zeros_like(t)
        for cents in (-7, 0, 7):
            ratio = 2 ** (cents / 1200)
            p = phase * ratio + drift
            sig += (np.sin(p) + (.20 + .06*np.sin(.17*t+note))*np.sin(2*p)
                    + (.09 + .035*np.sin(.11*t+note))*np.sin(3*p)) / 3
    elif track == 'bass':
        sig = np.sin(phase + drift*.35) + .16*np.sin(phase*2)
    else:
        p = phase + .06*np.sin(2*np.pi*.19*t+note)
        sig = np.sin(p) + .30*np.sin(2*p)*(.75+.25*np.sin(.29*t)) + .10*np.sin(3*p)
        if track == 'answer':
            sig = .8*sig + .09*np.sin(4*p)
    return np.asarray(sig * env * float(event['gain']), dtype=np.float32)


def read_score(path: Path) -> dict:
    score = json.loads(path.read_text())
    if (score.get('duration'), score.get('sampleRate'), score.get('fps')) != (DURATION, SR, FPS):
        raise ValueError('score must be 180 seconds, 48000 Hz and 24 fps')
    events = score.get('events')
    if not isinstance(events, list) or not events:
        raise ValueError('score contains no events')
    for event in events:
        if not isinstance(event, dict) or not all(k in event for k in ('track', 'note', 'duration', 't', 'gain', 'pan')):
            raise ValueError('invalid score event fields')
        numbers = [event[k] for k in ('note', 'duration', 't', 'gain', 'pan')]
        if (not all(isinstance(v, (int, float)) and math.isfinite(v) for v in numbers)
                or not 0 <= event['t'] < DURATION or not 0 < event['duration'] <= 30
                or not 0 <= event['gain'] <= 1 or not -1 <= event['pan'] <= 1
                or not 0 <= event['note'] <= 127
                or event['track'] not in ('pad', 'bass', 'melody', 'answer')):
            raise ValueError('score contains an out-of-range event')
    if not any(event['track'] == 'melody' for event in events):
        raise ValueError('score contains no melody')
    return score


def read_reference_envelope(path: Path) -> tuple[np.ndarray, np.ndarray]:
    data = json.loads(path.read_text())
    rows = data.get('rows')
    if not isinstance(rows, list) or len(rows) < 2:
        raise ValueError('reference envelope needs at least two measured points')
    times = np.asarray([row['target_seconds'] for row in rows], dtype=np.float64)
    levels = np.asarray([row['normalized_rms'] for row in rows], dtype=np.float64)
    if (not np.isfinite(times).all() or not np.isfinite(levels).all()
            or times[0] != 0 or times[-1] != DURATION
            or not np.all(np.diff(times) > 0) or np.any(levels < 0) or np.any(levels > 1)):
        raise ValueError('reference envelope must cover 0–180 seconds with increasing times and levels in [0, 1]')
    return times, levels


def make_impulse(rng: np.random.Generator, seconds: int = 10) -> np.ndarray:
    count = SR * seconds
    time = np.arange(count, dtype=np.float32) / SR
    raw = rng.standard_normal(count).astype(np.float32)
    filtered = sosfilt(butter(2, [120, 10500], btype='bandpass', fs=SR, output='sos'), raw)
    impulse = np.asarray(filtered * np.exp(-time / 2.25) * smooth01(time / .075), dtype=np.float32)
    norm = float(np.sqrt(np.sum(impulse.astype(np.float64)**2)))
    return impulse / max(norm, 1e-12)


def audio_controls(pcm: np.ndarray, wav_hash: str, source_audio: str) -> dict:
    if pcm.shape != (DURATION * SR, 2) or not np.isfinite(pcm).all():
        raise ValueError('decoded WAV has invalid sample count or non-finite samples')
    mono = pcm.mean(axis=1)
    padded = np.pad(mono, (2048, 2048))
    window = np.hanning(4096)
    freq = np.fft.rfftfreq(4096, 1 / SR)
    masks = [(freq >= a) & (freq < b) for a, b in ((30, 140), (140, 1500), (1500, 10000))]
    rows = np.empty((DURATION * FPS, 4), np.float64)
    for index in range(len(rows)):
        at = index * (SR // FPS)
        power = np.abs(np.fft.rfft(padded[at:at+4096] * window))**2
        rows[index] = [np.sqrt(np.mean(mono[at:at+SR//FPS].astype(np.float64)**2)),
                       *(np.sqrt(power[mask].sum()) for mask in masks)]
    rows = np.clip(rows / np.maximum(np.percentile(rows, 98, axis=0), 1e-9), 0, 1)
    smoothed = np.zeros_like(rows)
    for index, row in enumerate(rows):
        prev = smoothed[index-1] if index else np.zeros(4)
        tau = np.where(row > prev, .18, 1.1)
        smoothed[index] = prev + (row-prev) * (1-np.exp(-1/(FPS*tau)))
    return {'sourceAudio': source_audio, 'sourceStart': 0, 'duration': DURATION, 'fps': FPS,
            'columns': ['rms', 'low30_140', 'mid140_1500', 'high1500_10000'],
            'wav_sha256': wav_hash, 'frames': smoothed.round(6).tolist()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score', type=Path, default=Path('compositions/gujora-ambient/score.json'))
    parser.add_argument('--out', type=Path, default=Path('runs/dp-sts-gujora-ambient-v01'))
    parser.add_argument('--reference-envelope', type=Path,
                        default=Path('runs/dp-sts-gujora-particles-v01/reference-envelope.json'))
    args = parser.parse_args()
    score = read_score(args.score)
    out = args.out.resolve()
    if out.exists():
        raise FileExistsError(f'{out} already exists; choose a new --out')
    melody_path = Path(score['melodyScorePath'])
    if digest(melody_path) != score['melodyScoreSha256']:
        raise ValueError('score melody source hash does not match')
    if digest(Path('tools/gujora-ambient-score.mjs')) != score['scoreGeneratorSha256']:
        raise ValueError('score generator source changed since the score was created')
    original_score_path = Path(score['originalScorePath'])
    if digest(original_score_path) != score['originalScoreSha256']:
        raise ValueError('original BWV 846 source hash does not match')
    out.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix='.gujora-ambient-', dir=out.parent))
    try:
        shutil.copy2(args.score, temp / 'score.json')
        shutil.copy2(melody_path, temp / 'melody-source.json')
        shutil.copy2(original_score_path, temp / 'bwv846-source.ly')
        shutil.copy2(Path(__file__), temp / 'synthesizer.py')
        shutil.copy2('tools/gujora-ambient-score.mjs', temp / 'score-generator.mjs')
        shutil.copy2(args.reference_envelope, temp / 'reference-envelope.json')
        score = read_score(temp / 'score.json')
        if (digest(temp / 'melody-source.json') != score['melodyScoreSha256']
                or digest(temp / 'bwv846-source.ly') != score['originalScoreSha256']
                or digest(temp / 'score-generator.mjs') != score['scoreGeneratorSha256']):
            raise ValueError('source snapshot differs from the score provenance')
        reference_times, reference_levels = read_reference_envelope(temp / 'reference-envelope.json')
        length = DURATION * SR
        mix = np.zeros((length, 2), dtype=np.float32)
        for index, event in enumerate(score['events']):
            start = round(event['t']*SR)
            sig = synthesize(event)[:length-start]
            pan = event['pan']
            mix[start:start+len(sig), 0] += sig*np.sqrt((1-pan)/2)
            mix[start:start+len(sig), 1] += sig*np.sqrt((1+pan)/2)
            if index % 50 == 0:
                print(f'Voices {index}/{len(score["events"])}', flush=True)
        rng = np.random.default_rng(20261103)
        bed = rng.standard_normal(length).astype(np.float32)
        bed = sosfilt(butter(2, [180, 6500], btype='bandpass', fs=SR, output='sos'), bed).astype(np.float32)
        bed *= .0012/max(float(np.sqrt(np.mean(bed.astype(np.float64)**2))), 1e-9)
        mix[:, 0] += bed
        mix[:, 1] += bed
        del bed
        send = np.asarray((mix[:, 0]+mix[:, 1])*.5, dtype=np.float32)
        print('Rendering diffuse stereo reverb...', flush=True)
        for channel in (0, 1):
            reverb = oaconvolve(send, make_impulse(rng), mode='full')[:length]
            mix[:, channel] += .22*reverb
            del reverb
        del send
        for second in range(DURATION):
            t = second + np.arange(SR, dtype=np.float32)/SR
            env = smooth01(t/5) * (1-smooth01((t-167)/13))
            reference_gain = .25 + .75*np.interp(t, reference_times, reference_levels)
            part = mix[second*SR:(second+1)*SR]
            np.tanh(part*1.12, out=part)
            part *= (env*reference_gain)[:, None]
        peak_before = float(np.max(np.abs(mix)))
        if not np.isfinite(mix).all() or peak_before < 1e-8:
            raise ValueError('mix is silent or non-finite')
        mix *= .62/peak_before
        raw_path = temp / 'mix.f32'
        mix.astype('<f4', copy=False).tofile(raw_path)
        del mix
        audio = temp / 'audio.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-n', '-f', 'f32le', '-ar', str(SR), '-ac', '2',
                        '-i', str(raw_path), '-af', 'highpass=f=27,lowpass=f=14500',
                        '-c:a', 'pcm_s24le', str(audio)], check=True)
        raw_path.unlink()
        result = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(audio), '-f', 'f32le',
                                 '-acodec', 'pcm_f32le', 'pipe:1'], capture_output=True, check=True)
        pcm = np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2)
        wav_hash = digest(audio)
        controls = audio_controls(pcm, wav_hash, str(out / 'audio.wav'))
        sample_peak = float(np.max(np.abs(pcm)))
        clipped = int(np.count_nonzero(np.abs(pcm) >= 1))
        if sample_peak >= .99 or clipped:
            raise ValueError(f'final WAV exceeds headroom: peak={sample_peak}, clipped={clipped}')
        (temp / 'audio-features.json').write_text(json.dumps(controls, separators=(',', ':')))
        metadata = {'duration_seconds': DURATION, 'sample_rate_hz': SR, 'channels': 2, 'bit_depth': 24,
                    'sample_peak': sample_peak, 'rms': float(np.sqrt(np.mean(pcm.astype(np.float64)**2))),
                    'samples_at_or_above_full_scale': clipped, 'audio_sha256': wav_hash,
                    'features_sha256': digest(temp / 'audio-features.json'),
                    'score_sha256': digest(temp / 'score.json'),
                    'synthesizer_sha256': digest(temp / 'synthesizer.py'),
                    'score_generator_sha256': digest(temp / 'score-generator.mjs'),
                    'melody_source_sha256': digest(temp / 'melody-source.json'),
                    'original_score_sha256': digest(temp / 'bwv846-source.ly'),
                    'reference_envelope_sha256': digest(temp / 'reference-envelope.json'),
                    'reference_envelope_source': str(args.reference_envelope),
                    'reference_envelope_method': 'Linear interpolation of normalized measured RMS; gain=0.25+0.75*RMS, with an independent final fade.',
                    'melody': score.get('melody'), 'melody_status': score.get('melodyStatus'),
                    'melody_attribution': score.get('melodyAttribution'),
                    'reference': score.get('reference'),
                    'notes': 'Original synthesized audio. Sound quality and melodic choice require listening and user review.'}
        (temp / 'audio-render.json').write_text(json.dumps(metadata, indent=2) + '\n')
        os.rename(temp, out)
    finally:
        shutil.rmtree(temp, ignore_errors=True)
    print(f'Audio complete: {out}', flush=True)


if __name__ == '__main__':
    main()
