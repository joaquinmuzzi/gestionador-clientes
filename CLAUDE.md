# Gestionador de Clientes

App para que un técnico de soporte (soft y hard) documente la infraestructura de cada cliente **como un mapa**, al estilo Cisco Packet Tracer pero para anotar, no para simular. El objetivo es sacar de la cabeza del técnico todo lo que hoy tiene que recordar: IPs, claves largas, configuraciones, backups, quién hace qué.

La idea es de Gabriel Natalucci (técnico, usuario principal). Joaquín (GitHub `joaquinmuzzi`) es quien la desarrolla. Referencias: transcripción de audios en `/mnt/project-files/transcripciones/audios-2026-09-27.md` y el draw.io "VAIRO" de Gabriel (capturas en el proyecto).

## Principios (no negociables)

1. **Mapa primero.** La pantalla principal de un cliente es su diagrama de red. Doble click en un dispositivo abre su ficha. Nada de listas interminables como vista principal.
2. **Sin estándar rígido.** Cada dispositivo tiene campos libres ilimitados (nombre + valor, texto multilínea), como las "propiedades" de draw.io. Los campos básicos son sugerencias, no obligatorios.
3. **Simple.** Pocas pantallas, pocos clicks. Nada que se parezca a SAP. Si una feature complica el flujo principal, se posterga.
4. **Seguro de verdad.** La app guarda claves y datos de muchas empresas. Un leak es catastrófico. Ver "Seguridad".
5. **Imágenes como ciudadanos de primera.** Configuraciones complejas (IPsec, reservas DHCP) se documentan con capturas adjuntas al dispositivo o al cliente.

## Modelo de dominio

- **Cliente**: empresa atendida. Tiene un mapa, notas, contactos y usuarios finales.
- **Usuario final del cliente**: persona de la empresa. Perfil libre: nivel técnico, qué puede y qué no puede tocar, cómo tratarlo.
- **Dispositivo** (nodo del mapa): tipo (router, switch, servidor, PC, NAS, firewall, AP, impresora, nube, otro), nombre, posición en el mapa, ícono.
  - Campos libres (clave/valor multilínea). Un campo puede marcarse como **secreto**: se guarda cifrado y se muestra oculto hasta pedir verlo.
  - Adjuntos: capturas e imágenes con título.
  - Funciones / quién hace qué (texto libre).
  - Vulnerabilidades conocidas.
  - Historial de incidentes y errores pasados (fecha, qué pasó, cómo se resolvió).
  - Agenda: tareas puntuales con fecha (ej. "probar restore del backup").
- **Conexión** (arista del mapa): entre dos dispositivos, con etiqueta opcional (ej. "VPN IPsec", "WAN1", "VLAN 20").
- **Pestañas del cliente** (opcional en el MVP): páginas extra por cliente con imágenes y texto, como las pestañas de draw.io.

## Stack (confirmado por Joaquín el 2026-10-23)

- **Next.js 16 (App Router) + TypeScript + React 19** para frontend y backend en un solo proyecto. El paquete es ESM (`"type": "module"`).
- **React Flow (`@xyflow/react`)** para el mapa: nodos con íconos por tipo, drag & drop, conexiones, zoom. Se agrega en el hilo del editor del mapa.
- **PostgreSQL 18 + Prisma 7** (generador `prisma-client` con `@prisma/adapter-pg`). El cliente se genera en `src/generated/prisma` (no se commitea; lo crea `npm install`).
- **Tailwind CSS 4.** shadcn/ui todavía no está inicializado: el primer hilo que necesite componentes más complejos que un formulario lo agrega con `npx shadcn init`.
- **Login propio** (sin Auth.js): contraseña + TOTP, sesiones guardadas en la base. Auth.js con credenciales obliga a sesiones JWT que no se pueden revocar; acá necesitamos sesiones cortas y revocables. Detalle en "Seguridad".
- **zod 4** para validar entradas en el servidor.
- Archivos (capturas) en disco o S3 compatible, siempre cifrados.
- **Docker Compose** para levantar todo (app + migraciones + Postgres) en un servidor propio.
- Tests: **Vitest** (unitarios, `src/**/*.test.ts`) y **Playwright** (end to end, `e2e/`).

Si se cambia el stack, actualizar esta sección antes de escribir código.

### Next.js 16: lo que cambia respecto de versiones anteriores

Leé `AGENTS.md`: esta versión de Next.js tiene cambios grandes y su documentación está en `node_modules/next/dist/docs/`. Lo que más importa acá:

