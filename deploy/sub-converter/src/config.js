import { readFile } from 'node:fs/promises';
import { loadPremiumKeywords } from './classify.js';

const upstreamsPath = new URL('../config/upstreams.json', import.meta.url);
const premiumRulesPath = new URL('../rules/premium_keywords.txt', import.meta.url);

export async function loadUpstreamDefinitions() {
  const content = await readFile(upstreamsPath, 'utf8');
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : [];
}

export async function loadPremiumRulesText() {
  return readFile(premiumRulesPath, 'utf8');
}

export async function loadPremiumKeywordsFromRules() {
  const text = await loadPremiumRulesText();
  return loadPremiumKeywords(text);
}
