"""Prepare 30 seconds of pitch-preserving Gujora audio and actual bass controls."""
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
from scipy.signal import butter, sosfilt

SR = 48000
SECONDS = 30
FPS = 24
ATTACK_FPS = 50


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def follow(values: np.ndarray, fps: int, attack: float, release: float) -> np.ndarray:
    out = np.zeros(len(values), dtype=np.float64)
    previous = 0.0
    for i, value in enumerate(values):
        tau = attack if value > previous else release
        previous += (float(value)-previous)*(1-math.exp(-1/(fps*tau)))
        out[i] = previous
    return out


def analyze(pcm: np.ndarray, wav_hash: str, source_audio: str, original_audio: str) -> tuple[dict, dict]:
    if pcm.shape != (SECONDS*SR, 2) or not np.isfinite(pcm).all():
        raise ValueError('audio must decode to exactly 30 seconds of finite 48 kHz stereo')
    mono = np.mean(pcm, axis=1)
    low = sosfilt(butter(3, [30, 140], btype='bandpass', fs=SR, output='sos'), mono)
    window = SR // ATTACK_FPS
    low_rms = np.sqrt(np.mean(low.reshape(-1, window)**2, axis=1))
    delta = np.maximum(np.diff(low_rms, prepend=low_rms[0]), 0)
    positive = delta[delta > 1e-10]
    delta_reference = float(np.percentile(positive, 99)) if positive.size else 0.0
    # A silent source stays silent; normalisation does not manufacture attacks.
    onset = np.clip(delta/max(delta_reference, 1e-12), 0, 1) if delta_reference > 1e-10 else np.zeros_like(delta)
    low_reference = max(float(np.percentile(low_rms, 98)), 1e-12)
    level = np.clip(low_rms/low_reference, 0, 1)
    fast_level = follow(level, ATTACK_FPS, .03, .26)
    fast_onset = follow(onset, ATTACK_FPS, .03, .26)
    attacks = {'sourceAudio': source_audio, 'sourceOriginal': original_audio,
               'duration': SECONDS, 'fps': ATTACK_FPS, 'wav_sha256': wav_hash,
               'attack_seconds': .03, 'release_seconds': .26,
               'columns': ['low_rms', 'positive_low_delta', 'low_level_envelope', 'bass_attack_envelope'],
               'frames': np.column_stack((low_rms, delta, fast_level, fast_onset)).round(8).tolist()}
    fft_window = np.hanning(4096)
    frequency = np.fft.rfftfreq(4096, 1/SR)
    masks = [(frequency >= a) & (frequency < b) for a,b in ((30,140), (140,1500), (1500,10000))]
    padded = np.pad(mono, (2048, 2048))
    values = np.empty((SECONDS*FPS, 4), dtype=np.float64)
    for i in range(len(values)):
        at = i*(SR//FPS)
        power = np.abs(np.fft.rfft(padded[at:at+4096]*fft_window))**2
        values[i] = [np.sqrt(np.mean(mono[at:at+SR//FPS].astype(np.float64)**2)),
                     *(np.sqrt(power[mask].sum()) for mask in masks)]
    values = np.clip(values/np.maximum(np.percentile(values, 98, axis=0), 1e-12), 0, 1)
    smoothed = np.empty_like(values)
    for column in (0, 2, 3):
        smoothed[:, column] = follow(values[:, column], FPS, .18, 1.1)
    smoothed[:, 1] = np.interp(np.arange(SECONDS*FPS)/FPS,
                               np.arange(len(fast_level))/ATTACK_FPS, fast_level)
    features = {'sourceAudio': source_audio, 'sourceOriginal': original_audio,
                'sourceStart': 0, 'duration': SECONDS, 'fps': FPS, 'wav_sha256': wav_hash,
                'columns': ['rms', 'low30_140', 'mid140_1500', 'high1500_10000'],
                'frames': smoothed.round(6).tolist()}
    return features, attacks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('runs/dp-sts-gujora-spatial-audio-v01/audio.wav'))
    parser.add_argument('--out', type=Path, default=Path('runs/dp-sts-gujora-climax-v01'))
    args = parser.parse_args()
    source = args.input.resolve()
    output = args.out.resolve()
    if not source.is_file():
        raise FileNotFoundError(f'Input audio not found: {source}')
    if output.exists():
        raise FileExistsError(f'{output} already exists; choose a new --out')
    source_hash = sha256(source)
    probe = subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(source)],
                           capture_output=True, check=True)
    stream_info = json.loads(probe.stdout)
    streams = [stream for stream in stream_info['streams'] if stream['codec_type'] == 'audio']
    if (len(streams) != 1 or streams[0].get('sample_rate') != '48000' or streams[0].get('channels') != 2
            or not math.isclose(float(stream_info['format']['duration']), 464, abs_tol=.001)):
        raise ValueError('source must be the full 464-second 48 kHz stereo synthesized audio')
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix='.gujora-climax-audio-', dir=output.parent))
    try:
        audio = temp/'audio.wav'
        # Keep every atempo stage at <=2; trim/pad only at the boundary to meet the exact frame contract.
        filters = ('atempo=2,atempo=2,atempo=2,atempo=1.9333333333333333,'
                   'apad=whole_dur=30,atrim=duration=30,asetpts=PTS-STARTPTS,'
                   'afade=t=in:st=0:d=0.4,afade=t=out:st=29.5:d=0.5')
        subprocess.run(['ffmpeg','-v','error','-xerror','-nostdin','-n','-i',str(source),
                        '-af',filters,'-ar','48000','-ac','2','-c:a','pcm_s24le',str(audio)], check=True)
        result = subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(audio),'-f','f32le',
                                 '-acodec','pcm_f32le','pipe:1'], capture_output=True, check=True)
        pcm = np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2)
        audio_hash = sha256(audio)
        features, attacks = analyze(pcm, audio_hash, str(output/'audio.wav'), str(source))
        peak = float(np.max(np.abs(pcm)))
        clipped = int(np.count_nonzero(np.abs(pcm) >= 1))
        if peak >= 1 or clipped:
            raise ValueError(f'compressed audio clips: peak={peak}, samples={clipped}')
        (temp/'audio-features.json').write_text(json.dumps(features, separators=(',', ':')))
        (temp/'audio-attacks.json').write_text(json.dumps(attacks, separators=(',', ':')))
        shutil.copy2(Path(__file__), temp/'audio-preparation.py')
        metadata = {'duration_seconds': SECONDS, 'sample_rate_hz': SR, 'channels': 2,
                    'bit_depth': 24, 'sample_peak': peak,
                    'rms': float(np.sqrt(np.mean(pcm.astype(np.float64)**2))),
                    'samples_at_or_above_full_scale': clipped,
                    'audio_sha256': audio_hash, 'features_sha256': sha256(temp/'audio-features.json'),
                    'attacks_sha256': sha256(temp/'audio-attacks.json'),
                    'source_audio': str(source), 'source_sha256': source_hash,
                    'source_duration_seconds': 464, 'source_provenance': 'Original synthesized Bach BWV 846 arrangement; not the Aphex Twin master.',
                    'method': 'FFmpeg atempo 2 × 2 × 2 × 1.9333333333333333, then boundary pad/trim and short fades; pitch-preserving time compression.',
                    'controls': 'Actual 30–140 Hz bass RMS and positive low-band changes; 30 ms attack, 260 ms release.',
                    'preparation_sha256': sha256(temp/'audio-preparation.py'),
                    'limitations': 'Time compression artifacts and musical quality require listening; padding may account for an encoder boundary remainder.'}
        (temp/'audio-prepare.json').write_text(json.dumps(metadata, indent=2)+'\n')
        os.rename(temp, output)
    finally:
        shutil.rmtree(temp, ignore_errors=True)
    print(f'Prepared 30-second audio and controls: {output}', flush=True)


if __name__ == '__main__':
    main()
