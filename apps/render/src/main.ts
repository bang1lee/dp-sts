#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseComposition } from '@ambient-lab/audiovisual';
import { chromium } from 'playwright';
import { exportComposition, reproduce } from './pipeline.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      composition: { type: 'string' },
      out: { type: 'string' },
      duration: { type: 'string' },
    },
    allowPositionals: true,
  });
  const command = positionals[0] ?? 'inspect';
  if (positionals.length > 1)
    throw new Error(
      'Expected a single command: inspect, doctor, audio, export or reproduce',
    );
  if (['inspect', 'export', 'audio', 'reproduce'].includes(command)) {
    const path = resolve(
      values.composition ?? 'compositions/quiet-orbit/composition.json',
    );
    const raw = JSON.parse(await readFile(path, 'utf8'));
    if (values.duration) raw.durationSeconds = Number(values.duration);
    const composition = parseComposition(raw);
    if (command !== 'inspect') {
      const out =
        values.out ?? `runs/${composition.id}-${command}-${Date.now()}`;
      if (command === 'reproduce') await reproduce(composition, out);
      else await exportComposition(composition, out, command === 'audio');
      return;
    }
    console.log(
      JSON.stringify({ path, composition, exportImplemented: true }, null, 2),
    );
    return;
  }
  if (command !== 'doctor')
    throw new Error(
      `Unknown command: ${command}. Use inspect, doctor, audio, export or reproduce.`,
    );
  const browser = await chromium.launch({
    headless: true,
    ...(process.env['CHROME_PATH']
      ? { executablePath: process.env['CHROME_PATH'] }
      : { channel: 'chrome' }),
  });
  try {
    const page = await browser.newPage();
    const result = (await page.evaluate(`(async () => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const extension = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const audio = new OfflineAudioContext(1, 4800, 48000);
      const oscillator = audio.createOscillator();
      oscillator.connect(audio.destination); oscillator.start();
      const buffer = await audio.startRendering();
      return { webgl2: Boolean(gl), renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        webAudio: typeof AudioContext !== 'undefined', audioSamples: buffer.length,
        audioPeak: Math.max(...buffer.getChannelData(0)) };
    })()`)) as {
      webgl2: boolean;
      webAudio: boolean;
      audioSamples: number;
      audioPeak: number;
    };
    console.log(JSON.stringify(result, null, 2));
    if (
      !result.webgl2 ||
      !result.webAudio ||
      result.audioSamples !== 4800 ||
      result.audioPeak <= 0
    ) {
      throw new Error('Browser graphics/audio prerequisite check failed');
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
