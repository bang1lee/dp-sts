import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const result = await build({
  entryPoints: ['packages/engine-bridge/src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'AmbientBridge',
  write: false,
});
await mkdir('packages/engine-bridge/adapters', { recursive: true });
await writeFile(
  'packages/engine-bridge/adapters/cables-op.js',
  result.outputFiles[0].text +
    `
// Paste into a new cables custom OP. Load bundle.json into the Bundle JSON port.
const bundleInput = op.inString('Bundle JSON', '');
const secondsInput = op.inFloat('Seconds', 0);
const outputPoints = op.outArray('XYZ');
const outputRms = op.outNumber('RMS');
const outputAlignment = op.outNumber('Alignment');
const outputSeparation = op.outNumber('Separation');
const outputBreath = op.outNumber('Breath');
const outputError = op.outString('Error');
let currentBundle = null;
function renderBundle() {
  if (!currentBundle) return;
  try {
    const controls = AmbientBridge.sampleControls(currentBundle, secondsInput.get());
    outputPoints.set(AmbientBridge.samplePoints(currentBundle, controls.alignment));
    outputRms.set(controls.rms ?? 0);
    outputAlignment.set(controls.alignment);
    outputSeparation.set(controls.separation ?? 0);
    outputBreath.set(controls.breath ?? 0);
    outputError.set('');
  } catch (error) { outputError.set(String(error)); }
}
bundleInput.onChange = () => {
  try {
    const parsed = JSON.parse(bundleInput.get());
    AmbientBridge.validateBundle(parsed);
    currentBundle = parsed;
    renderBundle();
  } catch (error) {
    currentBundle = null;
    outputPoints.set([]);
    outputRms.set(0); outputAlignment.set(0); outputSeparation.set(0); outputBreath.set(0);
    outputError.set(String(error));
  }
};
secondsInput.onChange = renderBundle;
`,
);
console.log(
  'Built cables custom OP from shared evaluator. Native patch import remains separate.',
);
