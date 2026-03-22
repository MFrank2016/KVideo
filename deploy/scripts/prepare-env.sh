#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [[ ! -f "$dst" ]]; then
    mkdir -p "$(dirname "$dst")"
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
