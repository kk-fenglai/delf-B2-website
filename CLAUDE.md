Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

5. GitHub & Secrets (project-specific)
This repo may be public on GitHub. Keep internal business docs and secrets local only.

Never commit:

- `.env` / credentials (already in `.gitignore`)
- Internal docs listed in `.gitignore` under `# Internal docs`:
  - `定价标准.md` — pricing & margin analysis
  - `支付功能.md` — payment architecture & ops
  - `DEPLOYMENT.md` — infra & deployment details
  - `PLAN_subscription_overhaul.md` — internal plans
  - `AI批改作文.md` / `AI口语.md` — product specs
  - `PRD.md` — product requirements
  - `注意事项.txt` — test account passwords

When adding new internal-only markdown (pricing, ops, deployment, specs):

1. Add the filename to `.gitignore` before creating or editing locally.
2. Do not link it from `README.md` or other tracked docs.
3. If a doc was accidentally committed: `git rm --cached <file>`, commit, push — files stay on disk locally.

Limits:

- `git rm --cached` removes files from the latest tree only; old commits still contain them. For full erasure, history rewrite (`git filter-repo` / BFG) + key rotation if secrets were exposed.
- To hide all source code, change repo visibility to **Private** on GitHub (Settings → Danger Zone); re-authorize Vercel / Fly.io after.

Public README should point to code (`backend/src/constants/pricing.js`, admin UI) instead of internal markdown for pricing/payment details.

6. Exam titles (learner-visible)
Do not put exam session year/month/region in titles shown to users (e.g. avoid `2021年3月（法国）`, `2024-01 法国场`).

- Use `DELF B2 写作 · <topic>` / `DELF B2 阅读 · <topic>` / `DELF B2 口语 · <topic>`.
- On import, `backend/src/utils/examTitle.js` (`sanitizeExamTitle`) strips date/region; apply via admin import and `scripts/stripExamTitleDates.js` for bulk fixes.
- Public `/api/exams` does not expose `year`; keep provenance in admin-only fields or question `explanation` if needed.

7.请将md文件统一整理到一个文件夹docs下面
