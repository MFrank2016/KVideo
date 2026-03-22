const DEFAULT_FETCH_TIMEOUT_MS = 15000;

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isTimeoutError(error) {
  if (!error) {
    return false;
  }

  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }

  const message = toErrorMessage(error);
  return /timed out|timeout/i.test(message);
}

async function fetchOne(definition, { fetchImpl, timeoutMs }) {
  const name = String(definition?.name ?? '').trim() || 'upstream';
  const url = String(definition?.url ?? '').trim();

  if (!url) {
    throw new Error(`Upstream ${name} is missing url`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Upstream ${name} timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Upstream ${name} request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();

    return {
      definition,
      name,
      url,
      status: response.status,
      fetchedAt: new Date().toISOString(),
      payload,
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFailure(definition, error) {
  const name = String(definition?.name ?? '').trim() || 'upstream';
  const url = String(definition?.url ?? '').trim();
  const message = toErrorMessage(error);

  return {
    definition,
    name,
    url,
    message,
    timedOut: isTimeoutError(error),
    errorName: error?.name ?? null,
    error,
  };
}

export async function fetchUpstreams(
  definitions,
  {
    fetchImpl = fetch,
    timeoutMs = Number.parseInt(process.env.UPSTREAM_FETCH_TIMEOUT_MS ?? `${DEFAULT_FETCH_TIMEOUT_MS}`, 10) || DEFAULT_FETCH_TIMEOUT_MS,
  } = {}
) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return { results: [], failures: [] };
  }

  const settled = await Promise.allSettled(
    definitions.map(definition => fetchOne(definition, { fetchImpl, timeoutMs }))
  );

  const results = [];
  const failures = [];

  for (let index = 0; index < settled.length; index += 1) {
    const item = settled[index];
    if (item.status === 'fulfilled') {
      results.push(item.value);
      continue;
    }

    failures.push(normalizeFailure(definitions[index], item.reason));
  }

  return { results, failures };
}
