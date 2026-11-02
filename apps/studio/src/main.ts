import { parseComposition, type Composition } from '@ambient-lab/audiovisual';
import { renderAudio } from '@ambient-lab/audiovisual/offline';
import { createFractalRenderer } from '@ambient-lab/audiovisual/visual';
import manifest from '../../../compositions/quiet-orbit/composition.json?raw';

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const editor = element<HTMLTextAreaElement>('score');
const status = element<HTMLParagraphElement>('status');
const prepare = element<HTMLButtonElement>('prepare');
const play = element<HTMLButtonElement>('play');
const stop = element<HTMLButtonElement>('stop');
const download = element<HTMLButtonElement>('download');
const clock = element<HTMLOutputElement>('clock');
const canvas = element<HTMLCanvasElement>('fractal');
const renderer = createFractalRenderer(canvas);
let composition = parseComposition(JSON.parse(manifest));
editor.value = JSON.stringify(composition, null, 2);
let master: Awaited<ReturnType<typeof renderAudio>> | undefined;
let context: AudioContext | undefined;
let source: AudioBufferSourceNode | undefined;
let animation = 0;
let generation = 0;
let preparing = false;
renderer.draw(composition, 0);

function stopPlayback() {
  generation++;
  cancelAnimationFrame(animation);
  if (source) {
    source.onended = null;
    source.stop();
    source.disconnect();
    source = undefined;
  }
  if (context) {
    void context.close();
    context = undefined;
  }
  stop.disabled = true;
  play.disabled = !master || preparing;
}
function save(bytes: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function updateTitle(c: Composition) {
  element('composition-title').textContent = c.title;
  element('format').textContent =
    `${c.render.width} × ${c.render.height} · ${c.render.fps} fps · ${c.durationSeconds}s`;
}
updateTitle(composition);
editor.addEventListener('input', () => {
  stopPlayback();
  master = undefined;
  play.disabled = download.disabled = true;
  status.textContent =
    'Score changed. Prepare to hear and export this version.';
});
prepare.addEventListener('click', async () => {
  stopPlayback();
  preparing = true;
  master = undefined;
  prepare.disabled = play.disabled = download.disabled = editor.disabled = true;
  status.textContent =
    'Rendering Strudel audio and reading its frequency bands…';
  try {
    composition = parseComposition(JSON.parse(editor.value));
    const rendered = await renderAudio(composition);
    master = rendered;
    updateTitle(composition);
    renderer.draw(composition, 0, rendered.features[0]);
    clock.textContent = `0.0 / ${composition.durationSeconds}s`;
    status.textContent = `Ready. ${rendered.eventCount} note events, stereo ${composition.audio.sampleRate / 1000} kHz. Press Play to listen.`;
    play.disabled = download.disabled = false;
  } catch (error) {
    status.textContent = `Could not prepare: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    preparing = false;
    prepare.disabled = editor.disabled = false;
  }
});
play.addEventListener('click', async () => {
  if (!master) return;
  stopPlayback();
  const attempt = generation;
  play.disabled = true;
  stop.disabled = false;
  try {
    const active = new AudioContext({
      sampleRate: composition.audio.sampleRate,
    });
    context = active;
    await active.resume();
    if (attempt !== generation) {
      if (active.state !== 'closed') await active.close();
      return;
    }
    const buffer = active.createBuffer(
      2,
      master.channels[0].length,
      composition.audio.sampleRate,
    );
    master.channels.forEach((channel, index) =>
      buffer.getChannelData(index).set(channel),
    );
    const node = active.createBufferSource();
    source = node;
    node.buffer = buffer;
    node.connect(active.destination);
    const start = active.currentTime + 0.05;
    node.onended = () => {
      stopPlayback();
      status.textContent = 'Finished. Play again or save the master.';
      clock.textContent = `${composition.durationSeconds.toFixed(1)} / ${composition.durationSeconds}s`;
    };
    node.start(start);
    status.textContent =
      'Playing the exported audio master. The fractal follows amplitude and frequency bands.';
    const draw = () => {
      const seconds = Math.max(0, active.currentTime - start);
      const frame = Math.min(
        master!.features.length - 1,
        Math.floor(seconds * composition.render.fps),
      );
      renderer.draw(composition, frame, master!.features[frame]);
      clock.textContent = `${Math.min(seconds, composition.durationSeconds).toFixed(1)} / ${composition.durationSeconds}s`;
      animation = requestAnimationFrame(draw);
    };
    draw();
  } catch (error) {
    stopPlayback();
    status.textContent = `Playback failed: ${String(error)}`;
  }
});
stop.addEventListener('click', () => {
  stopPlayback();
  status.textContent = 'Stopped. Ready to play again.';
});
download.addEventListener('click', () => {
  if (master)
    save(master.wav.slice().buffer, 'audio/wav', `${composition.id}.wav`);
});
element('save-score').addEventListener('click', () => {
  try {
    const c = parseComposition(JSON.parse(editor.value));
    save(
      JSON.stringify(c, null, 2) + '\n',
      'application/json',
      'composition.json',
    );
  } catch (error) {
    status.textContent = `Invalid score: ${String(error)}`;
  }
});
window.addEventListener('pagehide', stopPlayback);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopPlayback();
    renderer.dispose();
  });
