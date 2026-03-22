import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStateStore } from '../src/state.js';

test('state store hydrates snapshot from persisted files on startup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sub-converter-state-'));

  await writeFile(join(dir, 'normal.json'), JSON.stringify([{ id: 'n1', baseUrl: 'https://n.example' }]));
  await writeFile(join(dir, 'premium.json'), JSON.stringify([{ id: 'p1', baseUrl: 'https://p.example' }]));
  await writeFile(join(dir, 'all.json'), JSON.stringify([{ id: 'n1', baseUrl: 'https://n.example' }, { id: 'p1', baseUrl: 'https://p.example' }]));

  const store = createStateStore({ dataDir: new URL(`file://${dir}/`) });
  await store.hydrateFromDisk();

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.normal.length, 1);
  assert.equal(snapshot.premium.length, 1);
  assert.equal(snapshot.all.length, 2);

  const status = store.getStatus();
  assert.equal(status.hasSnapshot, true);
});
