# KVideo Docker Compose Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Docker Compose deployment for KVideo that includes multi-account auth, premium-password isolation, persistent sessions, custom site branding, auto-synced standardized subscriptions from ew/MoonTV/LunaTV, preloaded ad keywords, and a co-deployed `danmu_api` service.

**Architecture:** Add a `deploy/` stack that builds KVideo from a dedicated deployment Dockerfile, runs `logvar/danmu-api`, and introduces a lightweight Node-based `sub-converter` service. The converter periodically fetches upstream JSON configs, normalizes them into KVideo’s expected source shape, classifies normal vs premium feeds, writes stable snapshots, and serves them to KVideo over the Compose network.

**Tech Stack:** Docker Compose, Dockerfiles, Node.js 22, built-in `node:test`, plain JavaScript HTTP server/fetch APIs, KVideo runtime environment variables, danmu_api upstream image.

---

## File Structure

### New deployment scaffolding
- Create: `deploy/docker-compose.yml` — the full three-service deployment stack
- Create: `deploy/README.md` — deployment-specific setup and troubleshooting guide
- Create: `deploy/env.example` — runtime env template for KVideo/auth/ports/optional Upstash
- Create: `deploy/scripts/prepare-env.sh` — helper to copy tracked example files to local runtime files

### KVideo deployment files
- Create: `deploy/kvideo/Dockerfile` — deployment-specific build that injects build-time branding vars from a local env file before `next build`
- Create: `deploy/kvideo/env.build.example` — tracked template for build-time `NEXT_PUBLIC_*` values
- Create: `deploy/kvideo/ad_keywords.example.txt` — tracked template for ad keywords preload file

### danmu_api deployment files
- Create: `deploy/danmu_api/config/env.example` — tracked template for danmu_api runtime config
- Create: `deploy/danmu_api/.cache/.gitkeep` — keep cache directory in git

### sub-converter service
- Create: `deploy/sub-converter/package.json` — local service scripts (`start`, `test`)
- Create: `deploy/sub-converter/Dockerfile` — image build for converter service
- Create: `deploy/sub-converter/server.js` — HTTP server + refresh scheduler entrypoint
- Create: `deploy/sub-converter/src/config.js` — upstream definitions, env parsing, paths
- Create: `deploy/sub-converter/src/fetch-upstreams.js` — upstream download and shape detection
- Create: `deploy/sub-converter/src/normalize.js` — normalization, name cleaning, ID generation, de-duplication
- Create: `deploy/sub-converter/src/classify.js` — premium keyword loading and source grouping logic
- Create: `deploy/sub-converter/src/state.js` — in-memory feed state + snapshot persistence helpers
- Create: `deploy/sub-converter/config/upstreams.json` — ew/MoonTV/LunaTV upstream list and grouping hints
- Create: `deploy/sub-converter/rules/premium_keywords.txt` — MoonTV premium classification keywords
- Create: `deploy/sub-converter/data/.gitkeep` — keep snapshot directory in git
- Create: `deploy/sub-converter/test/classify.test.js` — tests for premium classification rules
- Create: `deploy/sub-converter/test/normalize.test.js` — tests for shape conversion, cleanup, and dedupe

### Existing repo files to update
- Modify: `.gitignore` — ignore generated deploy runtime files and snapshots
- Modify: `README.md` — add a “Docker Compose 部署（含 danmu_api 和订阅转换）” section that points to `deploy/`

---

### Task 1: Create deploy scaffolding and local-env workflow

**Files:**
- Create: `deploy/README.md`
- Create: `deploy/env.example`
- Create: `deploy/scripts/prepare-env.sh`
- Create: `deploy/kvideo/env.build.example`
- Create: `deploy/kvideo/ad_keywords.example.txt`
- Create: `deploy/danmu_api/config/env.example`
- Create: `deploy/danmu_api/.cache/.gitkeep`
- Create: `deploy/sub-converter/data/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing documentation/structure assertions**

Create a shell smoke test file locally while implementing (no need to commit if you fold it into manual verification) that asserts the tracked templates exist:

```bash
test -f deploy/env.example
test -f deploy/kvideo/env.build.example
test -f deploy/kvideo/ad_keywords.example.txt
test -f deploy/danmu_api/config/env.example
test -f deploy/scripts/prepare-env.sh
```

- [ ] **Step 2: Run the assertions to verify they fail before files exist**

Run:

```bash
bash -lc 'test -f deploy/env.example && test -f deploy/kvideo/env.build.example'
```

Expected: non-zero exit because the files do not exist yet.

- [ ] **Step 3: Add the deploy templates and helper script**

Use these exact starting contents.

`deploy/env.example`
```env
KVIDEO_PORT=3000
DANMU_API_PORT=9321
SUB_CONVERTER_PORT=18080

