# Expansion volume continuation — independent review

Status: actual integrated five-second excerpt independently accepted on encoded image and audio-data evidence. Deliverable: `runs/expansion-volume-v01/expansion-volume-5s.mp4`.

## User correction and review boundary

This is a continuation of the existing recursive-circle expansion work. It must not be treated as the earlier standalone line-bulb study. Genuine power-8 Mandelbulb contours and dark depth geometry enter the existing central-circle composition, preserving the 43-circle identity, bounded afterimage, camera and wood-derived ambience.

The review excerpt uses source seconds 20–25 of the integrated scene: five seconds, exactly 150 frames at 30 fps, with the exact corresponding source PCM slice and global audio-feature timing. The full thirty-second route remains the same integrated scene.

## Acceptance

- Existing recursive circles remain recognizable and visually connected to the emerging bulb; no unrelated replacement or hard cut.
- Bulb contours and depth are visibly legible inside the circle composition. Its surface must not obscure the defining ring hierarchy. Inspect meaningful evolution across the actual five-second excerpt.
- Preserve framing without clipping, readable thin lines and finite echoes.
- Verify actual export dimensions/frame count/duration and included audio. Compare the excerpt WAV against source PCM samples 960,000–1,199,999 at 48 kHz and check encoded timing.
- Keep synthetic provenance accurate. No subjective listening or uninterrupted playback claim without corresponding evidence.

Root owns browser/export/mux. This critic owns only this document and review evidence. No implementation edits or additional research are required for the already established power-8 assets.

## Verified output — 2026-11-03

Independently decoded the actual MP4 (SHA-256 `4de0fc662db65040ba98334e49a008dbeff60450281d04605444bdd5b3e66d8f`): 960 × 540 H.264, 30 fps, exactly 150 frames. Video and stereo 48 kHz AAC start at zero and last exactly 5.000000 seconds. All 150 frames were scanned; no bright content reaches the two-pixel border, and minimum measured bright-content margin is 56 pixels at RGB-maximum threshold 40.

The UI WAV contains 240,000 stereo frames and matches the original thirty-second WAV's samples 960,000–1,199,999 byte for byte. This is the exact 20–25-second PCM excerpt, without a substituted soundtrack. Decoded AAC also contains 240,000 frames, with peak 0.190204576 and source-WAV correlation 0.999830073. Three consecutive comparison windows all peak at zero sample lag. No subjective listening was performed.

Reviewed source time mapping: local excerpt time is added to `sourceStart=20`; both visual draw and the existing 60 Hz PCM-feature lookup receive this global time. The emergence envelope runs from source time 20 to 24.4 seconds. Camera, 43-circle parent–child system and finite delayed-growth layer remain within the existing expansion renderer. The added volume is explicitly labeled an additive evolution, not a literal circle-to-bulb morph.

Viewed the former thirty-second export's frame 600 beside the new excerpt's frame 0. Composition, ring placement and camera are continuous; the decoded comparison differs by only 0.23045 RGB code values on average, with PSNR 46.94 dB, consistent with separate lossy encodes. This is evidence against a scene replacement or hard cut, not a claim of byte-identical video.

Viewed excerpt frames 0, 60 and 149: the original central ring and recursive surrounding rings remain recognizable while lobed contour depth progressively appears inside the central circle. The bulb is absent at the start, faintly present at two seconds and clearly formed near the end. Its dark surface and contour bands preserve the surrounding circle identity. No framing, continuity or observed visual blocker remains.

The source uses the established power-8 surface/contour assets: 72,692 surface triangles and 12,664 contour segments, with overall maximum eight draw calls. Earlier ring-only vertex counts do not include this added volume. These are artifact/source counts, not measured GPU timing.

Evidence is under `runs/expansion-volume-v01/critic/`: `probe.json`, `independent-review.json`, the prior source-frame comparison and decoded excerpt frames. This acceptance applies to the actual five-second integrated export. The full thirty-second route is integrated in source, but a new full thirty-second integrated render was not reviewed here. Review consisted of complete-frame data checks and representative image inspection, not uninterrupted playback or subjective listening.
