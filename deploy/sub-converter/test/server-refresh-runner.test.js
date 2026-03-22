import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createRefreshRunner } from '../server.js';

test('createRefreshRunner coalesces concurrent refreshes and avoids overlap', async () => {
  let callCount = 0;
  let active = 0;
  let peakActive = 0;

  const runRefresh = createRefreshRunner(async () => {
    callCount += 1;
    active += 1;
    peakActive = Math.max(peakActive, active);
    await delay(25);
    active -= 1;
  });

  await Promise.all([runRefresh(), runRefresh(), runRefresh()]);

  assert.equal(callCount, 1);
  assert.equal(peakActive, 1);

  await runRefresh();
  assert.equal(callCount, 2);
});
