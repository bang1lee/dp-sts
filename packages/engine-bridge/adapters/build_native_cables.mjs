// Build a self-contained OP source for a specific v1 bundle. This produces JavaScript,
// not a .cables patch; create and save the OP in cables Standalone.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const folder = resolve(process.argv[2] || 'runs/engine-native-sample-v01');
const bundle = JSON.parse(await readFile(`${folder}/bundle.json`, 'utf8'));
if (bundle.version !== 1 || !bundle.frames?.length) throw Error('Invalid v1 bundle');
const adapter = await readFile('packages/engine-bridge/adapters/cables-op.js', 'utf8');
const shared = adapter.split('// Paste into a new cables custom OP.')[0];
if (!shared.includes('var AmbientBridge')) throw Error('Build bridge adapters first');
const body = `
// Native sample: bundle values embedded; audio remains the sibling audio.wav.
const bundle = ${JSON.stringify(bundle)};
AmbientBridge.validateBundle(bundle);
const seconds = op.inFloat('Seconds', 0);
const audioElement = op.inObject('Audio Element', null, 'element');
const density = op.inFloat('Density', 1);
const sparkle = op.inFloat('Sparkle', 1);
const scale = op.inFloat('Scale', 1);
const xyz = op.outArray('XYZ');
const pointSize = op.outNumber('Point Size');
const alignment = op.outNumber('Alignment');
const actualSeconds = op.outNumber('Actual Seconds');
function update() {
  const audio = audioElement.get();
  const currentTime = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : seconds.get();
  const time = ((currentTime % bundle.duration) + bundle.duration) % bundle.duration;
  actualSeconds.set(time);
  const control = AmbientBridge.sampleControls(bundle, time);
  const all = AmbientBridge.samplePoints(bundle, control.alignment);
  const count = Math.max(1, Math.min(all.length / 3, Math.round(all.length / 3 * density.get())));
  const result = [];
  for (let i = 0; i < count; i++) {
    const j = 3 * Math.floor(i * (all.length / 3) / count);
    result.push(all[j] * scale.get(), all[j + 1] * scale.get(), all[j + 2] * scale.get());
  }
  xyz.set(result);
  pointSize.set(2 + 4 * Math.max(0, sparkle.get()));
  alignment.set(control.alignment);
}
seconds.onChange = audioElement.onChange = density.onChange = sparkle.onChange = scale.onChange = update;
let lastAudioTime = null;
op.onAnimFrame = () => {
  const audio = audioElement.get();
  if (audio && Number.isFinite(audio.currentTime) && audio.currentTime !== lastAudioTime) {
    lastAudioTime = audio.currentTime;
    update();
  }
};
update();
`;
await writeFile(`${folder}/cables-native-op.js`, shared + body);
console.log(`Wrote ${folder}/cables-native-op.js`);
