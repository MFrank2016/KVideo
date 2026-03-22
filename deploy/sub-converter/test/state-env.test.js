import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStateStore } from '../src/state.js';

test('createStateStore honors DATA_DIR env override when persisting snapshots', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'sub-converter-data-'));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = tempDir;

  try {
    const store = createStateStore();
    const snapshot = {
      normal: [{ id: 'env-data-normal', baseUrl: 'https://env.example' }],
      premium: [],
      all: [],
    };
    const now = new Date().toISOString();

    await store.commitSnapshot(snapshot, { refreshedAt: now });

    const persisted = JSON.parse(await readFile(join(tempDir, 'normal.json'), 'utf8'));
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].id, 'env-data-normal');
  } finally {
    if (previous === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previous;
    }
  }
});
