# B21 — Despliegue, respaldo, restauración y entrega

Fecha: **18 de octubre de 2026**. Historia B21, **RF56, RNF08 y RNF13**;
subconjunto de CU20. Fuentes: requisitos, casos de uso, modelo, arquitectura,
prototipos y plan de desarrollo conservados en `docs/`. El equipo confirmó que
dispone de **VPS, dominio y Coolify**.

Esta entrega prepara el despliegue reproducible, herramientas operativas,
consulta administrativa y manuales. La publicación en el servidor real y su
recepción requieren configurar ese entorno. El piloto humano B20 y las plantillas
institucionales siguen pendientes; no se afirma cobertura total de los 57 RF.

## Despliegue

`infra/compose.coolify.yaml` es el destino principal: aplicación Git en Coolify,
Base Directory `/`, Docker Compose Location `/infra/compose.coolify.yaml`, modo
normal. Las instrucciones y variables están en el
[manual de operación](manuales/instalacion-operacion.md). Solo **web** recibe
dominio en el puerto interno 8080. `WEB_ORIGINS` contiene el origen HTTPS público
sin ese puerto interno. API y PostgreSQL no publican puertos del host.

La API confía en un único salto interno solo cuando se activa
`TRUST_PROXY_HOPS=1` en Compose. Caddy normaliza la dirección del cliente. En la
variante Coolify, el operador define `TRUSTED_PROXY_CIDRS` con las IP o redes
exclusivas del proxy real, separadas por espacios; no autorizar rangos privados
completos ni cualquier dirección. El valor de seguridad inicial solo confía en
loopback: debe configurarse antes de la recepción para que la auditoría y el
límite de acceso distingan los clientes detrás de Coolify.

El operador define dos credenciales diferentes: propietario/migrador y usuario
de ejecución de API. El servicio `ops` prepara las migraciones y permisos. No hay
seed ni migraciones automáticas al iniciar NestJS. El primer administrador se
crea explícitamente con contraseña temporal privada y cambio obligatorio.

Para una instalación persistente de demostración local:

```sh
pnpm deploy:setup
pnpm deploy:config
pnpm deploy:build
pnpm deploy:db
pnpm deploy:migrate
pnpm deploy:status
```

Proporcionar BOOTSTRAP_ADMIN_USERNAME y BOOTSTRAP_ADMIN_PASSWORD de forma privada,
ejecutar `pnpm deploy:admin` y retirar ambas variables. Después:

```sh
pnpm deploy:up
```

La dirección es `https://localhost:8443`, salvo puerto configurado. La autoridad
local es exclusiva de la demostración; el procedimiento de confianza está en el
manual. `pnpm deploy:down` detiene el entorno conservando su volumen. No confundir
esta instalación con el VPS ni con la base de desarrollo.

`pnpm deploy:setup --coolify` prepara `infra/.env.coolify` privado como ayuda
local; revisar y transferir sus variables al gestor privado del recurso. No
publica servicios ni configura DNS. No versionar los `.env`.

## Respaldo y ensayo

Las herramientas reutilizan la conexión PostgreSQL del entorno del operador,
Node 24, dependencias instaladas con pnpm y Docker con imagen `postgres:18`.
Requieren `BACKUP_DIR` absoluto **fuera del repositorio** y uno de:

- BACKUP_ADMIN_ID y BACKUP_ADMIN_PASSWORD de administrador activo, sin cambio
  obligatorio pendiente.
- BACKUP_SERVICE_ID para la ejecución técnica programada, identificada como tal.

El proceso de Node debe alcanzar PostgreSQL con DB_HOST/PORT/NAME/USER/PASSWORD.
El cliente Docker puede usar otra ruta mediante BACKUP_DOCKER_NETWORK,
BACKUP_DOCKER_DB_HOST y BACKUP_DOCKER_DB_PORT. En Coolify, ejecutar desde un
operador con acceso a la red privada; no publicar PostgreSQL para facilitar el
respaldo. No hay soporte implícito de TLS remoto: necesita configuración de
certificados aprobada. La API no recibe acceso a Docker.

```sh
pnpm db:backup
```

Produce `excel-<fecha UTC>-<uuid>.dump` y su `.dump.json`, SHA256 y evento de
generación. El dump custom contiene el snapshot de una sola base; los roles
PostgreSQL y secretos se gestionan por separado. Es una copia comprimida sin
cifrado propio. Custodiar ambos archivos y la configuración privada en lugares
protegidos, con copia externa cifrada según política acordada.

Para el ensayo, definir BACKUP_FILE como **nombre lógico** devuelto por el
respaldo y RESTORE_CONFIRM como `VERIFICAR_EN_CONTENEDOR_NUEVO`:

```sh
pnpm db:restore:verify
```

No acepta una base destino existente. Crea un contenedor aleatorio sin red ni
puertos, restaura con `pg_restore`, compara esquema/migraciones/conteos y huella
de un intento cerrado completo y elimina ese contenedor. El origen se conserva.
Sin intento completo puede comprobar la estructura, pero registra explícitamente
que falta esa evidencia académica. El entorno temporal tiene límites de memoria
y tamaño: una base que los exceda exige revisar el procedimiento antes de operar.

