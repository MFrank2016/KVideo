# Nginx Proxy Manager Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independently managed Nginx Proxy Manager deployment that can reverse-proxy `tv.831688.xyz` to the existing local-only KVideo stack through a shared external Docker network.

**Architecture:** Keep the existing KVideo business stack under `deploy/docker-compose.yml`, add a separate `deploy/npm/docker-compose.yml` for Nginx Proxy Manager, and connect both stacks to a shared external Docker network named `kvideo-proxy`. Persist NPM data and Let's Encrypt state on disk, and document the exact bootstrapping, DNS, and proxy-host setup workflow.

**Tech Stack:** Docker Compose, Nginx Proxy Manager (`jc21/nginx-proxy-manager`), existing KVideo/Next.js deployment scaffolding, Markdown operator docs.

---

### Task 1: Extend the KVideo compose stack onto the shared proxy network

**Files:**
- Modify: `deploy/docker-compose.yml`
- Test: `docker compose -f deploy/docker-compose.yml config`

- [ ] **Step 1: Add an external `kvideo-proxy` network declaration**

Update `deploy/docker-compose.yml` so the compose project joins a named external Docker network:

```yaml
networks:
  default:
    external: true
    name: kvideo-proxy
```

- [ ] **Step 2: Preserve existing localhost port bindings**

Keep the current `127.0.0.1:${PORT}:...` mappings unchanged for:
- `kvideo`
- `danmu-api`
- `sub-converter`

Expected result: business services remain inaccessible directly from the public network.

- [ ] **Step 3: Render the compose file to verify structure**

Run:

```bash
docker network create kvideo-proxy || true
docker compose -f deploy/docker-compose.yml config
```

Expected: config renders successfully and the output shows `external: true` / `name: kvideo-proxy`.

- [ ] **Step 4: Commit**

```bash
git add deploy/docker-compose.yml
git commit -m "feat: join deploy stack to shared proxy network"
```

### Task 2: Add an independent Nginx Proxy Manager compose project

**Files:**
- Create: `deploy/npm/docker-compose.yml`
- Create: `deploy/npm/data/.gitkeep`
- Create: `deploy/npm/letsencrypt/.gitkeep`
- Test: `docker compose -f deploy/npm/docker-compose.yml config`

- [ ] **Step 1: Create the NPM compose definition**

Write `deploy/npm/docker-compose.yml` with one service:

```yaml
services:
  nginx-proxy-manager:
    image: jc21/nginx-proxy-manager:latest
    container_name: kvideo-nginx-proxy-manager
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
    ports:
      - "80:80"
      - "81:81"
      - "443:443"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt

networks:
  default:
    external: true
    name: kvideo-proxy
```

- [ ] **Step 2: Create persistent directory placeholders**

Add empty tracked files:

```text
deploy/npm/data/.gitkeep
deploy/npm/letsencrypt/.gitkeep
```

- [ ] **Step 3: Render the NPM compose file**

Run:

```bash
docker network create kvideo-proxy || true
docker compose -f deploy/npm/docker-compose.yml config
```

Expected: config renders successfully and points at the external `kvideo-proxy` network.

- [ ] **Step 4: Commit**

```bash
git add deploy/npm/docker-compose.yml deploy/npm/data/.gitkeep deploy/npm/letsencrypt/.gitkeep
git commit -m "feat: add nginx proxy manager compose stack"
```

### Task 3: Document bootstrap and proxy-host operations

**Files:**
- Create: `deploy/npm/README.md`
- Modify: `deploy/README.md`
- Modify: `README.md`
- Test: review rendered Markdown content manually

- [ ] **Step 1: Write the dedicated NPM operator guide**

Create `deploy/npm/README.md` covering:
- create network: `docker network create kvideo-proxy`
- start business stack
- start NPM stack
- open NPM UI at `http://<server-ip>:81`
- create Proxy Host for `tv.831688.xyz`
- forward to `kvideo:3000`
- request Let's Encrypt certificate
- Cloudflare recommendation: use DNS-only during initial issuance
- troubleshooting for 80/443/81 conflicts, 502, and missing network

- [ ] **Step 2: Cross-link from the main deploy README**

Update `deploy/README.md` with a short section noting:
- KVideo stack now joins `kvideo-proxy`
- NPM can be deployed separately from `deploy/npm/`
- operators should read `deploy/npm/README.md` for reverse-proxy setup

- [ ] **Step 3: Add a short root README section**

Update the repository `README.md` deployment section to mention the optional Nginx Proxy Manager layer for public HTTPS/domain access.

- [ ] **Step 4: Commit**

```bash
git add deploy/npm/README.md deploy/README.md README.md
git commit -m "docs: document nginx proxy manager deployment"
```

### Task 4: Verify end-to-end interoperability between both compose projects

**Files:**
- Verify only: existing compose files and docs from Tasks 1-3

- [ ] **Step 1: Ensure the shared network exists**

Run:

```bash
docker network create kvideo-proxy || true
```

Expected: network exists or is created successfully.

- [ ] **Step 2: Start the business stack on the shared network**

Run:

```bash
deploy/scripts/prepare-env.sh
docker compose -f deploy/docker-compose.yml up -d --build
```

Expected: `kvideo`, `danmu-api`, and `sub-converter` start successfully.

- [ ] **Step 3: Start the NPM stack**

Run:

```bash
docker compose -f deploy/npm/docker-compose.yml up -d
```

Expected: `kvideo-nginx-proxy-manager` starts successfully.

- [ ] **Step 4: Verify both stacks share the network**

Run:

```bash
docker network inspect kvideo-proxy
```

Expected: inspect output includes both business containers and the NPM container.

- [ ] **Step 5: Verify NPM can reach KVideo by service name**

Run:

```bash
docker exec kvideo-nginx-proxy-manager getent hosts kvideo
docker exec kvideo-nginx-proxy-manager curl -fsS http://kvideo:3000/api/auth
```

Expected: DNS resolves and the API returns JSON showing auth/premium configuration.

- [ ] **Step 6: Verify host-local access still works**

Run:

```bash
curl -fsS http://127.0.0.1:3000/api/auth
curl -fsS http://127.0.0.1:18080/healthz
curl -fsS http://127.0.0.1:9321/ | head
curl -I http://127.0.0.1:81
```

Expected: KVideo, sub-converter, danmu-api, and the NPM admin port are all reachable.

- [ ] **Step 7: Record actual verification results in the final handoff**

Summarize:
- whether both compose projects started
- whether `kvideo-proxy` contains all required containers
- whether NPM could resolve and reach `kvideo:3000`
- what the operator still needs to do manually in the NPM UI and Cloudflare

- [ ] **Step 8: Commit**

If verification required doc or config touch-ups:

```bash
git add <updated-files>
git commit -m "fix: refine npm proxy deployment verification"
```

If no files changed, skip the commit.
