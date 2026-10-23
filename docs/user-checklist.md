# Hoja del usuario

Una página con lo único que le toca cuidar a quien usa la app. La instalación del servidor, las
actualizaciones y los backups los hace quien administra el servidor, siguiendo
[deployment.md](deployment.md) y [backups.md](backups.md). Para el uso diario está la
[guía de uso](user-guide.md).

## El primer día

- [ ] Instalar en el celular una app de autenticación (Google Authenticator, Aegis, 1Password…).
- [ ] Escanear el código QR que muestra quien crea la cuenta, y entrar una vez para probarla.
- [ ] Elegir una contraseña larga (al menos 12 caracteres) que no se use en ningún otro lado.
- [ ] Guardar en un lugar seguro y **fuera del servidor**, por ejemplo una hoja impresa en una
      caja fuerte o un gestor de contraseñas, las dos claves que entrega quien instaló el
      servidor:
  - `ENCRYPTION_KEY`: sin ella no se puede descifrar ninguna contraseña ni captura.
  - `RESTIC_PASSWORD`: sin ella no se puede abrir ningún backup.

  Si se pierde el servidor y también estas claves, los datos no se recuperan nunca, ni siquiera
  con los backups.

## Todos los días

- [ ] Las contraseñas, siempre en campos marcados como **Secreto**. Nunca en notas, incidentes ni
      tareas.
- [ ] Cerrar la sesión (**Salir**) en una computadora que no sea propia.
- [ ] No sacar capturas de la app para mandarlas por WhatsApp o mail: si alguien necesita un
      dato, pasale solo ese dato.

## Una vez por mes

- [ ] Preguntarle a quien administra el servidor cómo salió la **prueba de restauración** del
      mes. Se corre sola el día 1 y deja el resultado en `restore-tests.log`. Tiene que decir
      que salió bien.
- [ ] Mirar en el mapa los dispositivos marcados (incidentes abiertos o tareas vencidas) y
      ponerlos al día.

## Dos veces por año

- [ ] Hacer junto con quien administra el servidor la recuperación completa en otra máquina,
      usando solo las claves guardadas y el backup de la nube
      ([Disaster recovery](backups.md#disaster-recovery)). Es la única forma de saber que las
      claves guardadas son las correctas.

## Si pasa algo

| Pasó esto | Hacer esto |
|---|---|
| Perdí o me robaron el celular | Avisar enseguida para que generen un 2FA nuevo. Eso cierra todas las sesiones abiertas. |
| Creo que alguien vio mi contraseña | Pedir que la cambien. También cierra todas las sesiones. |
| La app no abre | Avisar a quien administra el servidor. Los datos están en el servidor y en los backups. |
