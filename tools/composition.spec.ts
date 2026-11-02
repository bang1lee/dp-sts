import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseComposition } from '../packages/audiovisual/src/index.js';

const fixture = JSON.parse(
  readFileSync(
    new URL('../compositions/quiet-orbit/composition.json', import.meta.url),
    'utf8',
  ),
);

test('the starter composition can be loaded in Node without browser globals', () => {
  assert.equal(parseComposition(fixture).id, 'quiet-orbit');
});

test('invalid durations cannot enter the playback/export timeline', () => {
  for (const durationSeconds of [0, -1, NaN, Infinity, '30', null]) {
    assert.throws(
      () => parseComposition({ ...fixture, durationSeconds }),
      /durationSeconds/,
    );
  }
});

test('invalid gain, notes and seeds fail before playback', () => {
  for (const gain of [-1, 1.1, NaN, Infinity]) {
    assert.throws(
      () => parseComposition({ ...fixture, audio: { ...fixture.audio, gain } }),
      /gain/,
    );
  }
  assert.throws(
    () => parseComposition({ ...fixture, audio: { notes: '', gain: 0.1 } }),
    /notes/,
  );
  assert.throws(() => parseComposition({ ...fixture, seed: 1.5 }), /seed/);
});

test('unsupported schemas and visual types are rejected', () => {
  assert.throws(() => parseComposition(null), /object/);
  assert.throws(
    () => parseComposition({ ...fixture, schemaVersion: 2 }),
    /schemaVersion/,
  );
  assert.throws(
    () => parseComposition({ ...fixture, visual: { kind: 'unknown' } }),
    /visual/,
  );
});
