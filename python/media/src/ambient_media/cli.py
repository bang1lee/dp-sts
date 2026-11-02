"""Ambient Lab media diagnostics and finished-render validation."""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

from ambient_media.verify import verify


def doctor() -> dict:
    tools = {name: shutil.which(name) for name in ("ffmpeg", "ffprobe")}
    missing = [name for name, path in tools.items() if path is None]
    if missing:
        raise RuntimeError("Missing required tools: " + ", ".join(missing))
    image = np.zeros((64, 64), dtype=np.uint8)
    image[16:48, 16:48] = 255
    edges = int(np.count_nonzero(cv2.Canny(image, 50, 100)))
    if edges == 0:
        raise RuntimeError("OpenCV edge processing failed")
    with tempfile.TemporaryDirectory(prefix="ambient-lab-") as directory:
        output = Path(directory) / "probe.mp4"
        subprocess.run(
            [
                tools["ffmpeg"],
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=320x180:r=24:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:duration=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                str(output),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        probe = json.loads(
            subprocess.run(
                [
                    tools["ffprobe"],
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=codec_name,codec_type:format=duration",
                    "-of",
                    "json",
                    str(output),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            ).stdout
        )
    codecs = {stream["codec_name"] for stream in probe["streams"]}
    if (
        not {"h264", "aac"}.issubset(codecs)
        or abs(float(probe["format"]["duration"]) - 1) > 0.1
    ):
        raise RuntimeError(
            "Encoded video did not match the expected codecs or duration"
        )
    return {
        "python": sys.version.split()[0],
        "opencv": cv2.__version__,
        "numpy": np.__version__,
        "edge_pixels": edges,
        "tools": tools,
        "encode": probe,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["doctor", "verify"])
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--audio-only", action="store_true")
    args = parser.parse_args()
    if args.command == "verify" and args.directory is None:
        parser.error("verify requires --directory")
    try:
        print(
            json.dumps(
                doctor()
                if args.command == "doctor"
                else verify(args.directory, args.audio_only),
                indent=2,
            )
        )
    except (
        AssertionError,
        RuntimeError,
        OSError,
        ValueError,
        subprocess.SubprocessError,
    ) as error:
        detail = (
            error.stderr
            if isinstance(error, subprocess.CalledProcessError)
            else str(error)
        )
        print(f"Media check failed: {detail}", file=sys.stderr)
        raise SystemExit(1) from error
