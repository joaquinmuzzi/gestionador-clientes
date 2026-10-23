# Gestionador de Clientes

App para documentar la infraestructura de cada cliente como un mapa de red: dispositivos, IPs, claves (cifradas), capturas de configuraciones, incidentes y agenda. Pensada para un técnico de soporte que atiende a muchas empresas.

El contexto, las reglas de seguridad y las convenciones están en [CLAUDE.md](CLAUDE.md).

## Requisitos

- Node.js 22.12 o más nuevo
- Docker con Docker Compose

## Desarrollo

```bash
cp .env.example .env
# Editá .env: poné una clave de Postgres (solo letras y números) en POSTGRES_PASSWORD
# y en DATABASE_URL, y generá ENCRYPTION_KEY con: openssl rand -base64 32

docker compose up -d db
npm install
npm run db:migrate
npm run user:create -- tu@email
npm run dev
```

`user:create` pide la contraseña, muestra un QR para la app de autenticación (Google Authenticator, Aegis, 1Password…) y pide un código para confirmar. Después entrás en http://localhost:3000 con email, contraseña y el código de la app.

Si perdés el celular: `npm run user:reset-2fa -- tu@email`. Si olvidás la contraseña: `npm run user:set-password -- tu@email`. Los dos cierran todas las sesiones abiertas.

## Con Docker (todo junto)

```bash
docker compose up -d --build
docker compose run --rm migrate npm run user:create -- tu@email
```

La app queda en http://localhost:3000 y Postgres en localhost:5432, los dos solo accesibles desde la misma máquina. Para usarla desde otra máquina hace falta ponerle HTTPS adelante (se arma en el paso de despliegue).

**Guardá `ENCRYPTION_KEY` en un lugar seguro y separado de los backups.** Sin esa clave, los secretos cifrados no se pueden recuperar.

## Tests

```bash
npm run lint && npm run typecheck && npm test   # unitarios
npx playwright install chromium                 # solo la primera vez
npm run build && npm run test:e2e               # end to end (necesita Postgres levantado)
```
