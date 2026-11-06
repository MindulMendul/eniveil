#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --browser ) ]]; then
  echo "Usage: bash scripts/codex/verify.sh [--browser]" >&2
  exit 2
fi
mkdir -p .codex-results
log=$(mktemp .codex-results/verify.XXXXXXXX.log)
echo "Verification log: $log"
trap 'result=$?; echo "Verification exit code: $result; log: $log" >&2' EXIT
bun run verify 2>&1 | tee "$log"
if [[ "${1:-}" == --browser ]]; then
  if ! bun -e 'import p from "./package.json"; if (!p.scripts["test:e2e"]) process.exit(1)'; then
    echo "BLOCKED: test:e2e is not configured. Supply browser evidence before completing a UI task." | tee -a "$log" >&2
    exit 1
  fi
  bun run test:e2e 2>&1 | tee -a "$log"
fi
