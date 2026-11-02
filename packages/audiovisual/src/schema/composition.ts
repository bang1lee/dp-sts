export interface Composition {
  schemaVersion: 1;
  id: string;
  title: string;
  durationSeconds: number;
  seed: number;
  audio: {
    notes: string;
    gain: number;
    cps: number;
    slow: number;
    attack: number;
    release: number;
    cutoff: number;
    sampleRate: number;
    fadeSeconds: number;
  };
  visual: {
    kind: 'julia';
    iterations: number;
    zoom: number;
    speed: number;
    reactivity: number;
    hue: number;
  };
  render: { width: number; height: number; fps: number };
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Expected ${name} object`);
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  name: string,
  min: number,
  max: number,
  fallback?: number,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== 'number' ||
    !Number.isFinite(result) ||
    result < min ||
    result > max
  )
    throw new Error(`${name} must be finite and between ${min} and ${max}`);
  return result;
}
export function parseComposition(value: unknown): Composition {
  const c = object(value, 'composition');
  if (c['schemaVersion'] !== 1)
    throw new Error('Unsupported composition schemaVersion');
  const id = c['id'],
    title = c['title'];
  if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
    throw new Error('Composition id must be a lowercase slug');
  if (typeof title !== 'string' || !title.trim())
    throw new Error('Missing composition title');
  const durationSeconds = number(
    c['durationSeconds'],
    'durationSeconds',
    1,
    300,
  );
  const seed = number(c['seed'], 'seed', 0, 4294967295);
  if (!Number.isInteger(seed)) throw new Error('seed must be an integer');
  const a = object(c['audio'], 'audio'),
    v = object(c['visual'], 'visual'),
    r = object(c['render'] ?? {}, 'render');
  if (
    typeof a['notes'] !== 'string' ||
    !a['notes'].trim() ||
    a['notes'].length > 4096
  )
    throw new Error('audio.notes must contain 1–4096 characters');
  if (v['kind'] !== 'julia') throw new Error('Unsupported visual kind');
  const audio = {
    notes: a['notes'],
    gain: number(a['gain'], 'audio.gain', 0, 1),
    cps: number(a['cps'], 'audio.cps', 0.05, 4, 0.25),
    slow: number(a['slow'], 'audio.slow', 0.25, 32, 4),
    attack: number(a['attack'], 'audio.attack', 0.01, 10, 1.2),
    release: number(a['release'], 'audio.release', 0.01, 20, 2.5),
    cutoff: number(a['cutoff'], 'audio.cutoff', 80, 16000, 1800),
    sampleRate: number(
      a['sampleRate'],
      'audio.sampleRate',
      44100,
      48000,
      48000,
    ),
    fadeSeconds: number(
      a['fadeSeconds'],
      'audio.fadeSeconds',
      0,
      durationSeconds / 2,
      Math.min(1, durationSeconds / 2),
    ),
  };
  if (![44100, 48000].includes(audio.sampleRate))
    throw new Error('audio.sampleRate must be 44100 or 48000');
  const render = {
    width: number(r['width'], 'render.width', 160, 1920, 960),
    height: number(r['height'], 'render.height', 90, 1080, 540),
    fps: number(r['fps'], 'render.fps', 1, 60, 24),
  };
  if (![24, 25, 30, 60].includes(render.fps))
    throw new Error('render.fps must be 24, 25, 30 or 60');
  if (render.width % 2 || render.height % 2)
    throw new Error('Video dimensions must be even integers');
  if (
    Math.abs(
      durationSeconds * render.fps - Math.round(durationSeconds * render.fps),
    ) > 1e-8
  )
    throw new Error('Duration must contain an integer number of frames');
  const visual = {
    kind: 'julia' as const,
    iterations: number(v['iterations'], 'visual.iterations', 32, 192, 96),
    zoom: number(v['zoom'], 'visual.zoom', 0.2, 8, 1.1),
    speed: number(v['speed'], 'visual.speed', 0, 1, 0.12),
    reactivity: number(v['reactivity'], 'visual.reactivity', 0, 2, 0.8),
    hue: number(v['hue'], 'visual.hue', 0, 1, 0.55),
  };
  if (!Number.isInteger(visual.iterations))
    throw new Error('visual.iterations must be an integer');
  return {
    schemaVersion: 1,
    id,
    title,
    durationSeconds,
    seed,
    audio,
    visual,
    render,
  };
}
