# ADR-015 — Coolify y respaldo con restauración aislada

Fecha: **18 de octubre de 2026**. Historia B21, RF56, RNF08 y RNF13; subconjunto de CU20.

## Contexto y decisión del equipo

El equipo confirmó que dispone de VPS, dominio y **Coolify**. Se prepara una
aplicación Git con Docker Compose, usando el proxy y HTTPS que administra Coolify.
El dominio concreto, acceso al servidor y responsable de operación aún no se han
configurado ni comprobado desde esta entrega. No se afirma puesta en producción.

## Implementación propuesta

1. Una imagen React/Caddy sirve la web y dirige `/api` a NestJS. Solo web se
   conecta al proxy de Coolify; PostgreSQL y API permanecen en una red privada,
   sin puertos publicados. El origen HTTPS es único, con cookies Secure/HttpOnly
   y CSRF existentes. No se añade otra infraestructura distribuida.
   La API confía en un solo salto privado mediante una opción explícita; Caddy
   sustituye X-Forwarded-For por la dirección validada. Para Coolify, el operador
   declara las IP/CIDR exclusivas de su proxy y se analiza la cadena de derecha
   a izquierda. La configuración inicial solo confía en loopback. Así se evita
   atribuir todos los accesos a Caddy o aceptar direcciones inventadas por el cliente.
2. Las imágenes se construyen con Node 24 y el lockfile de pnpm 11.19.0. La API
   incluye distribución, dependencias de producción y plantillas XLSX versionadas.
   Los archivos privados, fuentes de prueba y `.env` no forman parte de la imagen.
3. El servicio operativo `ops` ejecuta explícitamente migraciones y preparación
   del usuario PostgreSQL de la API. El propietario del esquema y el usuario
   cotidiano tienen credenciales diferentes. El usuario de API carece de DDL,
   superusuario y administración de roles; no puede deshabilitar los triggers
   para borrar auditoría. Las migraciones no se ejecutan al iniciar la aplicación.
4. `compose.deploy.yaml` permite una demostración local HTTPS separada del
   desarrollo, con datos y credenciales propios. Su autoridad local no representa
   el certificado del dominio institucional.
5. El respaldo operativo utiliza `pg_dump` de PostgreSQL 18 en formato custom.
   El manifiesto y el dump comparten un snapshot exportado: migraciones, esquema,
   conteos y huella exacta de un intento cerrado se observan en el mismo instante.
   Se calcula SHA256 del archivo y del manifiesto y se guarda la ubicación lógica,
   sin rutas del servidor ni contraseñas en la consulta administrativa.
6. Cada inicio y resultado se añade como evento inmutable y se audita. Un corte
   puede dejar un inicio sin resultado; no se transforma en éxito por inferencia.
   Un ensayo exitoso referencia el respaldo exacto y sus hashes, sin modificar
   el resultado original de generación.
7. La restauración de prueba solo admite un contenedor nuevo y aleatorio, sin
   red, puertos ni volúmenes del host. Verifica el contenido restaurado y elimina
   ese entorno antes de registrar éxito. No hay restauración sobre la base real
   ni acceso al socket Docker desde la API.

La consola admite un administrador activo con contraseña comprobada o un proceso
técnico identificado de forma explícita, autenticado por sus credenciales de base.
Este último se registra como proceso, sin atribuirle una persona ficticia. El
operador con acceso a PostgreSQL/Docker forma parte del perímetro de confianza;
los hashes comprueban integridad, no una firma contra un operador privilegiado.

## Consecuencias y límites

Los respaldos se escriben fuera del repositorio con creación exclusiva. Son
archivos comprimidos **sin cifrado propio** y contienen información sensible;
requieren almacenamiento protegido y custodia externa cifrada. Este respaldo
lógico corresponde a una base, no a todos los roles, secretos o volúmenes del VPS.
La configuración privada se conserva por separado. No ofrece recuperación a un
instante arbitrario ni reemplaza una política de continuidad acordada.

El responsable debe configurar al menos un respaldo diario durante periodos
activos, horario, aviso de fallo, retención y copia externa. El plan de retención
solo informa candidatos y no elimina archivos. No se inventa una política ni se
activa una tarea remota sin acceso al entorno del centro.

Los respaldos nativos de Coolify pueden complementar el procedimiento; no se
consideran ensayos B21 ni se incorporan automáticamente a su bitácora. RF57 de
recuperación institucional y la pantalla general de auditoría quedan fuera de
este subconjunto. Las plantillas B19 y la aceptación humana B20 mantienen sus
pendientes.

## Referencias y verificación

- [B21: ejecución y resultados](../B21-despliegue-respaldo.md).
- [Manual de instalación y operación](../manuales/instalacion-operacion.md).
- [Coolify: aplicaciones Docker Compose](https://coolify.io/docs/applications/builds/docker-compose).
- [Express: confianza en proxies](https://expressjs.com/en/guide/behind-proxies/)
  y [Caddy: proxies confiables](https://caddyserver.com/docs/caddyfile/options#trusted-proxies).
- [PostgreSQL 18: pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
  [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html) y
  [snapshots exportados](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION).

Las verificaciones automatizadas contrastan el intento sintético completo y
deniegan manipulación, permisos insuficientes y archivos alterados. Los resultados
ejecutados se registran en B21, separados de la recepción pendiente del VPS.
