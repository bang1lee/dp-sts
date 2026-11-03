# Expansion drift chapter — independent review

Status: corrected final export independently accepted. Deliverable: `runs/expansion-drift-v01/expansion-drift-30s-complete.mp4`. Subjective listening and user taste approval are not claimed.

## Current user direction

Continue the same Expansion work through a legible thirty-second arc: minimal line form → recognizable three-dimensional object → particles gently drifting while awaiting connection. Preserve the established wood-derived ambience and visual identity. The existing page exposes this chapter through `?chapter=drift`; this is not an unrelated dust scene.

## Acceptance

- Sparse line construction becomes readable volume before fragmentation. Points come from the same visible form, with enough retained contour/core to make the transition continuous.
- Drift remains slow and spatially legible. A few incomplete/gapped threads suggest possible connection; avoid an explosion or dense finished network.
- Fine strokes, depth and calm negative space remain readable at native export resolution. Particle/line counts and echoes are explicitly bounded.
- Actual final MP4 contains 900 frames at 30 fps and 30-second video/audio streams; inspect the full frame sequence for edge clipping and representative decoded frames for continuity.
- Compare the included audio with the existing thirty-second ambience and verify the common time mapping. Preserve accurate synthetic provenance and distinguish measured sample evidence from subjective listening.

Root owns browser operation, export and mux; Terra owns implementation. This critic owns only this document and generated review evidence. Feedback will remain bounded to observed continuity, readability, framing and timing defects.

## Actual UI preflight

Viewed the actual 3-, 12- and 27-second UI PNGs, preserved under `runs/expansion-drift-v01/critic-before-*.png`. The sparse opening, contour volume and later surface-shaped particles show a readable progression. The late point cloud retains the lobed object's spatial memory rather than becoming unrelated scattered dust, with generous framing and no observed still-image clipping.

Source limits particles to 1,400 samples from spatially deduplicated vertices of the same power-8 surface, one 0.22-second delayed particle copy, and at most twelve fixed neighbour pairs drawn as two segments with a central gap. The 15–23-second line/point cross-transition is explicit; late drift remains bounded. Quiet connection hints suit the requested unresolved state and do not need additional density.

One inexpensive refinement was requested before export: replace the hard square point sprites, conspicuous at 2.5 pixels in the 27-second image, with one shared soft round alpha sprite around 2.0–2.3 pixels. Preserve particle count, echo and link count. No structural redesign or extra effects were requested. Actual encoded motion/audio acceptance remains pending.

## First encoded review

Independently decoded `runs/expansion-drift-v01/expansion-drift-30s.mp4` (SHA-256 `7257a4a6076b77a886e771ab9fee87bcd019668b5c907ef55b3b2d56fba0aa70`). It contains exactly 900 H.264 frames, 960 × 540 at 30 fps. Video and stereo 48 kHz AAC both start at zero and last exactly 30 seconds. Full-frame edge scan is clear, with a minimum bright-content margin of 119 pixels at RGB-maximum threshold 40.

The UI WAV is byte-identical to the existing expansion ambience. Decoded AAC is also byte-identical to the previously validated expansion audio (SHA-256 `3e9eb9937ca815194e17fc7cb60f9111f8afc652797ae37745d61ce29e354c19`), with 1,440,000 frames and peak 0.204546109. The prior 55 zero-sample-lag onset checks apply unchanged; they were not repeated. No subjective listening was performed.

Viewed native 960 × 540 frames at 12, 18, 22, 27 and 29.966667 seconds. The volume and later cloud retain the same lobed silhouette; drift is modest, the sparse gapped links remain unresolved, and there is no explosion or dense network. The shared 2.3-pixel soft round sprites improve the earlier square-pixel appearance. They remain deliberately quiet but readable at native resolution.

**Observed continuity blocker:** the largest adjacent-frame image change occurs at frame 686 (22.866667 seconds). Direct inspection of frames 685 and 686 confirms a sudden one-frame increase in particle density/brightness. Source explains it: the nearly transparent surface still writes depth until `surface.visible` becomes false when dissolve reaches 0.999; its removal suddenly reveals rear particles. This is not a requested artistic transition.

Requested minimal correction: stop the fading surface from discontinuously occluding the particle layers, for example by disabling depth testing for main/ghost points throughout their existing gradual reveal while retaining contour depth. No new geometry, additional links or broader art redesign is needed.

Evidence under `runs/expansion-drift-v01/critic-final/` includes `probe.json`, `independent-review.json`, representative decoded frames and the decisive `frame-685.png` / `frame-686.png` pair. These describe the initial encoded candidate; final acceptance awaits the corrected transition.

## Corrected final acceptance

The targeted correction disables particle/ghost depth testing throughout the existing gradual reveal while preserving contour depth. Independently checked `expansion-drift-30s-complete.mp4` (SHA-256 `670d3dfd5f295c31706ee5dec11ac6eea68ff7352778f1526716f6f4b0ff6518`): exactly 900 decoded frames, 960 × 540, 30 fps. Video and stereo 48 kHz audio both start at zero and last exactly 30 seconds.

All 900 decoded frames remain clear of the border. The minimum measured bright-content margin is 119 pixels at RGB-maximum threshold 40. The decoded audio hash matches the prior validated ambience exactly, so the existing 55 zero-lag onset checks and waveform assessment remain applicable without repetition.

Viewed corrected native-resolution frames 685 and 686 directly: the sudden particle-density jump is gone. Mean absolute RGB change at that transition drops from 0.753382 to 0.072170 code values, within the neighbouring-frame range of 0.068180–0.084080. The same surface-shaped cloud now persists continuously through the former visibility switch. No remaining observed continuity or framing blocker.

Final evidence is separately preserved in `runs/expansion-drift-v01/critic-corrected/`, including `probe.json`, `independent-review.json`, and native transition frames. The earlier failed candidate and evidence are retained. Acceptance combines complete-frame boundary checks, representative decoded-image inspection, source continuity/provenance review and verified audio identity; it does not claim uninterrupted realtime watching or subjective listening.
