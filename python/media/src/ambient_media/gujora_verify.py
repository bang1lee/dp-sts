"""Verify Gujora's finished film and create a small review package."""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

from ambient_media.storm_delivery import probe, run, sha256

TIMES = (15, 45, 75, 105, 135, 165)
OUTPUTS = ('contact-sheet.jpg', 'poster.jpg', 'preview-15s.mp4', 'delivery.json')


def inspect(path: Path, seconds: int) -> dict:
    data = probe(path, count_frames=True)
    videos = [stream for stream in data['streams'] if stream['codec_type'] == 'video']
    audios = [stream for stream in data['streams'] if stream['codec_type'] == 'audio']
    if len(videos) != 1 or len(audios) != 1:
        raise ValueError(f'{path}: expected one video and one audio stream')
    video, audio = videos[0], audios[0]
    got = (video.get('width'), video.get('height'), video.get('avg_frame_rate'),
           int(video.get('nb_read_frames', -1)))
    expected = (1080, 1080, '24/1', seconds * 24)
    if got != expected:
        raise ValueError(f'{path}: video stream {got}, expected {expected}')
    if audio.get('sample_rate') != '48000' or audio.get('channels') != 2:
        raise ValueError(f'{path}: expected 48 kHz stereo audio')
    durations = {'container': data['format'].get('duration'), 'video': video.get('duration'),
                 'audio': audio.get('duration')}
    for name, value in durations.items():
        if value is None or not math.isclose(float(value), seconds, abs_tol=0.001):
            raise ValueError(f'{path}: {name} duration {value}, expected {seconds} seconds')
    return {'width': 1080, 'height': 1080, 'fps': 24, 'decoded_video_frames': seconds * 24,
            'durations_seconds': {name: float(value) for name, value in durations.items()},
            'sample_rate_hz': 48000, 'channels': 2, 'video_codec': video.get('codec_name'),
            'audio_codec': audio.get('codec_name')}


def decode(path: Path, seconds: int) -> dict:
    """Decode both streams and report decoded audio, including possible AAC padding."""
    command = ['ffmpeg', '-v', 'error', '-xerror', '-err_detect', 'explode', '-i', str(path),
               '-map', '0:v:0', '-f', 'null', '-', '-map', '0:a:0', '-f', 'f32le',
               '-acodec', 'pcm_f32le', 'pipe:1']
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors)
        assert process.stdout is not None
        count = bad = clipped = 0
        peak = square_sum = 0.0
        while chunk := process.stdout.read(1024 * 1024):
            if len(chunk) % 4:
                process.kill()
                process.wait()
                raise ValueError(f'{path}: incomplete decoded audio sample')
            samples = np.frombuffer(chunk, dtype='<f4')
            finite = samples[np.isfinite(samples)].astype(np.float64)
            count += int(samples.size)
            bad += int(samples.size - finite.size)
            if finite.size:
                peak = max(peak, float(np.max(np.abs(finite))))
                clipped += int(np.count_nonzero(np.abs(finite) >= 1.0))
                square_sum += float(np.sum(finite * finite))
        process.stdout.close()
        code = process.wait()
        errors.seek(0)
        diagnostics = errors.read().decode(errors='replace')
    if code or diagnostics.strip():
        raise ValueError(f'{path}: full decode failed: {diagnostics[-2000:]}')
    expected = seconds * 48000 * 2
    # Container timestamps bound the presentation to the exact requested duration.
    # AAC may decode up to one 1024-sample frame beyond that duration.
    if bad or count % 2 or not expected <= count <= expected + 2048:
        raise ValueError(f'{path}: decoded {count} interleaved samples, expected {expected}'
                         f' plus at most 2048 padding samples; non-finite={bad}')
    return {'full_decode': 'passed', 'interleaved_samples': count,
            'possible_padding_interleaved_samples': count - expected,
            'nonfinite_samples': bad, 'samples_at_or_above_full_scale': clipped,
            'peak_absolute': round(peak, 8), 'rms': round(math.sqrt(square_sum / count), 8)}


