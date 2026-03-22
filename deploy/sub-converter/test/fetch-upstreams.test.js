import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchUpstreams } from '../src/fetch-upstreams.js';

test('fetchUpstreams reports structured timeout failure metadata', async () => {
  const definitions = [{ name: 'slow-upstream', url: 'https://slow.example/config.json' }];

  const fetchImpl = (_url, init) => {
    return new Promise((resolve, reject) => {
      if (!init?.signal) {
        reject(new Error('missing abort signal'));
        return;
      }

      init.signal.addEventListener('abort', () => {
        reject(init.signal.reason ?? new Error('aborted'));
      }, { once: true });

      // never resolve; rely on timeout abort
      void resolve;
    });
  };

  const { results, failures } = await fetchUpstreams(definitions, {
    fetchImpl,
    timeoutMs: 20,
  });

  assert.equal(results.length, 0);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, 'slow-upstream');
  assert.equal(failures[0].url, 'https://slow.example/config.json');
  assert.equal(failures[0].timedOut, true);
  assert.match(failures[0].message, /timed out/i);
});
