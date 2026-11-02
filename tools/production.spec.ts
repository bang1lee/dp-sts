import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseComposition,
  encodeWav,
  prepareMaster,
  analyzeAudio,
  frameState,
} from '../packages/audiovisual/src/index.js';

const input = {
  schemaVersion: 1,
  id: 'test',
  title: 'Test',
  durationSeconds: 2,
  seed: 42,
  audio: { notes: 'c3 e3', gain: 0.1 },
  visual: { kind: 'julia' },
};
test('production defaults and export bounds are validated', () => {
  const c = parseComposition(input);
  assert.equal(c.render.fps, 24);
  assert.equal(c.audio.sampleRate, 48000);
  for (const render of [{ width: 161 }, { fps: 0 }, { height: 4000 }]) {
    assert.throws(() => parseComposition({ ...input, render }));
  }
  assert.throws(
    () => parseComposition({ ...input, durationSeconds: 2.01 }),
    /frames/,
  );
});
test('WAV is stereo PCM16, reproducible, faded and finite', () => {
  const raw = [
    Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i * 0.04) * 0.1),
  ];
  const master = prepareMaster([raw[0].slice(), raw[0].slice()], 48000, 0.01);
  assert.equal(master[0][0], 0);
  assert.equal(master[0][4799], 0);
  const a = encodeWav(master, 48000),
    b = encodeWav(master, 48000);
  assert.deepEqual(a, b);
  const view = new DataView(a.buffer);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(a.length, 44 + 4800 * 4);
  assert.throws(
    () => prepareMaster([new Float32Array([NaN])], 48000, 0),
    /finite/,
  );
});
test('audio features follow signal and silence, frame state uses seed and audio', () => {
  const c = parseComposition(input);
  const silent = analyzeAudio([new Float32Array(96000)], 48000, 24);
  assert.equal(silent.length, 48);
  assert.equal(silent[10].amplitude, 0);
  const signal = Float32Array.from(
    { length: 96000 },
    (_, i) => 0.2 * Math.sin((2 * Math.PI * 110 * i) / 48000),
  );
  const loud = analyzeAudio([signal], 48000, 24);
  assert.ok(loud[10].amplitude > 0.1 && loud[10].bass > loud[10].treble);
  assert.deepEqual(frameState(c, 10, loud[10]), frameState(c, 10, loud[10]));
  assert.notDeepEqual(
    frameState(c, 10, loud[10]),
    frameState(c, 10, silent[10]),
  );
  assert.notDeepEqual(
    frameState(c, 10, loud[10]),
    frameState({ ...c, seed: 43 }, 10, loud[10]),
  );
  const unreactive = { ...c, visual: { ...c.visual, reactivity: 0 } };
  assert.deepEqual(
    frameState(unreactive, 10, loud[10]),
    frameState(unreactive, 10, silent[10]),
  );
});
