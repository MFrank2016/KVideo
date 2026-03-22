import { readFile } from 'node:fs/promises';
import { loadPremiumKeywords } from './classify.js';
import { resolveEnvPath } from './paths.js';

const defaultUpstreamsPath = new URL('../config/upstreams.json', import.meta.url);
const defaultPremiumRulesPath = new URL('../rules/premium_keywords.txt', import.meta.url);

function getUpstreamsPath() {
  return resolveEnvPath('UPSTREAMS_FILE', defaultUpstreamsPath);
}

function getPremiumRulesPath() {
  return resolveEnvPath('PREMIUM_KEYWORDS_FILE', defaultPremiumRulesPath);
}

export async function loadUpstreamDefinitions() {
  const content = await readFile(getUpstreamsPath(), 'utf8');
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : [];
}

export async function loadPremiumRulesText() {
  return readFile(getPremiumRulesPath(), 'utf8');
}

export async function loadPremiumKeywordsFromRules() {
  const text = await loadPremiumRulesText();
  return loadPremiumKeywords(text);
}
