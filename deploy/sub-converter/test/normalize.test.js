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

test('normalizes sources arrays, preserves optional fields, and defaults priority to 1', async () => {
  const payload = {
    sources: [
      {
        name: 'Regular Source',
        api: 'https://example.com/api',
        searchPath: '/search',
        detailPath: '/detail',
        headers: { 'X-Test': '1' },
        priority: '0'
      },
      {
        name: 'Premium Source',
        api: 'https://premium.example.com/api',
        group: 'premium',
        priority: 5
      },
      {
        name: 'Fallback Source',
        api: 'https://fallback.example.com/api',
        priority: 'abc'
      }
    ]
  };

  const result = normalizeUpstreamPayload({
    upstreamName: 'test',
    payload,
    defaultGroup: 'normal'
  });

  assert.equal(result.normalSources.length, 2);
  const [regular, fallback] = result.normalSources;
  assert.equal(regular.priority, 1);
  assert.deepEqual(regular.headers, { 'X-Test': '1' });
  assert.equal(regular.searchPath, '/search');
  assert.equal(regular.detailPath, '/detail');
  assert.equal(fallback.priority, 1);
  assert.equal(result.premiumSources.length, 1);
  assert.equal(result.premiumSources[0].priority, 5);
});
