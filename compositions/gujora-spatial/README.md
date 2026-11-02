# Gujora spatial ambient

This original 464-second ambient arrangement uses the opening four verified bars of Bach's BWV 846, selected by the user. The source notes repeat at 2.5 seconds per note, starting at 00:10. Pad attacks and releases overlap to keep the melody sustained. The original held lower notes are rearticulated in the arrangement.

Strudel queries generate the pitched score. The synthesizer uses its own oscillators and reverb, with slow bounded mix changes guided by numeric measurements of the public reference. The measured data and hashes are copied into the audio result; no source recording is included. Analysis of numerical features does not establish instrument identities or guarantee perceptual similarity.

From the workspace root, generate the score with `pnpm exec nx run media:gujora-spatial-score`, then, after the reference analysis is present and heavy rendering is available, run `pnpm exec nx run media:gujora-spatial-audio`. The score generator and audio renderer refuse to overwrite existing output. The first result defaults to `runs/dp-sts-gujora-spatial-audio-v01/` and includes a 48 kHz stereo 24-bit WAV and 11,136 audio-control frames.
