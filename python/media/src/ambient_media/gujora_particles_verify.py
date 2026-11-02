"""Verify and package the full Gujora 3D particle artwork for review."""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

from ambient_media.gujora_verify import decode, frame_at, inspect, make_preview
from ambient_media.storm_delivery import sha256

TIMES = (15, 35, 55, 75, 95, 115, 135, 155, 175)
OUTPUTS = ('contact-sheet.jpg', 'poster.jpg', 'preview-15s.mp4', 'delivery.json')


def audio_provenance(original_audio: str, expected_wav: str, expected_features: str) -> dict:
    audio_path = Path(original_audio)
    manifest_path = audio_path.parent / 'audio-render.json'
    if not manifest_path.is_file():
        return {'status': 'unavailable', 'reason': 'audio-render.json is not available beside the source audio'}
    manifest = json.loads(manifest_path.read_text())
    if (not audio_path.is_file() or sha256(audio_path) != expected_wav
            or manifest.get('audio_sha256') != expected_wav
            or manifest.get('features_sha256') != expected_features):
        raise ValueError('audio-render provenance does not match rendered WAV and features')
    artifacts = {'score_sha256': 'score.json', 'synthesizer_sha256': 'synthesizer.py',
                 'score_generator_sha256': 'score-generator.mjs',
                 'melody_source_sha256': 'melody-source.json',
                 'original_score_sha256': 'bwv846-source.ly',
                 'reference_envelope_sha256': 'reference-envelope.json'}
    for field, name in artifacts.items():
        path = audio_path.parent / name
        if not path.is_file() or sha256(path) != manifest.get(field):
            raise ValueError(f'audio-render {field} does not match {path}')
    return {'status': 'verified', 'manifest': str(manifest_path),
            'manifest_sha256': sha256(manifest_path), 'melody': manifest.get('melody'),
            'melody_attribution': manifest.get('melody_attribution'),
            'score_sha256': manifest.get('score_sha256'),
            'reference_envelope_sha256': manifest.get('reference_envelope_sha256')}


def validate_metadata(root: Path) -> dict:
    render_path = root / 'render.json'
    metadata = json.loads(render_path.read_text())
    expected = {'start': 0, 'duration': 180, 'fps': 24, 'frames': 4320,
                'width': 1080, 'height': 1080, 'errors': []}
    if any(metadata.get(key) != value for key, value in expected.items()):
        raise ValueError('render metadata does not describe an error-free full 180-second render')
    source = metadata.get('source')
    if not isinstance(source, dict):
        raise TypeError('render metadata has no source object')
    # Renderer records absolute input paths; relative paths use the current workspace.
    if not isinstance(source.get('audio'), str) or not source['audio']:
        raise ValueError('render metadata has no audio path')
    if not isinstance(source.get('features'), str) or not source['features']:
        raise ValueError('render metadata has no features path')
    if not isinstance(source.get('cover'), str) or not source['cover']:
        raise ValueError('render metadata has no original cover path')
    paths = {'audioSha256': Path(source['audio']), 'featuresSha256': Path(source['features']),
             'implementationSha256': root / 'renderer.mjs', 'sceneSha256': root / 'scene.mjs',
             'coverSha256': root / 'reference.png'}
    for field, path in paths.items():
        if not path.is_file():
            raise ValueError(f'missing provenance input: {path}')
        if sha256(path) != source.get(field):
            raise ValueError(f'{field} does not match {path}')
    features = json.loads(paths['featuresSha256'].read_text())
    if features.get('wav_sha256') != source['audioSha256']:
        raise ValueError('audio features do not match the source WAV hash')
    if (features.get('duration'), features.get('fps')) != (180, 24):
        raise ValueError('audio feature timing must be 180 seconds at 24 fps')
    values = np.asarray(features.get('frames'), dtype=float)
    if values.shape != (4320, 4) or not np.isfinite(values).all():
        raise ValueError('audio features must contain 4320 finite, four-value frames')
    audio_source = features.get('sourceAudio')
    start = features.get('sourceStart')
    if (not isinstance(audio_source, str) or not audio_source
            or not isinstance(start, (float, int)) or not math.isfinite(start) or start < 0):
        raise ValueError('audio features lack valid source audio and start time')
    cover = cv2.imread(str(paths['coverSha256']), cv2.IMREAD_UNCHANGED)
    if cover is None:
        raise ValueError('reference.png is not a decodable image')
    original_cover = Path(source['cover'])
    original_status = ('matches' if sha256(original_cover) == source['coverSha256'] else 'changed') if original_cover.is_file() else 'unavailable'
    return {'audio_wav': str(paths['audioSha256']), 'audio_wav_sha256': source['audioSha256'],
            'audio_features': str(paths['featuresSha256']), 'audio_features_sha256': source['featuresSha256'],
            'renderer_sha256': source['implementationSha256'], 'scene_sha256': source['sceneSha256'],
            'render_json_sha256': sha256(render_path), 'original_audio': audio_source,
            'source_start_seconds': start, 'original_cover': source['cover'],
            'cover_snapshot': os.path.relpath(paths['coverSha256'], root),
            'cover_sha256': source['coverSha256'], 'cover_dimensions': list(cover.shape[:2]),
            'current_original_cover': original_status,
            'audio_render': audio_provenance(audio_source, source['audioSha256'], source['featuresSha256'])}


