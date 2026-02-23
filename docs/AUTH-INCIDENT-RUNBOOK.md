# Auth Incident Runbook (Prod)

This runbook is for auth/session incidents involving `auth_sessions` integrity.

## One-command runbook

```bash
APP_BASE_URL="https://YOUR_APP_HOST" \
ADMIN_REPAIR_TOKEN="YOUR_ADMIN_REPAIR_TOKEN" \
DRY_RUN=true \
bash scripts/auth-incident-runbook.sh
```

To apply cleanup changes:

```bash
APP_BASE_URL="https://YOUR_APP_HOST" \
ADMIN_REPAIR_TOKEN="YOUR_ADMIN_REPAIR_TOKEN" \
DRY_RUN=false \
bash scripts/auth-incident-runbook.sh
```

## What the command does

1. **Diagnose connection state**
   - `GET /api/admin/connection/diagnose`
2. **Diagnose auth session table health**
   - `GET /api/admin/auth-sessions/health?roundtrip=1`
   - verifies `auth_sessions` schema columns, required indexes, PK constraints, and insert/read/delete probe roundtrip.
3. **Repair expired session rows**
   - `POST /api/admin/auth-sessions/repair` with `{ dryRun }`
4. **Verify after repair**
   - `GET /api/admin/auth-sessions/health?roundtrip=1`

## Expected outputs

### Healthy
- Health response includes:
  - `ok: true`
  - `schema.tableExists: true`
  - `schema.missingColumns: []`
  - `schema.missingIndexes: []`
  - `schema.hasPrimaryKey: true`
  - `roundtrip.inserted/readBack/deleted: true`

### Repair dry-run
- Repair response includes:
  - `dryRun: true`
  - `repair.expiredSessionsFound >= 0`
  - `repair.expiredSessionsRemoved: 0`

### Repair apply mode (`DRY_RUN=false`)
- Repair response includes:
  - `dryRun: false`
  - `repair.expiredSessionsRemoved >= 0`

## Go / No-Go deployment criteria

### **GO**
- All of the following are true:
  - `/api/admin/auth-sessions/health` returns `ok: true`
  - No missing `auth_sessions` columns/indexes/PK
  - Roundtrip probe passes (`inserted`, `readBack`, `deleted` all true)
  - No unhandled 5xx in diagnose/repair/verify sequence

### **NO-GO**
- Any of the following:
  - `ok: false` from auth-session health probe
  - Missing schema columns/indexes/PK
  - Roundtrip probe failure
  - Repair endpoint returns 5xx or cannot complete

## Safety / redaction guardrails

- Probe endpoints redact token-like values from errors before logging.
- No raw OAuth/access token values are emitted in probe logs.
- Probe roundtrip uses a synthetic placeholder value (`probe-redacted-token`) rather than a real secret.
