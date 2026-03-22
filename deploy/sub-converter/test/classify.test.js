import test from 'node:test';
import assert from 'node:assert/strict';
import { isPremiumName, loadPremiumKeywords } from '../src/classify.js';

test('MoonTV AV-like names are classified as premium', async () => {
  const keywords = ['AV', '番号', '福利'];
  assert.equal(isPremiumName('AV-155资源', keywords), true);
  assert.equal(isPremiumName('番号资源', keywords), true);
  assert.equal(isPremiumName('卧龙资源', keywords), false);
});

test('loadPremiumKeywords strips blank and commented lines', async () => {
  const raw = `
# comment should be ignored
AV
   番号

福利
# another comment
`;

  assert.deepEqual(loadPremiumKeywords(raw), ['AV', '番号', '福利']);
});
