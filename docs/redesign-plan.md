# InboxAir — Instantly-style redesign plan

Status: waiting for "Done" from Abdullah. Mockup: "InboxAir Redesign Mockup" artifact (shell + Campaigns + Contacts + profile menu, dark/light, accent tweak).

## 1. Goal
Minimal, neat, clean, modern frontend in the style of Instantly (references: Leads/SuperSearch screen, AI home screen, profile menu). Pages redesigned one by one; each page delivered as its own zip and approved before the next.

## 2. What does NOT change
- Analytics (Dashboard): content, layout, stat cards, chart, filters and table stay exactly as they are. It only sits inside the new frame (rail + panel + top bar).
- All routes, API calls, data, logic, features, permissions and validation.
- Menu item names (Analytics, Campaigns, Contacts, Blocklist, Accounts, Inbox, Queue, Notifications, Deliverability, Visitors) and profile-menu items (Settings, System Health, App Tour, Deliverability Tips, Done-for-you Setup, Report a Bug, Suggest a Feature, Privacy, Terms, Logout).

## 3. Design language
- Ground: dark near-black (#0F0F11 page, #111113 panel, #0A0A0C rail, #151518 cards), thin 1px lines (#222226 / #2C2C31). Light theme mirrors it (white, #FAFAFB panel, #ECECEF lines).
- Text: 3 levels only (#EDEDEF, #C2C2C8, #8B8B94).
- One accent for primary buttons, links, focus, progress: blue #1F8BFF (reference) — brand orange #FF7034 is a one-line swap.
- Tinted pill buttons for inline actions ("Connect", "Set it up" style).
- Font: Figtree (geometric sans close to the reference), self-hosted so the CSP stops blocking it. Sizes: 28 page title, 15 body large, 14 body, 13 secondary, 11 uppercase labels.
- Radius: 8–9 controls, 12 menus, 14 cards. No shadows except popovers. No gradients, no banners.
- Icons: existing Aegis stroke icons, 17–19px, 1.8 stroke.
- Status chips: soft tinted pills with a dot (green active, amber paused, grey draft, accent completed/replied, red bounced).

## 4. App shell (one change, every page)
- Icon rail (56px): logo, 5 module icons, avatar at bottom. Tooltips on hover.
- Section panel (248px, collapsible): product name + collapse button, module title, the module's pages, optional FILTERS block (Contacts, Inbox).
- Top bar (60px): breadcrumb (Module › Page), notifications bell, page primary action on the right.
- Profile menu: opens from avatar (reference style): name/email header, Theme (Light/Dark/System — uses existing DarkModeContext), then the existing items unchanged.
- Mobile: rail becomes bottom bar, panel becomes a drawer.

Module grouping (only new structure; names/routes unchanged):
| Rail | Panel pages |
|---|---|
| Dashboard | Analytics |
| Outreach | Campaigns, Queue |
| Contacts | Contacts, Visitors, Blocklist |
| Inbox | Inbox, Notifications |
| Accounts | Accounts, Deliverability |

## 5. Shared components (built once, used everywhere)
Buttons (primary, secondary, ghost, tinted pill, icon), inputs/search, select/dropdown, tabs (underline), table, status chip, card, list row, toggle, checkbox, modal, drawer, popover menu, toast, empty state (big title + checklist card, like the reference home), skeleton loader, pagination.

## 6. Page template
Page title + one-line subtitle → toolbar row (tabs or search + filters, actions right) → one bordered card (table/list/form). Content max width 1120px, 40px side padding. Empty states use the centred "setup checklist" pattern.

## 7. Order (one page at a time, approval after each)
0. Tokens, fonts, shared components (no visible page changes)
1. App shell + profile menu (Analytics checked unchanged inside it)
2. Campaigns list → Add campaign → Campaign detail / Sequence builder
3. Contacts (+ Lead detail)
4. Accounts (+ connect modal)
5. Inbox (Unibox) — 3-column mail view
6. Queue (Schedule)
7. Blocklist
8. Visitors
9. Deliverability (DNS Doctor) + Deliverability Tips
10. Notifications
11. Settings (section list in the panel)
12. System Health, Done-for-you, Feedback
13. Login / Signup / Forgot / Reset / Accept invite
14. App Tour, Splash, Privacy, Terms
15. Browser extension (optional)
16. Final QA: every page in dark + light, 1366 / 1024 / mobile, contrast check, no behaviour change.

## 8. Technical approach
- New token file replaces the Aegis/bridge colour layer; old `ref-skin.css` (pass 1) is folded in and retired.
- Shell: rewrite `Sidebar.jsx` into Rail + Panel + TopBar inside `Layout.jsx`; same `<NavLink>` routes.
- Pages: replace page-level `<style>` blocks and hero banners with the shared template; JSX logic untouched.
- Analytics: no edits to `Analytics.jsx`; it keeps its current styles (scoped), only the frame around it changes.

## 9. Decisions to confirm with "Done"
1. Dark by default, Light available from the profile menu. (Analytics keeps its current light look until you say otherwise.)
2. Accent: blue #1F8BFF like the reference, or brand orange #FF7034.
3. Rail + panel grouping as in section 4.
4. Theme row added to the profile menu (only new menu item).
