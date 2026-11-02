# dp-sts — psytrance audiovisual artwork

2026-11-01 (Asia/Seoul). User-confirmed title: **dp-sts**. Earlier production snapshots retain the working title PHASE BLOOM for provenance. Current user goal replaces the Yunseul sea study for this deliverable: approximately ten minutes of psytrance music synchronized with monochrome shimmering dotted fractals, revised until the independent critic accepts the finished product.

## Deliverable and artistic intent

600 seconds, 144 BPM, 360 bars. Black space and white dots form recursively structured objects that evolve from an initial seed through pressure, suspension, expansion and dissolution. Local shimmer and geometric motion express rhythm; full-screen white flashes are not the compositional device. The music must have an identifiable kick/bass engine, evolving psychedelic motifs, deliberate transitions, two releases of tension and a resolved ending.

A short pilot is an iteration tool, not completion. Existing sea samples and image-generated studies are not inputs to this film.

## Arrangement

| Bars | Seconds | Phase |
|---|---|---|
| 0–16 | 0–26.667 | Threshold |
| 16–48 | 26.667–80 | Ignition |
| 48–80 | 80–133.333 | Lattice |
| 80–112 | 133.333–186.667 | Bloom |
| 112–144 | 186.667–240 | Mutation |
| 144–176 | 240–293.333 | Suspension |
| 176–208 | 293.333–346.667 | First Contact |
| 208–240 | 346.667–400 | Helix Drive |
| 240–272 | 400–453.333 | Ascension |
| 272–304 | 453.333–506.667 | Event Horizon |
| 304–336 | 506.667–560 | Transfiguration |
| 336–360 | 560–600 | Dissolution |

## Responsibilities and evidence

Audio: Strudel event composition plus offline synthesis/mastering. Visual: recursive dot geometry plus audio-driven movement. Integration: Nx tasks, full-duration render, mux, independent checks. Critic: actual artifact inspection and written acceptance/revision request; signal metrics alone cannot substitute for listening or artistic judgment.

Sources of evidence will include event score, WAV master, audio-derived features, rendered film, section samples, technical verification and [independent critique](critique-rubric.md). A final state is not claimed until those artifacts exist and the review is complete.

## Current state

The full 600-second film is rendered and muxed. The delivery is `runs/dp-sts-v01/dp-sts.mp4`; the uncompressed stereo master is `runs/dp-sts-v01/dp-sts.wav`. A ten-second excerpt at 450–460 seconds is `dp-sts-accent-10s.mp4` in that directory. All 18,000 frames decoded successfully at 1920×1080 / 30 fps with zero RGB channel difference. The encoded audio measures −13.4 LUFS, −1.5 dBFS true peak and 5.6 LU loudness range. Its frame-level energy correlation with the visual input is 0.999989.

The independent critic accepted the visual result within the documented frame-sampling scope. Full artistic acceptance is pending trustworthy auditory evidence; all three tested local model routes failed or produced unusable controls and are excluded. A public captioning service also failed on a generic generated test tone; no artwork or user reference was uploaded there. Direct listener feedback has been requested. See [the bound delivery review](critique-dp-sts-final.md) and [listening evidence](listening-evidence.md).

## Reference-image contribution

The reference contributes widening attention, circular negative space, slight asymmetry and a held breath. At 453.125–453.333 seconds, the music leaves a half-beat gap; an off-center aperture contracts and releases through the existing dotted geometry. A smaller echo appears at 506.667 seconds. This is sparse seasoning, not a portrait or a new dominant motif. The extraction and decisions are recorded in [image-spice.md](image-spice.md).

## Running this composition

Nx remains the task entry point. Strudel score generation uses pnpm; synthesis and OpenCV rendering use uv. These are composition-specific tasks, not a mandatory workflow for future ideas. Use new output directories for experiments so approved renders remain intact.

```sh
pnpm nx run media:psy-score
pnpm nx run media:psy-audio --output runs/psytrance-audio-new
pnpm nx run media:psy-visual --audio-dir runs/psytrance-audio-new --output runs/psytrance-visual-new
```

Delivery combines the rendered video with the stereo master using FFmpeg. This version adds a uniform −1.5 dB delivery gain because the initial AAC encoding overshot full scale; it does not change the composition or normalized visual features. `runs/dp-sts-v01/delivery-notes.json` records the final hashes and provenance. The renderer's frozen source and input features are preserved beside the silent render. Exact bit-identical recreation of the entire delivery has not been tested.

The actual delivered file was audited with:

```sh
pnpm nx run media:psy-verify --video runs/dp-sts-v01/dp-sts.mp4 --audio-dir runs/psytrance-audio-v02 --visual-dir runs/psytrance-visual-final-v01 --output runs/dp-sts-v01/verification
```

For a fresh audit, choose a new verification output directory. Technical verification is separate from artistic acceptance.
