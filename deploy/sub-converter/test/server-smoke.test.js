import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('server exposes health and feed endpoints', async () => {
  const server = createServer({
    getSnapshot: () => ({ normal: [], premium: [], all: [] }),
    getStatus: () => ({ ok: true })
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);

  const feed = await fetch(`http://127.0.0.1:${port}/feeds/normal.json`);
  assert.equal(feed.status, 200);

  server.close();
});
