import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUpstreamPayload } from '../src/normalize.js';

test('normalizes api_site payloads and removes duplicate baseUrl entries', async () => {
  const payload = {
    api_site: {
      api_1: { name: 'TV-卧龙资源', api: 'https://wolongzyw.com/api.php/provide/vod' },
      api_2: { name: '🎬卧龙资源', api: 'https://wolongzyw.com/api.php/provide/vod' },
      api_3: { name: 'AV-155资源', api: 'https://155api.com/api.php/provide/vod' }
    }
  };

  const result = normalizeUpstreamPayload({
    upstreamName: 'moontv',
    payload,
    defaultGroup: 'normal',
    premiumKeywords: ['AV']
  });

  assert.equal(result.normalSources.length, 1);
  assert.equal(result.premiumSources.length, 1);
  assert.equal(result.normalSources[0].name, '卧龙资源');
  assert.equal(result.premiumSources[0].group, 'premium');
});
