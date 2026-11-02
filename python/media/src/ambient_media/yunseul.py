"""Offline, procedural 3D ocean-glint study. No generated-image inputs.

Nx invokes this module through uv. NumPy provides geometry, perspective,
wave normals and stereo surf synthesis; OpenCV splats/composites the frames.
"""

import argparse
import hashlib
import json
import math
import subprocess
import time
import wave
from pathlib import Path

import cv2
import numpy as np


def validate(c):
    bounds = {
        "duration": (1, 60),
        "width": (320, 1920),
        "height": (180, 1080),
        "fps": (12, 60),
        "seed": (0, 2**31 - 1),
        "density": (0, 1),
        "glint_amount": (0, 1),
        "glint_rate": (0.01, 1),
        "flow_speed": (0.05, 2),
        "wave_period": (2, 20),
        "audio_latency": (0, 3),
        "audio_sync": (0, 1),
        "camera_travel": (0, 5),
    }
    if set(c) != set(bounds):
        raise ValueError(f"Expected keys: {sorted(bounds)}")
    for key, (low, high) in bounds.items():
        value = c[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError(f"{key} must be numeric")
        if not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f"{key} must be within {low}..{high}")
    for key in ("width", "height", "fps", "seed"):
        if int(c[key]) != c[key]:
            raise ValueError(f"{key} must be an integer")
    if c["width"] % 2 or c["height"] % 2:
        raise ValueError("Video dimensions must be even")
    if abs(c["duration"] * c["fps"] - round(c["duration"] * c["fps"])) > 1e-6:
        raise ValueError("duration times fps must be an integer")
    return c


def normalize(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-8)


def swell(t, period):
    """Shared smooth wave-arrival envelope, used by picture and sound."""
    return (0.5 + 0.5 * np.sin(2 * np.pi * t / period - 0.7)) ** 2


def water(x, z, t, speed, detail=True):
    """A nested wave spectrum and its analytic slopes; stable world coordinates."""
    height = np.zeros_like(x)
    dx = np.zeros_like(x)
    dz = np.zeros_like(x)
    terms = [(0.14, 0.78, 0.35), (0.065, 1.63, -0.56), (0.024, 4.7, 0.8)]
    if detail:
        terms += [(0.009, 12.1, -0.31), (0.004, 29.3, 0.63), (0.0016, 63.2, -1.1)]
    for i, (amplitude, k, angle) in enumerate(terms):
        kx, kz = math.sin(angle) * k, math.cos(angle) * k
        phase = (
            x * kx
            + z * kz
            - t * speed * math.sqrt(9.81 * k) / (1 + 0.08 * k)
            + i * 1.71
        )
        height += amplitude * np.sin(phase)
        derivative = amplitude * np.cos(phase)
        dx += derivative * kx
        dz += derivative * kz
    return height, dx, dz


def camera(t, c):
    u = t / c["duration"]
    eye = np.array(
        [1.9 - c["camera_travel"] * u, 2.15 + 0.11 * math.sin(u * 2), 7.6 - 0.75 * u],
        dtype=np.float32,
    )
    target = np.array([-0.8 + 0.65 * u, 1.6, -7.5], dtype=np.float32)
    forward = normalize(target - eye)
    right = normalize(np.cross(forward, [0.0, 1.0, 0.0]))
    up = np.cross(right, forward)
    return eye, right, up, forward


