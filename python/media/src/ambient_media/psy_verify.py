"""Full-delivery audit for the psytrance artwork; artistic approval stays separate."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np


def probe(path):
    return json.loads(
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    )


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument("--visual-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    info = probe(args.video)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
    fps = float(eval_ratio(video["avg_frame_rate"]))
    duration = float(info["format"]["duration"])
    if abs(duration - 600) > 0.1 or abs(fps - 30) > 0.001:
        raise RuntimeError("Delivery must be 600 seconds at 30fps")
    if audio["channels"] != 2:
        raise RuntimeError("Stereo delivery required")
    cap = cv2.VideoCapture(str(args.video))
    expected = round(duration * fps)
    metrics, contacts = [], []
    previous = None
    maximum_color_error = 0
    sample_indices = {round(t * fps) for t in np.linspace(3, 597, 24)}
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, (320, 180), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        error = np.ptp(small.astype(np.int16), axis=2).max()
        maximum_color_error = max(maximum_color_error, int(error))
        change = 0 if previous is None else float(np.mean(np.abs(gray - previous)))
        metrics.append(
            {
                "t": idx / fps,
                "luma": float(gray.mean()),
                "white_fraction": float(np.mean(gray > 0.85)),
                "motion": change,
                "lit_fraction": float(np.mean(gray > 0.1)),
            }
        )
        if idx in sample_indices:
            tile = cv2.resize(frame, (480, 270), interpolation=cv2.INTER_AREA)
            border = cv2.copyMakeBorder(tile, 0, 28, 0, 0, cv2.BORDER_CONSTANT)
            cv2.putText(
                border,
                f"{idx / fps:07.2f}s",
                (12, 290),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (210, 210, 210),
                1,
                cv2.LINE_AA,
            )
            contacts.append(border)
        previous = gray
        idx += 1
        if idx % 1800 == 0:
            print(f"Decoded {idx}/{expected}", flush=True)
    cap.release()
    if idx != expected:
        raise RuntimeError(f"Decoded {idx}, expected {expected}")
    if maximum_color_error > 3:
        raise RuntimeError(f"Not monochrome: channel difference {maximum_color_error}")
    if len(contacts) == 24:
        sheet = np.vstack([np.hstack(contacts[i : i + 4]) for i in range(0, 24, 4)])
        cv2.imwrite(str(args.output / "full-timeline.jpg"), sheet)
    (args.output / "video-metrics.json").write_text(json.dumps(metrics))
    # Decode the actual muxed audio; do not substitute the source WAV in this check.
    pcm = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(args.video),
            "-vn",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-f",
            "f32le",
            "pipe:1",
        ],
        check=True,
        capture_output=True,
    ).stdout
    signal = np.frombuffer(pcm, dtype="<f4").reshape(-1, 2)
    if abs(len(signal) / 48000 - duration) > 0.1 or not np.all(np.isfinite(signal)):
        raise RuntimeError("Invalid decoded audio duration or nonfinite samples")
    peak = float(np.max(np.abs(signal)))
    if peak > 1.001:
        raise RuntimeError(f"Decoded audio exceeds full scale: {peak}")
    sec = signal[: 600 * 48000].reshape(600, 48000, 2)
    rms = np.sqrt(np.mean(sec * sec, axis=(1, 2)))
    if np.any(rms[10:-10] < 1e-5):
        raise RuntimeError("Unexpected interior silent second")
    loudness = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(args.video),
            "-vn",
            "-af",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    (args.output / "loudness.txt").write_text(loudness.stderr)
    features = json.loads((args.audio_dir / "features.json").read_text())
    if len(features["frames"]) != expected or features["fps"] != 30:
        raise RuntimeError("Audio feature length does not match every video frame")
    # Independently compare encoded delivery energy with the renderer's input.
    blocks = signal[: expected * 1600].reshape(expected, 1600, 2)
    frame_rms = np.sqrt(np.mean(blocks * blocks, axis=(1, 2)))
    normalized_rms = np.clip(frame_rms / np.percentile(frame_rms, 98), 0, 1)
    recorded_rms = np.array([f["rms"] for f in features["frames"]])
    rms_correlation = float(np.corrcoef(normalized_rms, recorded_rms)[0, 1])
    if rms_correlation < 0.995:
        raise RuntimeError(
            f"Delivery energy diverges from visual input: {rms_correlation}"
        )
    render = json.loads((args.visual_dir / "render.json").read_text())
    feature_hash = digest(args.audio_dir / "features.json")
    if render["feature_sha256"] != feature_hash:
        raise RuntimeError("Renderer used different audio features")
    if render["source_sha256"] != digest(args.visual_dir / "source.py"):
        raise RuntimeError("Renderer source snapshot does not match its report")
    telemetry = json.loads((args.visual_dir / "telemetry.json").read_text())
    if len(telemetry) != expected:
        raise RuntimeError("Renderer telemetry does not cover the full delivery")
    for i, row in enumerate(telemetry):
        if abs(row["time"] - i / fps) > 1e-5:
            raise RuntimeError(f"Visual clock discontinuity at frame {i}")
    report = {
        "pass": True,
        "duration": duration,
        "decoded_frames": idx,
        "dimensions": [video["width"], video["height"]],
        "fps": fps,
        "max_rgb_channel_difference": maximum_color_error,
        "audio_channels": audio["channels"],
        "decoded_audio_peak": peak,
        "decoded_audio_rms_by_second": rms.tolist(),
        "max_frame_mean_luminance_jump": float(
            np.max(np.abs(np.diff([m["luma"] for m in metrics])))
        ),
        "max_white_area_fraction": max(m["white_fraction"] for m in metrics),
        "feature_count": len(features["frames"]),
        "encoded_audio_feature_rms_correlation": rms_correlation,
        "render_feature_sha256": feature_hash,
        "render_source_sha256": render["source_sha256"],
        "video_sha256": digest(args.video),
        "scope": "Full decode, timing, grayscale, audible-signal and level checks. Does not establish artistic quality or certify photosensitivity safety.",
    }
    (args.output / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {k: v for k, v in report.items() if k != "decoded_audio_rms_by_second"},
            indent=2,
        )
    )


def eval_ratio(text):
    numerator, denominator = text.split("/")
    return float(numerator) / float(denominator)


if __name__ == "__main__":
    main()
