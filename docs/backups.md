# Backups

La regla del usuario: una copia principal, una copia local y una copia en la nube, y
restauraciones que de verdad se prueban cada tanto. Así la cumple la app.

| Copia | Dónde | Qué |
|---|---|---|
| Principal | El servidor: los volúmenes Docker `db-data` y `attachments` | Los datos en uso |
| Local | `BACKUP_LOCAL_DIR`: otro disco o un NAS montado en el servidor | Un repositorio de restic |
| Nube | `BACKUP_CLOUD_REPOSITORY`: un bucket (Backblaze B2 o cualquier almacenamiento compatible con S3) | Un repositorio de restic |

Todas las noches un backup vuelca la base de datos (`pg_dump`) y copia ese volcado, junto con los
archivos de las capturas, a los dos repositorios con [restic](https://restic.net/). restic cifra
todo con `RESTIC_PASSWORD`, solo sube lo que cambió y guarda 7 copias diarias, 4 semanales y 6
mensuales. Una vez por mes una prueba de restauración carga la última copia en una base de datos
descartable y verifica que todos los secretos y todas las capturas se sigan descifrando.

## Lo que no está en los backups

Tres cosas quedan fuera de los backups a propósito, para que un backup robado no sirva de nada:

- `ENCRYPTION_KEY`: sin ella no se puede descifrar ningún campo secreto ni captura, aunque el
  backup esté perfecto.
- `RESTIC_PASSWORD`: sin ella no se pueden abrir los backups.
- Las claves de la nube (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

Guardalas en un gestor de contraseñas **y** en una hoja impresa en un lugar seguro (no en el
servidor). Cuando las anotes, comparalas con `.env` carácter por carácter: perderlas, o un error
al copiarlas, significa perder todo.

## Configuración

1. **Contraseña.** Poné `RESTIC_PASSWORD` en `.env` (`openssl rand -base64 32`) y guardala como
   se explica arriba.
2. **Copia local.** Montá el segundo disco o el NAS en el servidor (por ejemplo en
   `/mnt/backups`, desde `/etc/fstab` para que sobreviva a los reinicios) y poné
   `BACKUP_LOCAL_DIR=/mnt/backups/gestionador`. Si queda vacía, usa `./backups` al lado de
   `docker-compose.yml`, que está en el mismo disco que los datos: sirve para una primera prueba,
   no como copia local de verdad.
3. **Copia en la nube (Backblaze B2).**
   1. Creá una cuenta de B2 y un bucket **privado**, por ejemplo `gestionador-backups`.
   2. Creá una application key limitada a ese bucket, con permiso de lectura y escritura.
   3. En `.env`:

      ```bash
      BACKUP_CLOUD_REPOSITORY=s3:https://s3.<region>.backblazeb2.com/gestionador-backups/gestionador
      AWS_ACCESS_KEY_ID=<keyID>
      AWS_SECRET_ACCESS_KEY=<applicationKey>
      ```

      La región es parte del endpoint del bucket (por ejemplo `us-west-004`). Cualquier otro
      almacenamiento compatible con S3 funciona igual con su propio endpoint, y también cualquier
      otro [repositorio de restic](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).
4. **Primer backup.** Crea los dos repositorios:

   ```bash
   cd /opt/gestionador-clientes
   docker compose run --rm backup
   ```

   Termina con `backup finished`. Un `WARNING: BACKUP_CLOUD_REPOSITORY is empty` quiere decir que
   todavía no hay copia en la nube.
5. **Programación.** Agregá al crontab del usuario que corre Docker (`crontab -e`):

   ```cron
   # Todas las noches a las 03:30: backup a la copia local y a la de la nube
   30 3 * * * cd /opt/gestionador-clientes && docker compose run --rm -T backup >> backup.log 2>&1
   # El día 1 de cada mes a las 05:00: prueba de restauración de la copia de la nube
   0 5 1 * * cd /opt/gestionador-clientes && scripts/restore-test.sh cloud >> backup.log 2>&1
   ```

6. **Monitoreo (recomendado).** Un backup que deja de correr sin avisar es la forma más común de
   perder datos. Creá un check gratis en [healthchecks.io](https://healthchecks.io/) (diario, con
   unas horas de tolerancia) y poné su URL en `BACKUP_PING_URL`. Cada backup le avisa, y las
   fallas se informan a `<url>/fail`; healthchecks.io manda un email cuando un backup falla o no
   llega.

7. **Corré la primera prueba de restauración** (sección siguiente) y anotala en el
   [registro](#registro-de-pruebas-de-restauración). Agregá también una tarea mensual en la agenda
   del dispositivo del servidor en su mapa: "Revisar la prueba de restore".

## Prueba de restauración

```bash
scripts/restore-test.sh          # la copia local
scripts/restore-test.sh cloud    # la copia de la nube
```

Arranca un Postgres descartable que no guarda nada en disco, restaura en él la última snapshot y
después corre [`scripts/verify-restore.ts`](../scripts/verify-restore.ts) con el código de la
propia app: cuenta clientes, dispositivos, campos, capturas, etc., y descifra cada clave 2FA, cada
campo secreto y cada captura con `ENCRYPTION_KEY`. No se imprime nada descifrado. La base de datos
y los archivos en uso nunca se tocan, y los datos descartables se borran al final.

El resultado se agrega a `restore-tests.log` al lado de `docker-compose.yml`. Una falla lista lo
que no se restauró o no se pudo descifrar:

- `Nothing decrypts`: la `ENCRYPTION_KEY` de `.env` no es la que se usó para hacer el backup.
- `attachment ... has no file`: una captura borrada en los segundos entre el volcado de la base
  de datos y la copia de los archivos. Corré el backup y la prueba de nuevo; si se repite, es un
  problema real.

La prueba mensual corre en el mismo servidor, así que no demuestra que las claves guardadas en
lugar seguro sean las correctas. **Dos veces por año, hacé el ejercicio completo**: en otra
máquina, solo con la hoja impresa y este repositorio, seguí
[Recuperación ante desastres](#recuperación-ante-desastres) con la copia de la nube y entrá a la
app. Anotalo también en el registro.

## Recuperación ante desastres

El servidor murió o los datos están dañados. En un servidor nuevo (o el mismo, reinstalado):

1. Seguí las secciones 1 y 2 de [deployment.md](deployment.md), escribiendo `.env` con la
   **misma** `ENCRYPTION_KEY`, la misma `RESTIC_PASSWORD` y la misma configuración de backups que
   antes (las del lugar seguro).
2. Arrancá solo la base de datos y restaurá en ella. `recover` se niega a correr sobre una base de
   datos que ya tiene tablas, así que nunca puede pisar datos en uso:

   ```bash
   docker compose up -d db
   docker compose run --rm recover cloud     # o: local
   ```

3. Arrancá todo y entrá como siempre:

   ```bash
   docker compose up -d --build
   ```

Para volver a una copia más vieja, listalas y pasá el ID de la snapshot:

```bash
docker compose run --rm backup snapshots cloud
docker compose run --rm recover cloud <snapshot-id>
```

Para restaurar sobre datos dañados en un servidor que está andando, pará la app, hacé un backup
del estado dañado por las dudas (`docker compose run --rm backup`), borrá los volúmenes
(`docker compose down -v`, que elimina la base de datos y las capturas en uso) y seguí el paso 2.

## Referencia

| Tarea | Comando |
|---|---|
| Backup ahora | `docker compose run --rm backup` |
| Listar las copias | `docker compose run --rm backup snapshots local` (o `cloud`) |
| Prueba de restauración | `scripts/restore-test.sh local` (o `cloud`) |
| Recuperación ante desastres | `docker compose run --rm recover cloud [snapshot-id]` |

La imagen de backup es [`docker/backup`](../docker/backup/Dockerfile): las herramientas de cliente
de Postgres 18 y restic. Sus comandos están en [`backupctl.sh`](../docker/backup/backupctl.sh).

## Registro de pruebas de restauración

El script escribe `restore-tests.log` solo; anotá acá los ejercicios completos y cualquier cosa que
valga la pena recordar.

| Fecha | Copia | Resultado | Quién | Notas |
|---|---|---|---|---|
| | | | | |
