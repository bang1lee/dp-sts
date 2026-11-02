"""Validate seven full renders and make offline comparison deliverables."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ITEMS = (
    ('01-canopy-melt', 'Canopy Melt'), ('02-coral-vortex', 'Coral Vortex'),
    ('03-glacier-veins', 'Glacier Veins'), ('04-mycelium-choir', 'Mycelium Choir'),
    ('05-mineral-memory', 'Mineral Memory'), ('06-neon-abyss', 'Neon Abyss'),
    ('07-acid-bloom', 'Acid Bloom'),
)
TIMES = (15, 90, 165)
PRODUCTS = ('contact-sheet.jpg', 'poster.jpg', 'comparison.mp4', 'delivery.json', 'README.md')


def run(args: list[str]) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f'{args[0]} failed: {exc.stderr.decode(errors="replace")[-2000:]}') from exc


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def probe(path: Path, count_frames: bool = False) -> dict:
    args = ['ffprobe', '-v', 'error']
    if count_frames:
        args += ['-count_frames']
    args += ['-show_streams', '-show_format', '-of', 'json', str(path)]
    return json.loads(run(args).stdout)


def inspect_video(path: Path, seconds: int, frame_count: int) -> dict:
    data = probe(path, True)
    video = [s for s in data['streams'] if s['codec_type'] == 'video']
    audio = [s for s in data['streams'] if s['codec_type'] == 'audio']
    if len(video) != 1 or len(audio) != 1:
        raise ValueError(f'{path}: expected one video and one audio stream')
    v, a = video[0], audio[0]
    expected = (1280, 720, '24/1', frame_count)
    actual = (v.get('width'), v.get('height'), v.get('avg_frame_rate'), int(v.get('nb_read_frames', -1)))
    if actual != expected:
        raise ValueError(f'{path}: expected {expected}, got {actual}')
    if a.get('sample_rate') != '48000' or a.get('channels') != 2:
        raise ValueError(f'{path}: expected stereo 48000 Hz audio')
    for label, value in [('container', data['format'].get('duration')), ('video', v.get('duration')), ('audio', a.get('duration'))]:
        if value is None or not math.isclose(float(value), seconds, abs_tol=0.001):
            raise ValueError(f'{path}: {label} duration is {value}, expected {seconds} s')
    return {'width': 1280, 'height': 720, 'fps': 24, 'decoded_frames': frame_count,
            'duration_seconds': seconds, 'sample_rate': 48000, 'channels': 2,
            'video_codec': v.get('codec_name'), 'audio_codec': a.get('codec_name')}


def decode_and_measure(path: Path, seconds: int) -> dict:
    # One FFmpeg pass fully decodes both streams; stderr goes to a temporary file
    # so diagnostics cannot deadlock the raw audio pipe.
    cmd = ['ffmpeg', '-v', 'error', '-xerror', '-err_detect', 'explode', '-i', str(path),
           '-map', '0:v:0', '-f', 'null', '-', '-map', '0:a:0', '-f', 'f32le',
           '-acodec', 'pcm_f32le', 'pipe:1']
    with tempfile.TemporaryFile() as errors:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errors)
        assert p.stdout is not None
        count = bad = clipped = 0
        peak = total = 0.0
        while True:
            chunk = p.stdout.read(1024 * 1024)
            if not chunk:
                break
            if len(chunk) % 4:
                p.kill()
                raise ValueError(f'{path}: incomplete PCM sample')
            samples = np.frombuffer(chunk, dtype='<f4')
            finite = samples[np.isfinite(samples)].astype(np.float64)
            count += samples.size
            bad += samples.size - finite.size
            if finite.size:
                peak = max(peak, float(np.max(np.abs(finite))))
                clipped += int(np.count_nonzero(np.abs(finite) >= 1.0))
                total += float(np.dot(finite, finite))
        p.stdout.close()
        code = p.wait()
        errors.seek(0)
        diagnostics = errors.read().decode(errors='replace')
    if code or diagnostics.strip():
        raise ValueError(f'{path}: full decode failed: {diagnostics[-2000:]}')
    if count != seconds * 48000 * 2 or bad:
        raise ValueError(f'{path}: decoded {count} samples, nonfinite={bad}; expected {seconds * 48000 * 2}')
    return {'full_decode': 'passed', 'interleaved_samples': count, 'nonfinite_samples': bad,
            'samples_at_or_above_full_scale': clipped, 'peak_absolute': round(peak, 8),
            'rms': round(math.sqrt(total / count), 8)}


def sample_frame(path: Path, second: int) -> np.ndarray:
    result = run(['ffmpeg', '-v', 'error', '-ss', str(second), '-i', str(path),
                  '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'])
    frame = cv2.imdecode(np.frombuffer(result.stdout, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None or frame.shape[:2] != (720, 1280):
        raise ValueError(f'{path}: could not decode frame at {second} s')
    return frame


def label(img: np.ndarray, value: str, x: int, y: int, scale: float = .55) -> None:
    cv2.putText(img, value, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (238, 240, 242),
                1, cv2.LINE_AA)


def images(frames: list[list[np.ndarray]], destination: Path) -> list[dict]:
    cell_w, cell_h, caption = 384, 216, 37
    sheet = np.full((7 * (cell_h + caption), 3 * cell_w, 3), (20, 20, 20), np.uint8)
    poster = np.full((2 * (236 + caption), 4 * 420, 3), (20, 20, 20), np.uint8)
    metrics = []
    for row, ((_, title), pictures) in enumerate(zip(ITEMS, frames)):
        sample_stats = []
        for col, (second, frame) in enumerate(zip(TIMES, pictures)):
            y, x = row * (cell_h + caption), col * cell_w
            sheet[y:y + cell_h, x:x + cell_w] = cv2.resize(frame, (cell_w, cell_h), interpolation=cv2.INTER_AREA)
            label(sheet, f'{title}  |  {second // 60:02d}:{second % 60:02d}', x + 9, y + cell_h + 24)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            sample_stats.append({'second': second, 'mean_luma_8bit': round(float(gray.mean()), 2),
                                 'luma_p05_8bit': int(np.percentile(gray, 5)),
                                 'luma_p95_8bit': int(np.percentile(gray, 95))})
        py, px = (row // 4) * (236 + caption), (row % 4) * 420
        poster[py:py + 236, px:px + 420] = cv2.resize(pictures[1], (420, 236), interpolation=cv2.INTER_AREA)
        label(poster, title + '  |  01:30', px + 10, py + 260)
        metrics.append(sample_stats)
    for name, data in [('contact-sheet.jpg', sheet), ('poster.jpg', poster)]:
        if not cv2.imwrite(str(destination / name), data, [cv2.IMWRITE_JPEG_QUALITY, 94]):
            raise RuntimeError(f'could not write {name}')
    return metrics


def montage(paths: list[Path], dest: Path, tmp: Path) -> None:
    cmd = ['ffmpeg', '-v', 'error', '-xerror', '-y']
    for path in paths:
        cmd += ['-ss', '72', '-t', '10', '-i', str(path)]
    for index, (_, title) in enumerate(ITEMS):
        overlay = np.zeros((60, 520, 4), np.uint8)
        cv2.rectangle(overlay, (0, 0), (519, 59), (0, 0, 0, 115), -1)
        cv2.putText(overlay, title, (15, 39), cv2.FONT_HERSHEY_SIMPLEX, .85,
                    (255, 255, 255, 230), 2, cv2.LINE_AA)
        png = tmp / f'title-{index}.png'
        if not cv2.imwrite(str(png), overlay):
            raise RuntimeError(f'could not create {png}')
        cmd += ['-loop', '1', '-framerate', '24', '-i', str(png)]
    filters = []
    for i in range(7):
        filters += [f'[{i}:v]setpts=PTS-STARTPTS[v{i}]',
                    f'[{7+i}:v]format=rgba[title{i}]',
                    f'[v{i}][title{i}]overlay=28:H-h-28:shortest=1:format=auto,format=yuv420p[vo{i}]',
                    f'[{i}:a]asetpts=PTS-STARTPTS[a{i}]']
    filters.append(''.join(f'[vo{i}][a{i}]' for i in range(7)) + 'concat=n=7:v=1:a=1[outv][outa]')
    cmd += ['-filter_complex', ';'.join(filters), '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
            '-r', '24', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
            '-movflags', '+faststart', str(dest)]
    run(cmd)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('runs/dp-sts-visual-storm-v01'), help='seven-render folder')
    parser.add_argument('--out', type=Path, help='delivery folder (default: ROOT/delivery)')
    parser.add_argument('--overwrite', action='store_true', help='replace existing delivery products after all checks succeed')
    args = parser.parse_args()
    root = args.root.resolve()
    out = (args.out or root / 'delivery').resolve()
    try:
        paths = [root / item / 'artwork.mp4' for item, _ in ITEMS]
        required = [root / item / name for item, _ in ITEMS
                    for name in ('artwork.mp4', 'audio.wav', 'audio-features.json', 'render.json')]
        missing = [str(path) for path in required if not path.is_file()]
        if missing:
            raise ValueError('missing required inputs:\n' + '\n'.join(missing))
        existing = [str(out / name) for name in PRODUCTS if (out / name).exists()]
        if existing and not args.overwrite:
            raise ValueError('delivery products already exist; select --out or use --overwrite:\n' + '\n'.join(existing))
        records = []
        all_frames = []
        for (item, title), path in zip(ITEMS, paths):
            print(f'Checking {title}...', flush=True)
            folder = root / item
            features = json.loads((folder / 'audio-features.json').read_text())
            rendering = json.loads((folder / 'render.json').read_text())
            wav_hash = sha256(folder / 'audio.wav')
            if features.get('wav_sha256') != wav_hash or rendering.get('audioSha256') != wav_hash:
                raise ValueError(f'{item}: audio hash differs between WAV, features, and render metadata')
            if rendering.get('sourceAudio') != features.get('sourceAudio'):
                raise ValueError(f'{item}: render and feature sourceAudio differ')
            if rendering.get('errors') != []:
                raise ValueError(f'{item}: render metadata has errors or does not report them')
            if (features.get('duration'), features.get('fps'), len(features.get('frames', []))) != (180, 24, 4320):
                raise ValueError(f'{item}: feature controls are not 180 s / 24 fps / 4320 frames')
            values = np.asarray(features['frames'], dtype=float)
            if values.shape != (4320, 4) or not np.isfinite(values).all():
                raise ValueError(f'{item}: invalid feature data')
            source_start = features.get('sourceStart')
            if not isinstance(source_start, (float, int)) or not math.isfinite(source_start) or source_start < 0:
                raise ValueError(f'{item}: invalid source start')
            info = inspect_video(path, 180, 4320)
            info['audio'] = decode_and_measure(path, 180)
            record = {'id': item, 'title': title, 'file': os.path.relpath(path, out),
                      'sha256': sha256(path), 'source_audio': features.get('sourceAudio'),
                      'source_start_seconds': source_start, 'wav_sha256': wav_hash,
                      'audio_features_sha256': sha256(folder / 'audio-features.json'),
                      'render_metadata_sha256': sha256(folder / 'render.json'), **info}
            records.append(record)
            all_frames.append([sample_frame(path, s) for s in TIMES])
        out.mkdir(parents=True, exist_ok=True)
        # Temporary siblings allow finished files to be moved into place only after validation.
        with tempfile.TemporaryDirectory(prefix='.storm-delivery-', dir=out) as name:
            temp = Path(name)
            stats = images(all_frames, temp)
            for record, item_stats in zip(records, stats):
                record['video_samples'] = item_stats
            print('Rendering 70-second comparison...', flush=True)
            montage(paths, temp / 'comparison.mp4', temp)
            comparison = inspect_video(temp / 'comparison.mp4', 70, 1680)
            comparison['audio'] = decode_and_measure(temp / 'comparison.mp4', 70)
            comparison['sha256'] = sha256(temp / 'comparison.mp4')
            comparison['excerpt_seconds'] = [72, 82]
            evidence = {'status': 'passed', 'items': records, 'comparison': comparison,
                        'sampling_times_seconds': list(TIMES),
                        'limitations': ['Frame luminance measurements describe only three decoded frames per work.',
                                        'Audio measurements describe decoded MP4 audio; full-scale samples are reported, not a subjective quality verdict.',
                                        'Hash linkage verifies metadata and WAV identity, not perceptual synchronization or the source recording itself.']}
            (temp / 'delivery.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n')
            links = '\n'.join(f'- [{r["title"]}]({r["file"]})' for r in records)
            (temp / 'README.md').write_text('# Organic Storm delivery\n\n'
                + links + '\n\n'
                + '- [Comparison: 70 seconds](comparison.mp4) — 10 seconds per work, from 01:12 to 01:22.\n'
                + '- [Contact sheet: 00:15, 01:30, 02:45](contact-sheet.jpg)\n'
                + '- [Poster: 01:30](poster.jpg)\n'
                + '- [Technical evidence](delivery.json)\n\n'
                + 'Each original passed full decoding and was checked for 180 seconds, 1280 × 720, '
                + '24 fps, 4320 decoded frames, and 48 kHz stereo. The comparison was also fully decoded. '
                + 'The WAV hash matches its control data and render metadata; this is metadata linkage, '
                + 'not proof of perceptual sync. Measurements of image luminance cover three sampled frames only. '
                + 'Audio peak, RMS, non-finite and full-scale sample counts describe decoded audio; '
                + 'they are not judgments of artistic quality.\n')
            for product in PRODUCTS:
                os.replace(temp / product, out / product)
        print(f'Delivery complete: {out}', flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