- **`src/proxy.ts`** reemplaza a `middleware.ts`. Solo hace un chequeo optimista (si no hay cookie de sesión, manda a `/login`).
- **Cache Components está activado.** Leer cookies o la sesión tiene que pasar dentro de un `<Suspense>`; si no, el build falla. Patrón: la página es estática y el componente que lee datos va dentro de `<Suspense>`.
- **Toda página, Server Action y Route Handler que toque datos llama a `requireUser()`** (`src/lib/auth/session.ts`). Los layouts no se vuelven a ejecutar en cada navegación, así que no alcanza con chequear en el layout.
- `next start` no funciona con `output: "standalone"`; por eso el standalone solo se activa en el build de Docker (`BUILD_STANDALONE=1`).

## Seguridad

- Campos secretos y adjuntos se cifran en la aplicación (AES-256-GCM) con una clave maestra que viene de la variable de entorno `ENCRYPTION_KEY`, nunca del repo ni de la base. Usar `encrypt`/`decrypt` (o `encryptString`/`decryptString`) de `src/lib/crypto.ts`, siempre con un **contexto** que identifique dónde vive el dato (`"<entidad>:<id>:<campo>"`, ej. `"device-field:<id>:value"`). El contexto va como dato autenticado: un valor cifrado copiado a otra fila no se descifra.
- Nunca commitear credenciales reales, dumps, `.env` ni capturas de clientes. Datos de ejemplo y seeds siempre inventados (`192.0.2.x`, `ejemplo.local`, claves falsas).
- Login obligatorio con contraseña (argon2id) + 2FA TOTP. No hay registro por la web: los usuarios se crean con `npm run user:create`.
- Sesiones en la tabla `Session` (se guarda el SHA-256 del token, no el token). Duran 8 horas como máximo y se cierran tras 1 hora sin actividad. Cookie `__Host-session` (httpOnly, Secure, SameSite=Lax) en producción, por eso la app tiene que servirse por HTTPS (o localhost).
- Rate limit de login: 5 fallos por IP y 10 por email cada 15 minutos. Cada intento queda en `LoginAttempt` (auditoría de logins, 90 días). Un código TOTP no se puede usar dos veces.
- Log de auditoría: quién vio o cambió un secreto y cuándo.
- Validar toda entrada en el servidor (zod). Sin SQL crudo con interpolación.
- Cabeceras de seguridad en `next.config.ts` (no se puede embeber en iframes, nosniff, etc.).
- Backups de la base: principal + local + nube, con prueba de restore periódica (filosofía de Gabriel). Documentar el procedimiento en `docs/backups.md`.

## Alcance del MVP

Entra:
- Login de un usuario (el técnico) con 2FA.
- ABM de clientes.
- Mapa por cliente: agregar, mover, conectar y borrar dispositivos; se guarda solo.
- Ficha del dispositivo por doble click: campos libres, secretos, adjuntos, funciones, vulnerabilidades, incidentes y agenda.
- Perfiles de usuarios finales por cliente.
- Búsqueda global (por nombre, IP o texto de cualquier campo no secreto).
- Despliegue con Docker Compose.

Queda para después:
- Varios técnicos con permisos por cliente (hoy todos los usuarios ven todo).
- Abrir RDP desde la app.
- Agente en cada máquina que sube su inventario (tipo msinfo32).
- Importar diagramas de draw.io.
- Historial de versiones de claves.

## Convenciones

- Código, nombres de variables y commits en inglés; interfaz y documentación de usuario en español (Rioplatense).
- Un PR por hilo de trabajo, chico y enfocado. Descripción con "Antes / Después".
- Todo PR corre lint, typecheck y tests antes de pedir revisión (también lo corre GitHub Actions, `.github/workflows/ci.yml`).
- Migraciones de Prisma versionadas; nunca editar una migración ya mergeada.
- Estructura:
  - `src/app/login`: pantalla y acción de login.
  - `src/app/(app)`: todo lo que requiere sesión.
  - `src/components`: componentes compartidos.
  - `src/lib`: `crypto.ts`, `db.ts`, `auth/` (contraseñas, TOTP, sesiones, rate limit).
  - `prisma/`: esquema y migraciones. `scripts/`: CLI (usuarios). `e2e/`: tests de Playwright. `docs/`: documentación.
- Tests end to end: usan la base de `DATABASE_URL`, crean su propio usuario (`e2e@ejemplo.local`) y mandan IPs de documentación (`192.0.2.x`) para no pisar datos de desarrollo.

## Comandos

```bash
cp .env.example .env                    # completar claves (ver comentarios)
docker compose up -d db                 # Postgres en localhost:5432
npm install                             # también genera el cliente de Prisma
npm run db:migrate                      # aplica/crea migraciones (desarrollo)
npm run user:create -- tu@email         # crea el usuario y configura el 2FA
npm run dev                             # app en http://localhost:3000

npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e       # e2e contra el build de producción (puerto 3100)

docker compose up -d --build            # todo junto: Postgres + migraciones + app
docker compose run --rm migrate npm run user:create -- tu@email
```
