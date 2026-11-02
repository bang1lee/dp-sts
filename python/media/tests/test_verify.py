import hashlib
import json
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np
from ambient_media.verify import verify


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.composition = {"durationSeconds": 1, "audio": {"sampleRate": 48000}}
        (self.directory / "composition.json").write_text(json.dumps(self.composition))
        self.write_audio()

    def write_audio(self, silent=False, frames=48000):
        samples = (
            np.zeros(frames)
            if silent
            else np.sin(np.arange(frames) * 2 * np.pi * 220 / 48000) * 2000
        )
        with wave.open(str(self.directory / "audio.wav"), "wb") as audio:
            audio.setnchannels(2)
            audio.setsampwidth(2)
            audio.setframerate(self.composition["audio"]["sampleRate"])
            audio.writeframes(np.repeat(samples.astype("<i2"), 2).tobytes())
        report = {
            "composition": self.composition,
            "artifacts": {
                "audio": hashlib.sha256(
                    (self.directory / "audio.wav").read_bytes()
                ).hexdigest()
            },
        }
        (self.directory / "render.json").write_text(json.dumps(report))

    def test_valid_stereo_master(self):
        self.assertTrue(verify(self.directory, True)["pass"])

    def test_silence_rejected(self):
        self.write_audio(silent=True)
        with self.assertRaisesRegex(RuntimeError, "Silent"):
            verify(self.directory, True)

    def test_wrong_duration_rejected(self):
        self.write_audio(frames=24000)
        with self.assertRaisesRegex(RuntimeError, "duration"):
            verify(self.directory, True)

    def test_altered_audio_rejected(self):
        path = self.directory / "audio.wav"
        data = bytearray(path.read_bytes())
        data[100] ^= 1
        path.write_bytes(data)
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            verify(self.directory, True)

    def test_missing_audio_rejected(self):
        (self.directory / "audio.wav").unlink()
        with self.assertRaises(FileNotFoundError):
            verify(self.directory, True)

    def test_altered_composition_rejected(self):
        (self.directory / "composition.json").write_text("{}")
        with self.assertRaisesRegex(RuntimeError, "Composition differs"):
            verify(self.directory, True)

    def test_half_sample_duration_matches_browser_rounding(self):
        self.composition = {"durationSeconds": 1.125, "audio": {"sampleRate": 44100}}
        (self.directory / "composition.json").write_text(json.dumps(self.composition))
        self.write_audio(frames=49613)
        self.assertTrue(verify(self.directory, True)["pass"])

    def write_static_video(self):
        self.composition.update(
            {
                "render": {"width": 160, "height": 90, "fps": 24},
                "visual": {"speed": 0.000001, "reactivity": 0},
            }
        )
        (self.directory / "composition.json").write_text(json.dumps(self.composition))
        self.write_audio()
        video = self.directory / "film.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=160x90:r=24:d=1,drawbox=x=20:y=20:w=50:h=50:color=white:t=fill",
                "-i",
                str(self.directory / "audio.wav"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                str(video),
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        report_path = self.directory / "render.json"
        report = json.loads(report_path.read_text())
        report["artifacts"]["video"] = hashlib.sha256(video.read_bytes()).hexdigest()
        frames = ["0" * 64] * 24
        (self.directory / "frames.sha256.json").write_text(json.dumps(frames))
        report["artifacts"]["frames"] = hashlib.sha256(
            json.dumps(frames, separators=(",", ":")).encode()
        ).hexdigest()
        report_path.write_text(json.dumps(report))

    def test_subtle_motion_is_valid_even_when_encoded_frames_look_static(self):
        self.write_static_video()
        self.assertTrue(verify(self.directory)["pass"])

    def test_altered_frame_evidence_rejected(self):
        self.write_static_video()
        frames = ["1" * 64] * 24
        (self.directory / "frames.sha256.json").write_text(json.dumps(frames))
        with self.assertRaisesRegex(RuntimeError, "Frame evidence checksum"):
            verify(self.directory)

    def test_missing_frame_evidence_rejected(self):
        self.write_static_video()
        (self.directory / "frames.sha256.json").unlink()
        with self.assertRaises(FileNotFoundError):
            verify(self.directory)
