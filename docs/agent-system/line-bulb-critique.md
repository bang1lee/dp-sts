# Line-bulb independent review

Status: preserved five-second prototype verified technically; decoded visual samples reviewed. The current active user direction is the separate thirty-second expansion film.

## Direction and acceptance

The additional five-second work should make lines the primary visual material while preserving recognizable Mandelbulb volume. A readable outer silhouette, front/back contour separation and modest camera parallax should make the form feel sculptural. Fine strokes must survive the actual native export and avoid dense, uniform wire clutter.

- Verify genuine power-8 Mandelbulb contour/surface provenance in source and generation records. Distinguish precomputation cost from playback cost; report measured counts rather than an optimality claim.
- Review actual rendered and decoded frames for depth, line readability, clipping and parallax. A build alone is insufficient.
- Final video must contain exactly 150 frames at 30 fps, spanning five seconds, with valid included audio.
- Synthetic fire-kit accents must have accurate provenance and clear accent semantics. Do not describe audio as intersection-triggered unless shared geometric event timing establishes that behavior.
- Review encoded audio timing/headroom through actual sample data. Do not claim subjective listening without audio access.

Root owns browser interaction and mux. This critic owns only this review document and review evidence under `runs/line-bulb-v01/`. Existing Flower of Life and other works remain separate.

## Findings — 2026-11-03

Independently probed `runs/line-bulb-v01/line-bulb-5s.mp4`: native 960 × 540 H.264 at 30 fps, exactly 150 decoded frames and 5.000000 seconds. Included AAC is stereo 48 kHz, also exactly five seconds, beginning at zero with the video. The decoded audio has 240,000 frames; comparison with the source WAV gives correlation 0.999732218 and zero-sample cross-correlation lag. Source WAV peak is 0.10067749; decoded AAC peak is 0.10059175. No subjective listening was performed.

Viewed actual decoded frames at 0, 3 and 4.966667 seconds, and extracted a further 1.5-second frame. Thin contours remain readable, silhouette is unclipped, and the form changes slightly under the documented 0.2-radian total rotation. The sculpture reads as a dark lobed volume wrapped in horizontal contour bands. Depth is subtle; the uniformly horizontal section family gives a flattened impression in some stills. This is an acceptable preserved line-study prototype, not evidence that a more pronounced sculptural aesthetic has been achieved or approved by the user.

Source renderer uses a depth-writing dark surface to occlude the contour lines, with three maximum draw calls. Manifest reports a power-8 distance-estimator isosurface, 100³ grid, 19 section planes, 72,692 surface triangles and 12,664 line segments. These counts describe the prepared artifact and distinguish static geometry from runtime rendering; this review did not independently rerun the surface generator.

Four accents at 0.75, 1.8, 2.9 and 4.05 seconds are correctly labeled composed synthetic accents rather than actual geometric crossing events. The renderer and audio adapter use the shared accent schedule. Synthetic fire-kit provenance is explicit.

Evidence is under `runs/line-bulb-v01/critic-decoded/`, including decoded PNGs and `independent-probe-audio.json`. No implementation changes were made.
