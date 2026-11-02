export interface BridgeBundle {
  version: 1;
  duration: number;
  fps: number;
  sourceStart: number;
  audio: { file: string; sha256: string; sourceSha256: string };
  channels: string[];
  frames: number[][];
  fourier: {
    modes: number[];
    coefficients: [number, number][];
    phases: number[][];
  };
}

export function validateBundle(value: unknown): asserts value is BridgeBundle {
  const b = value as BridgeBundle;
  const finite = (x: unknown): x is number =>
    typeof x === 'number' && Number.isFinite(x);
  if (
    !b ||
    b.version !== 1 ||
    !finite(b.duration) ||
    b.duration <= 0 ||
    !finite(b.fps) ||
    b.fps <= 0 ||
    !finite(b.sourceStart) ||
    b.sourceStart < 0 ||
    !b.audio ||
    b.audio.file !== 'audio.wav' ||
    !/^[a-f0-9]{64}$/.test(b.audio.sha256) ||
    !/^[a-f0-9]{64}$/.test(b.audio.sourceSha256)
  )
    throw new Error('Invalid bridge metadata');
  if (
    !Array.isArray(b.channels) ||
    !b.channels.length ||
    new Set(b.channels).size !== b.channels.length ||
    !b.channels.every(
      (c) => typeof c === 'string' && /^[a-z][a-z0-9_]*$/.test(c),
    ) ||
    !b.channels.includes('alignment') ||
    !Array.isArray(b.frames) ||
    b.frames.length !== Math.ceil(b.duration * b.fps) ||
    !b.frames.every(
      (row) =>
        Array.isArray(row) &&
        row.length === b.channels.length &&
        row.every(finite),
    )
  )
    throw new Error('Invalid channels or frames');
  const f = b.fourier;
  if (
    !f ||
    !Array.isArray(f.modes) ||
    !f.modes.length ||
    !f.modes.every(Number.isInteger) ||
    !Array.isArray(f.coefficients) ||
    f.coefficients.length !== f.modes.length ||
    !f.coefficients.every(
      (c) => Array.isArray(c) && c.length === 2 && c.every(finite),
    ) ||
    !Array.isArray(f.phases) ||
    !f.phases.length ||
    !f.phases.every(
      (row) =>
        Array.isArray(row) &&
        row.length === f.modes.length &&
        row.every(finite),
    )
  )
    throw new Error('Invalid Fourier data');
}

/** Pure, seekable sampling. Caller supplies audio playback time, not wall time. */
export function sampleControls(
  b: BridgeBundle,
  seconds: number,
): Record<string, number> {
  if (!Number.isFinite(seconds)) throw new Error('Time must be finite');
  const p = Math.max(0, Math.min(b.frames.length - 1, seconds * b.fps));
  const i = Math.floor(p),
    j = Math.min(i + 1, b.frames.length - 1),
    a = p - i;
  return Object.fromEntries(
    b.channels.map((c, k) => [
      c,
      b.frames[i][k] * (1 - a) + b.frames[j][k] * a,
    ]),
  );
}

export function samplePoints(b: BridgeBundle, alignment: number): number[] {
  if (!Number.isFinite(alignment)) throw new Error('Alignment must be finite');
  const a = Math.max(0, Math.min(1, alignment));
  return b.fourier.phases.flatMap((row, j) => {
    const theta = (j * 2 * Math.PI) / b.fourier.phases.length;
    let x = 0,
      y = 0;
    b.fourier.modes.forEach((mode, k) => {
      const phase = theta * mode + (1 - a) * row[k];
      const [re, im] = b.fourier.coefficients[k];
      x += re * Math.cos(phase) - im * Math.sin(phase);
      y += re * Math.sin(phase) + im * Math.cos(phase);
    });
    return [x, y, 0];
  });
}

/** Adapter for an already loaded cables patch; does not create a patch file. */
export function applyToCables(
  patch: { setVariable(name: string, value: number): void },
  b: BridgeBundle,
  seconds: number,
) {
  const controls = sampleControls(b, seconds);
  for (const [name, value] of Object.entries(controls))
    patch.setVariable(`ambient_${name}`, value);
  return controls;
}
