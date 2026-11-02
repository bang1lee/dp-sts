# dp-sts — audio production

144 BPM; 4/4; F♯ minor; 360 bars; exactly 600 seconds; 48 kHz stereo, 24-bit PCM master. One bar is 5/3 seconds. Seed: 81273.

## Arrangement

| Bars (zero based, end exclusive) | Seconds | Movement |
|---|---|---|
| 0–16 | 0–26.667 | Threshold: harmonic atmosphere, sparse kick entrance |
| 16–48 | 26.667–80 | Ignition: rolling three-note-per-beat bass and progressive percussion |
| 48–80 | 80–133.333 | Lattice: resonant sequencer enters |
| 80–112 | 133.333–186.667 | Bloom: first melodic statement |
| 112–144 | 186.667–240 | Mutation: percussive and acid focus |
| 144–176 | 240–293.333 | Suspension: kick/bass removed; bells, accelerating snare build, final vacuum |
| 176–208 | 293.333–346.667 | First Contact: first full drop and melodic return |
| 208–240 | 346.667–400 | Helix Drive: second melodic contour and FM accents |
| 240–272 | 400–453.333 | Ascension: second breakdown and extended accelerating build |
| 272–304 | 453.333–506.667 | Event Horizon: peak drop |
| 304–336 | 506.667–560 | Transfiguration: brighter final peak and melodic variation |
| 336–360 | 560–600 | Dissolution: instrumental exit; drums stop at bar 352; ten-second final fade |

## Provenance and implementation

`tools/psy-score.mjs` loads the installed `@strudel/web` 1.3.0 browser bundle in local headless Chrome. It runs real `note(mini(expression)).queryArc(0,1)` queries and records the returned note onsets/durations in `compositions/psytrance/score.json`. Each Strudel cycle is a bar. The resulting score contains individual percussion, bass and melodic events; long pads/transitions are explicit supplementary score events. No external samples, paid services or prerecorded loops are used.

`python/media/src/ambient_media/psy_audio.py` synthesizes the events with NumPy. The kick has a fast pitch bend and F♯1 body. Bass uses a short harmonically filtered waveform on the remaining three sixteenth notes of each beat. Hats use band-limited noise plus inharmonic metal partials; claps, snares, pitched toms, moving resonant acid, detuned melodic voices, FM accents and slowly evolving chords have independent envelopes. Melodic delay taps are dotted-eighth-note spaced and alternate across the stereo field. Low-frequency rhythmic voices remain centered. Pads duck rhythmically during the driving sections.

The full waveform is synthesized from the score; it is not a short sample stretched or looped to ten minutes. FFmpeg measures the premaster, removes DC/subsonic energy below 18 Hz, applies a fixed gain derived from that measurement, and runs a stereo-linked lookahead limiter at four times the final sample rate. The intended loudness region is approximately −11 to −13 LUFS, with peak headroom. Actual final measurements are in `mastering.json`; targets are not a substitute for listening. Dynamic loudness normalization was rejected because it raised the quiet introduction excessively and weakened the arrangement's contrasts.

## Reproduction

```sh
pnpm nx run media:psy-score
pnpm nx run media:psy-audio --output=runs/psytrance-audio-v02
```

Current outputs: `runs/psytrance-audio-v02/phase-bloom-master.wav`, `features.json`, `audio-analysis.json`, `mastering.json`, a score snapshot, and six 30-second `audition-*.wav` extracts. The `.f32` files are reproducible intermediate PCM. The previous `runs/psytrance-audio-v01` is preserved.

## Synchronization contract

`features.json` contains `{fps:30,duration:600,bpm:144,frames:[...]}` with exactly 18,000 frames. Frame fields: `t`, `rms`, `bass`, `mid`, `treble`, `kick`, `section`. Values except `t`/`section` are normalized 0–1 against the actual mastered waveform's 98th percentile. RMS uses all stereo PCM samples for that frame. Spectral energy uses a 4096-point Hann FFT of the mono sum: bass 25–180 Hz, mid 180–3000 Hz, treble 3000–16000 Hz. `kick` is positive bass-energy flux, not an invented beat indicator. `section` is an integer 0–11 matching the score. Visuals can combine these measured features with score-defined phrase boundaries.

## Evaluation status

Technical and artistic evaluation are separate. Audio must be auditioned at the ignition, first drop, second breakdown, final peak and ending; metrics alone cannot establish musical quality. Listening approval has not yet been claimed. Independent critique and any resulting revisions must be recorded here. The initial technical pass found DC offset from the asymmetric kick envelopes; the mastering highpass corrects this before the listening pass.

Corrected render measured on 2026-11-01: exactly 600.000 seconds; 48,000 Hz; two channels; 24-bit PCM; integrated −11.88 LUFS; true peak −1.30 dBTP; loudness range 5.6 LU; sample peak 0.86080; channel means approximately 0.000078/0.000076. Driving sections have RMS approximately −11.2 dBFS; breakdowns approximately −18.5 dBFS. `features.json` has 18,000 measured frames. Nx score generation, audio render and Python lint passed. Corrected full render took 55.2 seconds on this machine; source synthesis took 6.6 seconds.

Audition starts: ignition 72 s, first-drop 286 s (includes the 293.333 s transition), breakdown 406 s, peak 498 s (includes the 506.667 s transition), ending 570 s. Each extract is exactly 30 seconds. These are listening materials, not a claim that human or model listening has already passed.

Version 2 responds to the user's added visual/music reference: a single brief held breath immediately before the Event Horizon drop. The complete mix fades down over 12 ms starting at 453.125 s, remains quiet until 453.333333 s, and opens over 3 ms at the drop. This is exactly half a beat, preserves all section boundaries and total duration, and is recorded in `score.transitions`. No voice or literal sample is added. A sixth `audition-vacuum-drop.wav` starts at 440 s to include this transition. The first breakdown's longer suspended ending and second buildup's accelerating rolls remain distinct. Listening feedback is still pending.
