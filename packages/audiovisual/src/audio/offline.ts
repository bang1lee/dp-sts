import type { Composition } from '../schema/composition.js';
import { prepareMaster, encodeWav } from './pcm.js';
import { analyzeAudio } from '../timeline/features.js';

export interface ScheduledAudioEvent {
  startSeconds: number;
  durationSeconds: number;
  source: Record<string, string | number | boolean | null>;
}

let initialized: Promise<typeof import('@strudel/web')> | undefined;
let busy = false;
async function engine() {
  initialized ??= import('@strudel/web')
    .then(async (module) => {
      await module.initStrudel();
      return module;
    })
    .catch((error) => {
      initialized = undefined;
      throw error;
    });
  return initialized;
}

/** Query Strudel note onsets in cycle units without changing audio scheduling. */
export async function queryNotePattern(notes: string, begin: number, end: number, cps: number) {
  if (!notes || !Number.isFinite(begin) || !Number.isFinite(end) || end <= begin || !Number.isFinite(cps) || cps <= 0)
    throw new Error('Invalid Strudel pattern query');
  const strudel = await engine();
  return strudel.note(notes).queryArc(begin, end, { _cps: cps })
    .filter(event => event.hasOnset())
    .map(event => ({ beginCycles: event.whole.begin.valueOf(), note: event.value['note'] }));
}

/** Uses Strudel's event model and native synth, with the same scheduling as its offline exporter. */
export async function renderAudio(c: Composition) {
  if (busy) throw new Error('An audio render is already running');
  busy = true;
  let strudel: Awaited<ReturnType<typeof engine>> | undefined;
  try {
    strudel = await engine();
    const pattern = strudel
      .stack(
        strudel
          .note(c.audio.notes)
          .slow(c.audio.slow)
          .s('sine')
          .gain(c.audio.gain)
          .attack(c.audio.attack)
          .release(c.audio.release)
          .lpf(c.audio.cutoff)
          .pan(0.3),
        strudel
          .note(c.audio.notes)
          .slow(c.audio.slow)
          .s('triangle')
          .gain(c.audio.gain * 0.24)
          .attack(c.audio.attack * 1.2)
          .release(c.audio.release)
          .lpf(c.audio.cutoff * 0.6)
          .pan(0.7),
      )
      .seed(c.seed);
    const events = pattern
      .queryArc(0, c.durationSeconds * c.audio.cps, { _cps: c.audio.cps })
      .filter((event) => event.hasOnset())
      .sort((a, b) => a.whole.begin.valueOf() - b.whole.begin.valueOf());
    if (!events.length || events.length > 10000)
      throw new Error('Score must produce 1–10000 note events');
    await strudel.getAudioContext().close();
    const context = new OfflineAudioContext(
      2,
      Math.round(c.durationSeconds * c.audio.sampleRate),
      c.audio.sampleRate,
    );
    strudel.setAudioContext(context);
    strudel.setSuperdoughAudioController(null);
    await strudel.initAudio({ maxPolyphony: events.length + 1 });
    // Chromium's many-input summing order is not stable across fresh audio graphs.
    // Keep Strudel's synth/effects, but connect the voices through a fixed binary
    // sum tree (at most two inputs per node). This avoids 1-LSB PCM drift in chords.
    // This controller adapter is covered by real-browser reproducibility checks.
    const orbit = strudel.getSuperdoughAudioController().getOrbit(0, [0, 1]);
    const connectOutput = orbit.connectToOutput.bind(orbit);
    let voices: AudioNode[] = [];
    orbit.connectToOutput = (node) => {
      voices.push(node);
    };
    const scheduledEvents: ScheduledAudioEvent[] = [];
    for (const event of events) {
      const begin = event.whole.begin.valueOf() / c.audio.cps;
      const durationSeconds = Number(event.duration) / c.audio.cps;
      const value = { ...event.value, orbit: 0 };
      // Keep a detached snapshot of the exact note parameters being scheduled.
      // These scalar values are sufficient for the current note/synth patterns.
      const source: ScheduledAudioEvent['source'] = {};
      for (const [key, item] of Object.entries(value)) {
        if (item === null || typeof item === 'string' || typeof item === 'boolean' ||
            (typeof item === 'number' && Number.isFinite(item))) source[key] = item;
      }
      await strudel.superdough(value, begin, durationSeconds, c.audio.cps, begin);
      scheduledEvents.push({ startSeconds: begin, durationSeconds, source });
    }
    orbit.connectToOutput = connectOutput;
    while (voices.length > 1) {
      const next: AudioNode[] = [];
      for (let i = 0; i < voices.length; i += 2) {
        if (i + 1 === voices.length) {
          next.push(voices[i]);
          continue;
        }
        const sum = new GainNode(context, {
          gain: 1,
          channelCount: 2,
          channelCountMode: 'explicit',
        });
        voices[i].connect(sum);
        voices[i + 1].connect(sum);
        next.push(sum);
      }
      voices = next;
    }
    connectOutput(voices[0]);
    const buffer = await context.startRendering();
    const channels = prepareMaster(
      [buffer.getChannelData(0), buffer.getChannelData(1)],
      c.audio.sampleRate,
      c.audio.fadeSeconds,
    );
    let peak = 0;
    for (const channel of channels)
      for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    if (peak < 0.00001) throw new Error('Rendered score is silent');
    return {
      channels,
      wav: encodeWav(channels, c.audio.sampleRate),
      features: analyzeAudio(channels, c.audio.sampleRate, c.render.fps),
      peak,
      eventCount: events.length,
      scheduledEvents,
    };
  } finally {
    strudel?.setAudioContext(null);
    strudel?.setSuperdoughAudioController(null);
    busy = false;
  }
}

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384)
    text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
}
