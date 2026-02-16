# Web Task: Landing Page & Docs

Improve the landing page and add documentation.

## 1. Landing Page (`src/app/page.tsx`)

Replace the minimal "Sign in with GitHub" with a proper landing page.

### Hero Section
- **Headline:** "Git-native issue tracking for AI-first teams"
- **Subhead:** "Your tickets live in your repo. No sync. No lock-in. No per-seat pricing for agents."
- **CTA:** "Sign in with GitHub" button (existing functionality)

### Features Section (3 columns)
1. **Git-native**
   - Icon: 📁
   - "Tickets are markdown files in `.tickets/`. Full history via git log. Works offline."

2. **CLI-first**
   - Icon: ⌨️
   - "Built for AI agents. `ticket new`, `ticket start`, `ticket done`. Auto-commits included."

3. **Free for robots**
   - Icon: 🤖
   - "No per-seat pricing. Your AI agents don't count as users. Pay only for the web dashboard."

### How It Works Section
1. `ticket init` — Initialize `.tickets/` in your repo
2. `ticket new "Fix login bug"` — Create a ticket
3. `ticket start TK-01ABC` — Move to in_progress
4. Code, commit, PR, merge
5. `ticket done TK-01ABC` — Close it out

### Pricing Section
- **CLI:** Free forever (open source)
- **Web Dashboard:** $5/repo/month or $20/month unlimited
- "Try free for 14 days" note

### Footer
- Links: GitHub, Docs, Discord (placeholder hrefs for now)
- © 2026 Ticket.app

## 2. Style

Use Tailwind CSS. Dark theme preferred (dark bg, light text). Clean, minimal, dev-focused aesthetic. No heavy gradients or animations.

## 3. Responsive

Mobile-friendly. Stack columns on small screens.

## 4. Keep Auth Working

The sign-in button should still work — don't break the OAuth flow.

---

## Testing Setup

**Add Vitest + Testing Library:**

```bash
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

**Create `vitest.config.ts`:**
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

**Create `src/test/setup.ts`:**
```ts
import '@testing-library/jest-dom'
```

**Add test script to `package.json`:**
```json
"test": "vitest run"
```

**Write tests for:**
1. `src/lib/auth.test.ts` — session encryption/decryption
2. `src/lib/github.test.ts` — ticket parsing, index fetching
3. `src/components/board.test.tsx` — renders columns, handles empty state
4. `src/components/ticket-detail-modal.test.tsx` — displays ticket info

## Verification

Run `pnpm build` and `pnpm test` to ensure no errors.

## Completion

Output `<promise>DONE</promise>` when landing page is complete, tests pass, and builds successfully.