ADMIN_PASSWORD=change-me-admin
ACCOUNTS=owner:站长:super_admin,guest:访客:viewer:iptv_access
PREMIUM_PASSWORD=change-me-premium
PERSIST_SESSION=true

SUBSCRIPTION_SOURCES=[{"name":"系统普通订阅","url":"http://sub-converter:8080/feeds/normal.json"},{"name":"系统高级订阅","url":"http://sub-converter:8080/feeds/premium.json"}]
AD_KEYWORDS_FILE=/app/config/ad_keywords.txt

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`deploy/kvideo/env.build.example`
```env
NEXT_PUBLIC_SITE_NAME=KVideo 私有站
NEXT_PUBLIC_SITE_TITLE=KVideo 私有站
NEXT_PUBLIC_SITE_DESCRIPTION=私有视频聚合平台
NEXT_PUBLIC_DANMAKU_API_URL=http://danmu-api:9321
```

`deploy/kvideo/ad_keywords.example.txt`
```txt
博彩
新葡京
澳门新葡京
娱乐城
威尼斯人
澳门赌场
澳门博彩
太阳城
金沙
六合彩
真人视讯
现金网
```

`deploy/danmu_api/config/env.example`
```env
TOKEN=87654321
DANMU_API_PORT=9321
RATE_LIMIT_MAX_REQUESTS=0
```

`deploy/scripts/prepare-env.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [[ ! -f "$dst" ]]; then
    cp "$src" "$dst"
    echo "Created $dst from $src"
  else
    echo "Keeping existing $dst"
  fi
}

copy_if_missing env.example .env
copy_if_missing kvideo/env.build.example kvideo/.env.build
copy_if_missing kvideo/ad_keywords.example.txt kvideo/ad_keywords.txt
copy_if_missing danmu_api/config/env.example danmu_api/config/.env
mkdir -p danmu_api/.cache sub-converter/data
```

Update `.gitignore` with:
```gitignore
# deploy runtime artifacts
/deploy/.env
/deploy/kvideo/.env.build
/deploy/kvideo/ad_keywords.txt
/deploy/danmu_api/config/.env
/deploy/danmu_api/.cache/*
!/deploy/danmu_api/.cache/.gitkeep
/deploy/sub-converter/data/*
!/deploy/sub-converter/data/.gitkeep
```

- [ ] **Step 4: Run the helper script and verify generated local files**

Run:

```bash
bash deploy/scripts/prepare-env.sh
ls -la deploy deploy/kvideo deploy/danmu_api/config
```

Expected: `.env`, `.env.build`, `ad_keywords.txt`, and `deploy/danmu_api/config/.env` now exist locally.

- [ ] **Step 5: Commit the scaffolding**

```bash
git add .gitignore deploy
git commit -m "chore: add deployment scaffolding"
```

---

### Task 2: Implement and test subscription normalization logic

**Files:**
- Create: `deploy/sub-converter/package.json`
- Create: `deploy/sub-converter/src/config.js`
- Create: `deploy/sub-converter/src/classify.js`
- Create: `deploy/sub-converter/src/normalize.js`
- Create: `deploy/sub-converter/config/upstreams.json`
- Create: `deploy/sub-converter/rules/premium_keywords.txt`
- Test: `deploy/sub-converter/test/classify.test.js`
- Test: `deploy/sub-converter/test/normalize.test.js`

- [ ] **Step 1: Write failing tests for classification and normalization**

`deploy/sub-converter/test/classify.test.js`
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPremiumName } from '../src/classify.js';

