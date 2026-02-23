#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${APP_BASE_URL:-}" ]]; then
  echo "APP_BASE_URL is required (example: https://ticket.app)" >&2
  exit 1
fi

if [[ -z "${ADMIN_REPAIR_TOKEN:-}" ]]; then
  echo "ADMIN_REPAIR_TOKEN is required" >&2
  exit 1
fi

DRY_RUN="${DRY_RUN:-true}"

call() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  if [[ -n "$body" ]]; then
    curl --fail --silent --show-error \
      -X "$method" \
      -H "x-admin-repair-token: ${ADMIN_REPAIR_TOKEN}" \
      -H "content-type: application/json" \
      "${APP_BASE_URL}${path}" \
      -d "$body"
  else
    curl --fail --silent --show-error \
      -X "$method" \
      -H "x-admin-repair-token: ${ADMIN_REPAIR_TOKEN}" \
      "${APP_BASE_URL}${path}"
  fi
}

echo "=== diagnose: connection snapshot ==="
call GET "/api/admin/connection/diagnose"
echo

echo "=== diagnose: auth session health ==="
call GET "/api/admin/auth-sessions/health?roundtrip=1"
echo

echo "=== repair: expired auth sessions (dryRun=${DRY_RUN}) ==="
if [[ "${DRY_RUN}" == "true" ]]; then
  call POST "/api/admin/auth-sessions/repair" '{"dryRun":true}'
else
  call POST "/api/admin/auth-sessions/repair" '{"dryRun":false}'
fi

echo

echo "=== verify: auth session health after repair ==="
call GET "/api/admin/auth-sessions/health?roundtrip=1"
echo

echo "=== runbook completed ==="
