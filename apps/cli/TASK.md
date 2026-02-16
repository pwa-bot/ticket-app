# CLI Task: Remaining Commands

Build these 4 commands to complete the CLI:

## 1. `ticket edit <id> [options]`

Edit ticket metadata without opening an editor.

```bash
ticket edit TK-01ABC --title "New title"
ticket edit TK-01ABC --priority p0
ticket edit TK-01ABC --labels "bug,urgent"
ticket edit TK-01ABC --labels "+frontend"  # append
ticket edit TK-01ABC --labels "-backend"   # remove
```

Options:
- `--title <string>` — replace title
- `--priority <p0-p3>` — change priority
- `--labels <list>` — replace labels (comma-separated)
- `--labels +<label>` — add label
- `--labels -<label>` — remove label
- `--ci` — require exact ID match

Behavior:
- Updates YAML frontmatter in ticket file
- Updates `updated` timestamp
- Regenerates index.json
- Auto-commits with message: `edit(TK-XXXXX): <what changed>`

Error if `--ci` and ID is ambiguous or not found.

## 2. `ticket branch <id>`

Create a git branch named after the ticket.

```bash
ticket branch TK-01ABC
# Creates branch: tk-01abc-short-title-slug
```

Behavior:
- Slugify: lowercase, replace spaces/special chars with `-`, truncate to 50 chars
- Format: `tk-{short_id}-{slug}` (e.g., `tk-01abc-fix-login-bug`)
- Run: `git checkout -b <branch_name>`
- If branch exists, check it out instead
- `--ci` mode: print branch name only, don't switch

## 3. `ticket validate [--fix]`

Validate all tickets against schema.

```bash
ticket validate        # report errors
ticket validate --fix  # auto-fix what's possible
```

Checks:
- Valid YAML frontmatter
- Required fields present (title, state, priority, labels, created, updated)
- State is valid enum value
- Priority is valid enum value
- ULID format for filename
- index.json matches tickets on disk

`--fix` can:
- Add missing `updated` timestamp
- Regenerate index.json if stale

## 4. `ticket install-hooks`

Install git hooks for automatic validation.

```bash
ticket install-hooks
```

Creates `.git/hooks/pre-commit`:
```bash
#!/bin/sh
ticket validate --ci || exit 1
```

Makes it executable. If hook exists, ask before overwriting (unless `--force`).

---

## Testing

Add tests in `src/__tests__/` for each command:
- `edit.test.ts`
- `branch.test.ts`
- `validate.test.ts`
- `hooks.test.ts`

Test happy paths and error cases.

## Completion

Run `pnpm test` and `pnpm build`. Output `<promise>DONE</promise>` when all tests pass.
