import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportComposition } from '../apps/render/src/pipeline.js';
import { parseComposition } from '../packages/audiovisual/src/index.js';

test('an existing output directory is refused without changing its files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ambient-output-test-'));
  try {
    await writeFile(join(directory, 'keep.txt'), 'existing artwork');
    const c = parseComposition(
      JSON.parse(
        await readFile('compositions/quiet-orbit/composition.json', 'utf8'),
      ),
    );
    await assert.rejects(exportComposition(c, directory), /EEXIST/);
    assert.equal(
      await readFile(join(directory, 'keep.txt'), 'utf8'),
      'existing artwork',
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});
