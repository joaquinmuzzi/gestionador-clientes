# Deployment

How to run Gestionador de Clientes on a server of your own with Docker Compose. Backups are in
[backups.md](backups.md); set them up on the same day as the server, before loading real data.

The app holds passwords and screenshots of many companies, so the recommended setup keeps it off
the public internet: the technician reaches it through a private network (Tailscale), and nothing
on the server is open to the world except SSH.

## 1. The server

- Any 64-bit Linux with Docker Engine and the Docker Compose plugin. Ubuntu Server 24.04 LTS or
  Debian 12 are the simplest. It can be a machine at the office or a small VPS.
- 2 GB of RAM and 20 GB of disk are enough to start; screenshots are what grows.
- A second disk or a NAS for the local backup copy (not the disk the server runs on).
- Basic hardening: SSH with keys only (`PasswordAuthentication no`), automatic security updates
  (`unattended-upgrades` on Ubuntu and Debian) and a firewall that only lets SSH in:

  ```bash
  sudo ufw default deny incoming
  sudo ufw allow OpenSSH
  sudo ufw enable
  ```

  Docker bypasses `ufw` for the ports it publishes. That is why `docker-compose.yml` binds the app
  and Postgres to `127.0.0.1`: they are never reachable from outside the machine.

Install Docker from its official repository: <https://docs.docker.com/engine/install/>.

## 2. The code and the `.env` file

```bash
sudo mkdir -p /opt/gestionador-clientes && sudo chown "$USER" /opt/gestionador-clientes
git clone https://github.com/joaquinmuzzi/gestionador-clientes.git /opt/gestionador-clientes
cd /opt/gestionador-clientes
cp .env.example .env
chmod 600 .env
```

The repository is private: clone it with a read-only deploy key or a fine-grained token limited to
this repository.

Fill in `.env`:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | A long random password, letters and digits only: `openssl rand -hex 24` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `RESTIC_PASSWORD` | `openssl rand -base64 32` |
| `BACKUP_*`, `AWS_*` | See [backups.md](backups.md#setup) |
| `SITE_ADDRESS` | Empty with Tailscale; the domain with Caddy (section 4) |

`DATABASE_URL` and `ATTACHMENTS_DIR` are only for development: Docker Compose sets its own.

**Before going on, copy `ENCRYPTION_KEY` and `RESTIC_PASSWORD` to a password manager and to a
printed sheet kept in a safe place.** They are not inside the backups on purpose: without
`ENCRYPTION_KEY` no secret or screenshot can be decrypted, and without `RESTIC_PASSWORD` no backup
can be opened. Never change `ENCRYPTION_KEY` once there is data.

## 3. Start the app

```bash
docker compose up -d --build
docker compose run --rm migrate npm run user:create -- tecnico@example.com
```

`up` starts Postgres, applies the migrations and starts the app on `127.0.0.1:3000`. The second
command creates the technician's user and shows the QR code for the authenticator app.

The session cookie only works over HTTPS (or on `localhost`), so the app is used through one of
the two options below, never as `http://<server-ip>:3000`.

## 4. Access

### Option A: Tailscale (recommended)

Tailscale builds a private network between the server and the technician's devices. Nothing is
opened on the server's firewall, and the connection uses HTTPS with a valid certificate.

1. Create a Tailscale account and, in the admin console, turn on MagicDNS and HTTPS certificates
   (DNS page).
2. On the server: install Tailscale (<https://tailscale.com/download/linux>), run
   `sudo tailscale up`, and then publish the app inside the private network:

   ```bash
   sudo tailscale serve --bg 3000
   ```

3. Install Tailscale on the technician's computer and phone with the same account.
4. Open `https://<server-name>.<tailnet>.ts.net` (the address `tailscale serve status` shows).

`tailscale serve` (not `funnel`) keeps the app inside the private network; it survives reboots.

### Option B: a public domain with Caddy

Only if the app must be reachable from devices that cannot run Tailscale. The login still needs
the password and the 2FA code, and it has a rate limit, but the page is exposed to the internet.

1. Create a DNS `A` record (for example `gestionador.example.com`) pointing to the server's
   public IP, and set it in `.env` as `SITE_ADDRESS`.
2. Open ports 80 and 443 to the server (in the provider's firewall, if it has one).
3. Start Caddy, which gets and renews the Let's Encrypt certificate on its own:

   ```bash
   docker compose --profile https up -d
   ```

Caddy's configuration is [`Caddyfile`](../Caddyfile): HTTPS, HSTS and compression in front of the
app.

## 5. Updates

```bash
cd /opt/gestionador-clientes
docker compose run --rm backup          # a backup right before updating
git pull
docker compose up -d --build            # add --profile https when using Caddy
```

The `migrate` service applies new migrations before the app starts. If something goes wrong,
`docker compose logs app migrate` shows why.

## 6. Day to day

| Task | Command |
|---|---|
| See if everything is running | `docker compose ps` |
| Logs of the app | `docker compose logs -f app` |
| Restart | `docker compose restart app` |
| Lost phone (new 2FA) | `docker compose run --rm migrate npm run user:reset-2fa -- <email>` |
| Forgotten password | `docker compose run --rm migrate npm run user:set-password -- <email>` |
| Backups and restore tests | [backups.md](backups.md) |
