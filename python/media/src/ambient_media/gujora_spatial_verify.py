"""Check the 464-second Gujora spatial film and create a review package."""
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

from ambient_media.gujora_particles_verify import audio_provenance
from ambient_media.gujora_verify import decode, frame_at, inspect, make_preview
from ambient_media.storm_delivery import sha256

DURATION = 464
FPS = 24
TIMES = (15, 60, 116, 174, 232, 290, 348, 406, 450)
OUTPUTS = ('contact-sheet.jpg', 'poster.jpg', 'preview-15s.mp4', 'delivery.json')


def validate_metadata(root: Path) -> dict:
    render_path = root / 'render.json'
    data = json.loads(render_path.read_text())
    expected = {'start': 0, 'duration': DURATION, 'fps': FPS, 'frames': DURATION * FPS,
                'width': 1080, 'height': 1080, 'errors': []}
    if any(data.get(key) != value for key, value in expected.items()):
        raise ValueError('render metadata does not describe an error-free 464-second render')
    source = data.get('source')
    if not isinstance(source, dict):
        raise TypeError('render metadata has no source object')
    for name in ('audio', 'features', 'cover'):
        if not isinstance(source.get(name), str) or not source[name]:
            raise ValueError(f'render metadata has no source {name} path')
    files = {'audioSha256': Path(source['audio']), 'featuresSha256': Path(source['features']),
             'coverSha256': root/'reference.png', 'implementationSha256': root/'renderer.mjs',
             'sceneSha256': root/'scene.mjs'}
    for key, path in files.items():
        if not path.is_file() or sha256(path) != source.get(key):
            raise ValueError(f'{key} does not match {path}')
    features = json.loads(files['featuresSha256'].read_text())
    if (features.get('wav_sha256') != source['audioSha256']
            or (features.get('duration'), features.get('fps')) != (DURATION, FPS)):
        raise ValueError('audio controls do not match 464-second source WAV')
    values = np.asarray(features.get('frames'), dtype=float)
    if values.shape != (DURATION * FPS, 4) or not np.isfinite(values).all():
        raise ValueError('audio controls must contain 11136 finite four-value frames')
    audio_source, start = features.get('sourceAudio'), features.get('sourceStart')
    if (not isinstance(audio_source, str) or not audio_source
            or not isinstance(start, (int, float)) or not math.isfinite(start) or start < 0):
        raise ValueError('audio controls lack valid source and start')
    cover = cv2.imread(str(files['coverSha256']), cv2.IMREAD_UNCHANGED)
    if cover is None:
        raise ValueError('reference.png is not a decodable image')
    geometry = data.get('geometry')
    camera = data.get('camera')
    if not isinstance(geometry, dict) or geometry.get('staticParticlePositions') is not True:
        raise ValueError('render metadata does not declare static particle positions')
    if not isinstance(camera, dict) or not isinstance(camera.get('keyframes'), list) or not camera['keyframes']:
        raise ValueError('render metadata has no camera keyframes')
    for key in ('fovDegrees', 'near', 'far'):
        if not isinstance(camera.get(key), (float, int)) or not math.isfinite(camera[key]) or camera[key] <= 0:
            raise ValueError(f'render metadata has invalid camera {key}')
    if camera['near'] >= camera['far']:
        raise ValueError('camera clipping planes are reversed')
    return {'audio_wav': str(files['audioSha256']), 'audio_wav_sha256': source['audioSha256'],
            'audio_features': str(files['featuresSha256']), 'audio_features_sha256': source['featuresSha256'],
            'cover_source': source['cover'], 'cover_snapshot': 'reference.png',
            'cover_sha256': source['coverSha256'], 'cover_dimensions': list(cover.shape[:2]),
            'renderer_sha256': source['implementationSha256'], 'scene_sha256': source['sceneSha256'],
            'render_json_sha256': sha256(render_path), 'original_audio': audio_source,
            'source_start_seconds': start,
            'audio_render': audio_provenance(audio_source, source['audioSha256'], source['featuresSha256']),
            'renderer_geometry_metadata': geometry, 'renderer_camera_metadata': camera}


