import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadUpstreamDefinitions, loadPremiumRulesText } from '../src/config.js';

test('loadUpstreamDefinitions respects UPSTREAMS_FILE env override', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'sub-converter-upstreams-'));
  const customPath = join(tempDir, 'upstreams.json');
  await writeFile(customPath, JSON.stringify([{ name: 'custom', url: 'https://custom.example/config.json' }]));

  const previous = process.env.UPSTREAMS_FILE;
  process.env.UPSTREAMS_FILE = customPath;
  try {
    const definitions = await loadUpstreamDefinitions();
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].name, 'custom');
  } finally {
    if (previous === undefined) {
      delete process.env.UPSTREAMS_FILE;
    } else {
      process.env.UPSTREAMS_FILE = previous;
    }
  }
});

test('loadPremiumRulesText respects PREMIUM_KEYWORDS_FILE env override', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'sub-converter-rules-'));
  const customPath = join(tempDir, 'premium_keywords.txt');
  await writeFile(customPath, 'custom keyword');

  const previous = process.env.PREMIUM_KEYWORDS_FILE;
  process.env.PREMIUM_KEYWORDS_FILE = customPath;
  try {
    const text = await loadPremiumRulesText();
    assert.equal(text.trim(), 'custom keyword');
  } finally {
    if (previous === undefined) {
      delete process.env.PREMIUM_KEYWORDS_FILE;
    } else {
      process.env.PREMIUM_KEYWORDS_FILE = previous;
    }
  }
});
