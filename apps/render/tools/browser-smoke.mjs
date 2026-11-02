import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: 'chrome' }),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript(() => {
    window.__liveAnalyzers = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination, ...rest) {
      const result = connect.call(this, destination, ...rest);
      if (
        destination instanceof AudioDestinationNode &&
        this.context instanceof AudioContext
      ) {
        const analyser = this.context.createAnalyser();
        connect.call(this, analyser);
        window.__liveAnalyzers.push(analyser);
      }
      return result;
    };
  });
  await page.goto(process.env.STUDIO_URL ?? 'http://127.0.0.1:4200', {
    waitUntil: 'networkidle',
  });
  assert.equal(await page.locator('h1').textContent(), 'Quiet Orbit');
  assert.equal(await page.locator('#play').isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__liveAnalyzers.length), 0);
  const original = await page.locator('#score').inputValue();
  await page.locator('#score').fill('{');
  await page.locator('#prepare').click();
  await page.waitForFunction(() =>
    document
      .querySelector('#status')
      .textContent.startsWith('Could not prepare'),
  );
  assert.equal(await page.locator('#play').isDisabled(), true);
  const c = JSON.parse(original);
  c.durationSeconds = 2;
  c.audio.fadeSeconds = 0.2;
  await page.locator('#score').fill(JSON.stringify(c));
  await page.locator('#prepare').click();
  await page.waitForFunction(
    () => document.querySelector('#status').textContent.startsWith('Ready.'),
    null,
    { timeout: 30000 },
  );
  assert.equal(await page.locator('#play').isEnabled(), true);
  console.log(
    'PASS: no autoplay, invalid score recovery, actual Strudel preparation',
  );
  const downloading = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloading;
  const wav = await readFile(await download.path());
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.length, 44 + 2 * 48000 * 2 * 2);
  const before = await page.locator('canvas').screenshot();
  await page.locator('#play').click();
  await page.waitForFunction(() =>
    window.__liveAnalyzers.some((a) => {
      const b = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(b);
      return b.some((v) => Math.abs(v) > 0.00001);
    }),
  );
  assert.notDeepEqual(await page.locator('canvas').screenshot(), before);
  await page.locator('#stop').click();
  assert.equal(await page.locator('#play').isEnabled(), true);
  await page.evaluate(() => {
    document.querySelector('#play').click();
    document.querySelector('#stop').click();
    document.querySelector('#play').click();
  });
  await page.waitForFunction(() =>
    document.querySelector('#status').textContent.startsWith('Playing'),
  );
  await page.waitForFunction(
    () => document.querySelector('#status').textContent.startsWith('Finished'),
    null,
    { timeout: 10000 },
  );
  assert.equal(await page.locator('#stop').isDisabled(), true);
  console.log(
    'PASS: valid WAV download, audible signal, moving fractal, stop/restart, automatic end',
  );
  // Preparing a second score exercises Strudel context teardown and reinitialization.
  await page.locator('#score').fill(original);
  await page.locator('#prepare').click();
  await page.waitForFunction(
    () => document.querySelector('#status').textContent.startsWith('Ready.'),
    null,
    { timeout: 30000 },
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  assert.deepEqual(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  await mkdir('runs/verification', { recursive: true });
  await page.screenshot({
    path: 'runs/verification/studio-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: 'runs/verification/studio-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        accessibilityViolations: 0,
        browserErrors: errors,
        mobileOverflow: false,
        timing: await page.evaluate(() =>
          performance
            .getEntriesByType('paint')
            .map((e) => ({ name: e.name, ms: e.startTime })),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
