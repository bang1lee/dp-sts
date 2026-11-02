# Gujora ambient score

The user selected the opening of Bach's Prelude in C major, BWV 846, from *The Well-Tempered Clavier*, Book I. The score generator requires a separately verified four-bar note transcription and records its source and SHA-256. It queries the repeated arpeggio and accompaniment through Strudel in a real browser. The arrangement uses an original synthesized sound palette and an independently written structure.

The reference track's public playback was measured numerically in eight-second RMS windows and mapped to the new work's 180-second duration. Its interpolated envelope gently shapes the final mix; it does not establish the reference's instrumentation or claim an identical arrangement. No listening or audio sampling was used in that measurement. The chosen envelope and its hash are saved with the render, and `--reference-envelope` selects an alternative measured file.

Score output is created once; choose a new `--out` path to preserve an existing score. The synthesizer also creates a new output folder rather than overwriting an earlier render.
