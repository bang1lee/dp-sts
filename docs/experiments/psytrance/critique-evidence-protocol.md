# dp-sts — model-assisted evidence protocol

This specifies how to evaluate additional evidence under the existing rubric. It does not lower its thresholds, grant approval, replace failed controls, or claim the critic personally heard the soundtrack.

## Artifact and provenance

Use the already reviewed final `runs/dp-sts-v01/dp-sts.mp4` (SHA-256 `55b4152ac31c3143e94791f351b15ea94cfc8279f2e10de8561f180941c4fbc3`) or its documented corresponding final WAV. Do not silently substitute an earlier master or pilot. Record extraction timestamps, excerpt hashes, model repository/revision, runtime and preprocessing settings, exact prompts, and raw responses. Any gain, resampling, downmixing, video frame selection, or resizing must be disclosed.

Use neutral excerpt identifiers. The perceptual model should not receive the intended genre, section names, score, expected sounds, or desired verdict. Asking it to describe rhythm, timbre, transitions, balance and uncertainty is appropriate; telling it that the excerpt is successful psytrance is not.

## Controls must pass before evidence is credited

Three independently known inputs provide a minimum calibration:

1. A stationary test tone: recognize a steady/simple tone or beep, without inventing speech, instruments or a song arrangement.
2. Nonmusical synthetic surf/noise: recognize a noise-like or environmental texture, without inventing intelligible singing, speech or specific musical instruments absent from the input.
3. Intelligible speech: recognize speaker presence and recover enough of the known content to show real conditioning on this particular audio rather than generic guessing.

Judge factual performance, not stylistic wording. Preserve all control answers, including failures. Passing these controls establishes only a basic ability to condition on audio, not expert music criticism. Musical reports still need to be specific and credible. An out-of-memory failure is a runtime failure, not a failed perceptual answer; it also supplies no positive evidence.

The failed Qwen2-Audio and Nemotron control runs remain excluded even if a later model succeeds.

## Required content samples

- Twelve blind audio excerpts, each 24–30 seconds, representing the twelve actual sections. Include the middle of steady driving sections, breakdown material, a drop transition, and the actual ending. Select from the full timeline rather than only producer-picked highlights.
- Four actual audiovisual excerpts spanning the 293.333s return, 453.333s breath/drop, 506.667s final-peak transition, and ending. Each should include context before and after the event, where applicable.
- Preserve sample-specific observations: rhythmic organization, recognizable sound roles, changes within the excerpt, density/balance, and any audible problems. Twelve interchangeable statements that this is electronic music are insufficient for groove, mix or structural approval.
- Ask for uncertainty and weaknesses. Do not translate silence about defects into proof that no defects exist. Contradictions with known signals or visual evidence require investigation; do not average them away into a passing score.

## Temporal limits of audiovisual evidence

Record how many frames the model actually receives and their timestamps. A video filename alone does not establish continuous video conditioning. Sparse stills can support scene-level contrast, abstraction and arrangement, but cannot prove beat-level shimmer timing.

Where memory permits, a reduced-resolution sample at approximately 8 fps or more over 8–12 seconds gives more meaningful beat-level coverage than occasional stills. This is an evidence preference, not permission to exceed the bounded runtime budget. If only sparse frames are feasible, label the result as section-level audiovisual evidence. Existing exact clocks and framewise waveform/feature checks support measured synchronization separately.

## Decision rule

This evidence set can be sufficient input for a **bounded, model-assisted** final judgment; its existence does not automatically satisfy the rubric. The critic must inspect raw answers, calibration and provenance, then assign only scores supported by evidence. Any unresolved aesthetic weakness can still require revision. Any unassessed category remains unassessed.

An eventual acceptance must distinguish: direct critic inspection of images, automated full-file technical checks, and another model's audio/video-conditioned judgments. It must retain the limits of sampled coverage and the absence of continuous human-style audition. If the reports are generic, contradictory or untrustworthy, overall artistic acceptance remains pending; no speculative musical edits should be demanded solely to conceal missing perception.
