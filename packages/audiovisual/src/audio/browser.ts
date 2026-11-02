import type { Composition } from '../schema/composition.js';

let engine: typeof import('@strudel/web') | undefined;
let initialization: Promise<void> | undefined;

export function initializeAudio(): Promise<void> {
  initialization ??= (async () => {
    const loaded = await import('@strudel/web');
    await loaded.initStrudel();
    engine = loaded;
  })().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export async function playSetupPattern(
  composition: Composition,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  await initializeAudio();
  if (!isCurrent()) return;
  if (!engine) throw new Error('Audio engine did not initialize');
  await engine.getAudioContext().resume();
  if (!isCurrent()) return;
  engine.hush();
  engine
    .note(composition.audio.notes)
    .slow(4)
    .s('sine')
    .gain(composition.audio.gain)
    .attack(0.5)
    .release(1)
    .play();
}

export function stopAudio(): void {
  engine?.hush();
}
