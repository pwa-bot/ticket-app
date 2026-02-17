# Web Dashboard MVP Task

Build a read-only kanban dashboard for ticket.app.

## Stack
- Next.js 16 (App Router) - already scaffolded
- Tailwind CSS - already configured
- TypeScript
- GitHub OAuth via next-auth (or lightweight custom)

## Features to Build

### 1. GitHub OAuth Flow
- `/api/auth/github` - OAuth callback
- `/api/auth/logout` - Clear session
- Store access token in encrypted HTTP-only cookie
- Minimum scope: `repo` (to read private repos)

### 2. Landing Page (`/`)
- If not logged in: "Sign in with GitHub" button
- If logged in: redirect to `/board`

### 3. Repo Picker (`/repos`)
- List user's repos that have `.tickets/` directory
- Use GitHub API: GET /user/repos, then check for .tickets/index.json
- Click repo → go to `/board?repo=owner/name`
- Store selected repo in cookie or URL param

### 4. Kanban Board (`/board`)
- Fetch `.tickets/index.json` from selected repo via GitHub API
- Render 4 columns: Backlog, Ready, In Progress, Done
- Cards show: display_id, title, priority badge, labels
- Color code by priority (p0=red, p1=orange, p2=yellow, p3=gray)
- Click card → open detail modal

### 5. Ticket Detail Modal
- Fetch full `.md` file from GitHub API
- Render markdown body
- Show all frontmatter fields
- Link to file on GitHub
- Close button / click outside to close

## API Routes Needed
- `GET /api/auth/github` - OAuth callback
- `GET /api/auth/logout` - Clear session  
- `GET /api/repos` - List repos with .tickets/
- `GET /api/tickets?repo=owner/name` - Fetch index.json
- `GET /api/ticket/[id]?repo=owner/name` - Fetch single ticket .md

## Environment Variables
```
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
NEXTAUTH_SECRET=  # or custom session secret
```

## Don't Build
- Any write operations
- Comments
- User management
- Anything not listed above

## Testing
- Manual testing is fine for MVP
- Make sure OAuth flow works end-to-end

## When Done
Output `<promise>DONE</promise>` when:
1. OAuth flow works
2. Can list repos with .tickets/
3. Kanban board renders tickets
4. Detail modal shows ticket content
