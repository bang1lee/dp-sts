"""Checks the quantities that make the ocean prototype responsive and timed."""

import json
import unittest
from pathlib import Path

import numpy as np
from ambient_media.yunseul import (
    audio_envelope,
    camera,
    surf_audio,
    swell,
    validate,
    water,
)


class YunseulTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[3]
        self.c = json.loads((root / "compositions/yunseul/sample.json").read_text())

    def test_normals_match_surface_derivatives(self):
        x = np.array([0.3, 1.2, -2.1], dtype=np.float64)
        z = np.array([-0.6, 2.0, 3.1], dtype=np.float64)
        h, dx, dz = water(x, z, 1.1, 0.7)
        eps = 1e-6
        hx = water(x + eps, z, 1.1, 0.7)[0]
        hz = water(x, z + eps, 1.1, 0.7)[0]
        np.testing.assert_allclose((hx - h) / eps, dx, atol=1e-4)
        np.testing.assert_allclose((hz - h) / eps, dz, atol=1e-4)

    def test_audio_latency_is_a_real_time_shift(self):
        self.c["audio_sync"] = 1
        self.c["audio_latency"] = 0.4
        t = np.linspace(0, 10, 300)
        np.testing.assert_allclose(
            audio_envelope(t + 0.4, self.c),
            0.14 + 0.86 * swell(t, self.c["wave_period"]),
        )

    def test_camera_moves_and_basis_is_orthonormal(self):
        start = camera(0, self.c)
        finish = camera(10, self.c)
        self.assertGreater(np.linalg.norm(start[0] - finish[0]), 2)
        basis = np.stack(finish[1:])
        np.testing.assert_allclose(basis @ basis.T, np.eye(3), atol=1e-6)

    def test_audio_has_correct_length_and_headroom(self):
        self.c["duration"] = 1
        rate, audio = surf_audio(self.c)
        self.assertEqual(audio.shape, (rate, 2))
        self.assertLessEqual(np.max(np.abs(audio)), 0.421)
        self.assertGreater(np.std(audio), 0.01)
        self.assertTrue(np.all(np.isfinite(audio)))
        self.assertLess(np.max(np.abs(audio[:48])), 0.001)

    def test_invalid_render_settings_rejected(self):
        for key, value in [
            ("width", 321),
            ("fps", 29.5),
            ("density", 1.1),
            ("audio_latency", float("nan")),
        ]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate({**self.c, key: value})
