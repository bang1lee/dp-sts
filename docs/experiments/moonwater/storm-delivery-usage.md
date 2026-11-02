# Organic Storm delivery tool

Run from the `ambient-lab` directory **after all seven final renders and their `render.json` files are complete**:

```sh
pnpm nx run media:storm-delivery --output-style=stream
```

The default input is `runs/dp-sts-visual-storm-v01`, and the default output is its `delivery/` subfolder. Existing delivery products are protected: choose another destination with `--out runs/dp-sts-visual-storm-v01/delivery-v02`, or explicitly replace them with `--overwrite`. Input artworks, audio, feature data and renderer metadata are never overwritten by this command. FFmpeg and ffprobe must be available in `PATH`; NumPy and OpenCV are provided by the project environment.

Nx owns task execution and calls `uv run --locked --package ambient-media python -m ambient_media.storm_delivery`. Pass optional arguments after `--` in the Nx command.

The command first requires `artwork.mp4`, `audio.wav`, `audio-features.json` and `render.json` for all seven works. For each original it checks stream format and durations, counts the decoded video frames, fully decodes video and audio with FFmpeg's strict error handling, and checks audio sample count and non-finite values. It confirms that the WAV's SHA-256 matches both the control data and render metadata, and that source-audio names agree. Clipping-related sample counts, peak and RMS are recorded from decoded audio. Sampled luminance measurements describe just three decoded frames and are not quality judgments. Hashes establish metadata linkage, not audible synchronization or the identity of the original source recording.

Only after all original files pass does the tool produce a 7 × 3 contact sheet at 00:15, 01:30 and 02:45; a compact seven-work poster at 01:30; and a 70-second comparison with one 01:12–01:22 excerpt from each work. It verifies the comparison's duration, stream properties, frame count and full decode, then writes `delivery.json` and `README.md` with relative links and limitations. All products are staged before they replace any destination files. A failure returns a nonzero status; missing or failed inputs never produce a passing report. Creating the comparison is a separate, potentially heavy render; do not run in parallel with a heavy source render.
