#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p /Users/knightmafia/.hermes/webui
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PORT="${PORT:-3000}"
export HOST="${HOST:-127.0.0.1}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

# Launchd should manage a single stable foreground server here.
# Build on startup so the served bundle matches the current checkout.
/opt/homebrew/bin/pnpm build
exec /opt/homebrew/bin/node server-entry.js