def make_sheet(source: Path, directory: Path) -> list[dict]:
    size, gutter, caption = 384, 12, 36
    sheet = np.full((3 * (size + caption) + 4 * gutter,
                     3 * size + 4 * gutter, 3), 18, np.uint8)
    observations = []
    previous = None
    for index, second in enumerate(TIMES):
        original = frame_at(source, second)
        small = cv2.resize(original, (size, size), interpolation=cv2.INTER_AREA)
        x = gutter + (index % 3) * (size + gutter)
        y = gutter + (index // 3) * (size + caption + gutter)
        sheet[y:y + size, x:x + size] = small
        cv2.putText(sheet, f'{second // 60:02d}:{second % 60:02d}', (x + 4, y + size + 26),
                    cv2.FONT_HERSHEY_SIMPLEX, .65, (245, 245, 245), 1, cv2.LINE_AA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        item = {'second': second, 'mean_luma_8bit': round(float(gray.mean()), 2)}
        if previous is not None:
            item['mean_absolute_luma_difference_from_previous_sample_8bit'] = round(
                float(np.mean(np.abs(gray.astype(np.int16) - previous.astype(np.int16)))), 2)
        previous = gray
        observations.append(item)
    poster = frame_at(source, 90)
    if not cv2.imwrite(str(directory / 'contact-sheet.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 94]):
        raise RuntimeError('could not write contact sheet')
    if not cv2.imwrite(str(directory / 'poster.jpg'), poster, [cv2.IMWRITE_JPEG_QUALITY, 94]):
        raise RuntimeError('could not write poster')
    return observations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('runs/dp-sts-gujora-particles-v01'))
    parser.add_argument('--out', type=Path, help='output directory; default ROOT/delivery')
    parser.add_argument('--overwrite', action='store_true', help='replace existing delivery products')
    args = parser.parse_args()
    root = args.root.resolve()
    out = (args.out or root / 'delivery').resolve()
    try:
        names = ('artwork.mp4', 'render.json', 'renderer.mjs', 'scene.mjs', 'reference.png')
        missing = [str(root / name) for name in names if not (root / name).is_file()]
        if missing:
            raise ValueError('missing required inputs:\n' + '\n'.join(missing))
        existing = [str(out / name) for name in OUTPUTS if (out / name).exists()]
        if existing and not args.overwrite:
            raise ValueError('delivery outputs already exist; use --out or --overwrite:\n' + '\n'.join(existing))
        provenance = validate_metadata(root)
        film = root / 'artwork.mp4'
        print('Checking final particle artwork...', flush=True)
        film_info = inspect(film, 180)
        film_info['audio'] = decode(film, 180)
        film_info['sha256'] = sha256(film)
        out.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.gujora-particles-delivery-', dir=out) as temp_name:
            temp = Path(temp_name)
            observations = make_sheet(film, temp)
            print('Rendering 15-second preview...', flush=True)
            preview = temp / 'preview-15s.mp4'
            make_preview(film, preview)
            preview_info = inspect(preview, 15)
            preview_info['audio'] = decode(preview, 15)
            preview_info.update({'sha256': sha256(preview), 'excerpt_start_seconds': 72,
                                 'audio_fade_in_seconds': 0.2, 'audio_fade_out_seconds': 0.2})
            evidence = {'status': 'technical_checks_passed',
                        'artwork': {'file': os.path.relpath(film, out), **film_info},
                        'provenance': provenance, 'preview': preview_info,
                        'contact_sheet': {'file': 'contact-sheet.jpg', 'samples': observations},
                        'poster': {'file': 'poster.jpg', 'sample_second': 90},
                        'visual_review_objectives': {'status': 'not_evaluated',
                            'requested': ['Seven people in groups of 3, 2 and 2',
                                          'Island separated from the people',
                                          'Original cover composition represented by 3D contour particles',
                                          'Visible motion of particles']},
                        'limitations': ['Technical checks do not replace watching the complete artwork.',
                                        'Visual review objectives are requested design intent, not automatically verified findings.',
                                        'Luminance differences compare only sampled stills, not continuous motion.',
                                        'Source hashes link files to render metadata; they do not prove perceptual synchronization.',
                                        'Audio peak and full-scale counts describe decoded samples, not artistic quality.',
                                        'Preview fade durations record encoding settings, not a listening assessment.']}
            (temp / 'delivery.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n')
            for name in OUTPUTS:
                os.replace(temp / name, out / name)
        print(f'Delivery complete: {out}', flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
