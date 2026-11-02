import { test } from 'node:test';
import assert from 'node:assert/strict';

test('music settings produce bounded score and preserve silence gain', async () => {
  const module = await import('../apps/studio/src/workbench-engine');
  const c = module.makeComposition({bpm: 60, root: 48, mood: 'moonlit', sparsity: .5, duration: 30, gain: 0});
  assert.equal(c.durationSeconds, 30);
  assert.equal(c.audio.cps, .25);
  assert.match(c.audio.notes, /c3/);
  assert.throws(() => module.makeComposition({bpm: 60, root: 48, mood: 'moonlit', sparsity: .5, duration: 121, gain: .5}));
});

test('measured RMS reads the selected audio time and silence outside its range', async () => {
  const {rmsAt}=await import('../apps/studio/src/workbench-engine');
  const channel = Float32Array.from([0,0,1,1,0,0,0,0]);
  assert.equal(rmsAt([channel], 4, .5, .5),1);
  assert.equal(rmsAt([channel], 4, 1, .5),0);
  assert.equal(rmsAt([channel], 4, 2.1, .5),0);
});
