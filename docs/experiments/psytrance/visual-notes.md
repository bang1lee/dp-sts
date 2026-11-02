# dp-sts — monochrome fractal choreography

Production date: 2026-11-01, Asia/Seoul. Scope: 600 seconds, 144 BPM, 360 bars, 1920×1080 at 30fps. Final artistic approval belongs to the independent critic and the user; implementation and preview evidence are not final acceptance.

## Material

The picture is generated from points belonging to five recursive constructions:

1. An exponent-eight Mandelbulb boundary sampled along stratified directions using escape testing and radial bisection. This is an outer-boundary study, not a complete voxel reconstruction of every cavity.
2. A Sierpinski-carpet IFS folded around a torus, preserving recursive gaps.
3. A pentagonal contracting IFS with nested branches.
4. A two-map Lévy dragon (C-curve) IFS lifted slightly into depth. Its complex maps are the conjugates of equation 1.1 in [Gonzalez-Carriedo et al., 2026](https://arxiv.org/html/2606.05565v1). Early implementation metadata incorrectly called it Heighway; this is a naming correction, not a geometry change.
5. The carpet folded into a helical volume.

A stable set of 65,536 identities moves between these structures. Fractal geometry supplies the point positions themselves; dots are not an overlay on a solid fractal picture. The renderer uses perspective, local deformation, slow spatial rotation, subpixel splatting and a restrained rare-highlight tier. The output is grayscale throughout, with no captions, hue shifts, portrait, medical symbol or full-screen luminance inversion.

## Composition and development

| Bars | Time | Musical section | Visual role |
|---|---:|---|---|
| 0–16 | 0–26.667s | Threshold | Small emerging boundary, controlled fade from black |
| 16–48 | 26.667–80s | Ignition | Boundary gains presence and local detail |
| 48–80 | 80–133.333s | Lattice | Recursive torus and subdued distant echoes |
| 80–112 | 133.333–186.667s | Bloom | Branched field opens beyond the centered object |
| 112–144 | 186.667–240s | Mutation | Dragon recursion and asymmetrical counterform |
| 144–176 | 240–293.333s | Suspension | Space opens, motif contracts, detail quietens |
| 176–208 | 293.333–346.667s | First Contact | Large branch field, cropped immersive detail |
| 208–240 | 346.667–400s | Helix Drive | Folded spatial carpet, elongated movement |
| 240–272 | 400–453.333s | Ascension | Torus returns with changed perspective and scale |
| 272–304 | 453.333–506.667s | Event Horizon | Close boundary passage; rare aperture release |
| 304–336 | 506.667–560s | Transfiguration | Eccentric enlarged dragon detail fills the frame |
| 336–360 | 560–600s | Dissolution | Motif returns, recedes, resolves into black |

These are not twelve stills held on screen: geometry, spectral deformation, point shimmer, perspective and framing evolve continuously. Family changes morph over eight beats. Intro and ending fades are slow; section contrast comes mainly from geometry and scale rather than whole-screen flashes.

## Audio connection

Final renders require `features.json` with 18,000 actual PCM-derived records at 30fps. RMS, bass, mid, treble and positive bass flux control local intensity, scale, bending, shimmer prominence and sparse kick accents. Section boundaries use the common 144-BPM score. A feature file hash is captured when it is loaded, so evidence identifies the actual modulation input rather than a file that may later change.

Preview-only mode permits explicitly marked timing fallback when the audio is not yet available. Full render refuses that fallback. The final audio version is v02; v01 previews are development evidence only.

## Reference as a subtle accent

The user's expressive image is translated into a held-breath/opening gesture, not copied into the picture. Around 453.333s, one off-center aperture contracts and opens through the existing point field, with slight asymmetrical radial widening. A weaker echo occurs at 506.667s. There are no paired eyes, mouth graphic, facial outline, meme frame or literal portrait. The first event aligns with the half-beat vacuum and release in audio v02.

## Critique-driven revisions so far

- V01: distinct fractal identities, but too many small centered compositions; satellite copies sometimes brighter than the main form.
- V03: larger cropped passages at peaks, asymmetric final detail, sparse Suspension retained. Satellites removed from immersive phases and subsampled elsewhere; contour/highlight hierarchy strengthened.
- Reference pilot: rare spatial aperture incorporated. The independent critic approved the revised visual direction and reference/transition pilot for full rendering. This is not final-film approval.

## Commands and evidence

```sh
pnpm nx run media:psy-visual --audio-dir=runs/psytrance-audio-v02 --output=runs/psytrance-visual-final-v01
```

Use a fresh output path for every version; existing directories are never overwritten. `--preview` renders a 32-second montage of eight interior excerpts. `--transition-stills` writes full-size frames around the 293.333s, 453.333s and 506.667s boundaries. `--start` and `--duration` select a contiguous pilot interval without changing global choreography time.

The silent visual output is intended for exact muxing with the matching audio master. Metadata records resolution, frame count, source interval, source hash and loaded feature hash. Telemetry records audio controls, geometry family, aperture cue and frame luminance. Decode/synchronization checks and full artistic review are handled independently by the parent/critic; mean luminance diagnostics are not a flash-safety certification.

## Full-render result

The full visual rendered successfully in 455.9 seconds to [visual-silent.mp4](../../../runs/psytrance-visual-final-v01/visual-silent.mp4). FFprobe reports 600.000 seconds, 18,000 frames, 1920×1080, 30fps, H.264/yuv420p. The actual v02 feature input SHA-256 is `9026ac9e75da2c75426d8085c32b0c1e100d631f3a8780b5e66c27d5b69bde65`. Exact renderer source and feature snapshots are stored beside the output; no visual parameters or source code changed during rendering.

The source snapshot contains the early Heighway naming in its metadata string; the output report includes an explicit naming-only correction to Lévy dragon/C-curve. Geometry and pixels were not changed. Final mux, full decoded QA, synchronization review and critique acceptance are separate gates, not implied by this successful render.
