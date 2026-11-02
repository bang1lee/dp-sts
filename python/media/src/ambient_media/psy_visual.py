"""Monochrome recursive-point choreography for the 600-second psytrance score.

Geometry consists of actual iterated-function-system attractors and a sampled
Mandelbulb boundary. No stock/generated images, shader noise overlay or video loop.
"""

import argparse
import hashlib
import json
import math
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np

BPM = 144
FPS = 30
DURATION = 600
BARS = np.array([0, 16, 48, 80, 112, 144, 176, 208, 240, 272, 304, 336, 360])
STARTS = BARS * 5 / 3
NAMES = [
    "Threshold",
    "Ignition",
    "Lattice",
    "Bloom",
    "Mutation",
    "Suspension",
    "First Contact",
    "Helix Drive",
    "Ascension",
    "Event Horizon",
    "Transfiguration",
    "Dissolution",
]
# A motif returns in changed scale/perspective; transitions follow the score.
FAMILIES = [0, 0, 1, 2, 3, 0, 2, 4, 1, 0, 3, 0]


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def aperture_cue(t):
    """Rare held-breath/release gesture; abstract aperture, never facial anatomy."""
    inhale = 0.0
    release = 0.0
    for onset, strength in [(453.3333333333, 1.0), (506.6666666667, 0.62)]:
        inhale += strength * float(
            smooth((t - (onset - 2.5)) / 1.8) * (1 - smooth((t - onset) / 0.28))
        )
        release += strength * float(
            smooth((t - onset) / 0.12) * (1 - smooth((t - (onset + 0.35)) / 2.5))
        )
    return inhale, release


def normalized(p):
    p = np.asarray(p, dtype=np.float32)
    p -= p.mean(axis=0)
    p /= max(float(np.quantile(np.linalg.norm(p, axis=1), 0.98)), 1e-6)
    return p


def ifs_cloud(n, kind, rng):
    z = np.zeros(n, dtype=np.complex64)
    latent = rng.random(n).astype(np.float32)
    if kind == "flower":
        branches = 5
        for _ in range(16):
            i = rng.integers(0, branches, n)
            angle = i * 2 * np.pi / branches
            z = 0.39 * np.exp(1j * (angle * 0.23 + 0.22)) * z + 0.71 * np.exp(
                1j * angle
            )
        depth = 0.19 * np.sin(np.angle(z) * 5) * np.abs(z) + (latent - 0.5) * 0.035
    elif kind == "dragon":
        for _ in range(19):
            i = rng.integers(0, 2, n)
            z = np.where(i == 0, (0.5 + 0.5j) * z, (0.5 - 0.5j) * z + 0.5 + 0.5j)
        depth = 0.21 * np.sin(z.real * 8) * np.cos(z.imag * 6) + (latent - 0.5) * 0.04
    elif kind == "carpet":
        offsets = np.array([-1 - 1j, -1j, 1 - 1j, -1, 1, -1 + 1j, 1j, 1 + 1j])
        for _ in range(11):
            z = z / 3 + offsets[rng.integers(0, 8, n)] * 2 / 3
        depth = latent
    else:
        raise ValueError(kind)
    return np.stack([z.real, z.imag, depth], axis=1).astype(np.float32)


def bulb_escape(p):
    z = p.copy()
    escaped = np.zeros(len(p), dtype=bool)
    for _ in range(10):
        r = np.linalg.norm(z, axis=1)
        escaped |= r > 2
        r = np.minimum(np.maximum(r, 1e-7), 2)
        theta = np.arccos(np.clip(z[:, 2] / r, -1, 1)) * 8
        phi = np.arctan2(z[:, 1], z[:, 0]) * 8
        radius = r**8
        z = (
            np.stack(
                [
                    np.sin(theta) * np.cos(phi),
                    np.sin(theta) * np.sin(phi),
                    np.cos(theta),
                ],
                axis=1,
            )
            * radius[:, None]
            + p
        )
        z[escaped] = 2.5
    return escaped


