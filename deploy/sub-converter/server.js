import { createServer as createHttpServer } from 'node:http';
import { loadPremiumKeywordsFromRules, loadUpstreamDefinitions } from './src/config.js';
import { fetchUpstreams } from './src/fetch-upstreams.js';
import { normalizeUpstreamPayload } from './src/normalize.js';
import { createStateStore } from './src/state.js';

const DEFAULT_PORT = 8080;
const DEFAULT_REFRESH_INTERVAL_MS = 21600000;

function parseRefreshInterval(rawValue) {
  if (!rawValue) {
    return DEFAULT_REFRESH_INTERVAL_MS;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REFRESH_INTERVAL_MS;
  }

  return parsed;
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(`${JSON.stringify(body)}\n`);
}

export function createServer({ getSnapshot, getStatus }) {
  return createHttpServer((req, res) => {
    const method = req.method ?? 'GET';
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');

    if (method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    if (requestUrl.pathname === '/healthz') {
      return sendJson(res, 200, {
        ok: true,
        ...getStatus(),
      });
    }

    if (requestUrl.pathname === '/status.json') {
      return sendJson(res, 200, getStatus());
    }

    const snapshot = getSnapshot();

    if (requestUrl.pathname === '/feeds/normal.json') {
      return sendJson(res, 200, snapshot.normal ?? []);
    }

    if (requestUrl.pathname === '/feeds/premium.json') {
      return sendJson(res, 200, snapshot.premium ?? []);
    }

    if (requestUrl.pathname === '/feeds/all.json') {
      return sendJson(res, 200, snapshot.all ?? []);
    }

    return sendJson(res, 404, { ok: false, error: 'Not Found' });
  });
}

function dedupeByBaseUrl(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.baseUrl) {
      continue;
    }

    if (!map.has(entry.baseUrl)) {
      map.set(entry.baseUrl, entry);
    }
  }

  return Array.from(map.values());
}

async function buildSnapshot() {
  const [definitions, premiumKeywords] = await Promise.all([
    loadUpstreamDefinitions(),
    loadPremiumKeywordsFromRules(),
  ]);

  const { results, failures } = await fetchUpstreams(definitions);
  if (failures.length > 0) {
    const names = failures.map(item => item.definition?.name || 'unknown').join(', ');
    throw new Error(`Failed to refresh one or more upstreams: ${names}`);
  }

  const normal = [];
  const premium = [];

  for (const upstream of results) {
    const normalized = normalizeUpstreamPayload({
      upstreamName: upstream.definition?.name,
      payload: upstream.payload,
      defaultGroup: upstream.definition?.defaultGroup,
      premiumKeywords,
      allowKeywordPromotion: upstream.definition?.allowKeywordPromotion,
    });

    normal.push(...normalized.normalSources);
    premium.push(...normalized.premiumSources);
  }

  const dedupedNormal = dedupeByBaseUrl(normal);
  const dedupedPremium = dedupeByBaseUrl(premium);

  return {
    snapshot: {
      normal: dedupedNormal,
      premium: dedupedPremium,
      all: dedupeByBaseUrl([...dedupedNormal, ...dedupedPremium]),
    },
    upstreamCount: results.length,
  };
}

export async function startService({ port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10) || DEFAULT_PORT } = {}) {
  const state = createStateStore();

  async function refresh() {
    const refreshedAt = new Date().toISOString();

    try {
      const { snapshot, upstreamCount } = await buildSnapshot();
      await state.commitSnapshot(snapshot, {
        refreshedAt,
        sourceCount: snapshot.all.length,
        upstreamCount,
      });
    } catch (error) {
      state.markRefreshError(error, { refreshedAt });
      console.error('[sub-converter] refresh failed:', error);
    }
  }

  const server = createServer({
    getSnapshot: () => state.getSnapshot(),
    getStatus: () => state.getStatus(),
  });

  const refreshIntervalMs = parseRefreshInterval(process.env.REFRESH_INTERVAL_MS);

  await refresh();
  const timer = setInterval(() => {
    void refresh();
  }, refreshIntervalMs);

  timer.unref?.();

  server.on('close', () => {
    clearInterval(timer);
  });

  await new Promise(resolve => server.listen(port, resolve));
  console.log(`[sub-converter] listening on :${port}`);

  return { server, refresh };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startService().catch(error => {
    console.error('[sub-converter] failed to start:', error);
    process.exitCode = 1;
  });
}
