export async function fetchUpstreams(definitions, { fetchImpl = fetch } = {}) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return { results: [], failures: [] };
  }

  const settled = await Promise.allSettled(
    definitions.map(async definition => {
      const name = String(definition?.name ?? '').trim() || 'upstream';
      const url = String(definition?.url ?? '').trim();

      if (!url) {
        throw new Error(`Upstream ${name} is missing url`);
      }

      const response = await fetchImpl(url);
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
    })
  );

  const results = [];
  const failures = [];

  for (let index = 0; index < settled.length; index += 1) {
    const item = settled[index];
    if (item.status === 'fulfilled') {
      results.push(item.value);
      continue;
    }

    failures.push({
      definition: definitions[index],
      error: item.reason,
    });
  }

  return { results, failures };
}
