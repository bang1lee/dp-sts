# Ambient Lab production pipeline

**Goal:** Implement the five user-requested capabilities: fractals, audio response, WAV, synchronized MP4, repeatable export.

**Architecture:** Strudel compiles a seeded score and its own Web Audio synth schedules all events into an OfflineAudioContext. The resulting stereo PCM receives a deterministic fade, is quantized once, and becomes both the preview source and WAV master. Fixed-frame audio features drive one shared WebGL Julia renderer in Studio and export. The Node runner serves the built render host on loopback, renders numbered frames, and pipes PNGs to the installed FFmpeg CLI. uv/OpenCV/ffprobe verify actual output media. Nx owns build, export, validation and reproducibility commands.

**Decision:** Use a single-pass stateless shader and frame-index time. Avoid wall-clock recording, unseeded reverb/noise, remote samples and feedback history. This bounds the first production profile to deterministic synthesized instruments and Strudel mini-notation. Playback is of the prepared PCM master, so preview audio and exported audio are the same samples.

**Reproducibility contract:** Same normalized composition, source, lockfiles, browser/render backend and encoder versions. Compare full WAV bytes, every encoded frame hash and MP4 bytes across two independent runs. Record environment fingerprints and refuse to claim cross-platform identity. Fail rather than silently accept changed frames.

**Constraints:** CLI for dependency/project/task ownership; direct edits for custom implementation. No Context7. No unrelated files, global model settings, remote publishing or Nx Cloud. GPU renders sequential. Keep failures in run records; never overwrite an existing run directory.

## Tasks

- [x] Extend validated composition settings and write tests for PCM/WAV, timeline, seed and invalid parameters.
- [x] Implement and verify Strudel offline synthesis, master WAV and per-frame audio features.
- [x] Implement shared Julia shader, render host and audio-clock-driven Studio preview/WAV download.
- [x] Implement export/audio/reproduce CLI operations and Nx targets through the Nx target generator.
- [x] Implement Python media verification using OpenCV, wave and ffprobe.
- [x] Export real media; render twice and compare hashes; validate duration, codecs, frame count, nonblank/moving frames and audio levels.
- [x] Run browser interaction/accessibility checks, regressions, independent review and update documentation.

## Acceptance

The repository can produce an actual 30-second WAV and MP4 from the provided composition, shows reactive fractals during preview, and proves repeatability with a machine-readable report. Negative tests cover silent audio, invalid geometry/timing, missing files, altered output and existing run directories.

## Execution evidence and decisions

- Unit contracts first failed on missing production exports, then passed after implementation (7 tests).
- Native Strudel offline synthesis verified with real Chrome before wiring export.
- Nx `@nx/workspace:run-commands` generated audio/export/reproduce/media verify tasks; custom dependencies edited afterward.
- Two-second independent exports matched all WAV/frame/MP4 hashes. Full 30-second chord export exposed 356 sample positions with at most 1 PCM16 unit difference; checksum validation correctly failed instead of reporting success.
- Ruling: deterministic Strudel routing uses an explicit binary summing tree rather than the engine's many-input orbit sum. Evidence points to floating-point summation order with overlapping voices; the two-input starter passed while chords showed sparse 1-LSB drift. Native synthesis/filter/envelopes stay in Strudel. Cost: a small version-specific controller adapter must be exercised whenever Strudel is upgraded.
- Ruling: WebGL generates shared preview/export fractals; OpenCV validates decoded final frames. Maintaining a second OpenCV drawing implementation would introduce preview/export divergence. Cost: Python is currently validation tooling, not the creative renderer.
- Expect CLI attempted. Installed CLI rejected `--base-url`; environment-based invocation then failed because its default Claude provider is unauthenticated. No authentication/model settings were changed. Local Playwright + axe verification completed independently.

## Final review and fixes

- Fresh read-only review found no critical issue, two important edge cases, and an archival verification gap.
- Fixed half-sample rounding disagreement at 44.1 kHz: explicit positive half-up rounding matches the browser. Regression failed first, then passed.
- Fixed legitimate near-zero/static motion being rejected: movement remains measured, not an arbitrary universal gate. A real encoded static fixture failed first, then passed.
- Ruling: regraded the archival frame-manifest gap as important for this project's reproducibility promise. Added count/hash validation; altered/missing frame evidence tests failed first, then passed. Cost: old hand-created export folders without the evidence cannot be certified as complete video exports.
- Ruling: the review did not repeat browser/GPU work or judge mastering/cross-platform identity. Parent's real-browser and double-render checks supply the execution evidence; artistic mastering and cross-platform identity remain outside the claimed capability. Cost: users must assess musical taste/mastering, and rerun reproduction after environment changes.
- The optional Expect CLI failed its provider authentication; local browser/audio/accessibility checks are the verified substitute, not an Expect success claim.
