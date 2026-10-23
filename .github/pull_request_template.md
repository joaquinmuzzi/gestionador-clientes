## What

<!-- What does this pull request change? -->

## Why

<!-- The problem it solves. Link the issue: "Fixes #123". -->

## Testing

<!-- How you checked it: commands you ran, new or updated tests, screenshots for UI changes. Only made-up data (192.0.2.x, example.com), never real customer data. -->

## Checklist

- [ ] The title follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (`feat(auth): ...`), in English.
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass; `npm run build && npm run test:e2e` pass if pages, actions or the database changed.
- [ ] Tests cover the change (unit tests in `test/`, end-to-end tests in `e2e/`).
- [ ] Every new page, Server Action and Route Handler that touches data calls `requireUser()`, and validates its input with zod.
- [ ] Secrets and attachments are encrypted with `src/lib/crypto.ts` and a context; no real credentials, customer data or screenshots are committed.
- [ ] Database changes come with a new migration; no merged migration was edited.
- [ ] Everything is in English except the interface text, which is in Spanish.
- [ ] Documentation is updated (README, CONTRIBUTING, AGENTS.md, and a line under *Unreleased* in CHANGELOG.md), if needed.
- [ ] I have read and understood every line of the change, and I ran the checks above myself.

## AI assistance

<!-- Keep this line last: the description becomes the commit message on main. Name each AI tool and model, one line per assistant (see "AI-assisted contributions" in CONTRIBUTING.md), or write "none". No other AI attribution or promotional footer. Examples: "Assisted-by: Claude Code:claude-opus-5-5", "Assisted-by: none". -->

Assisted-by: 
