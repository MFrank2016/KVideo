import test from 'node:test';
import assert from 'node:assert/strict';
import { isPremiumName } from '../src/classify.js';

test('MoonTV AV-like names are classified as premium', async () => {
  const keywords = ['AV', '番号', '福利'];
  assert.equal(isPremiumName('AV-155资源', keywords), true);
  assert.equal(isPremiumName('番号资源', keywords), true);
  assert.equal(isPremiumName('卧龙资源', keywords), false);
});
