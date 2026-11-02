"use strict";
var AmbientBridge = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/engine-bridge/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    applyToCables: () => applyToCables,
    sampleControls: () => sampleControls,
    samplePoints: () => samplePoints,
    validateBundle: () => validateBundle
  });

  // packages/engine-bridge/src/lib/engine-bridge.ts
  function validateBundle(value) {
    const b = value;
    const finite = (x) => typeof x === "number" && Number.isFinite(x);
    if (!b || b.version !== 1 || !finite(b.duration) || b.duration <= 0 || !finite(b.fps) || b.fps <= 0 || !finite(b.sourceStart) || b.sourceStart < 0 || !b.audio || b.audio.file !== "audio.wav" || !/^[a-f0-9]{64}$/.test(b.audio.sha256) || !/^[a-f0-9]{64}$/.test(b.audio.sourceSha256))
      throw new Error("Invalid bridge metadata");
    if (!Array.isArray(b.channels) || !b.channels.length || new Set(b.channels).size !== b.channels.length || !b.channels.every(
      (c) => typeof c === "string" && /^[a-z][a-z0-9_]*$/.test(c)
    ) || !b.channels.includes("alignment") || !Array.isArray(b.frames) || b.frames.length !== Math.ceil(b.duration * b.fps) || !b.frames.every(
      (row) => Array.isArray(row) && row.length === b.channels.length && row.every(finite)
    ))
      throw new Error("Invalid channels or frames");
    const f = b.fourier;
    if (!f || !Array.isArray(f.modes) || !f.modes.length || !f.modes.every(Number.isInteger) || !Array.isArray(f.coefficients) || f.coefficients.length !== f.modes.length || !f.coefficients.every(
      (c) => Array.isArray(c) && c.length === 2 && c.every(finite)
    ) || !Array.isArray(f.phases) || !f.phases.length || !f.phases.every(
      (row) => Array.isArray(row) && row.length === f.modes.length && row.every(finite)
    ))
      throw new Error("Invalid Fourier data");
  }
  function sampleControls(b, seconds) {
    if (!Number.isFinite(seconds)) throw new Error("Time must be finite");
    const p = Math.max(0, Math.min(b.frames.length - 1, seconds * b.fps));
    const i = Math.floor(p), j = Math.min(i + 1, b.frames.length - 1), a = p - i;
    return Object.fromEntries(
      b.channels.map((c, k) => [
        c,
        b.frames[i][k] * (1 - a) + b.frames[j][k] * a
      ])
    );
  }
  function samplePoints(b, alignment) {
    if (!Number.isFinite(alignment)) throw new Error("Alignment must be finite");
    const a = Math.max(0, Math.min(1, alignment));
    return b.fourier.phases.flatMap((row, j) => {
      const theta = j * 2 * Math.PI / b.fourier.phases.length;
      let x = 0, y = 0;
      b.fourier.modes.forEach((mode, k) => {
        const phase = theta * mode + (1 - a) * row[k];
        const [re, im] = b.fourier.coefficients[k];
        x += re * Math.cos(phase) - im * Math.sin(phase);
        y += re * Math.sin(phase) + im * Math.cos(phase);
      });
      return [x, y, 0];
    });
  }
  function applyToCables(patch, b, seconds) {
    const controls = sampleControls(b, seconds);
    for (const [name, value] of Object.entries(controls))
      patch.setVariable(`ambient_${name}`, value);
    return controls;
  }
  return __toCommonJS(index_exports);
})();

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