test('MoonTV AV-like names are classified as premium', async () => {
  const keywords = ['AV', '番号', '福利'];
  assert.equal(isPremiumName('AV-155资源', keywords), true);
  assert.equal(isPremiumName('番号资源', keywords), true);
  assert.equal(isPremiumName('卧龙资源', keywords), false);
});
```

`deploy/sub-converter/test/normalize.test.js`
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUpstreamPayload } from '../src/normalize.js';

test('normalizes api_site payloads and removes duplicate baseUrl entries', async () => {
  const payload = {
    api_site: {
      api_1: { name: 'TV-卧龙资源', api: 'https://wolongzyw.com/api.php/provide/vod' },
      api_2: { name: '🎬卧龙资源', api: 'https://wolongzyw.com/api.php/provide/vod' },
      api_3: { name: 'AV-155资源', api: 'https://155api.com/api.php/provide/vod' }
    }
  };

  const result = normalizeUpstreamPayload({
    upstreamName: 'moontv',
    payload,
    defaultGroup: 'normal',
    premiumKeywords: ['AV']
  });

  assert.equal(result.normalSources.length, 1);
  assert.equal(result.premiumSources.length, 1);
  assert.equal(result.normalSources[0].name, '卧龙资源');
  assert.equal(result.premiumSources[0].group, 'premium');
});
```

- [ ] **Step 2: Run the tests to confirm they fail before implementation**

Run:

```bash
node --test deploy/sub-converter/test/*.test.js
```

Expected: FAIL with module-not-found or missing export errors.

- [ ] **Step 3: Add the converter package, upstream config, keywords, and implementation**

`deploy/sub-converter/package.json`
```json
{
  "name": "kvideo-sub-converter",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/*.test.js"
  }
}
```

`deploy/sub-converter/config/upstreams.json`
```json
[
  {
    "name": "ew",
    "url": "https://raw.githubusercontent.com/rapier15sapper/ew/refs/heads/main/test.json",
    "defaultGroup": "normal"
  },
  {
    "name": "moontv",
    "url": "https://raw.githubusercontent.com/666zmy/MoonTV/refs/heads/main/config.json",
    "defaultGroup": "normal",
    "allowKeywordPromotion": true
  },
  {
    "name": "luna-jin18",
    "url": "https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json",
    "defaultGroup": "normal"
  },
  {
    "name": "luna-jingjian",
    "url": "https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json",
    "defaultGroup": "premium"
  }
]
```

`deploy/sub-converter/rules/premium_keywords.txt`
```txt
AV
番号
麻豆
色
黄
淫
无码
福利
国产自拍
```

Implementation requirements:
- `classify.js` must export `loadPremiumKeywords(text)` and `isPremiumName(name, keywords)`.
- `normalize.js` must export `normalizeUpstreamPayload({ upstreamName, payload, defaultGroup, premiumKeywords, allowKeywordPromotion })`.
- Support array payloads, `{sources: []}`, `{list: []}`, and `{api_site: { ... }}` payloads.
- Convert `api` to `baseUrl`, clean names by removing `TV-`, `AV-`, and leading emoji/punctuation, and dedupe by `baseUrl`.
- Produce two arrays: `normalSources` and `premiumSources`, with items shaped exactly like KVideo import format (`id`, `name`, `baseUrl`, `group`, `enabled`, `priority`).

- [ ] **Step 4: Re-run the converter tests**

Run:

```bash
cd deploy/sub-converter && npm test
```

Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit the normalization layer**

```bash
git add deploy/sub-converter/package.json deploy/sub-converter/src deploy/sub-converter/config deploy/sub-converter/rules deploy/sub-converter/test
git commit -m "feat: add subscription normalization logic"
```

---

### Task 3: Build the converter HTTP service and container image

**Files:**
- Create: `deploy/sub-converter/src/fetch-upstreams.js`
- Create: `deploy/sub-converter/src/state.js`
- Create: `deploy/sub-converter/server.js`
- Create: `deploy/sub-converter/Dockerfile`
- Test: reuse `deploy/sub-converter/test/*.test.js`

- [ ] **Step 1: Write the failing service smoke test**

Add a simple HTTP smoke test file:

