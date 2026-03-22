# Deploy scaffolding

This directory holds deployment templates and helpers for composing the KVideo services locally.

## Operator guide

1. `cd deploy` (if you are not already there), then run `scripts/prepare-env.sh` to copy examples into the ignored runtime files (`.env`, `kvideo/.env.build`, `kvideo/ad_keywords.txt`, `danmu_api/config/.env`). The script skips existing files so you can re-run it safely after editing templates only when you delete the generated artifacts first.
2. Populate `.env` with your `ACCOUNTS` 多账户列表、`ADMIN_PASSWORD`、`PREMIUM_PASSWORD`、`PERSIST_SESSION`、`SUBSCRIPTION_SOURCES` 以及 `AD_KEYWORDS_FILE`/`UPSTASH_*` 等变量；`kvideo/.env.build` 控制站点名称、标题、描述等品牌信息；`kvideo/ad_keywords.txt` 是广告过滤关键词列表；`danmu_api/config/.env` 保存 `danmu_api` 的 TOKEN/端口设置。
3. `sub-converter` 会根据 `sub-converter/config/upstreams.json`（包含 MoonTV、LunaTV 等上游）拉取原始订阅，并用 `sub-converter/rules/premium_keywords.txt` 将高级/普通源分类，KVideo 的 `SUBSCRIPTION_SOURCES` 直接引用转换后的普通/高级 feeds。
4. 运行 `docker compose up -d --build` 后，访问 KVideo、`danmu_api` 以及 `sub-converter` 的健康检查确认服务已就绪。

## File references

| File | Purpose |
| --- | --- |
| `env.example` | 环境配置：定义多账户 (`ACCOUNTS`)、`PREMIUM_PASSWORD`、`PERSIST_SESSION`、`ADMIN_PASSWORD`、默认 `SUBSCRIPTION_SOURCES`、`AD_KEYWORDS_FILE` 以及 Upstash Redis 环境（如需跨设备同步）。 |
| `kvideo/env.build.example` | 构建时间品牌变量（`NEXT_PUBLIC_SITE_NAME`、`NEXT_PUBLIC_SITE_TITLE`、`NEXT_PUBLIC_SITE_DESCRIPTION`）以及 `NEXT_PUBLIC_DANMAKU_API_URL` 指向同一 Compose 网络的 `danmu_api`。 |
| `kvideo/ad_keywords.example.txt` | 广告过滤关键词清单（示例包含博彩、赌场等词汇），对应 `AD_KEYWORDS_FILE` 让 KVideo 加载自定义广告屏蔽策略。 |
| `danmu_api/config/env.example` | `danmu_api` 的 TOKEN、监听端口与限流配置，生成的 `.env` 与 `.cache` 数据应保留在 `danmu_api/` 下。 |
| `sub-converter/config/upstreams.json` | 定义 MoonTV、LunaTV 等上游源的 URL、分组偏好与 `allowKeywordPromotion`，服务启动会定期拉取并传递给 `normalize.js`。 |
| `sub-converter/rules/premium_keywords.txt` | 用于 `sub-converter` 判断 MoonTV 名称是否属于高级频道（AV、番号、福利、无码 等关键词），决定源是归入普通还是高级订阅。 |

Templates stay in this directory so you can track the expected defaults while keeping generated secrets/data local and ignored by git.

## 外部网络要求

- `kvideo-proxy` 是主堆栈及 NPM 共享的外部网络，在启动主堆栈前需要先创建它：`docker network create kvideo-proxy`（在仓库根目录执行）。若网络已经存在可跳过此步。
- 该网络也被 `deploy/npm/README.md` 中的 Nginx Proxy Manager 复用，若需要复查先决条件，请阅读该文档获取网络、Proxy Host 与证书的详细流程。

## 反向代理与公网域名

- KVideo Docker Compose 堆栈现已加入名为 `kvideo-proxy` 的外部网络，NPM 可复用此网络通过服务别名 `kvideo`（容器名为 `kvideo-compose`）访问内部服务。
- Nginx Proxy Manager (NPM) 堆栈可在 `deploy/npm/` 目录独立启动；仅需运行该目录下的 `docker compose up -d`，无需将其与主堆栈在同一个命令中联动。
- 运营人员需要阅读 `deploy/npm/README.md`，了解 Proxy Host、证书申请和 Cloudflare 配置等反向代理细节。
