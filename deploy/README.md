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
