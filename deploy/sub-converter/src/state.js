import { mkdir, writeFile } from 'node:fs/promises';

const DEFAULT_SNAPSHOT = Object.freeze({
  normal: [],
  premium: [],
  all: [],
});

function cloneSnapshot(snapshot) {
  return {
    normal: Array.isArray(snapshot?.normal) ? [...snapshot.normal] : [],
    premium: Array.isArray(snapshot?.premium) ? [...snapshot.premium] : [],
    all: Array.isArray(snapshot?.all) ? [...snapshot.all] : [],
  };
}

export function createStateStore({ dataDir = new URL('../data/', import.meta.url) } = {}) {
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
      upstreamFailures: context.upstreamFailures,
    };
  }

  return {
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    getStatus() {
      return { ...status };
    },
    commitSnapshot,
    markRefreshError,
  };
}