La bitácora relaciona inicio y resultado sin actualizarlos ni borrarlos. Un
inicio sin resultado requiere revisión; una copia exitosa no equivale a un ensayo
exitoso. El snapshot contiene el evento de inicio de su propia generación; el
resultado final se registra después y no se pretende incluirlo retroactivamente.

La política diaria debe configurarse en el servidor por el responsable: mínimo
una copia durante cada día activo, revisión de fallos, conservación y ensayo.
`BACKUP_RETENTION_DAYS` permite `pnpm db:backup:retention`, que **solo enumera**
candidatos; no borra ni adopta una retención por defecto. No se ha activado un
calendario remoto ni designado un custodio institucional en esta entrega.

## Consulta de administración y contrato

Administración → **Respaldos**, ruta `#/respaldos`, consulta la última copia
exitosa y el último ensayo con intento completo, además de filtrar y paginar
operaciones. Reutiliza los componentes de tablas, campos, estados y consulta
compartidos. Informa error y permite reintentar; no descarga archivos ni lanza
restauraciones desde el navegador.

`GET /api/v1/control/respaldos`, solo ADMIN, devuelve el último evento por
operación, `nextCursor`, `ultimoRespaldo` y `ultimaVerificacion`. Acepta `tipo`,
`estado`, `after` y `limit`. El servidor vuelve a comprobar la cuenta y sus
permisos. Los demás roles reciben 403; una sesión ausente recibe 401. No expone
rutas físicas, contraseñas ni contenido del manifiesto académico. OpenAPI
documenta el contrato. La migración 17 incorpora `respaldos`, restricciones y
triggers inmutables; su reversión rechaza evidencia existente.

## Verificación reproducible

```sh
pnpm check
pnpm test:b21
pnpm test:db
pnpm deploy:build
pnpm test:deploy
```

`test:b21` prepara un intento sintético con voucher, reglas, asistencia, criterios,
notas y acta, genera un dump real y restaura sus 32 tablas y 17 migraciones.
Contrasta el intento completo, hashes, inmutabilidad, fallos de herramienta,
permisos y la pantalla React. El informe se genera en `.tmp/b21/pruebas.json`
y la captura en `.tmp/b21/respaldos-administracion.png`. La suite completa incluye
estos mismos casos: no sumarlos dos veces.

`test:deploy` utiliza las imágenes construidas y un proyecto aleatorio propio.
Prepara una base limpia, aplica migraciones y permisos, comprueba web/API por
HTTPS, sesión segura, protección CSRF y denegación de DDL, y elimina únicamente
su entorno temporal. Registra `.tmp/b21/despliegue.json` sin credenciales.
No modifica una instalación persistente ni publica el dominio del VPS.

Resultados locales del **18 de octubre de 2026**, con datos sintéticos:

| Verificación ejecutada | Resultado |
| --- | --- |
| `pnpm check` | Aprobado: lint sin advertencias, tipos y compilación de API/web; 370 pruebas unitarias, 3 HTTP y 44 de herramientas |
| `pnpm test:b21` | 7 pruebas aprobadas, incluido dump real, restauración de 32 tablas/17 migraciones e intento completo |
| `pnpm test:db` | 578 pruebas aprobadas en 29 suites; migración limpia, reversión y reaplicación incluidas |
| Construcción de imágenes API/web y validación Compose local/Coolify | Aprobadas |
| `pnpm test:deploy` | 8 comprobaciones aprobadas: instalación limpia/idempotencia, red privada, HTTPS/recursos/API, sesión/CSRF, IP depurada, permisos/ACL, plantillas/imagen y variante Caddy para Coolify |

Se comprobó una cabecera X-Forwarded-For inventada y se verificó que la IP de
auditoría no era esa cabecera ni la del contenedor web. También se concedieron
permisos TRUNCATE/TRIGGER al rol de prueba y `ops` los retiró al reaplicar su
configuración. La revisión independiente identificó y corrigió esos puntos de
proxy y permisos antes de la comprobación final. La captura administrativa se
revisó visualmente. El entorno de despliegue temporal se eliminó al concluir.

Los resultados locales no acreditan una ejecución remota de GitHub Actions,
publicación en Coolify, validación por otro integrante ni aceptación del centro.
El total sin duplicar subconjuntos es **995 pruebas automatizadas**, más las
8 comprobaciones del despliegue. No sumar nuevamente `test:b21`, pues sus siete
casos ya están incluidos en `test:db`.

## Entrega y pendientes

Se entregan [manual de usuario](manuales/usuario.md),
[instalación y operación](manuales/instalacion-operacion.md),
[índice de evidencias TAP](evidencias/B21/indice-entrega.md) y
[ADR-015](decisiones/ADR-015-despliegue-coolify-respaldos.md).

Quedan pendientes la publicación/HTTPS del dominio real en Coolify, revisión por
otro integrante, responsable operativo, calendario diario, retención y custodia
externa, recepción de la recuperación y piloto humano. RF57 sobre recuperación
institucional y la consulta general RF54 no se presentan como implementadas por
este ensayo. Revisar alcance con el equipo el 23 de octubre y 6 de noviembre.
