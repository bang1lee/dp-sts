"""Validate finished media using OpenCV, PCM samples and FFprobe."""

import hashlib
import json
import math
import subprocess
import wave
from pathlib import Path

import cv2
import numpy as np


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def verify(directory: Path, audio_only: bool = False) -> dict:
    composition = json.loads((directory / "composition.json").read_text())
    report = json.loads((directory / "render.json").read_text())
    require(
        report["composition"] == composition, "Composition differs from render record"
    )
    for key, name in [("audio", "audio.wav")] + (
        [] if audio_only else [("video", "film.mp4")]
    ):
        actual = hashlib.sha256((directory / name).read_bytes()).hexdigest()
        require(
            actual == report["artifacts"][key], f"Artifact checksum mismatch: {name}"
        )
    duration = composition["durationSeconds"]
    rate = composition["audio"]["sampleRate"]
    with wave.open(str(directory / "audio.wav"), "rb") as audio:
        require(audio.getnchannels() == 2, "Expected stereo audio")
        require(audio.getsampwidth() == 2, "Expected PCM16 audio")
        require(audio.getframerate() == rate, "Wrong sample rate")
        require(
            audio.getnframes() == math.floor(duration * rate + 0.5),
            "Wrong audio duration",
        )
        samples = (
            np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(
                np.float64
            )
            / 32768
        )
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples**2)))
    require(0.00001 < peak <= 0.951, "Silent or clipped audio")
    result = {
        "pass": True,
        "audio": {"seconds": duration, "sample_rate": rate, "peak": peak, "rms": rms},
        "opencv": cv2.__version__,
    }
    if audio_only:
        return result
    frame_hashes = json.loads((directory / "frames.sha256.json").read_text())
    expected_frames = round(duration * composition["render"]["fps"])
    require(
        isinstance(frame_hashes, list) and len(frame_hashes) == expected_frames,
        "Frame evidence count mismatch",
    )
    frame_digest = hashlib.sha256(
        json.dumps(frame_hashes, separators=(",", ":")).encode()
    ).hexdigest()
    require(
        frame_digest == report["artifacts"]["frames"],
        "Frame evidence checksum mismatch",
    )
    video_path = directory / "film.mp4"
    settings = composition["render"]
    capture = cv2.VideoCapture(str(video_path))
    require(capture.isOpened(), "Cannot decode video")
    count, motion, spatial = 0, 0.0, 0.0
    previous = None
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            require(
                frame.shape[:2] == (settings["height"], settings["width"]),
                "Wrong video dimensions",
            )
            gray = cv2.cvtColor(
                cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY
            ).astype(np.float32)
            spatial = max(spatial, float(np.std(gray)))
            if previous is not None:
                motion = max(motion, float(np.mean(np.abs(gray - previous))))
            previous = gray
            count += 1
    finally:
        capture.release()
    require(
        count == round(duration * settings["fps"]),
        f"Wrong decoded frame count: {count}",
    )
    require(spatial > 3, f"Blank/flat frames: {spatial}")
    # Motion is reported, not gated: valid static/subpixel experiments are allowed.
    probe = json.loads(
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        ).stdout
    )
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    audio = next(s for s in probe["streams"] if s["codec_type"] == "audio")
    require(
        video["codec_name"] == "h264" and audio["codec_name"] == "aac", "Wrong codecs"
    )
    tolerance = 1 / settings["fps"]
    for stream in (video, audio):
        require(
            abs(float(stream["duration"]) - duration) <= tolerance,
            "Audio/video duration mismatch",
        )
        require(
            abs(float(stream.get("start_time", 0))) <= tolerance,
            "Audio/video start offset",
        )
    result["video"] = {
        "frames": count,
        "width": settings["width"],
        "height": settings["height"],
        "fps": settings["fps"],
        "maximum_frame_change": motion,
        "spatial_std": spatial,
        "video_seconds": float(video["duration"]),
        "audio_seconds": float(audio["duration"]),
    }
    return result
