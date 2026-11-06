#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
required=1.4.4
if ! command -v bun >/dev/null || [[ "$(bun --version)" != "$required" ]]; then
  echo "Install Bun $required in the cloud environment, then rerun bash scripts/codex/setup.sh." >&2
  exit 1
fi
bun install --frozen-lockfile --ignore-scripts
printf 'Cloud dependencies ready. Run bash scripts/codex/verify.sh before publishing.\n'