def mandelbulb(n, rng):
    # Stratified directions, bisection of the outer boundary, exponent eight.
    i = np.arange(n, dtype=np.float32)
    y = 1 - 2 * (i + 0.5) / n
    a = i * np.float32(np.pi * (3 - math.sqrt(5)))
    r = np.sqrt(1 - y * y)
    direction = np.stack([r * np.cos(a), r * np.sin(a), y], axis=1)
    low = np.full(n, 0.35, dtype=np.float32)
    high = np.full(n, 1.55, dtype=np.float32)
    for _ in range(11):
        mid = (low + high) * 0.5
        outside = bulb_escape(direction * mid[:, None])
        high = np.where(outside, mid, high)
        low = np.where(outside, low, mid)
    p = direction * ((low + high) * 0.5)[:, None]
    p += rng.normal(0, 0.0005, p.shape).astype(np.float32)
    return normalized(p)


def build_clouds(n, seed=20261101):
    rng = np.random.default_rng(seed)
    bulb = mandelbulb(n, rng)
    carpet = ifs_cloud(n, "carpet", rng)
    u, v = carpet[:, 0], carpet[:, 1]
    theta, phi = u * np.pi, v * np.pi
    torus = np.stack(
        [
            (1 + 0.37 * np.cos(phi)) * np.cos(theta),
            (1 + 0.37 * np.cos(phi)) * np.sin(theta),
            0.37 * np.sin(phi),
        ],
        axis=1,
    )
    flower = ifs_cloud(n, "flower", rng)
    dragon = ifs_cloud(n, "dragon", rng)
    dragon = normalized(dragon)
    # A carpet folded around a rising spiral preserves its self-similar holes.
    theta = u * 2.7 * np.pi
    radius = 0.55 + 0.35 * v
    helix = np.stack([radius * np.cos(theta), u * 1.1, radius * np.sin(theta)], axis=1)
    return [bulb, normalized(torus), normalized(flower), dragon, normalized(helix)]


class Features:
    def __init__(self, directory, allow_fallback=False):
        path = directory / "features.json"
        self.actual = path.is_file()
        self.values = None
        self.digest = None
        if self.actual:
            source = path.read_bytes()
            self.digest = hashlib.sha256(source).hexdigest()
            data = json.loads(source)
            if data["fps"] != FPS or abs(data["duration"] - DURATION) > 0.001:
                raise ValueError("Expected 600s audio features at 30fps")
            if len(data["frames"]) != DURATION * FPS:
                raise ValueError("Expected 18000 audio feature records")
            self.values = np.array(
                [
                    [f[k] for k in ["rms", "bass", "mid", "treble", "kick"]]
                    for f in data["frames"]
                ],
                dtype=np.float32,
            )
            if not np.isfinite(self.values).all():
                raise ValueError("Invalid audio features")
            # Smooth spectral fields but preserve percussive transients separately.
            for column in range(4):
                self.values[:, column] = cv2.GaussianBlur(
                    self.values[:, column].reshape(-1, 1), (1, 9), 1.5
                ).ravel()
        elif not allow_fallback:
            raise FileNotFoundError(f"Actual audio features required: {path}")

    def at(self, t):
        if self.values is not None:
            return self.values[min(len(self.values) - 1, max(0, int(t * FPS)))]
        phase = (t * BPM / 60) % 1
        kick = math.exp(-phase * 15)
        return np.array([0.48, 0.5, 0.4, 0.35, kick], dtype=np.float32)


