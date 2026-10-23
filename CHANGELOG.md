# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/) (while it is `0.x`, minor versions may change
behaviour).

## [Unreleased]

### Added

- Project skeleton: Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4,
  Prisma 7 on PostgreSQL 18.
- Login with email, password (argon2id) and a TOTP code in one form, with one generic error and
  no reuse of a TOTP code.
- Server-side sessions (only the token hash is stored), 8 hours at most and 1 hour of inactivity,
  in a `__Host-session` cookie in production.
- Login rate limit: 5 failures per IP and 10 per email every 15 minutes; attempts are kept as a
  login audit for 90 days.
- AES-256-GCM encryption helper with a per-field context, used for the TOTP secret.
- User management from the terminal (`npm run user:create`, `user:reset-2fa`,
  `user:set-password`); there is no sign-up page.
- Docker Compose with Postgres, a one-shot migration service and the standalone app running as a
  non-root user, with ports bound to `127.0.0.1`.
- Security headers: no framing, `nosniff`, a strict referrer policy and permissions policy.
- Repository conventions: English documentation, a contributing guide, a security policy, issue
  and pull request templates, Conventional Commit titles and a mandatory `Assisted-by:` line
  checked by CI, Dependabot, and CI for lint, types, build, unit, end-to-end and Docker checks.
- The full data model: customers, end users, devices with free and secret fields, connections,
  attachments, incidents, vulnerabilities, agenda items and an audit log. The database refuses a
  secret field stored in clear text and a connection or attachment that mixes two customers.
- Customer list with a search by name, and pages to create, edit and delete a customer. Deleting
  asks for the customer's name and removes everything it holds; every change is audited.
- `npm run db:seed` loads two made-up sample customers for development.
- A not-found page in Spanish.
- The network map on each customer's page: a palette with an icon per device type (click or
  drag), moving, connecting with an optional label, renaming and deleting devices (deleting a
  device asks first). Every change is saved automatically, with a saving indicator, and
  device and connection changes are audited.
- The device sheet, opened with a double click on a device (or "Abrir ficha"): unlimited free
  fields with a multi-line value, added, renamed, reordered and deleted, with suggested fields per
  device type; secret fields encrypted with AES-256-GCM that reach the browser only when shown
  or copied, hide again after 30 seconds and leave a `REVEAL` audit entry; and free text for
  roles (who does what) and notes. Everything is saved automatically and audited.
