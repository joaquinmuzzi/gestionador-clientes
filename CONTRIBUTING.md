# Contributing to Gestionador de Clientes

This guide explains how to set up a development environment, which checks to run and how to send
changes. By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Coding
agents also follow [AGENTS.md](AGENTS.md), which records the project's rules in more detail.

## Ways to contribute

- **Report a bug** (a page breaks, the login fails, something is saved wrong) with the
  [Bug report](https://github.com/joaquinmuzzi/gestionador-clientes/issues/new?template=bug_report.yml)
  form.
- **Suggest a feature** with the
  [Feature request](https://github.com/joaquinmuzzi/gestionador-clientes/issues/new?template=feature_request.yml)
  form. The app aims to stay simple, so describe the problem first.
- **Send a pull request.** For anything bigger than a small fix, open an issue first so we can
  agree on the approach.

Security problems are never reported in public issues: see [SECURITY.md](SECURITY.md). Never put
real customer data, passwords or screenshots in an issue, a pull request or a commit.

## Development environment

You need Node.js 22.12+ and Docker with Docker Compose.

```bash
cp .env.example .env                    # fill in the keys (see the comments in the file)
docker compose up -d db                 # Postgres on localhost:5432
npm ci                                  # also generates the Prisma client
npm run db:migrate                      # applies the migrations
npm run user:create -- you@example.com  # creates a user and enrolls 2FA
npm run db:seed                         # optional: two made-up sample customers
npm run dev                             # app on http://localhost:3000
```

## Checks

These are the checks CI runs (see `.github/workflows/`). Run them before opening a pull request:

```bash
npm run lint                            # ESLint
npm run typecheck                       # route types and tsc
npm test                                # unit tests (Vitest)

npx playwright install chromium         # first time only
npm run build && npm run test:e2e       # end to end against the production build (needs Postgres)
```

If you change the `Dockerfile`, `docker-compose.yml` or the dependencies, also check that
`docker compose up -d --build` still starts the app.

The tests are organised like this:

- `test/` holds the **unit tests** (Vitest), mirroring `src/`: encryption, TOTP (with the RFC
  6238 test vectors), password hashing, the client IP for the rate limit, customer input. They
  need no database.
- `test/docs.test.ts` checks the Markdown files: no literal `\n` typed instead of a line break,
  and every relative link leads to a file or heading that exists.
- `e2e/` holds the **end-to-end tests** (Playwright): redirects without a session, security
  headers, login and logout, the session cookie, the idle timeout, the generic login error, TOTP
  replay, the rate limit, the customer pages, the map editor, the device sheet, attachments,
  incidents, vulnerabilities, the agenda, end users and the rules the database enforces (secret
  fields, connections between customers). They create their own user (`e2e@example.test`) and
  use documentation IPs (`192.0.2.x`), so they do not touch your development data.

When you fix a bug, add a test that fails without the fix, and say in the description how you
reproduced and checked it.

## Code style

Everything in the repository is written in English: identifiers, comments, commit messages,
pull requests, documentation, test names and command-line output. Comments explain *why* the
code does something, not what it does. The only exception is the **interface text**, which is
in Spanish because that is the language of the people who use the app.

- **TypeScript** is strict and linted with ESLint (`npm run lint`). There is no Prettier: follow
  the style of the surrounding code and do not reformat files you did not change.
- **Every page, Server Action and Route Handler that touches data calls `requireUser()`.**
- **Secrets are encrypted** with `src/lib/crypto.ts`, always with a context that names the row and
  field.
- **Validate input on the server** with zod.
- **Migrations** are created with `npm run db:migrate -- --name <what>`; never edit one that is
  already on `main`.

## Project layout

```
src/
  app/login/         login page and its Server Action
  app/(app)/         pages that need a session
  lib/crypto.ts      AES-256-GCM encryption with a per-field context
  lib/db.ts          Prisma client
  lib/auth/          passwords, TOTP, sessions, rate limit, users
  lib/customers/     customer input validation and queries
  proxy.ts           redirects visitors without a session cookie to /login
prisma/              schema, migrations and the development seed
scripts/user.ts      user management from the terminal
test/                unit tests (Vitest)
e2e/                 end-to-end tests (Playwright)
Dockerfile           production image (standalone Next.js, non-root)
docker-compose.yml   Postgres, a one-shot migration service and the app
CHANGELOG.md         what changed in each release
```

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <description>

<optional body: what changed and why>

<optional footers, e.g. BREAKING CHANGE: ..., Assisted-by: ...>
```

- **Types:** `feat` (new feature), `fix` (bug fix), `docs`, `style` (formatting or visual style
  only), `refactor`, `perf`, `test`, `build` (dependencies, packaging, Docker), `ci`, `chore`,
  `revert`.
- **Scopes** are optional and short, usually the area of the code: `auth`, `db`, `map`,
  `devices`, `customers`, `ui`, `docker`, `deps`.
- Write the description in the imperative mood ("add", not "added"), in lowercase, without a
  final period.
- Mark breaking changes with `!` after the type and a `BREAKING CHANGE:` footer.
- Keep commits **atomic**: one logical change per commit.

Examples:

```
feat(auth): add login with password and TOTP
fix(ui): keep the device sheet inside the screen on narrow windows
build(deps): bump next from 16.4.2 to 16.4.3
```

## AI-assisted contributions

You can use AI tools (Claude Code, Codex, Copilot, Cursor…), but you must say so, as the
[Linux kernel](https://docs.kernel.org/process/coding-assistants.html) asks:

- **Every commit made with an AI assistant ends with a trailer** naming the tool and the model:

  ```
  Assisted-by: AGENT_NAME:MODEL_VERSION
  ```

  For example `Assisted-by: Claude Code:claude-opus-5-5`. Write one line per assistant if you
  used more than one. Editors, linters and formatters do not count.
- **The pull request description ends with the same line**, or with `Assisted-by: none` if no AI
  tool was used. Pull requests are squash-merged and their description becomes the commit
  message on `main`, so this is where the line stays in the history. CI checks that it is there
  and that it is the last line.
- **No "Generated with Claude Code" line**, nor any other promotional footer, in descriptions or
  commits. The `Assisted-by:` line is the only AI attribution. CI rejects a description that
  contains such a line.
- **You are responsible for the change**, whoever wrote it: read and understand every line, run
  the checks above yourself, and say in the description what you ran.

## Pull requests

1. Create a branch from `main` (for example `feat/customer-map`).
2. Make your change and run the checks above.
3. Open a pull request. Its **title must follow Conventional Commits**: CI checks it, and the
   pull request is squash-merged, so the title becomes the commit message on `main`.
4. Fill in the template: what changes, why, how you tested it, the checklist, and the
   `Assisted-by:` line at the very end.
5. CI runs `lint`, `typecheck`, `build`, `unit tests`, `e2e tests`, `conventional title` and
   `ai disclosure` (and `docker` when the image changes). The owner reviews the change once it is
   green.
6. If the change alters what users see or how to set the project up, add a line under
   *Unreleased* in [CHANGELOG.md](CHANGELOG.md) (it follows
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)).

Keep pull requests small and focused: a bug fix, a feature or a refactor, not all three.
