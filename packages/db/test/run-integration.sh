#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
compose_file="$repo_root/docker-compose.test.yml"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://realtr_test:realtr_test@localhost:5434/realtr_test}"

cleanup() {
  docker compose -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose -f "$compose_file" up --detach --wait
pnpm exec tsx test/upgrade-path.ts
pnpm exec vitest run --config vitest.integration.config.ts