class Renderer:
    def __init__(self, features, width=1920, height=1080, points=65536):
        self.features = features
        self.width, self.height = width, height
        self.n = points
        self.clouds = build_clouds(points)
        rng = np.random.default_rng(1101)
        self.phase = rng.uniform(0, 2 * np.pi, points).astype(np.float32)
        self.priority = rng.random(points).astype(np.float32)
        self.identity = rng.random(points).astype(np.float32)
        self.buffer = np.zeros(width * height, dtype=np.float32)
        self.stats = []

    def state(self, t):
        index = min(11, int(np.searchsorted(STARTS, t, side="right") - 1))
        local = (t - STARTS[index]) / (STARTS[index + 1] - STARTS[index])
        beat = t * BPM / 60
        phrase = (beat / 32) % 1
        audio = self.features.at(t)
        return index, local, beat, phrase, audio

    def positions(self, t, index, local, audio):
        family = FAMILIES[index]
        p = self.clouds[family].copy()
        # Eight-beat transitions morph related point identities instead of hard cuts.
        if index > 0:
            weight = float(smooth((t - STARTS[index]) / 3.333333))
            p = self.clouds[FAMILIES[index - 1]] * (1 - weight) + p * weight
        elif t < 20:
            p *= 0.56 + 0.44 * float(smooth(t / 20))
        bass, mid, kick = float(audio[1]), float(audio[2]), float(audio[4])
        radius = np.linalg.norm(p, axis=1)
        # Keep local motion continuously phased and tied to the actual spectral envelope.
        turn = 0.18 * np.sin(t * 0.031) + 0.15 * local
        angle = t * 0.035 + turn + p[:, 1] * (0.17 + 0.20 * mid)
        if index in (3, 6, 10):
            angle += 0.12 * np.sin(radius * 8 - t * 0.15)
        elif index in (7, 8):
            angle += p[:, 1] * (0.35 + 0.28 * local)
        co, si = np.cos(angle), np.sin(angle)
        x, y = p[:, 0].copy(), p[:, 1].copy()
        p[:, 0] = x * co - y * si
        p[:, 1] = x * si + y * co
        # The beat moves a sparse subset more than the whole silhouette.
        accent = (self.identity > 0.84).astype(np.float32)
        p *= (1 + 0.025 * kick * accent + 0.018 * bass * np.sin(radius * 9 - t * 0.2))[
            :, None
        ]
        p[:, 2] += 0.03 * np.sin(p[:, 0] * 7 + t * 0.18) * mid
        if family in (0, 1, 4):
            tilt = 0.28 + 0.28 * math.sin(t * 0.012) + (0.25 if family == 1 else 0)
            if index == 9:
                tilt = 0.9 + 0.3 * local
        else:
            tilt = 0.12 * math.sin(t * 0.018)
        c, s = math.cos(tilt), math.sin(tilt)
        y, z = p[:, 1].copy(), p[:, 2].copy()
        p[:, 1], p[:, 2] = y * c - z * s, y * s + z * c
        return p

    def project(self, p, scale, center, angle=0):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        if angle:
            c, s = math.cos(angle), math.sin(angle)
            x, y = x * c - y * s, x * s + y * c
        perspective = 3.7 / (3.7 - z)
        px = center[0] + x * scale * perspective
        py = center[1] - y * scale * perspective
        return px, py, z

    def splat(self, px, py, values):
        good = (px >= 1) & (px < self.width - 2) & (py >= 1) & (py < self.height - 2)
        px, py, values = px[good], py[good], values[good]
        ix, iy = px.astype(np.int32), py.astype(np.int32)
        dx, dy = px - ix, py - iy
        # Bincount is deterministic and substantially faster than per-point drawing.
        for ox, oy, weight in [
            (0, 0, (1 - dx) * (1 - dy)),
            (1, 0, dx * (1 - dy)),
            (0, 1, (1 - dx) * dy),
            (1, 1, dx * dy),
        ]:
            self.buffer += np.bincount(
                (iy + oy) * self.width + ix + ox,
                weights=values * weight,
                minlength=self.width * self.height,
            ).astype(np.float32)

    def frame(self, t):
        index, local, _beat, _phrase, audio = self.state(t)
        p = self.positions(t, index, local, audio)
        rms, bass, mid, high, kick = map(float, audio)
        inhale, release = aperture_cue(t)

        def framing(section, progress):
            profiles = [
                0.68 + 0.22 * float(smooth(progress)),
                1 + 0.12 * math.sin(progress * np.pi),
                1.18 - 0.15 * progress,
                1.32 + 0.22 * math.sin(progress * np.pi),
                1.55 + 0.25 * progress,
                1.15 - 0.60 * float(smooth(progress)),
                1.60 + 0.25 * math.sin(progress * np.pi),
                1.5 + 0.30 * math.sin(progress * np.pi),
                1 + 0.25 * progress,
                2 + 0.5 * math.sin(progress * np.pi),
                2.35 + 0.45 * progress,
                0.9 - 0.50 * float(smooth(progress)),
            ]
            return profiles[section]

        amount = framing(index, local)
        if index:
            transition = float(smooth((t - STARTS[index]) / 3.333333))
            amount = framing(index - 1, 1) * (1 - transition) + amount * transition
        scale = self.height * 0.37 * amount
        scale *= 1 + 0.025 * bass
        scale *= 1 - 0.055 * inhale + 0.045 * release
        center = (
            self.width * (0.5 + 0.035 * math.sin(t * 0.009)),
            self.height * (0.5 + 0.025 * math.sin(t * 0.013)),
        )
        if index == 10:
            shift = float(smooth((t - STARTS[index]) / 3.333333))
            center = (
                center[0] - self.width * 0.16 * shift * math.sin(local * np.pi),
                center[1],
            )
        self.buffer.fill(0)
        px, py, z = self.project(p, scale, center)
        # A single off-center aperture widens through the existing fractal field.
        # No outlines, paired eye holes, labels or portrait texture are introduced.
        qx = (px - self.width * 0.47) / (self.height * 0.5)
        qy = (py - self.height * 0.49) / (self.height * 0.5)
        qr = np.sqrt(qx * qx + (qy * 1.16) ** 2)
        push = release * 0.13 * np.exp(-(((qr - 0.55) / 0.38) ** 2))
        px += qx * push * self.height * 0.5 * (1 + 0.15 * np.sin(qy * 3))
        py += qy * push * self.height * 0.5
        # Local twinkles slide continuously; actual treble controls their prominence.
        shimmer = (
            0.70 + 0.30 * np.sin(self.phase + t * 0.75 + 0.5 * high + p[:, 0] * 5) ** 2
        )
        light = 0.20 + 0.80 * np.clip((z + 1.2) / 2.2, 0, 1)
        dot = (0.09 + 0.91 * self.priority**2) * light * shimmer
        dot *= 0.55 + 0.35 * rms
        dot += (self.priority > 0.94) * kick * 0.17
        dot *= 1 + (self.priority > 0.88) * 0.65
        radial = np.maximum(np.linalg.norm(p, axis=1), 0.001)
        contour = (1 - np.abs(z) / radial) ** 6
        dot *= (0.8 + 1.25 * contour) * max(1, amount) ** 0.7
        aperture = 0.29 * inhale + 0.39 * release
        if aperture > 0.001:
            dot *= smooth((qr - aperture) / 0.10)
        if index == 0:
            dot *= 0.45 + 0.55 * float(smooth(local))
        elif index == 5:
            dot *= 0.72
        self.splat(px, py, dot)
        # Recursively echoed motifs supply different macro-compositions, not stock overlays.
        if index in (2, 7, 8):
            echo_count = 2
            echo_scale = scale * (0.21 + 0.025 * math.sin(t * 0.08))
            for k in range(echo_count):
                a = k * 2 * np.pi / echo_count + t * 0.009
                cx = self.width * 0.5 + math.cos(a) * self.width * 0.325
                cy = self.height * 0.5 + math.sin(a) * self.height * 0.30
                ex, ey, _ = self.project(p, echo_scale, (cx, cy), -a * 0.3)
                self.splat(ex[::16], ey[::16], dot[::16] * (0.32 + 0.10 * mid))
        field = self.buffer.reshape(self.height, self.width)
        # Small AA kernel preserves separated points; bloom only from rare bright clusters.
        point_sigma = 0.48 + 0.17 * max(0, amount - 1)
        field = cv2.GaussianBlur(field, (5, 5), point_sigma)
        # A larger, sparse highlight tier gives point sizes a hierarchy.
        bright = np.maximum(field - 0.34, 0)
        field = field + cv2.GaussianBlur(bright, (0, 0), 1.3) * 0.20
        exposure = 3.9 if index not in (0, 5, 11) else 3.6
        image = 1 - np.exp(-field * exposure)
        # No all-screen flashes/inversions. Opening and ending have slow black fades.
        fade = float(smooth(t / 7) * smooth((DURATION - t) / 13))
        image *= fade
        gray = np.clip(image * 255, 0, 255).astype(np.uint8)
        stats = {
            "time": t,
            "section": index,
            "family": FAMILIES[index],
            "rms": rms,
            "bass": bass,
            "treble": high,
            "kick": kick,
            "aperture_inhale": inhale,
            "aperture_release": release,
            "mean_luma": float(gray.mean() / 255),
            "white_fraction": float(np.mean(gray > 245)),
        }
        return gray, stats


