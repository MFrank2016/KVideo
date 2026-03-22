import { createHash } from 'node:crypto';
import { isPremiumName } from './classify.js';

const BASE_URL_FIELDS = ['baseUrl', 'url', 'api', 'apiUrl', 'api_url'];
const LEADING_SYMBOLS = /^[\p{P}\p{S}\s]+/u;
const TV_AV_PREFIX = /^(?:TV|AV)-/i;

function normalizeBaseUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  let trimmed = String(rawUrl).trim();
  if (!trimmed) {
    return '';
  }

  while (trimmed.endsWith('/') && !trimmed.endsWith('://')) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed;
}

function resolveBaseUrl(entry) {
  for (const field of BASE_URL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) {
      continue;
    }

    const value = entry[field];
    if (typeof value !== 'string') {
      continue;
    }

    const normalized = normalizeBaseUrl(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function getRawName(entry, sourceKey, baseUrl) {
  const priorityKeys = ['name', 'title', 'label', 'id'];

  for (const key of priorityKeys) {
    if (entry == null || !Object.prototype.hasOwnProperty.call(entry, key)) {
      continue;
    }

    const value = entry[key];
    if (value == null) {
      continue;
    }

    const asString = String(value).trim();
    if (asString) {
      return asString;
    }
  }

  if (sourceKey) {
    return String(sourceKey);
  }

  return baseUrl;
}

function cleanName(inputName) {
  const fallback = typeof inputName === 'string' ? inputName.trim() : '';
  if (!fallback) {
    return fallback;
  }

  let cleaned = fallback;

  for (let i = 0; i < 5; i += 1) {
    const strippedSymbols = cleaned.replace(LEADING_SYMBOLS, '');
    const strippedPrefixes = strippedSymbols.replace(TV_AV_PREFIX, '').trim();

    if (!strippedPrefixes) {
      cleaned = '';
      break;
    }

    if (strippedPrefixes === cleaned) {
      break;
    }

    cleaned = strippedPrefixes;
  }

  return cleaned || fallback;
}

function parseEnabled(value) {
  if (value === undefined) {
    return true;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'false' || lowered === '0') {
      return false;
    }

    if (lowered === 'true' || lowered === '1') {
      return true;
    }
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return Boolean(value);
}

function createPriorityResolver() {
  let counter = 1;
  return (value) => {
    const parsed = typeof value === 'number'
      ? value
      : (typeof value === 'string' ? Number(value.trim()) : NaN);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }

    return counter++;
  };
}

function normalizeGroupValue(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'premium') {
    return 'premium';
  }

  if (normalized === 'normal') {
    return 'normal';
  }

  return null;
}

function sanitizeIdPart(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateId(upstreamName, providedId, baseUrl, sourceKey) {
  const asString = typeof providedId === 'string' ? providedId.trim() : '';
  if (asString) {
    return asString;
  }

  const prefix = sanitizeIdPart(upstreamName) || 'source';
  const hashInput = baseUrl || sourceKey || 'unnamed';
  const hash = createHash('sha1').update(hashInput).digest('hex').slice(0, 8);

  return `${prefix}-${hash}`;
}

function buildNameSuffix(entry) {
  if (!entry) {
    return '';
  }

  const candidates = [];

  try {
    const parsed = new URL(entry.baseUrl);
    if (parsed.host) {
      candidates.push(parsed.host);
    }

    const path = parsed.pathname.replace(/\/+$/u, '');
    if (path && path !== '/') {
      candidates.push(path);
    }
  } catch (error) {
    // ignore invalid URLs
  }

  if (entry.sourceKey) {
    candidates.push(entry.sourceKey);
  }

  if (entry.id) {
    candidates.push(entry.id);
  }

  return candidates.find(value => Boolean(value)) || entry.baseUrl;
}

function annotateDuplicateNames(entries) {
  const buckets = entries.reduce((map, entry) => {
    const key = entry.name;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(entry);
    return map;
  }, new Map());

  for (const [name, group] of buckets) {
    if (group.length < 2) {
      continue;
    }

    for (const entry of group) {
      const suffix = buildNameSuffix(entry);
      if (suffix) {
        entry.name = `${entry.name} (${suffix})`;
      }
    }
  }
}

function extractEntries(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.map(item => ({ entry: item }));
  }

  if (payload.sources && Array.isArray(payload.sources)) {
    return payload.sources.map(item => ({ entry: item }));
  }

  if (payload.list && Array.isArray(payload.list)) {
    return payload.list.map(item => ({ entry: item }));
  }

  if (payload.api_site && typeof payload.api_site === 'object') {
    return Object.entries(payload.api_site)
      .filter(([, entry]) => entry && typeof entry === 'object')
      .map(([key, entry]) => ({ entry, sourceKey: key }));
  }

  return [];
}

export function normalizeUpstreamPayload({
  upstreamName = 'source',
  payload,
  defaultGroup = 'normal',
  premiumKeywords = [],
  allowKeywordPromotion,
}) {
  const entries = extractEntries(payload);
  if (entries.length === 0) {
    return { normalSources: [], premiumSources: [] };
  }

  const effectiveKeywords = Array.isArray(premiumKeywords) ? premiumKeywords : [];
  const keywordPromotionEnabled = allowKeywordPromotion !== false && effectiveKeywords.length > 0;
  const defaultGroupValue = normalizeGroupValue(defaultGroup) || 'normal';
  const priorityResolver = createPriorityResolver();
  const uniqueMap = new Map();

  for (const { entry, sourceKey } of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const baseUrl = resolveBaseUrl(entry);
    if (!baseUrl) {
      continue;
    }

    if (uniqueMap.has(baseUrl)) {
      continue;
    }

    const rawName = getRawName(entry, sourceKey, baseUrl);
    const cleanedName = cleanName(rawName);
    const normalizedGroup = normalizeGroupValue(entry.group) || defaultGroupValue;
    const isKeywordPremium = keywordPromotionEnabled && normalizedGroup !== 'premium' && isPremiumName(rawName, effectiveKeywords);
    const finalGroup = isKeywordPremium ? 'premium' : normalizedGroup;
    const enabled = parseEnabled(entry.enabled);
    const priority = priorityResolver(entry.priority);
    const id = generateId(upstreamName, entry.id, baseUrl, sourceKey);

    uniqueMap.set(baseUrl, {
      id,
      name: cleanedName,
      baseUrl,
      group: finalGroup,
      enabled,
      priority,
      sourceKey,
    });
  }

  const normalized = Array.from(uniqueMap.values());
  annotateDuplicateNames(normalized);

  const finalSources = normalized.map(({ sourceKey, ...rest }) => rest);
  const normalSources = finalSources.filter(item => item.group !== 'premium');
  const premiumSources = finalSources.filter(item => item.group === 'premium');

  return { normalSources, premiumSources };
}