def frame_at(path: Path, second: int) -> np.ndarray:
    result = run(['ffmpeg', '-v', 'error', '-ss', str(second), '-i', str(path),
                  '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'])
    frame = cv2.imdecode(np.frombuffer(result.stdout, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None or frame.shape != (1080, 1080, 3):
        raise ValueError(f'{path}: could not decode 1080-square frame at {second} seconds')
    return frame


def write_images(path: Path, directory: Path) -> list[dict]:
    size, gutter, caption = 420, 12, 40
    sheet = np.full((2 * (size + caption) + 3 * gutter, 3 * size + 4 * gutter, 3), 18, np.uint8)
    observations = []
    previous = None
    for index, second in enumerate(TIMES):
        frame = frame_at(path, second)
        small = cv2.resize(frame, (size, size), interpolation=cv2.INTER_AREA)
        x = gutter + (index % 3) * (size + gutter)
        y = gutter + (index // 3) * (size + caption + gutter)
        sheet[y:y + size, x:x + size] = small
        cv2.putText(sheet, f'{second // 60:02d}:{second % 60:02d}', (x + 5, y + size + 28),
                    cv2.FONT_HERSHEY_SIMPLEX, .7, (245, 245, 245), 1, cv2.LINE_AA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        obs = {'second': second, 'mean_luma_8bit': round(float(gray.mean()), 2)}
        if previous is not None:
            obs['mean_absolute_luma_difference_from_previous_sample_8bit'] = round(
                float(np.mean(np.abs(gray.astype(np.int16) - previous.astype(np.int16)))), 2)
        previous = gray
        observations.append(obs)
    poster = frame_at(path, 90)
    if not cv2.imwrite(str(directory / 'contact-sheet.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 94]):
        raise RuntimeError('could not write contact sheet')
    if not cv2.imwrite(str(directory / 'poster.jpg'), poster, [cv2.IMWRITE_JPEG_QUALITY, 94]):
        raise RuntimeError('could not write poster')
    return observations


def validate_metadata(root: Path) -> dict:
    features_path = root / 'audio-features.json'
    features = json.loads(features_path.read_text())
    rendering = json.loads((root / 'render.json').read_text())
    actual = {'audioSha256': sha256(root / 'audio.wav'),
              'featuresSha256': sha256(features_path), 'coverSha256': sha256(root / 'cover.png')}
    source = rendering.get('source')
    if not isinstance(source, dict) or any(source.get(key) != value for key, value in actual.items()):
        raise ValueError('render metadata does not match WAV, control-data or cover hashes')
    if features.get('wav_sha256') != actual['audioSha256']:
        raise ValueError('audio-features WAV hash does not match audio.wav')
    expected_render = {'start': 0, 'duration': 180, 'fps': 24, 'frames': 4320,
                       'width': 1080, 'height': 1080, 'errors': []}
    if any(rendering.get(key) != value for key, value in expected_render.items()):
        raise ValueError('render metadata does not describe an error-free full 180-second render')
    if (features.get('duration'), features.get('fps')) != (180, 24):
        raise ValueError('audio feature timing must be 180 seconds at 24 fps')
    values = np.asarray(features.get('frames'), dtype=float)
    if values.shape != (4320, 4) or not np.isfinite(values).all():
        raise ValueError('audio features must have 4320 finite, four-value control frames')
    source_audio, start = features.get('sourceAudio'), features.get('sourceStart')
    if not isinstance(source_audio, str) or not source_audio or not isinstance(start, (float, int)) or not math.isfinite(start) or start < 0:
        raise ValueError('audio features lack valid source audio and start time')
    cover = cv2.imread(str(root / 'cover.png'), cv2.IMREAD_UNCHANGED)
    if cover is None or cover.shape[0] != cover.shape[1]:
        raise ValueError('cover.png must decode to a square image')
    return {'audio_wav_sha256': actual['audioSha256'], 'audio_features_sha256': actual['featuresSha256'],
            'cover_sha256': actual['coverSha256'], 'cover_dimensions': list(cover.shape[:2]),
            'render_json_sha256': sha256(root / 'render.json'),
            'source_audio': source_audio, 'source_start_seconds': start,
            'render_implementation_sha256': source.get('implementationSha256'),
            'render_shader_sha256': source.get('shaderSha256')}


def make_preview(source: Path, destination: Path) -> None:
    run(['ffmpeg', '-v', 'error', '-xerror', '-y', '-ss', '72', '-i', str(source), '-t', '15',
         '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
         '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
         '-af', 'afade=t=in:st=0:d=0.2,afade=t=out:st=14.8:d=0.2',
         '-movflags', '+faststart', str(destination)])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('runs/dp-sts-gujora-film-v01'))
    parser.add_argument('--out', type=Path, help='output directory; default ROOT/delivery')
    parser.add_argument('--overwrite', action='store_true', help='replace existing delivery products')
    args = parser.parse_args()
    root = args.root.resolve()
    out = (args.out or root / 'delivery').resolve()
    try:
        required = ('artwork.mp4', 'audio.wav', 'audio-features.json', 'cover.png', 'render.json')
        missing = [str(root / name) for name in required if not (root / name).is_file()]
        if missing:
            raise ValueError('missing required inputs:\n' + '\n'.join(missing))
        existing = [str(out / name) for name in OUTPUTS if (out / name).exists()]
        if existing and not args.overwrite:
            raise ValueError('delivery outputs already exist; use --out or --overwrite:\n' + '\n'.join(existing))
        provenance = validate_metadata(root)
        film = root / 'artwork.mp4'
        print('Checking final film...', flush=True)
        film_info = inspect(film, 180)
        film_info['audio'] = decode(film, 180)
        film_info['sha256'] = sha256(film)
        out.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.gujora-delivery-', dir=out) as temp_name:
            temp = Path(temp_name)
            observations = write_images(film, temp)
            print('Rendering 15-second preview...', flush=True)
            preview = temp / 'preview-15s.mp4'
            make_preview(film, preview)
            preview_info = inspect(preview, 15)
            preview_info['audio'] = decode(preview, 15)
            preview_info.update({'sha256': sha256(preview), 'excerpt_start_seconds': 72,
                                 'audio_fade_in_seconds': 0.2, 'audio_fade_out_seconds': 0.2})
            evidence = {'status': 'passed', 'artwork': {'file': os.path.relpath(film, out), **film_info},
                        'provenance': provenance, 'preview': preview_info,
                        'contact_sheet': {'file': 'contact-sheet.jpg', 'samples': observations},
                        'poster': {'file': 'poster.jpg', 'sample_second': 90},
                        'limitations': ['Technical checks do not replace watching the complete artwork.',
                                        'Luminance differences compare only sampled still frames, not continuous motion.',
                                        'Hashes link the WAV, controls and cover to render metadata; they do not prove perceptual synchronization.',
                                        'Audio peak and full-scale counts describe decoded samples and do not determine artistic quality.',
                                        'Preview fade durations record the encoding settings, not an independent listening assessment.']}
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
