import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolveEnvDir } from './paths.js';

const DEFAULT_SNAPSHOT = Object.freeze({
  normal: [],
  premium: [],
  all: [],
});

const DEFAULT_DATA_DIR = new URL('../data/', import.meta.url);

function cloneSnapshot(snapshot) {
  return {
    normal: Array.isArray(snapshot?.normal) ? [...snapshot.normal] : [],
    premium: Array.isArray(snapshot?.premium) ? [...snapshot.premium] : [],
    all: Array.isArray(snapshot?.all) ? [...snapshot.all] : [],
  };
}

function normalizeUpstreamFailures(upstreamFailures) {
  if (!Array.isArray(upstreamFailures)) {
    return undefined;
  }

  return upstreamFailures.map(item => ({
    name: item?.name ?? null,
    url: item?.url ?? null,
    message: item?.message ?? null,
    timedOut: Boolean(item?.timedOut),
    errorName: item?.errorName ?? null,
  }));
}

async function readJsonArray(fileUrl) {
  try {
    const text = await readFile(fileUrl, 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function createStateStore({ dataDir = resolveEnvDir('DATA_DIR', DEFAULT_DATA_DIR) } = {}) {
  let snapshot = cloneSnapshot(DEFAULT_SNAPSHOT);
  let status = {
    ok: true,
    hasSnapshot: false,
    lastRefreshAt: null,
    lastSuccessAt: null,
    lastError: null,
  };

  async function writeSnapshotFiles(nextSnapshot) {
    await mkdir(dataDir, { recursive: true });
    await Promise.all([
      writeFile(new URL('normal.json', dataDir), `${JSON.stringify(nextSnapshot.normal, null, 2)}\n`, 'utf8'),
      writeFile(new URL('premium.json', dataDir), `${JSON.stringify(nextSnapshot.premium, null, 2)}\n`, 'utf8'),
      writeFile(new URL('all.json', dataDir), `${JSON.stringify(nextSnapshot.all, null, 2)}\n`, 'utf8'),
    ]);
  }

  async function hydrateFromDisk() {
    await mkdir(dataDir, { recursive: true });

    const [normal, premium, all] = await Promise.all([
      readJsonArray(new URL('normal.json', dataDir)),
      readJsonArray(new URL('premium.json', dataDir)),
      readJsonArray(new URL('all.json', dataDir)),
    ]);

    if (normal === null && premium === null && all === null) {
      return false;
    }

    const hydrated = {
      normal: normal ?? [],
      premium: premium ?? [],
      all: all ?? [...(normal ?? []), ...(premium ?? [])],
    };

    snapshot = cloneSnapshot(hydrated);
    status = {
      ...status,
      hasSnapshot: true,
      ok: true,
      sourceCount: snapshot.all.length,
      hydratedAt: new Date().toISOString(),
    };

    return true;
  }

  async function commitSnapshot(nextSnapshot, context = {}) {
    const finalized = cloneSnapshot(nextSnapshot);
    await writeSnapshotFiles(finalized);

    snapshot = finalized;
    status = {
      ...status,
      ok: true,
      hasSnapshot: true,
      lastRefreshAt: context.refreshedAt ?? new Date().toISOString(),
      lastSuccessAt: context.refreshedAt ?? new Date().toISOString(),
      lastError: null,
      upstreamFailures: undefined,
      sourceCount: context.sourceCount ?? finalized.all.length,
      upstreamCount: context.upstreamCount ?? undefined,
    };
  }

  function markRefreshError(error, context = {}) {
    status = {
      ...status,
      ok: false,
      lastRefreshAt: context.refreshedAt ?? new Date().toISOString(),
      lastError: error instanceof Error ? error.message : String(error),
      upstreamFailures: normalizeUpstreamFailures(context.upstreamFailures),
    };
  }

  return {
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    getStatus() {
      return { ...status };
    },
    hydrateFromDisk,
    commitSnapshot,
    markRefreshError,
  };
}
