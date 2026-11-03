"""Independently check a Gujora continuum render and publish review stills."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from scipy.io import wavfile

from ambient_media.gujora_climax_verify import inspect_video, make_sheet
from ambient_media.gujora_verify import decode
from ambient_media.storm_delivery import sha256

OUTPUTS = ('contact-sheet.jpg', 'poster.jpg', 'delivery.json')
REQUIRED = ('artwork.mp4', 'render.json', 'renderer.mjs', 'scene.mjs', 'base-scene.mjs',
            'reference.png', 'audio.wav', 'ambient-stem.wav', 'hihat-stem.wav',
            'audio-features.json', 'audio-attacks.json', 'audio-prepare.json')


def check_hash(path: Path, expected: object, label: str) -> str:
    if not isinstance(expected, str) or not path.is_file() or sha256(path) != expected:
        raise ValueError(f'{label} hash does not match {path}')
    return expected


def check_wav(path: Path) -> dict:
    rate, samples = wavfile.read(path)
    if rate != 48000 or samples.shape != (30 * 48000, 2):
        raise ValueError(f'{path}: expected exactly 30 seconds of 48 kHz stereo samples')
    if not np.isfinite(samples).all():
        raise ValueError(f'{path}: non-finite PCM samples')
    return {'sample_rate_hz': rate, 'channels': 2, 'samples_per_channel': len(samples),
            'dtype': str(samples.dtype), 'sha256': sha256(path)}


def validate_metadata(root: Path) -> dict:
    render_path = root / 'render.json'
    render = json.loads(render_path.read_text())
    expected = {'start': 0, 'duration': 30, 'fps': 24, 'frames': 720,
                'width': 720, 'height': 720, 'errors': []}
    if any(render.get(k) != v for k, v in expected.items()):
        raise ValueError('render metadata does not describe an error-free 720-square 30-second final')
    source = render.get('source')
    if not isinstance(source, dict):
        raise TypeError('missing render source metadata')
    local = {'cover': 'reference.png', 'audio': 'audio.wav', 'features': 'audio-features.json',
             'attacks': 'audio-attacks.json'}
    hashes = {}
    for name, filename in local.items():
        field = name + 'Sha256'
        hashes[name] = check_hash(root / filename, source.get(field), field)
        original = source.get(name)
        if not isinstance(original, str) or not original:
            raise ValueError(f'missing render source path: {name}')
        path = Path(original)
        if not path.is_absolute():
            path = Path.cwd() / path
        check_hash(path, source[field], f'render source {name}')
    for field, filename in (('implementationSha256', 'renderer.mjs'),
                            ('sceneSha256', 'scene.mjs'), ('baseSceneSha256', 'base-scene.mjs')):
        hashes[field] = check_hash(root / filename, source.get(field), field)
    cover = cv2.imread(str(root / 'reference.png'), cv2.IMREAD_UNCHANGED)
    if cover is None:
        raise ValueError('reference.png is not a decodable image')
    arrays = {}
    for name, fps, columns in (
        ('features', 24, ['rms', 'low30_140', 'mid140_1500', 'high1500_10000']),
        ('attacks', 50, ['low_rms', 'positive_low_delta', 'low_level_envelope', 'bass_attack_envelope']),
    ):
        data = json.loads((root / local[name]).read_text())
        values = np.asarray(data.get('frames'), dtype=float)
        if (data.get('duration') != 30 or data.get('fps') != fps or
                data.get('wav_sha256') != hashes['audio'] or data.get('columns') != columns or
                values.shape != (30 * fps, 4) or not np.isfinite(values).all()):
            raise ValueError(f'invalid or mismatched {name} control data')
        arrays[name] = values
    preparation_path = root / 'audio-prepare.json'
    preparation = json.loads(preparation_path.read_text())
    for name, field in (('audio', 'audio_sha256'), ('features', 'features_sha256'),
                        ('attacks', 'attacks_sha256')):
        if preparation.get(field) != hashes[name]:
            raise ValueError(f'audio preparation {field} mismatch')
    for name, field in (('ambient-stem.wav', 'ambient_stem_sha256'),
                        ('hihat-stem.wav', 'hihat_stem_sha256')):
        check_hash(root / name, preparation.get(field), field)
    for path_field, hash_field in (('source_audio', 'source_sha256'),
                                   ('hihat_source', 'hihat_source_sha256')):
        value = preparation.get(path_field)
        if not isinstance(value, str) or not value or not Path(value).is_absolute():
            raise ValueError(f'missing absolute source path: {path_field}')
        check_hash(Path(value), preparation.get(hash_field), hash_field)
    if (preparation.get('source_start_seconds'), preparation.get('source_end_seconds')) != (50, 80):
        raise ValueError('unexpected original source interval')
    geometry = render.get('geometry')
    if (not isinstance(geometry, dict) or geometry.get('staticParticlePositions') is not True or
            geometry.get('pointCount') != 884292):
        raise ValueError('renderer metadata must report 884292 static particle positions')
    wavs = {name: check_wav(root / name) for name in
            ('audio.wav', 'ambient-stem.wav', 'hihat-stem.wav')}
    return {'render_json_sha256': sha256(render_path), 'linked_source_hashes': hashes,
            'audio_preparation_sha256': sha256(preparation_path),
            'original_audio_path': preparation['source_audio'],
            'original_audio_sha256': preparation['source_sha256'],
            'original_audio_interval_seconds': [50, 80],
            'hihat_source_path': preparation['hihat_source'],
            'hihat_source_sha256': preparation['hihat_source_sha256'],
            'source_provenance': preparation.get('source_provenance'),
            'wav_observations': wavs, 'cover_dimensions': list(cover.shape[:2]),
            'control_shapes': {'features': list(arrays['features'].shape),
                               'attacks': list(arrays['attacks'].shape)},
            'measured_bass_attack_peak': float(arrays['attacks'][:, 3].max()),
            'renderer_geometry_metadata': geometry, 'renderer_camera_metadata': render.get('camera')}


def publish(root: Path, out: Path, overwrite: bool) -> None:
    missing = [str(root / name) for name in REQUIRED if not (root / name).is_file()]
    if missing:
        raise ValueError('missing required inputs:\n' + '\n'.join(missing))
    if out.exists():
        if not out.is_dir():
            raise ValueError(f'output is not a directory: {out}')
        entries = {p.name for p in out.iterdir()}
        if entries and not overwrite:
            raise ValueError('delivery directory already contains files; choose --out or use --overwrite')
        if entries - set(OUTPUTS):
            raise ValueError('delivery directory contains unrelated files; choose a different --out')
    provenance = validate_metadata(root)
    video = root / 'artwork.mp4'
    info = inspect_video(video, 720)
    info['audio'] = decode(video, 30)
    info['sha256'] = sha256(video)
    out.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix='.continuum-delivery-', dir=out.parent))
    backup = None
    try:
        times = make_sheet(video, temp, 720)
        report = {'status': 'technical_checks_passed', 'user_acceptance': 'not_asserted',
                  'artwork': {'file': os.path.relpath(video, out), **info}, 'provenance': provenance,
                  'contact_sheet': {'file': 'contact-sheet.jpg', 'sample_seconds': times},
                  'poster': {'file': 'poster.jpg', 'sample_second': 15},
                  'limitations': ['Technical checks do not replace watching and listening to the complete film.',
                                  'Particle count, static geometry and camera are renderer metadata, not independently measured from images.',
                                  'Hash linkage does not prove audible synchronization or visual response.',
                                  'User acceptance has not been asserted.']}
        (temp / 'delivery.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
        if overwrite and out.exists():
            # Recheck before replacement and preserve the previous package for rollback.
            if not out.is_dir() or {p.name for p in out.iterdir()} - set(OUTPUTS):
                raise ValueError('delivery directory contains unrelated files; choose a different --out')
            backup = Path(tempfile.mkdtemp(prefix='.continuum-previous-', dir=out.parent))
            backup.rmdir()
            os.rename(out, backup)
        try:
            os.rename(temp, out)
        except OSError:
            if backup is not None:
                os.rename(backup, out)
                backup = None
            raise
        if backup is not None:
            shutil.rmtree(backup)
    finally:
        if temp.exists():
            shutil.rmtree(temp)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('runs/dp-sts-gujora-continuum-v01'))
    parser.add_argument('--out', type=Path, help='output directory; default ROOT/delivery')
    parser.add_argument('--overwrite', action='store_true', help='replace an existing delivery package')
    args = parser.parse_args()
    root = args.root.resolve()
    out = (args.out or root / 'delivery').resolve()
    try:
        publish(root, out, args.overwrite)
        print(f'Verified delivery: {out}', flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
