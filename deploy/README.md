# Deploy scaffolding

This directory holds deployment templates and helpers for composing the KVideo services locally.

1. Run `deploy/scripts/prepare-env.sh` to populate the ignored runtime files (`deploy/.env`, `deploy/kvideo/.env.build`, `deploy/kvideo/ad_keywords.txt`, `deploy/danmu_api/config/.env`). The script intentionally copies templates only when the destination is missing, so rerun it after editing templates only if you remove the generated files first.
2. Once the runtime files exist, fill them with production values and secrets; do **not** edit the tracked `*.example` templates—they stay in source control as non-secret defaults.
3. The helper script also ensures necessary cache/data directories exist, and the runtime artifacts are protected by `.gitignore` so they remain local.
