# Move InboxAir to Claude Code in VS Code

Project folder: `D:\projects\quickly` · GitHub: `https://github.com/arslanawandev/InboxAir.git` (keep it PRIVATE)

## 1. Put the kit in the project
Unzip `inboxair-vscode-kit.zip` into `D:\projects\quickly` so you get:
- `CLAUDE.md` (project memory Claude Code reads every session)
- `.claude/settings.json` (blocks Claude from reading or editing `.env`, keys, `dump.rdb`)
- `docs/redesign-plan.md`, `docs/SETUP-VSCODE.md`
Then paste the lines from `.gitignore.add` at the end of `.gitignore` and delete `.gitignore.add`.

## 2. Make sure no secret is in git (PowerShell in VS Code terminal)
```powershell
cd D:\projects\quickly
git ls-files | Select-String -Pattern '\.env|dump\.rdb|\.pem|\.key'
```
If anything is listed, untrack it (the file stays on disk):
```powershell
git rm --cached <file>
```
If a real key was EVER committed or pushed, change that key at the provider (Stripe, SMTP, Google, Microsoft, OpenAI…). Removing it from git is not enough.
Keep a `.env.example` with names only, no values.

## 3. Install claude-mem (memory across sessions)
Needs Node.js 18+. In the VS Code terminal start the CLI and run:
```
claude
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```
Restart Claude Code. Memory is stored on your PC in `C:\Users\<you>\.claude-mem\` (outside the repo, never pushed).
Safety rules:
- Keep the default provider (`claude`). Do not switch `CLAUDE_MEM_PROVIDER` to Gemini/OpenRouter — that would send your session notes to another company.
- The deny rules in `.claude/settings.json` stop Claude reading `.env`, so keys never reach memory.
- If you must paste a secret in chat, wrap it: `<private>sk_live_...</private>` — claude-mem does not store it.
- Turn on claude-mem Auto-Redaction (docs.claude-mem.ai/usage/auto-redaction) as a second net.

## 4. Push to GitHub
```powershell
git remote -v
git remote add origin https://github.com/arslanawandev/InboxAir.git   # or: git remote set-url origin <url>
git add -A
git status            # read the list: no .env, no dump.rdb, no keys
git commit -m "InboxAir: Claude Code setup + current frontend"
git branch -M main
git push -u origin main
```
If push is rejected because GitHub already has a README: `git pull origin main --rebase --allow-unrelated-histories`, then push again.
On GitHub: Settings → General → confirm Visibility is Private; Settings → Code security → turn on Secret scanning / Push protection if your plan offers it.

## 5. Start the redesign in Claude Code
Open the Claude Code panel and send:
> Read CLAUDE.md and docs/redesign-plan.md. Decisions: [dark default / accent blue or #FF7034 / Analytics stays light or goes dark]. Do step 0 (tokens, self-hosted Figtree, shared components) only, run `npm run build` in frontend, show me what changed, then wait for "Done".
Then one step per message, approve each one, and commit after every approved step:
```powershell
git add -A; git commit -m "redesign: <page>"; git push
```
