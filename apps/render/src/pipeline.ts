import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';
import type { Composition } from '@ambient-lab/audiovisual';

type Prepared = {
  wav: string;
  features: unknown[];
  peak: number;
  eventCount: number;
  frames: number;
  backend: string;
};
declare const window: {
  ambientRender: {
    prepare(c: Composition): Promise<Prepared>;
    frame(index: number): string;
  };
};
const root = process.cwd();
const hash = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex');
const json = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n');

export async function sourceFingerprint(): Promise<string> {
  const files: string[] = [];
  async function walk(path: string) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (['node_modules', 'dist', '__pycache__', '.venv'].includes(entry.name))
        continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && !child.endsWith('.tsbuildinfo'))
        files.push(child);
    }
  }
  for (const dir of ['apps', 'packages', 'python']) await walk(dir);
  files.push('pnpm-lock.yaml', 'uv.lock', '.python-version', 'package.json');
  const digest = createHash('sha256');
  for (const path of files.sort())
    digest.update(path).update(await readFile(path));
  return digest.digest('hex');
}

export async function serveStudio() {
  const base = resolve(root, 'apps/studio/dist');
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url ?? '/', 'http://localhost').pathname,
      );
      const path = resolve(
        base,
        '.' + (pathname === '/' ? '/index.html' : pathname),
      );
      if (!path.startsWith(base + '/')) {
        res.writeHead(403).end();
        return;
      }
      const bytes = await readFile(path);
      res.setHeader(
        'Content-Type',
        (
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.ico': 'image/x-icon',
          } as Record<string, string>
        )[extname(path)] ?? 'application/octet-stream',
      );
      res.end(bytes);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Cannot start local renderer');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((done, reject) =>
        server.close((e) => (e ? reject(e) : done())),
      ),
  };
}

export async function exportComposition(
  c: Composition,
  out: string,
  audioOnly = false,
) {
  out = resolve(out);
  await mkdir(resolve(out, '..'), { recursive: true });
  await mkdir(out); // Refuse to overwrite an existing experiment.
  await json(join(out, 'composition.json'), c);
  await json(join(out, 'status.json'), { state: 'rendering' });
  const server = await serveStudio();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let encoder: ReturnType<typeof spawn> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env['CHROME_PATH']
        ? { executablePath: process.env['CHROME_PATH'] }
        : { channel: 'chrome' }),
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(300000);
    await page.goto(server.url + '/render.html');
    await page.waitForFunction('Boolean(window.ambientRender)');
    console.log('Rendering the Strudel audio master…');
    const prepared = await page.evaluate(
      (c) => window.ambientRender.prepare(c),
      c,
    );
    const wav = Buffer.from(prepared.wav, 'base64');
    await writeFile(join(out, 'audio.wav'), wav);
    await json(join(out, 'features.json'), prepared.features);
    const frameHashes: string[] = [];
    if (!audioOnly) {
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-fflags',
        '+bitexact',
        '-f',
        'image2pipe',
        '-framerate',
        String(c.render.fps),
        '-vcodec',
        'png',
        '-i',
        'pipe:0',
        '-i',
        join(out, 'audio.wav'),
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-threads',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-flags:v',
        '+bitexact',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-flags:a',
        '+bitexact',
        '-map_metadata',
        '-1',
        '-movflags',
        '+faststart',
        join(out, 'film.mp4'),
      ];
      encoder = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
      let encoderError = '';
      encoder.stderr?.on('data', (d) => {
        encoderError += d.toString();
      });
      // Attach immediately so early startup/pipe errors cannot become unhandled rejections.
      const completion = new Promise<void>((done, reject) => {
        encoder!.on('error', reject);
        encoder!.on('close', (code) =>
          code === 0
            ? done()
            : reject(new Error(`FFmpeg failed (${code}): ${encoderError}`)),
        );
      });
      completion.catch(() => {});
      encoder.stdin!.on('error', () => {});
      for (let frame = 0; frame < prepared.frames; frame++) {
        if (encoder.exitCode !== null)
          throw new Error(`FFmpeg stopped: ${encoderError}`);
        const png = Buffer.from(
          await page.evaluate(
            (index) => window.ambientRender.frame(index),
            frame,
          ),
          'base64',
        );
        frameHashes.push(hash(png));
        if (frame === Math.floor(prepared.frames / 2))
          await writeFile(join(out, 'poster.png'), png);
        if (!encoder.stdin!.write(png))
          await Promise.race([
            once(encoder.stdin!, 'drain'),
            completion.then(() => {
              throw new Error('Encoder ended before all frames were sent');
            }),
          ]);
        if (frame % (c.render.fps * 5) === 0)
          console.log(`Frames ${frame + 1}/${prepared.frames}`);
      }
      encoder.stdin!.end();
      await completion;
      await json(join(out, 'frames.sha256.json'), frameHashes);
    }
    const environment = {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      chrome: browser.version(),
      graphics: prepared.backend,
      ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split(
        '\n',
      )[0],
      sourceSha256: await sourceFingerprint(),
    };
    const artifacts = {
      audio: hash(wav),
      ...(audioOnly
        ? {}
        : {
            video: hash(await readFile(join(out, 'film.mp4'))),
            frames: hash(JSON.stringify(frameHashes)),
          }),
    };
    const report = {
      schemaVersion: 1,
      composition: c,
      environment,
      artifacts,
      eventCount: prepared.eventCount,
      peak: prepared.peak,
      frameCount: audioOnly ? 0 : prepared.frames,
    };
    await json(join(out, 'render.json'), report);
    const verification = JSON.parse(
      execFileSync(
        'uv',
        [
          'run',
          '--locked',
          '--package',
          'ambient-media',
          'ambient-media',
          'verify',
          '--directory',
          out,
          ...(audioOnly ? ['--audio-only'] : []),
        ],
        { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      ),
    );
    await json(join(out, 'verification.json'), verification);
    await json(join(out, 'status.json'), { state: 'complete' });
    console.log(`Saved and verified: ${out}`);
    return report;
  } catch (error) {
    encoder?.kill();
    await json(join(out, 'status.json'), {
      state: 'failed',
      error: String(error),
    });
    throw error;
  } finally {
    await browser?.close();
    await server.close();
  }
}

export async function reproduce(c: Composition, out: string) {
  out = resolve(out);
  await mkdir(resolve(out, '..'), { recursive: true });
  await mkdir(out);
  const a = await exportComposition(c, join(out, 'a'));
  const b = await exportComposition(c, join(out, 'b'));
  const checks = {
    environment:
      JSON.stringify(a.environment) === JSON.stringify(b.environment),
    audioBytes: a.artifacts.audio === b.artifacts.audio,
    everyFrame: a.artifacts.frames === b.artifacts.frames,
    videoBytes: a.artifacts.video === b.artifacts.video,
  };
  const pass = Object.values(checks).every(Boolean);
  await json(join(out, 'reproducibility.json'), {
    pass,
    checks,
    scope:
      'Identical composition and source, locked dependencies, same browser, graphics backend, FFmpeg and machine. Not a cross-platform guarantee.',
    a: a.artifacts,
    b: b.artifacts,
  });
  if (!pass)
    throw new Error(`Reproducibility check failed: ${JSON.stringify(checks)}`);
  console.log(
    'PASS: WAV bytes, every frame, and MP4 bytes match across two independent renders.',
  );
}