def make_sheet(source: Path, directory: Path) -> list[dict]:
    size, gap, caption = 384, 12, 36
    sheet = np.full((3*(size+caption)+4*gap, 3*size+4*gap, 3), 18, np.uint8)
    observations = []
    previous = None
    for i, sec in enumerate(TIMES):
        pic = cv2.resize(frame_at(source, sec), (size, size), interpolation=cv2.INTER_AREA)
        x, y = gap+(i%3)*(size+gap), gap+(i//3)*(size+caption+gap)
        sheet[y:y+size, x:x+size] = pic
        cv2.putText(sheet, f'{sec//60:02d}:{sec%60:02d}', (x+4, y+size+26),
                    cv2.FONT_HERSHEY_SIMPLEX, .65, (245,245,245), 1, cv2.LINE_AA)
        gray = cv2.cvtColor(pic, cv2.COLOR_BGR2GRAY)
        item = {'second': sec, 'mean_luma_8bit': round(float(gray.mean()), 2)}
        if previous is not None:
            item['mean_absolute_luma_difference_from_previous_sample_8bit'] = round(
                float(np.mean(np.abs(gray.astype(np.int16)-previous.astype(np.int16)))), 2)
        previous = gray
        observations.append(item)
    if not cv2.imwrite(str(directory/'contact-sheet.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 94]):
        raise RuntimeError('could not write contact sheet')
    if not cv2.imwrite(str(directory/'poster.jpg'), frame_at(source, 232), [cv2.IMWRITE_JPEG_QUALITY, 94]):
        raise RuntimeError('could not write poster')
    return observations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('runs/dp-sts-gujora-spatial-v01'))
    parser.add_argument('--out', type=Path, help='output directory; default ROOT/delivery')
    parser.add_argument('--overwrite', action='store_true', help='replace existing delivery products')
    args = parser.parse_args()
    root = args.root.resolve()
    out = (args.out or root/'delivery').resolve()
    try:
        names = ('artwork.mp4', 'render.json', 'renderer.mjs', 'scene.mjs', 'reference.png')
        missing = [str(root/name) for name in names if not (root/name).is_file()]
        if missing:
            raise ValueError('missing required inputs:\n'+'\n'.join(missing))
        existing = [str(out/name) for name in OUTPUTS if (out/name).exists()]
        if existing and not args.overwrite:
            raise ValueError('delivery outputs already exist; use --out or --overwrite:\n'+'\n'.join(existing))
        provenance = validate_metadata(root)
        film = root/'artwork.mp4'
        print('Checking 464-second spatial artwork...', flush=True)
        film_info = inspect(film, DURATION)
        film_info['audio'] = decode(film, DURATION)
        film_info['sha256'] = sha256(film)
        out.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.gujora-spatial-delivery-', dir=out) as temp_name:
            temp = Path(temp_name)
            observations = make_sheet(film, temp)
            print('Rendering 15-second preview...', flush=True)
            preview = temp/'preview-15s.mp4'
            make_preview(film, preview)
            preview_info = inspect(preview, 15)
            preview_info['audio'] = decode(preview, 15)
            preview_info.update({'sha256': sha256(preview), 'excerpt_start_seconds': 72,
                                 'audio_fade_in_seconds': .2, 'audio_fade_out_seconds': .2})
            report = {'status': 'technical_checks_passed',
                      'artwork': {'file': os.path.relpath(film, out), **film_info},
                      'provenance': provenance, 'preview': preview_info,
                      'contact_sheet': {'file': 'contact-sheet.jpg', 'samples': observations},
                      'poster': {'file': 'poster.jpg', 'sample_second': 232},
                      'visual_review_objectives': {'status': 'not_evaluated',
                          'requested': ['Original cover composition preserved', 'Seven people in groups of 3, 2 and 2',
                                        'Island separated from the people', 'Static particles with camera motion']},
                      'limitations': ['Technical checks do not replace watching the complete artwork.',
                                      'Geometry and camera settings are renderer-reported metadata, not independent visual verification.',
                                      'Luminance differences compare only sampled stills, not continuous motion.',
                                      'Source hashes do not prove perceptual synchronization.',
                                      'Audio measurements do not establish artistic quality.',
                                      'Preview fades record encoding settings, not a listening assessment.']}
            (temp/'delivery.json').write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
            for name in OUTPUTS:
                os.replace(temp/name, out/name)
        print(f'Delivery complete: {out}', flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