class Scene:
    def __init__(self, c):
        self.c = c
        self.w, self.h = c["width"], c["height"]
        self.focal = self.h * 1.08
        self.sun = normalize(np.array([-0.34, 0.58, -0.74], dtype=np.float32))
        # Fixed populations: changing density reveals a subset, not new random positions.
        rng = np.random.default_rng(c["seed"])
        centers = [
            (-0.3, 2.25, 2.0),
            (2.7, 1.1, -0.8),
            (-0.3, 3.8, -3.1),
            (-4.7, 0.9, -6.0),
            (3.6, 3.1, -7.0),
            (-1.5, 1.4, -10.5),
            (1.7, 4.7, -11.0),
            (-5.6, 4.1, -13.5),
            (5.2, 0.7, -15.0),
            (-0.1, 2.8, -17.0),
            (3.4, 3.5, -20.0),
            (-4.2, 1.7, -21.0),
        ]
        self.patches = []
        for i, center in enumerate(centers):
            u, v = np.meshgrid(np.linspace(-1, 1, 200), np.linspace(-1, 1, 168))
            u, v = u.ravel().astype(np.float32), v.ravel().astype(np.float32)
            u += rng.uniform(-0.004, 0.004, u.shape).astype(np.float32)
            v += rng.uniform(-0.004, 0.004, v.shape).astype(np.float32)
            radius = np.sqrt(u * u + v * v)
            angle = np.arctan2(v, u)
            edge = 0.90 + 0.06 * np.sin(angle * 5 + i) + 0.035 * np.sin(angle * 11)
            keep = (radius < edge) & (rng.random(u.shape) < c["density"])
            u, v, radius = u[keep], v[keep], radius[keep]
            scale = 2.1 + 0.33 * (i % 3)
            self.patches.append(
                {
                    "center": np.array(center, dtype=np.float32),
                    "u": u * scale,
                    "v": v * scale * 0.80,
                    "edge": np.clip((0.96 - radius) * 5, 0, 1),
                    "phase": rng.uniform(0, 2 * np.pi, len(u)).astype(np.float32),
                    "tilt": -0.42 + 0.16 * (i % 5),
                    "id": i,
                }
            )
        # Background ray evaluation at half size; highlights separately sampled at full size.
        self.bw, self.bh = self.w // 2, self.h // 2
        xx, yy = np.meshgrid(np.arange(self.bw), np.arange(self.bh))
        self.rx = ((xx + 0.5) / self.bw - 0.5).astype(np.float32) * self.w / self.focal
        self.ry = (0.5 - (yy + 0.5) / self.bh).astype(np.float32) * self.h / self.focal

    def background(self, t, basis):
        eye, right, up, forward = basis
        rays = normalize(forward + self.rx[..., None] * right + self.ry[..., None] * up)
        y = rays[..., 1]
        horizon = np.exp(-np.abs(y) * 10)
        sky = np.zeros((*y.shape, 3), dtype=np.float32)
        sky[:] = [0.075, 0.15, 0.20]
        sky += horizon[..., None] * np.array([0.14, 0.145, 0.13])
        sunlight = np.clip(rays @ self.sun, 0, 1)
        sky += sunlight[..., None] ** 16 * np.array([0.19, 0.155, 0.095])
        sea = y < -0.012
        distance = -eye[1] / np.minimum(y, -0.012)
        distance = np.minimum(distance, 190)
        for _ in range(3):
            p = eye + rays * distance[..., None]
            h, _, _ = water(p[..., 0], p[..., 2], t, self.c["flow_speed"], False)
            distance = np.clip((h - eye[1]) / np.minimum(y, -0.012), 1, 190)
        p = eye + rays * distance[..., None]
        h, dx, dz = water(p[..., 0], p[..., 2], t, self.c["flow_speed"], False)
        normal = normalize(np.stack([-dx, np.ones_like(dx), -dz], axis=-1))
        view = -rays
        half = normalize(view + self.sun)
        spec = np.clip(np.sum(normal * half, axis=-1), 0, 1)
        fresnel = (
            0.035 + 0.65 * (1 - np.clip(np.sum(normal * view, axis=-1), 0, 1)) ** 4
        )
        base = np.zeros_like(sky) + np.array([0.013, 0.075, 0.095])
        base += fresnel[..., None] * np.array([0.10, 0.18, 0.20])
        base += (h[..., None] + 0.25) * np.array([0.025, 0.055, 0.06])
        base += (spec**50)[..., None] * np.array([0.75, 0.58, 0.31]) * 0.35
        # Wet sand visible only close to the observer, never a hard rectangular floor.
        sand = np.clip((p[..., 2] - 4.4) / 3.2, 0, 0.7)[..., None]
        base = base * (1 - sand) + np.array([0.15, 0.12, 0.075]) * sand
        mist = (1 - np.exp(-distance * 0.022))[..., None]
        base = base * (1 - mist) + np.array([0.20, 0.245, 0.255]) * mist
        sky[sea] = base[sea]
        return cv2.resize(sky, (self.w, self.h), interpolation=cv2.INTER_CUBIC)

    def particles(self, t, basis):
        c = self.c
        eye, right, up, forward = basis
        positions, colors = [], []
        bright_total = 0
        for patch in self.patches:
            i = patch["id"]
            u, v = patch["u"], patch["v"]
            center = patch["center"].copy()
            center[0] += 0.10 * math.sin(t * 0.32 + i * 0.7)
            center[1] += 0.09 * math.sin(t * 0.5 + i * 0.33)
            # Shared world wave propagation couples neighboring patches without graph edges.
            x, z = center[0] + u, center[2] + v
            h, dx, dz = water(x, z, t, c["flow_speed"])
            curve = 0.10 * (u * u - 0.5 * v * v)
            py = center[1] + h + patch["tilt"] * v + curve
            p = np.stack([x, py, z], axis=-1)
            n = normalize(
                np.stack(
                    [-dx - 0.20 * u, np.ones_like(dx), -dz - patch["tilt"] + 0.10 * v],
                    axis=-1,
                )
            )
            view = normalize(eye - p)
            half = normalize(view + self.sun)
            reflect = np.abs(np.sum(n * half, axis=-1))
            # Fixed local microstructure, no independently flickering random values per frame.
            orientation = 0.5 + 0.5 * np.cos(u * 31 + v * 17 + 0.7 * np.sin(v * 43))
            reflect = np.clip(reflect - 0.025 * orientation, 0, 1)
            glint = reflect ** (70 - c["glint_amount"] * 30)
            # Smooth, slow eligibility envelopes: glint_rate is not an exact count of events.
            eligibility = (
                0.5 + 0.5 * np.sin(2 * np.pi * c["glint_rate"] * t + i * 0.8)
            ) ** 2
            tide = swell(t - (center[2] + 10) * 0.035, c["wave_period"])
            glint *= (
                (0.35 + 0.65 * eligibility)
                * (0.72 + 0.28 * tide)
                * c["glint_amount"]
                * 9
            )
            bright_total += int(np.count_nonzero(glint > 0.15))
            ridge = (
                0.5 + 0.5 * np.sin(u * 6.5 + v * 12 - t * c["flow_speed"] * 2)
            ) ** 7
            base = (0.025 + 0.11 * ridge)[:, None] * np.array([0.35, 0.71, 0.79])
            color = base + glint[:, None] * np.array([1.0, 0.79, 0.44])
            color *= patch["edge"][:, None]
            color *= np.exp(-np.linalg.norm(p - eye, axis=1) * 0.034)[:, None]
            positions.append(p)
            colors.append(color)
        p = np.concatenate(positions)
        color = np.concatenate(colors)
        relative = p - eye
        depth = relative @ forward
        px = self.w * 0.5 + (relative @ right) * self.focal / np.maximum(depth, 0.1)
        py = self.h * 0.5 - (relative @ up) * self.focal / np.maximum(depth, 0.1)
        visible = (
            (depth > 0.5)
            & (px >= 1)
            & (px < self.w - 2)
            & (py >= 1)
            & (py < self.h - 2)
        )
        px, py, color = px[visible], py[visible], color[visible]
        # Bilinear point splatting provides subpixel continuity under camera motion.
        ix, iy = px.astype(np.int32), py.astype(np.int32)
        fx, fy = px - ix, py - iy
        light = np.zeros((self.h * self.w, 3), dtype=np.float32)
        for ox, oy, weight in [
            (0, 0, (1 - fx) * (1 - fy)),
            (1, 0, fx * (1 - fy)),
            (0, 1, (1 - fx) * fy),
            (1, 1, fx * fy),
        ]:
            np.add.at(light, (iy + oy) * self.w + ix + ox, color * weight[:, None])
        light = light.reshape(self.h, self.w, 3)
        light = cv2.GaussianBlur(light, (0, 0), 0.55)
        light = np.minimum(light, 2.3)
        bloom = cv2.GaussianBlur(np.maximum(light - 0.20, 0), (0, 0), 2.2)
        return light + bloom * 0.22, bright_total

    def frame(self, t):
        basis = camera(t, self.c)
        background = self.background(t, basis)
        light, bright = self.particles(t, basis)
        linear = np.maximum(background + light * 1.55, 0)
        # Soft shoulder keeps highlights local and avoids white clipping.
        mapped = linear / (1 + linear)
        rgb = np.clip(mapped ** (1 / 2.2) * 255, 0, 255).astype(np.uint8)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), {
            "time": float(t),
            "camera": basis[0].tolist(),
            "bright_facets": bright,
            "wave_envelope": float(swell(t, self.c["wave_period"])),
            "audio_envelope": float(audio_envelope(np.array(t), self.c)),
        }


