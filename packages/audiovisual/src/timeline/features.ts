import type { Composition } from '../schema/composition.js';
export interface AudioFeatures {
  amplitude: number;
  bass: number;
  mid: number;
  treble: number;
}
export const SILENCE: AudioFeatures = {
  amplitude: 0,
  bass: 0,
  mid: 0,
  treble: 0,
};
export function analyzeAudio(
  channels: Float32Array[],
  sampleRate: number,
  fps: number,
): AudioFeatures[] {
  const frames = Math.round((channels[0].length / sampleRate) * fps),
    result: AudioFeatures[] = [];
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate),
    highAlpha = 1 - Math.exp((-2 * Math.PI * 2500) / sampleRate);
  let low = 0,
    high = 0,
    previous = { ...SILENCE };
  for (let frame = 0; frame < frames; frame++) {
    const start = Math.round((frame * sampleRate) / fps),
      end = Math.min(
        channels[0].length,
        Math.round(((frame + 1) * sampleRate) / fps),
      );
    const energy = [0, 0, 0, 0];
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] / channels.length;
      low += lowAlpha * (sample - low);
      high += highAlpha * (sample - high);
      const treble = sample - high,
        mid = sample - low - treble;
      [sample, low, mid, treble].forEach((v, j) => {
        energy[j] += v * v;
      });
    }
    const keys = ['amplitude', 'bass', 'mid', 'treble'] as const;
    const current = { ...SILENCE };
    keys.forEach((key, i) => {
      const level = Math.min(
        1,
        Math.sqrt(energy[i] / Math.max(1, end - start)) * 10,
      );
      const alpha =
        1 - Math.exp(-1 / (fps * (level > previous[key] ? 0.12 : 0.55)));
      current[key] = previous[key] + alpha * (level - previous[key]);
    });
    result.push(current);
    previous = current;
  }
  return result;
}
export function frameState(
  c: Composition,
  frame: number,
  feature: AudioFeatures = SILENCE,
) {
  const time = frame / c.render.fps,
    phase = ((c.seed % 10007) / 10007) * Math.PI * 2;
  const drift = time * c.visual.speed,
    response = c.visual.reactivity;
  return {
    cx:
      -0.745 +
      0.035 * Math.sin(drift * 0.37 + phase) +
      feature.bass * 0.018 * response,
    cy:
      0.185 +
      0.035 * Math.cos(drift * 0.29 + phase) +
      feature.mid * 0.014 * response,
    zoom:
      c.visual.zoom *
      (1 +
        0.08 * Math.sin(drift * 0.2 + phase) +
        feature.amplitude * 0.18 * response),
    rotation: phase * 0.12 + drift * 0.08,
    hue:
      c.visual.hue +
      0.035 * Math.sin(drift * 0.17) +
      feature.treble * 0.1 * response,
    light: 0.85 + feature.amplitude * 0.45 * response,
    iterations: c.visual.iterations,
  };
}
