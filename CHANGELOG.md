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
- Screenshots and images (PNG, JPG, WebP, up to 10 MB) on the device sheet and on the customer
  page: added with a button, by dropping files or by pasting with Ctrl+V, with an editable title,
  a full-size view, download and deletion. Files are encrypted with AES-256-GCM before they reach
  the disk (`ATTACHMENTS_DIR`, an `attachments` volume in Docker Compose), are served only to a
  logged-in user and never cached, and every upload, view, rename and deletion is audited.
  Deleting a customer or a device also removes its encrypted files.
- Incidents (day, what happened, how it was solved, open or resolved), known vulnerabilities
  (severity, open or resolved) and an agenda of dated tasks on the device sheet, each opened in
  place and saved automatically. A device with an open incident or an overdue task gets a red
  mark on the map.
- End users on the customer page: name, role, contact, technical level, what they may and may
  not touch, how to deal with them, and whether they are a main contact. Saved automatically.
- Every change to incidents, vulnerabilities, tasks and end users is audited.
- A global search in the header (Ctrl+K or ⌘K): by customer, device or device type name, IP or
  any text that is not a secret (free fields, roles, notes, connection labels, incidents,
  vulnerabilities, tasks, end users, image titles). Results are grouped by customer and device
  with the match marked, and a device result opens the map centred on it with its sheet open.
  Secret fields are never searched or shown.