def audio_envelope(t, c):
    delayed = swell(t - c["audio_latency"], c["wave_period"])
    independent = swell(t * 0.83 + 1.3, c["wave_period"])
    return 0.14 + 0.86 * (
        c["audio_sync"] * delayed + (1 - c["audio_sync"]) * independent
    )


def surf_audio(c):
    """Synthetic filtered surf, not a field recording and not Strudel music."""
    rate = 48000
    count = round(c["duration"] * rate)
    rng = np.random.default_rng(c["seed"] + 500)
    t = np.arange(count) / rate
    f = np.fft.rfftfreq(count, 1 / rate)
    color = (np.maximum(f, 45) / 160) ** (-0.60)
    color *= (1 - np.exp(-((f / 65) ** 2))) * np.exp(-((f / 4200) ** 2))
    shared = np.fft.irfft(np.fft.rfft(rng.standard_normal(count)) * color, n=count)
    shared /= max(float(np.std(shared)), 1e-8)
    tracks = []
    for channel in range(2):
        noise = np.fft.irfft(np.fft.rfft(rng.standard_normal(count)) * color, n=count)
        noise /= max(float(np.std(noise)), 1e-8)
        # Stereo variation is a small texture difference, not alternating loudness jumps.
        texture = 0.70 * shared + 0.30 * noise
        env = audio_envelope(t - channel * 0.045, c)
        tracks.append(texture * (0.12 + 0.88 * env))
    stereo = np.stack(tracks, axis=-1)
    fade = np.minimum(np.clip(t / 0.5, 0, 1), np.clip((c["duration"] - t) / 0.65, 0, 1))
    stereo *= (np.sin(fade * np.pi / 2) ** 2)[:, None]
    stereo *= 0.42 / max(float(np.max(np.abs(stereo))), 1e-8)
    return rate, stereo


