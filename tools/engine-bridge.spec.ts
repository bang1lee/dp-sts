import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import {
  validateBundle,
  sampleControls,
  samplePoints,
  applyToCables,
  type BridgeBundle,
} from '../packages/engine-bridge/src/index.ts';

const b: BridgeBundle = {
  version: 1,
  duration: 2,
  fps: 1,
  sourceStart: 350,
  audio: {
    file: 'audio.wav',
    sha256: 'a'.repeat(64),
    sourceSha256: 'b'.repeat(64),
  },
  channels: ['rms', 'alignment'],
  frames: [
    [0.1, 0],
    [0.3, 1],
  ],
  fourier: {
    modes: [1],
    coefficients: [[1, 0]],
    phases: [[0.3], [-0.4], [0.8], [-0.2]],
  },
};

test('rejects broken metadata, frames and Fourier data', () => {
  validateBundle(b);
  for (const change of [
    { version: 2 },
    { fps: 0 },
    { frames: [[0]] },
    { channels: ['alignment', 'alignment'] },
    { fourier: { modes: [1], coefficients: [[NaN, 0]], phases: [[0]] } },
  ]) {
    assert.throws(() => validateBundle({ ...b, ...change }));
  }
});
test('clamps seeks and interpolates using audio time', () => {
  assert.equal(sampleControls(b, -20).alignment, 0);
  assert.equal(sampleControls(b, 20).alignment, 1);
  assert.equal(sampleControls(b, 0.5).alignment, 0.5);
  assert.throws(() => sampleControls(b, NaN));
  const seen: Record<string, number> = {};
  applyToCables(
    {
      setVariable: (k, v) => {
        seen[k] = v;
      },
    },
    b,
    0.5,
  );
  assert.equal(seen.ambient_alignment, 0.5);
});
test('final shape is the target circle, and Python TD math agrees off-grid', () => {
  const final = samplePoints(b, 1);
  [1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0].forEach((n, i) =>
    assert.ok(Math.abs(final[i] - n) < 1e-12),
  );
  const script = `import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('bridge','packages/engine-bridge/adapters/td_bridge.py')\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nb=json.load(sys.stdin)\nprint(json.dumps({'controls':m.sample(b,.37),'points':m.points(b,.37)}))`;
  const result = JSON.parse(
    execFileSync('python3', ['-c', script], {
      input: JSON.stringify(b),
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(result.controls, sampleControls(b, 0.37));
  samplePoints(b, 0.37).forEach((v, i) =>
    assert.ok(Math.abs(v - result.points[i]) < 1e-12),
  );
});
test('cables port adapter clears invalid input instead of keeping stale geometry', () => {
  const ports = new Map<string, any>();
  const port = (name: string, value: unknown) => {
    const p = {
      value,
      get() {
        return this.value;
      },
      set(v: unknown) {
        this.value = v;
      },
      onChange: () => {},
    };
    ports.set(name, p);
    return p;
  };
  vm.runInNewContext(
    readFileSync('packages/engine-bridge/adapters/cables-op.js', 'utf8'),
    {
      op: {
        inString: port,
        inFloat: port,
        outArray: port,
        outNumber: port,
        outString: port,
      },
    },
  );
  const input = ports.get('Bundle JSON');
  input.set(JSON.stringify(b));
  input.onChange();
  assert.equal(ports.get('XYZ').get().length, 12);
  input.set('{broken');
  input.onChange();
  assert.equal(ports.get('XYZ').get().length, 0);
  assert.match(ports.get('Error').get(), /SyntaxError/);
});
