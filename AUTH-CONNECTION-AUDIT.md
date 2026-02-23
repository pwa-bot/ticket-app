# Auth + GitHub Connection Audit

## Canonical state machine

`getConnectionState()` is the single server-side source of truth for auth + connection readiness.

States:

1. `AUTH_REQUIRED`
   - No valid server session.
   - Action: reconnect OAuth.
2. `OAUTH_TOKEN_MISSING`
   - Session exists but no OAuth token available.
   - Action: reconnect OAuth.
3. `USER_RECORD_MISSING`
   - Session user id does not map to a `users` row.
   - Action: reconnect OAuth to repair identity linkage.
4. `GITHUB_APP_NOT_INSTALLED`
   - User has no `user_installations` links.
   - Action: install GitHub App.
5. `INSTALLATION_STATE_STALE`
   - `user_installations` links exist but one or more missing `installations` rows.
   - Action: refresh installations / reconnect.
6. `REPO_NOT_ENABLED`
   - App installed but no enabled repos linked to user installations.
   - Action: enable repos.
7. `INSTALLATION_REPO_MISMATCH`
   - Enabled repos appear OAuth-only / not linked to installation state.
   - Action: reconnect + refresh installation hydration.
8. `ready`
   - Auth, OAuth, app install, and enabled repo prerequisites are present.

## Route contracts

### `GET /api/github/installations`
- Returns cache-first installation list (no GitHub network calls).
- Now also returns `connection` object from `getConnectionState()`.
- Contract:
  - `{ ok: true, installations: Installation[], connection: ConnectionState }`

### `POST /api/auth/reconnect`
- Deterministic, mutation-guarded reconnect bootstrap.
- Always returns explicit reconnect intent payload when successful:
  - `{ ok: true, status: "reconnect_required", reasonCode, redirectTo, connection }`
- Error paths are explicit + coded:
  - `oauth_not_configured` (500)
  - `reconnect_failed` (500)

### `GET /api/space/attention`
### `GET /api/space/sync-health`
- On auth failure (401/403), both now return actionable API errors:
  - code: `auth_required`
  - details.action: `reconnect`

## Failure modes covered

- Missing/expired auth session.
- OAuth token missing from resolved server session.
- Missing user row for authenticated session.
- Missing app installation links.
- Stale/missing installation rows for existing links.
- Repos not enabled despite valid install.
- Mismatch between enabled repos and installation linkage.

## Frontend remediation behavior

- Settings connected-apps view reads canonical `connection` from `/api/github/installations`.
- Settings displays specific “Connection needs attention” guidance by reason code.
- Portfolio attention/sync-health data loaders parse non-2xx payloads and show reconnect-focused copy for 401/403 instead of generic network errors.
- Existing reconnect CTA path remains `/api/auth/reconnect` with returnTo preservation.
