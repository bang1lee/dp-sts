# Production verification — 2026-10-31

## Implemented capabilities

| Requested capability      | Implementation                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fractal art               | Shared stateless WebGL2 Julia renderer in browser preview and export                                       |
| Respond to music          | Amplitude + bass/mid/treble measured from the actual quantized audio master; frame-index mapping           |
| WAV export                | Strudel native offline synthesis → deterministic fades/PCM16 stereo → CLI or browser download              |
| Synchronized video        | Fixed video frame timestamps, the same WAV master, FFmpeg H.264/AAC mux                                    |
| Identical finished render | Two fresh browser runs, full WAV bytes, each source PNG frame hash, full MP4 bytes, environment comparison |

## Evidence

`runs/quiet-orbit-final/reproducibility.json` records all four checks passing for two independent full renders. Each is 30 seconds, 960×540, 24 fps, 720 decoded frames, stereo 48 kHz. The WAV peak is 0.252655 and RMS 0.062149. Both audio/video stream durations are exactly 30 seconds. OpenCV measured nonflat imagery and maximum adjacent-frame change 3.290069.

The first full polyphonic test correctly **failed** reproducibility: 356 sample positions differed by at most one PCM16 unit. A fixed binary sum tree around Strudel's native voice output removed the many-input floating-point summation-order variation. The subsequent two fresh runs matched exactly. This adapter is specific to the locked Strudel version and must be revalidated on upgrades. A two-input early smoke fixture alone was insufficient to reveal the issue.

The source/environment fingerprint is retained with every render. Artifact hashes prove identity of those recorded runs; they do not assert identical rendering on another machine, OS, browser or graphics driver. Browser/FFmpeg versions are recorded machine prerequisites, not locked package artifacts.

## Automated checks

- TypeScript build/typecheck, composition bounds, PCM/WAV format/fades/nonfinite input, frequency response, seed/time/audio mapping.
- Existing output-directory protection without modifying existing files.
- Python checks: valid master; missing/altered/silent/wrong-duration audio; missing/altered frame evidence; changed composition; half-sample rounding at 44.1 kHz; valid subpixel/static video experiments.
- Real browser: no autoplay, invalid JSON recovery, native Strudel preparation, nonzero playback, changing canvas, WAV download, rapid stop/restart, automatic finish, second preparation, mobile overflow.
- axe WCAG2A/AA and WCAG2.1AA audit: zero violations in the tested page. No uncaught browser errors. Local first contentful paint measured 36 ms in one run; this is not a cross-machine performance guarantee.
- Desktop/mobile screenshots: `runs/verification/studio-desktop.png`, `studio-mobile.png`.

The optional Expect CLI could not run its browser agent: its installed version rejected the documented `--base-url` option, then the environment-based invocation failed with `AcpProviderUnauthenticatedError` for its Claude provider. Authentication/model settings were left unchanged. The local Playwright and axe checks above ran successfully instead.

## Operating boundaries

Motion magnitude is a diagnostic rather than a universal rejection threshold: intentionally static or extremely subtle valid compositions must still export. The default fixture's motion was measured and verified. Output validation checks byte integrity, PCM structure/levels, decoded frame count/dimensions, image variation, codecs, and stream timing. This is technical validation, not music mastering or an artistic-quality score.

Exports preserve the normalized composition, feature timeline and hashes. Keep source + lockfiles + runs together, and rerun `render:reproduce` after dependency or browser/encoder changes. No output folder is overwritten, and a failed/interrupted run must not be treated as complete.

Independent read-only review verified artifact hashes and identified the rounding/static-motion cases above plus frame-evidence revalidation. All three received regression tests observed failing before the fix. No review findings remain deferred.

The final post-review run `quiet-orbit-final` again matched all four identity checks. The workspace check passes all 10 Nx build/typecheck/lint/test tasks (18 individual regression tests across the test targets).

The separate `render:audio` command produced a WAV byte-identical to the final film's master (`runs/quiet-orbit-audio`). A real 44.1 kHz export of 1.125 seconds succeeded with 27 video frames and 49,613 PCM sample frames (`runs/sample-rounding-export`), covering the browser/Python rounding boundary end to end. The final browser smoke also passed with zero axe violations, no uncaught browser errors, and no mobile overflow.