def write_audio(path, c):
    rate, samples = surf_audio(c)
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(np.round(samples * 32767).astype("<i2").tobytes())
    return {
        "sample_rate": rate,
        "samples": len(samples),
        "peak": float(np.max(np.abs(samples))),
        "rms": float(np.sqrt(np.mean(samples * samples))),
        "source": "procedural filtered stereo noise, no field recording or Strudel",
    }


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def review_board(out, c, frames):
    """Companion review sheet. Gauges are not burned into the artwork."""
    tiles = [cv2.resize(f, (640, 360)) for f in frames]
    board = np.full((560, 1920, 3), 235, dtype=np.uint8)
    for i, tile in enumerate(tiles):
        board[:360, i * 640 : (i + 1) * 640] = tile
        cv2.putText(
            board,
            f"{[0, 5, 9.9667][i]:.2f}s",
            (i * 640 + 20, 390),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (40, 40, 40),
            1,
            cv2.LINE_AA,
        )
    gauges = [
        ("DENSITY", c["density"]),
        ("GLINT AMOUNT", c["glint_amount"]),
        ("AUDIO SYNC", c["audio_sync"]),
    ]
    for i, (label, value) in enumerate(gauges):
        x = i * 640 + 20
        cv2.putText(
            board,
            f"{label} {value:.2f}",
            (x, 435),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (40, 40, 40),
            1,
            cv2.LINE_AA,
        )
        cv2.rectangle(board, (x, 450), (x + 560, 461), (205, 205, 205), -1)
        cv2.rectangle(board, (x, 450), (x + round(560 * value), 461), (85, 100, 95), -1)
    text = (
        f"Flow {c['flow_speed']:.2f} | Glint envelope {c['glint_rate']:.2f} cycles/s"
        f" | Wave {c['wave_period']:.1f}s | Audio lag {c['audio_latency']:.2f}s"
    )
    cv2.putText(
        board,
        text,
        (20, 510),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (40, 40, 40),
        1,
        cv2.LINE_AA,
    )
    cv2.imwrite(str(out / "review-board.jpg"), board)


