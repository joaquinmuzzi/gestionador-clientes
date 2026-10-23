# Instalación en el servidor

Cómo correr Gestionador de Clientes en un servidor propio con Docker Compose. Los backups están en
[backups.md](backups.md); configuralos el mismo día que el servidor, antes de cargar datos reales.

La app guarda contraseñas y capturas de muchas empresas, así que la configuración recomendada la
deja fuera de internet: el técnico entra por una red privada (Tailscale) y en el servidor no queda
nada abierto al mundo salvo SSH.

## 1. El servidor

- Cualquier Linux de 64 bits con Docker Engine y el plugin Docker Compose. Ubuntu Server 24.04 LTS
  o Debian 12 son lo más simple. Puede ser una máquina en la oficina o un VPS chico.
- Para empezar alcanzan 2 GB de RAM y 20 GB de disco; lo que crece son las capturas.
- Un segundo disco o un NAS para la copia local de los backups (no el disco donde corre el
  servidor).
- Seguridad básica: SSH solo con claves (`PasswordAuthentication no`), actualizaciones de
  seguridad automáticas (`unattended-upgrades` en Ubuntu y Debian) y un firewall que solo deje
  entrar SSH:

  ```bash
  sudo ufw default deny incoming
  sudo ufw allow OpenSSH
  sudo ufw enable
  ```

  Docker se saltea `ufw` en los puertos que publica. Por eso `docker-compose.yml` ata la app y
  Postgres a `127.0.0.1`: nunca se puede llegar a ellos desde fuera de la máquina.

Instalá Docker desde su repositorio oficial: <https://docs.docker.com/engine/install/>.

## 2. El código y el archivo `.env`

```bash
sudo mkdir -p /opt/gestionador-clientes && sudo chown "$USER" /opt/gestionador-clientes
git clone https://github.com/joaquinmuzzi/gestionador-clientes.git /opt/gestionador-clientes
cd /opt/gestionador-clientes
cp .env.example .env
chmod 600 .env
```

El repositorio es privado: clonalo con una deploy key de solo lectura o con un token
fine-grained limitado a este repositorio.

Completá `.env`:

| Variable | Valor |
|---|---|
| `POSTGRES_PASSWORD` | Una contraseña larga y aleatoria, solo letras y números: `openssl rand -hex 24` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `RESTIC_PASSWORD` | `openssl rand -base64 32` |
| `BACKUP_*`, `AWS_*` | Ver [backups.md](backups.md#configuración) |
| `SITE_ADDRESS` | Vacía con Tailscale; el dominio con Caddy (sección 4) |

`DATABASE_URL` y `ATTACHMENTS_DIR` son solo para desarrollo: Docker Compose pone los suyos.

**Antes de seguir, copiá `ENCRYPTION_KEY` y `RESTIC_PASSWORD` en un gestor de contraseñas y en una
hoja impresa guardada en un lugar seguro.** No están dentro de los backups a propósito: sin
`ENCRYPTION_KEY` no se puede descifrar ningún secreto ni captura, y sin `RESTIC_PASSWORD` no se
puede abrir ningún backup. Nunca cambies `ENCRYPTION_KEY` una vez que hay datos.

## 3. Arrancar la app

```bash
docker compose up -d --build
docker compose run --rm migrate npm run user:create -- tecnico@example.com
```

`up` arranca Postgres, aplica las migraciones y levanta la app en `127.0.0.1:3000`. El segundo
comando crea el usuario del técnico y muestra el código QR para la app de autenticación.

La cookie de sesión solo funciona con HTTPS (o en `localhost`), así que la app se usa por alguna de
las dos opciones de abajo, nunca como `http://<ip-del-servidor>:3000`.

## 4. Acceso

### Opción A: Tailscale (recomendada)

Tailscale arma una red privada entre el servidor y los dispositivos del técnico. No se abre nada
en el firewall del servidor y la conexión usa HTTPS con un certificado válido.

1. Creá una cuenta de Tailscale y, en la consola de administración, activá MagicDNS y los
   certificados HTTPS (página DNS).
2. En el servidor: instalá Tailscale (<https://tailscale.com/download/linux>), corré
   `sudo tailscale up` y después publicá la app dentro de la red privada:

   ```bash
   sudo tailscale serve --bg 3000
   ```

3. Instalá Tailscale en la computadora y el celular del técnico con la misma cuenta.
4. Abrí `https://<nombre-del-servidor>.<tailnet>.ts.net` (la dirección que muestra
   `tailscale serve status`).

`tailscale serve` (no `funnel`) mantiene la app dentro de la red privada y sobrevive a los
reinicios.

### Opción B: un dominio público con Caddy

Solo si hay que llegar a la app desde dispositivos que no pueden usar Tailscale. El ingreso sigue
pidiendo la contraseña y el código 2FA, y tiene límite de intentos, pero la página queda expuesta
a internet.

1. Creá un registro DNS `A` (por ejemplo `gestionador.example.com`) que apunte a la IP pública
   del servidor, y ponelo en `.env` como `SITE_ADDRESS`.
2. Abrí los puertos 80 y 443 hacia el servidor (en el firewall del proveedor, si tiene uno).
3. Arrancá Caddy, que obtiene y renueva solo el certificado de Let's Encrypt:

   ```bash
   docker compose --profile https up -d
   ```

La configuración de Caddy está en [`Caddyfile`](../Caddyfile): HTTPS, HSTS y compresión delante de
la app.

## 5. Actualizaciones

```bash
cd /opt/gestionador-clientes
docker compose run --rm backup          # un backup justo antes de actualizar
git pull
docker compose up -d --build            # agregá --profile https si usás Caddy
```

El servicio `migrate` aplica las migraciones nuevas antes de que arranque la app. Si algo sale
mal, `docker compose logs app migrate` muestra por qué.

## 6. El día a día

| Tarea | Comando |
|---|---|
| Ver si todo está corriendo | `docker compose ps` |
| Logs de la app | `docker compose logs -f app` |
| Reiniciar | `docker compose restart app` |
| Celular perdido (2FA nuevo) | `docker compose run --rm migrate npm run user:reset-2fa -- <email>` |
| Contraseña olvidada | `docker compose run --rm migrate npm run user:set-password -- <email>` |
| Backups y pruebas de restauración | [backups.md](backups.md) |
