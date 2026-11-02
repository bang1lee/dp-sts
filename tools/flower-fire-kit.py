#!/usr/bin/env python3
"""Create original, deterministic synthesized firewood-like crackle one-shots.

These are oscillator and filtered-noise synthesis, not recordings of a fire.
Existing samples are never overwritten. Run from the project root with uv run.
"""
import argparse
import hashlib
import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

RATE = 48000
SPECS = [
    ('ember01', 61031, .195, 1150, 4250, 3),
    ('ember02', 61032, .235, 800, 3650, 5),
    ('ember03', 61033, .168, 1650, 5200, 2),
    ('ember04', 61034, .260, 920, 3150, 6),
    ('ember05', 61035, .205, 1300, 4800, 4),
    ('ember06', 61036, .225, 1030, 4000, 4),
]


def synth(seed, duration, low_hz, high_hz, secondary_count):
    rng = np.random.default_rng(seed)
    count = round(duration * RATE)
    t = np.arange(count) / RATE
    noise = rng.standard_normal(count)
    # A woody broadband fracture followed by irregular, finer fragments. These
    # events are contained inside the sample; no secondary geometric event is implied.
    envelope = np.exp(-t / .0042) * (1 - np.exp(-t / .00035))
    fragments = []
    for index in range(secondary_count):
        at = float(rng.uniform(.012, min(.105, duration - .03)))
        decay = float(rng.uniform(.0015, .005))
        strength = float(rng.uniform(.035, .11) * np.exp(-at * 9))
        dt = t - at
        envelope += np.where(dt >= 0, strength * np.exp(-np.maximum(dt, 0) / decay) * (1 - np.exp(-np.maximum(dt, 0) / .00035)), 0)
        fragments.append({'offsetSeconds': round(at, 6), 'decaySeconds': round(decay, 6), 'strength': round(strength, 6)})
    colored = sosfilt(butter(3, [low_hz, high_hz], btype='bandpass', fs=RATE, output='sos'), noise)
    rasp = sosfilt(butter(2, [300, 1900], btype='bandpass', fs=RATE, output='sos'), rng.standard_normal(count))
    # Inharmonic damped resonances and a low-volume noisy tail make a short,
    # warm woody texture rather than a pitched drum hit or clock click.
    resonances = np.zeros(count)
    modes = []
    for freq, decay, amp in [(float(rng.uniform(480, 760)), .019, .09), (float(rng.uniform(1050, 1550)), .012, .055), (float(rng.uniform(2150, 2700)), .007, .035)]:
        phase = float(rng.uniform(0, 2 * np.pi))
        resonances += amp * np.sin(2 * np.pi * freq * t + phase) * np.exp(-t / decay) * (1 - np.exp(-t / .0005))
        modes.append({'frequencyHz': round(freq, 3), 'decaySeconds': decay, 'amplitude': amp, 'phaseRadians': round(phase, 6)})
    tail_env = np.exp(-t / .042) * (1 - np.exp(-t / .002))
    signal = colored * envelope * .75 + rasp * (envelope * .32 + tail_env * .045) + resonances
    signal *= np.minimum(1, np.maximum(0, (duration - t) / .012))
    signal -= np.mean(signal)
    signal *= .72 / max(np.max(np.abs(signal)), 1e-12)
    pcm = np.rint(np.clip(signal, -1, 1) * 32767).astype('<i2')
    return pcm, fragments, modes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path('assets/fire-kit'))
    args = parser.parse_args()
    root = args.output_dir
    targets = [root / (spec[0] + '.wav') for spec in SPECS] + [root / 'manifest.json']
    if any(path.exists() for path in targets):
        raise FileExistsError('Refusing to overwrite an existing fire-kit asset')
    root.mkdir(parents=True, exist_ok=True)
    files = []
    for name, seed, duration, low, high, count in SPECS:
        pcm, fragments, modes = synth(seed, duration, low, high, count)
        target = root / (name + '.wav')
        with wave.open(str(target), 'wb') as writer:
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(RATE)
            writer.writeframes(pcm.tobytes())
        files.append({'id': name, 'file': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'frames': len(pcm),
                      'seed': seed, 'parameters': {'durationSeconds': duration, 'noiseBandHz': [low, high], 'secondaryFragments': fragments, 'resonantModes': modes}})
    manifest = {'version': 1, 'id': 'ambient-lab-synthesized-fire-kit-v1', 'sampleRate': RATE,
                'origin': 'original procedural synthesis; no field recording or external samples',
                'description': 'Synthesized soft firewood-like snaps and fine crackle texture',
                'license': 'project-original-not-publicly-licensed', 'generator': 'tools/flower-fire-kit.py', 'files': files}
    (root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Created {len(files)} synthesized firewood-like PCM WAV samples and manifest in {root}')


if __name__ == '__main__':
    main()