def verify_movie(path, c):
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
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    )
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    audio = next(s for s in probe["streams"] if s["codec_type"] == "audio")
    expected = round(c["duration"] * c["fps"])
    if (video["width"], video["height"]) != (c["width"], c["height"]):
        raise RuntimeError("Wrong dimensions")
    if int(video["nb_frames"]) != expected or audio["channels"] != 2:
        raise RuntimeError("Wrong frame count or audio channels")
    if abs(float(probe["format"]["duration"]) - c["duration"]) > 0.05:
        raise RuntimeError("Wrong duration")
    cap = cv2.VideoCapture(str(path))
    means, differences, hashes = [], [], set()
    previous = None
    count = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, (160, 90)).astype(np.float32) / 255
        means.append(float(small.mean()))
        hashes.add(hashlib.sha256(frame.tobytes()).hexdigest())
        if previous is not None:
            differences.append(float(np.abs(small - previous).mean()))
        previous = small
        count += 1
    cap.release()
    if count != expected or len(hashes) < expected * 0.9:
        raise RuntimeError("Undecodable or unexpectedly repeated frames")
    return {
        "pass": True,
        "decoded_frames": count,
        "unique_frames": len(hashes),
        "duration": float(probe["format"]["duration"]),
        "dimensions": [video["width"], video["height"]],
        "fps": video["avg_frame_rate"],
        "audio_channels": audio["channels"],
        "mean_brightness_range": [min(means), max(means)],
        "max_adjacent_mean_brightness_change": float(np.max(np.abs(np.diff(means)))),
        "mean_adjacent_pixel_change": float(np.mean(differences)),
        "scope": "decode/duration/motion checks; not a clinical or flash-safety certification",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config", type=Path, default=Path("compositions/yunseul/sample.json")
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    c = validate(json.loads(args.config.read_text()))
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    save_json(out / "parameters.json", c)
    save_json(out / "status.json", {"state": "rendering"})
    started = time.monotonic()
    encoder = None
    try:
        scene = Scene(c)
        frames = []
        for t in (0, c["duration"] * 0.5, c["duration"] - 1 / c["fps"]):
            frame, _ = scene.frame(t)
            frames.append(frame)
            cv2.imwrite(str(out / f"still-{t:.2f}.png"), frame)
        review_board(out, c, frames)
        audio = write_audio(out / "audio.wav", c)
        if args.preview:
            save_json(
                out / "status.json",
                {"state": "preview", "elapsed": time.monotonic() - started},
            )
            print(f"Preview: {out}", flush=True)
            return
        args_ffmpeg = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{c['width']}x{c['height']}",
            "-r",
            str(c["fps"]),
            "-i",
            "pipe:0",
            "-i",
            str(out / "audio.wav"),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(out / "film.mp4"),
        ]
        telemetry = []
        with (out / "ffmpeg.log").open("wb") as log:
            encoder = subprocess.Popen(args_ffmpeg, stdin=subprocess.PIPE, stderr=log)
            for index in range(round(c["duration"] * c["fps"])):
                frame, state = scene.frame(index / c["fps"])
                encoder.stdin.write(frame.tobytes())
                telemetry.append(state)
                if index % c["fps"] == 0:
                    print(
                        f"Frame {index}/{round(c['duration'] * c['fps'])} "
                        f"({time.monotonic() - started:.1f}s)",
                        flush=True,
                    )
            encoder.stdin.close()
            if encoder.wait(timeout=60) != 0:
                raise RuntimeError((out / "ffmpeg.log").read_text())
        save_json(out / "telemetry.json", telemetry)
        verification = verify_movie(out / "film.mp4", c)
        save_json(out / "verification.json", verification)
        save_json(
            out / "render.json",
            {
                "parameters": c,
                "audio": audio,
                "elapsed": time.monotonic() - started,
                "numpy": np.__version__,
                "opencv": cv2.__version__,
                "source_sha256": hashlib.sha256(
                    Path(__file__).read_bytes()
                ).hexdigest(),
                "video_sha256": hashlib.sha256(
                    (out / "film.mp4").read_bytes()
                ).hexdigest(),
            },
        )
        save_json(out / "status.json", {"state": "complete"})
        print(f"Rendered and verified: {out}", flush=True)
    except BaseException as error:
        if encoder is not None and encoder.poll() is None:
            encoder.kill()
            encoder.wait()
        save_json(out / "status.json", {"state": "failed", "error": str(error)})
        raise


if __name__ == "__main__":
    main()