def json_write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--points", type=int, default=65536)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--stills-only", action="store_true")
    parser.add_argument("--transition-stills", action="store_true")
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--duration", type=float, default=600)
    args = parser.parse_args()
    if args.width % 2 or args.height % 2 or args.width < 640 or args.height < 360:
        parser.error("Even dimensions at least 640x360 required")
    if args.start < 0 or args.duration <= 0 or args.start + args.duration > 600:
        parser.error("Requested interval must lie inside 0..600 seconds")
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    features = Features(
        args.audio_dir, args.preview or args.stills_only or args.transition_stills
    )
    json_write(
        out / "status.json", {"state": "rendering", "actual_audio": features.actual}
    )
    started = time.monotonic()
    renderer = Renderer(features, args.width, args.height, args.points)
    print(f"Fractal geometry ready after {time.monotonic() - started:.1f}s", flush=True)
    # Section samples are evidence, not the entire deliverable.
    times = [12, 50, 100, 160, 220, 270, 310, 370, 430, 480, 540, 590]
    if args.transition_stills:
        times = [
            293.0,
            293.333333,
            293.666667,
            294.0,
            294.5,
            295.0,
            451.0,
            453.125,
            453.333333,
            453.666667,
            454.5,
            456.5,
            506.0,
            506.666667,
            507.0,
            507.5,
            508.0,
            510.0,
        ]
    samples = []
    stats = []
    for t in times:
        frame, state = renderer.frame(t)
        stamp = f"{t:03d}" if isinstance(t, int) else f"{t:.3f}"
        cv2.imwrite(str(out / f"still-{stamp}.png"), frame)
        thumb = cv2.resize(frame, (480, 270))
        if args.transition_stills:
            cv2.putText(
                thumb,
                f"{t:.3f}s",
                (12, 254),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                210,
                1,
                cv2.LINE_AA,
            )
        samples.append(thumb)
        stats.append(state)
    columns = 6 if args.transition_stills else 4
    contact = np.vstack(
        [np.hstack(samples[i : i + columns]) for i in range(0, len(samples), columns)]
    )
    cv2.imwrite(str(out / "contact-sheet.png"), contact)
    json_write(out / "still-stats.json", stats)
    if args.stills_only or args.transition_stills:
        json_write(
            out / "status.json",
            {"state": "stills", "elapsed": time.monotonic() - started},
        )
        return
    if args.preview:
        starts = [47, 97, 157, 267, 307, 477, 537, 587]
        timeline = np.concatenate([s + np.arange(4 * FPS) / FPS for s in starts])
    else:
        timeline = args.start + np.arange(round(args.duration * FPS)) / FPS
    video = out / ("preview-silent.mp4" if args.preview else "visual-silent.mp4")
    encoder = None
    try:
        with (out / "ffmpeg.log").open("wb") as log:
            encoder = subprocess.Popen(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-nostdin",
                    "-f",
                    "rawvideo",
                    "-pixel_format",
                    "gray",
                    "-video_size",
                    f"{args.width}x{args.height}",
                    "-framerate",
                    str(FPS),
                    "-i",
                    "pipe:0",
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-crf",
                    "18",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    str(video),
                ],
                stdin=subprocess.PIPE,
                stderr=log,
            )
            telemetry = []
            frame_started = time.monotonic()
            for i, t in enumerate(timeline):
                frame, state = renderer.frame(float(t))
                encoder.stdin.write(frame.tobytes())
                telemetry.append(state)
                if i % 300 == 0:
                    elapsed = time.monotonic() - frame_started
                    print(
                        f"Frames {i + 1}/{len(timeline)}; {elapsed:.1f}s; source {t:.2f}s",
                        flush=True,
                    )
            encoder.stdin.close()
            if encoder.wait(timeout=120) != 0:
                raise RuntimeError((out / "ffmpeg.log").read_text())
        json_write(out / "telemetry.json", telemetry)
        json_write(
            out / "render.json",
            {
                "width": args.width,
                "height": args.height,
                "fps": FPS,
                "frames": len(timeline),
                "actual_audio": features.actual,
                "source_times": timeline.tolist()
                if args.preview
                else [args.start, args.start + args.duration],
                "elapsed": time.monotonic() - started,
                "source_sha256": hashlib.sha256(
                    Path(__file__).read_bytes()
                ).hexdigest(),
                "feature_sha256": features.digest,
                "geometry": "Mandelbulb outer boundary, pentagonal IFS, Heighway dragon IFS, Sierpinski carpet torus and helix",
            },
        )
        json_write(
            out / "status.json", {"state": "complete", "actual_audio": features.actual}
        )
        print(f"Saved {video}; elapsed {time.monotonic() - started:.1f}s", flush=True)
    except BaseException as error:
        if encoder is not None and encoder.poll() is None:
            encoder.kill()
            encoder.wait()
        json_write(out / "status.json", {"state": "failed", "error": str(error)})
        raise


if __name__ == "__main__":
    main()
