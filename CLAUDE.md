# InboxAir — project memory for Claude Code

InboxAir is a multi-tenant cold-email SaaS (Devlet Tech). This repo: `frontend/` (React + Vite SPA) and the FastAPI backend.

## Current job: Instantly-style redesign
Full plan: `docs/redesign-plan.md`. Work ONE page at a time, show the result, wait for "Done" before the next page.

Hard rules
- Do NOT change Analytics (`src/pages/Analytics.jsx`, routes `/` and `/analytics`): no layout, content or style edits. Only the frame around it (rail, panel, top bar) changes.
- Do NOT change behaviour: routes, API calls, state, validation, permissions stay as they are. Restyle JSX/CSS only.
- Keep every menu label: Analytics, Campaigns, Contacts, Blocklist, Accounts, Inbox, Queue, Notifications, Deliverability, Visitors. Profile menu: Settings, System Health, App Tour, Deliverability Tips, Done-for-you Setup, Report a Bug, Suggest a Feature, Privacy, Terms, Logout.
- Ask before removing anything (past mistake: Backup & restore was removed and had to be restored).
- Brand text is "InboxAir", never "DevOutreach".

Design language (see plan for tokens)
- Dark near-black ground, 1px hairlines, 3 text levels, one accent (blue #1F8BFF or brand orange #FF7034 — confirm), light theme mirrors it.
- Font Figtree, self-hosted (the production CSP blocks Google Fonts).
- Radius 8–9 controls / 12 menus / 14 cards. No shadows except popovers, no gradients, no hero banners.
- Shell: 56px icon rail + 248px collapsible section panel + 60px top bar; profile menu opens from the avatar.
- Page template: title + subtitle, toolbar row, one bordered card.

## Frontend facts
- Entry `src/index.jsx`, router `src/App.jsx`. Tailwind is NOT installed: `do-compat.css` fakes Tailwind class names.
- CSS load order (App.jsx): index.css → do-compat.css → styles/aegis.css → styles/inboxair-theme.css → styles/inboxair-components.css → styles/inboxair-density.css → styles/ref-skin.css. Later files win; many pages inject their own `<style>` blocks, which is why `!important` exists.
- Icons: `components/ui/AegisIcon.jsx` (`<Icon name size />`), list in `components/ui/icons.js`.
- Theme: `context/DarkModeContext.jsx` sets `data-theme` on <html>.
- Many files are CRLF and some have a UTF-8 BOM: preserve line endings and BOM when editing.
- Check with `npm run build` inside `frontend/` after every change.

## Backend facts
- FastAPI + async SQLAlchemy (Postgres). New tables get startup `ALTER TABLE ... IF NOT EXISTS` migrations in `database.py`.
- Done-for-you (Stripe one-time checkout, `purchase_type=dfy_order`) and Website Visitor ID routers exist.

## Secrets
- Never read, print, copy or commit `.env*`, keys, certificates or `dump.rdb`. Use placeholder values in examples.
- Never paste API keys into chat or code; refer to env var names only.
- claude-mem is installed: anything secret the user pastes must be inside `<private>...</private>`; remind them if they forget.
- The GitHub repo (arslanawandev/InboxAir) is private and closed source. Before any commit, run `git status` and stop if a secret file is staged.

## Workflow
- One redesign step per request; run `npm run build` in `frontend/`; summarise changed files; wait for "Done".
- After "Done": commit with message `redesign: <page>` (push only when the user asks).
