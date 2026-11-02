import {
  parseComposition,
  type Composition,
  type AudioFeatures,
} from '@ambient-lab/audiovisual';
import { renderAudio, toBase64 } from '@ambient-lab/audiovisual/offline';
import { createFractalRenderer } from '@ambient-lab/audiovisual/visual';
const canvas = document.querySelector<HTMLCanvasElement>('#frame')!;
const renderer = createFractalRenderer(canvas);
let composition: Composition, features: AudioFeatures[];
const api = {
  async prepare(value: unknown) {
    composition = parseComposition(value);
    const audio = await renderAudio(composition);
    features = audio.features;
    return {
      wav: toBase64(audio.wav),
      features,
      peak: audio.peak,
      eventCount: audio.eventCount,
      backend: renderer.backend,
      frames: features.length,
    };
  },
  frame(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= features.length)
      throw new Error('Invalid frame index');
    renderer.draw(composition, index, features[index]);
    return canvas.toDataURL('image/png').split(',')[1];
  },
};
Object.assign(window, { ambientRender: api });
