# Gestionador de Clientes

Document every customer's IT infrastructure **as a network map**: devices, IP addresses,
passwords (encrypted), screenshots of complex configurations, incidents and an agenda. Built for
an IT support technician who looks after many small companies and should not have to keep all of
it in their head.

> **Status:** early development. Login with two-factor authentication, the customer list and
> the network map work; the device sheets are being built (see [CHANGELOG.md](CHANGELOG.md)).

## Why Gestionador de Clientes?

A technician who supports many companies has to remember hundreds of details: which IP the
firewall has, the long password of a NAS, how an IPsec tunnel was set up, who at the customer
may touch what. Generic documentation tools force everything into fixed forms and long lists.

Gestionador de Clientes works the way a technician already draws a network:

- **Map first.** Each customer opens on its network diagram; double-click a device to see its
  sheet.
- **No rigid standard.** Any device takes as many free fields as it needs.
- **Secure.** Passwords and screenshots are encrypted in the application, and login always
  needs a second factor.
- **Simple.** Few screens and few clicks.

## Features

Available now:

- Login with email, password (argon2id) and a code from an authenticator app (TOTP), with short,
  revocable sessions and rate limiting.
- Users are created from the command line; there is no sign-up page.
- Customers: a list with a search by name, and pages to create, edit and delete them (deleting
  asks for the customer's name). Every change goes to an audit log.
- A network map per customer: add devices from a palette (click or drag), move them, connect
  them with an optional label, rename and delete them. Every change is saved on its own.
- Device sheets opened with a double click: unlimited free fields and secret fields.
- Screenshots and images on each device and customer (pasted with Ctrl+V, dropped or uploaded),
  stored encrypted.
- On each device sheet, incidents (what happened and how it was solved), known vulnerabilities
  with a severity, and an agenda of dated tasks. A device with an open incident or an overdue
  task is marked on the map.
- The end users of each customer: role, contact, technical level, what they may touch and how
  to deal with them.
- A global search (Ctrl+K) by name, IP or any text that is not a secret; a result opens the
  device on its map.
- Application-level encryption (AES-256-GCM) for every secret and every image.
- Runs on your own server with Docker Compose.

The interface is in Spanish.

## Quick start

You need Node.js 22.12+ and Docker with Docker Compose.

```bash
cp .env.example .env
# Edit .env: set a Postgres password (letters and digits only) in POSTGRES_PASSWORD and in
# DATABASE_URL, and generate ENCRYPTION_KEY with: openssl rand -base64 32

docker compose up -d db
npm ci
npm run db:migrate
npm run user:create -- you@example.com
npm run dev
```

To try the app with made-up sample customers, run `npm run db:seed` (development only).

`user:create` asks for a password, shows a QR code for your authenticator app (Google
Authenticator, Aegis, 1Password…) and asks for a code to confirm it. Then sign in at
<http://localhost:3000> with your email, password and the code from the app.

## Usage

Lost your phone? `npm run user:reset-2fa -- you@example.com`. Forgot your password?
`npm run user:set-password -- you@example.com`. Both close every open session.

### Docker

```bash
docker compose up -d --build
docker compose run --rm migrate npm run user:create -- you@example.com
```

The app is served on <http://localhost:3000> and Postgres on `localhost:5432`, both reachable
only from the same machine. To use it from another machine, put HTTPS in front of it.

Screenshots are stored encrypted in the `attachments` volume, not in the database: a backup
needs both the database and that volume.

**Keep `ENCRYPTION_KEY` somewhere safe and separate from the backups.** Without it, the
encrypted secrets cannot be recovered.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, the checks, the commit and
pull request conventions and the rules for AI-assisted contributions. Coding agents also follow
[AGENTS.md](AGENTS.md). Security problems go through [SECURITY.md](SECURITY.md), never a public
issue.