`deploy/sub-converter/test/server-smoke.test.js`
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('server exposes health and feed endpoints', async () => {
  const server = createServer({
    getSnapshot: () => ({ normal: [], premium: [], all: [] }),
    getStatus: () => ({ ok: true })
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);

  const feed = await fetch(`http://127.0.0.1:${port}/feeds/normal.json`);
  assert.equal(feed.status, 200);

  server.close();
});
```

- [ ] **Step 2: Run tests to verify the new smoke test fails**

Run:

```bash
cd deploy/sub-converter && npm test
```

Expected: FAIL because `createServer` or endpoints do not exist yet.

- [ ] **Step 3: Implement refresh, persistence, and HTTP serving**

Implementation requirements:
- `fetch-upstreams.js` downloads all configured upstream URLs with `fetch` and returns parsed JSON plus source metadata.
- `state.js` holds the latest successful snapshot and writes `normal.json`, `premium.json`, `all.json` to `deploy/sub-converter/data/` inside the container.
- `server.js` must:
  - export `createServer({ getSnapshot, getStatus })`
  - start refresh on boot
  - repeat refresh on `REFRESH_INTERVAL_MS` (default `21600000`)
  - preserve the last successful snapshot on upstream failure
  - expose:
    - `GET /healthz`
    - `GET /feeds/normal.json`
    - `GET /feeds/premium.json`
    - `GET /feeds/all.json`
    - optional `GET /status.json`

`deploy/sub-converter/Dockerfile`
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY deploy/sub-converter/package.json ./package.json
RUN npm install --omit=dev
COPY deploy/sub-converter/server.js ./server.js
COPY deploy/sub-converter/src ./src
COPY deploy/sub-converter/config ./config
COPY deploy/sub-converter/rules ./rules
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["npm", "start"]
```

- [ ] **Step 4: Run tests and a local service smoke test**

Run:

```bash
cd deploy/sub-converter && npm test
node server.js &
PID=$!
sleep 2
curl -fsS http://127.0.0.1:8080/healthz
kill $PID
```

Expected:
- `npm test` passes
- `/healthz` returns JSON indicating the service is alive

- [ ] **Step 5: Commit the service runtime**

```bash
git add deploy/sub-converter/server.js deploy/sub-converter/src deploy/sub-converter/Dockerfile deploy/sub-converter/test/server-smoke.test.js
git commit -m "feat: add sub-converter service runtime"
```

---

### Task 4: Add the Compose stack and KVideo deployment image

**Files:**
- Create: `deploy/kvideo/Dockerfile`
- Create: `deploy/docker-compose.yml`
- Test: use `docker compose config` and service build commands

- [ ] **Step 1: Write the failing compose validation**

Run:

```bash
docker compose -f deploy/docker-compose.yml config
```

Expected: FAIL because the compose file does not exist yet.

- [ ] **Step 2: Add the deployment-specific KVideo Dockerfile**

`deploy/kvideo/Dockerfile`
```dockerfile
FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN if [ -f yarn.lock ]; then yarn --frozen-lockfile; elif [ -f package-lock.json ]; then npm ci; elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; else echo "Lockfile not found." && exit 1; fi

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY deploy/kvideo/.env.build ./.env.production
RUN if [ -f yarn.lock ]; then yarn run build; elif [ -f package-lock.json ]; then npm run build; elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; else echo "Lockfile not found." && exit 1; fi

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

- [ ] **Step 3: Add the main compose file**

`deploy/docker-compose.yml`
```yaml
services:
  kvideo:
    build:
      context: ..
      dockerfile: deploy/kvideo/Dockerfile
    container_name: kvideo-compose
    env_file:
      - ./.env
    environment:
      NODE_ENV: production
    ports:
      - "127.0.0.1:${KVIDEO_PORT:-3000}:3000"
    volumes:
      - ./kvideo/ad_keywords.txt:/app/config/ad_keywords.txt:ro
    depends_on:
      - danmu-api
      - sub-converter
    restart: unless-stopped

  danmu-api:
    image: logvar/danmu-api:latest
    container_name: kvideo-danmu-api
    ports:
      - "127.0.0.1:${DANMU_API_PORT:-9321}:9321"
    volumes:
      - ./danmu_api/config:/app/config
      - ./danmu_api/.cache:/app/.cache
    restart: unless-stopped

  sub-converter:
    build:
      context: ..
      dockerfile: deploy/sub-converter/Dockerfile
    container_name: kvideo-sub-converter
    environment:
      PORT: 8080
      REFRESH_INTERVAL_MS: 21600000
      DATA_DIR: /app/data
      UPSTREAMS_FILE: /app/config/upstreams.json
      PREMIUM_KEYWORDS_FILE: /app/rules/premium_keywords.txt
    ports:
      - "127.0.0.1:${SUB_CONVERTER_PORT:-18080}:8080"
    volumes:
      - ./sub-converter/data:/app/data
    restart: unless-stopped
```

- [ ] **Step 4: Resolve env files and validate Compose**

Run:

```bash
bash deploy/scripts/prepare-env.sh
docker compose -f deploy/docker-compose.yml config > /tmp/kvideo-compose.rendered.yml
sed -n '1,220p' /tmp/kvideo-compose.rendered.yml
```

Expected: rendered config shows exactly 3 services with resolved bind ports and KVideo depending on `danmu-api` and `sub-converter`.

- [ ] **Step 5: Commit the deployment runtime**

```bash
git add deploy/docker-compose.yml deploy/kvideo/Dockerfile
git commit -m "feat: add compose deployment stack"
```

---

### Task 5: Document the workflow in repo docs

**Files:**
- Modify: `README.md`
- Modify: `deploy/README.md`

- [ ] **Step 1: Write the failing docs grep check**

Run:

```bash
grep -n "Docker Compose 部署（含 danmu_api 和订阅转换）" README.md
```

Expected: no match yet.

- [ ] **Step 2: Update the docs with exact usage**

Add a new `README.md` section that points readers to the deploy stack and includes:
- `cd deploy`
- `bash scripts/prepare-env.sh`
- edit `.env`, `kvideo/.env.build`, `kvideo/ad_keywords.txt`, `danmu_api/config/.env`
- `docker compose up -d --build`
- health check URLs for KVideo, danmu_api, and sub-converter

Also add `deploy/README.md` with a short operator guide and a table explaining:
- `env.example`
- `kvideo/env.build.example`
- `kvideo/ad_keywords.example.txt`
- `danmu_api/config/env.example`
- `sub-converter/config/upstreams.json`
- `sub-converter/rules/premium_keywords.txt`

- [ ] **Step 3: Verify the docs mention the requested features**

Run:

```bash
grep -nE "多账户|PREMIUM_PASSWORD|PERSIST_SESSION|danmu_api|MoonTV|LunaTV|广告过滤" README.md deploy/README.md
```

Expected: matches in both files.

- [ ] **Step 4: Commit the docs**

```bash
git add README.md deploy/README.md
git commit -m "docs: document compose deployment workflow"
```

---

### Task 6: End-to-end verification of the local stack

**Files:**
- Use: `deploy/docker-compose.yml`
- Use: `deploy/.env`
- Use: `deploy/kvideo/.env.build`
- Use: `deploy/kvideo/ad_keywords.txt`
- Use: `deploy/danmu_api/config/.env`

- [ ] **Step 1: Run unit tests before bringing up containers**

Run:

```bash
cd deploy/sub-converter && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Build and start the stack**

Run:

```bash
cd deploy
docker compose up -d --build
```

Expected: all three services start successfully.

- [ ] **Step 3: Verify converter outputs and danmu_api health**

Run:

```bash
curl -fsS http://127.0.0.1:${SUB_CONVERTER_PORT:-18080}/healthz
curl -fsS http://127.0.0.1:${SUB_CONVERTER_PORT:-18080}/feeds/normal.json | head -c 200
curl -fsS http://127.0.0.1:${DANMU_API_PORT:-9321}/api/v2/search/anime?keyword=凡人修仙传 | head -c 200
```

Expected:
- `healthz` returns JSON with `ok: true`
- `normal.json` returns a JSON array or wrapped feed data
- danmu_api returns JSON, not HTML/error

- [ ] **Step 4: Verify KVideo runtime behavior**

Run:

```bash
curl -fsS http://127.0.0.1:${KVIDEO_PORT:-3000}/ > /tmp/kvideo-home.html
grep -o '<title>[^<]*</title>' /tmp/kvideo-home.html | head -n1
curl -fsS http://127.0.0.1:${KVIDEO_PORT:-3000}/api/auth
```

Expected:
- HTML title matches the custom build-time title
- `/api/auth` JSON reports `hasAuth: true`, `hasPremiumAuth: true`, and includes the subscription source URLs

- [ ] **Step 5: Inspect logs and shut down cleanly after verification**

Run:

```bash
cd deploy
docker compose logs --tail=100
# optional if finishing verification only:
# docker compose down
```

Expected: no crash loops; converter logs at least one successful refresh.

- [ ] **Step 6: Commit any verification-driven fixes**

```bash
git add .
git commit -m "fix: stabilize compose deployment verification"
```

---

## Manual review checklist

Before executing this plan, confirm:
- build-time branding is injected through `deploy/kvideo/.env.build`, not runtime-only env vars
- KVideo subscribes to converter-served URLs, not raw MoonTV/LunaTV configs
- MoonTV premium classification uses a file-backed keyword list
- local secrets/runtime files are generated from tracked examples and ignored by git
- the deploy flow remains usable with optional Upstash values left blank
