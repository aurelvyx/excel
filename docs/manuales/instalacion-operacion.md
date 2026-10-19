# Manual de instalación y operación

Entrega B21, **18 de octubre de 2026**. Referencias: RF56, RNF08, RNF13 y el
subconjunto de CU20 correspondiente a respaldos. El equipo dispone de **VPS,
dominio y Coolify**. Esta entrega prepara una instalación reproducible; los
accesos, nombre exacto del dominio, publicación y recepción operativa se verifican
en el servidor antes de afirmar que está en producción.

El [manual de usuario](usuario.md) explica los flujos académicos. Este documento
se dirige al operador autorizado. No hay credenciales predeterminadas. Las
plantillas B19 siguen como BORRADOR y el piloto humano B20 permanece pendiente.

## 1. Componentes y datos que deben conservarse

| Componente | Función | Conservación |
| --- | --- | --- |
| Web React | Interfaz y cliente de la API | Se reconstruye desde el código y el lockfile |
| API NestJS | Permisos, transacciones, cálculos, XLSX y OpenAPI | Distribución compilada y plantillas versionadas de `apps/api/templates/` |
| PostgreSQL 18 | Identidad, oferta, intentos, asistencias, notas, resultados y evidencia | Volumen persistente y respaldo verificado |
| Configuración y secretos | Conexión, origen web y credenciales del entorno | Gestor privado de secretos/configuración; fuera de Git y de anexos |
| Copias de respaldo | Recuperación ensayada mediante B21 | Carpeta protegida fuera del repositorio y copia externa según política acordada |

El esquema se cambia mediante migraciones. `synchronize` permanece desactivado.
La reconstrucción de imágenes no debe borrar el volumen de PostgreSQL. Los
archivos XLSX descargados se generan desde datos persistidos; no reemplazan un
respaldo de la base. Las muestras privadas `.tmp/b10` no se necesitan para operar
los formatos de demostración y no se incluyen en las imágenes.

## 2. Instalación de desarrollo desde una copia nueva

Requisitos: Git, Node.js **24**, pnpm **11.19.0**, Docker y Compose v2 con
contenedores Linux. Abrir la carpeta raíz del repositorio y ejecutar:

```sh
pnpm install --frozen-lockfile
pnpm env:setup
pnpm db:up
pnpm db:migrate
pnpm db:status
```

`env:setup` crea los tres `.env` locales desde sus ejemplos y genera una
contraseña aleatoria de PostgreSQL, sin imprimirla ni reemplazar archivos
existentes. Si se modifican usuario, contraseña o puerto, mantener concordantes
`infra/.env` y `apps/api/.env`. Cambiar una variable POSTGRES_PASSWORD no cambia
la contraseña de una base ya inicializada en un volumen.

Crear el primer administrador con una contraseña temporal introducida de forma
privada. Ejemplo en PowerShell:

```powershell
$env:BOOTSTRAP_ADMIN_USERNAME = Read-Host 'Nombre del administrador'
$env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Contraseña temporal (12–128 caracteres)' -AsSecureString)).Password
try {
  pnpm admin:bootstrap
} finally {
  Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:BOOTSTRAP_ADMIN_USERNAME -ErrorAction SilentlyContinue
}
```

El comando exige las migraciones y falla si ya existe un administrador activo.
No es un restablecimiento de contraseñas. El primer inicio obliga a cambiar la
clave temporal; no hay que conservarla en archivos del repositorio.

En dos terminales separadas:

```sh
pnpm dev:api
pnpm dev:web
```

| Dirección local | Uso |
| --- | --- |
| `http://127.0.0.1:5173` | Interfaz de desarrollo |
| `http://127.0.0.1:3000/api/v1/health` | Salud de API y conexión de base |
| `http://127.0.0.1:3000/api/docs` | Contratos OpenAPI con Swagger |
| `http://127.0.0.1:3000/api/openapi.json` | Contrato JSON |

El proxy de desarrollo dirige `/api` a la API local. No utilizar Vite de
desarrollo como servidor institucional. `pnpm db:down` detiene PostgreSQL y
conserva su volumen; `pnpm db:logs` consulta sus registros.

### Datos de demostración

Las migraciones crean roles, no cuentas ni reglas institucionales supuestas.
La carga opcional sintética se ejecuta solo en desarrollo:

```powershell
$env:ALLOW_DEMO_SEED = 'true'
try {
  pnpm db:seed:demo
} finally {
  Remove-Item Env:ALLOW_DEMO_SEED -ErrorAction SilentlyContinue
}
```

Los códigos DEMO y sus reglas no son evidencia institucional. La cuenta de
referencia del seed está inactiva y no se usa para ingresar. El seed no aprueba
criterios de evaluación. No ejecutar esa carga sobre la base del centro.

## 3. Preparación del despliegue en Coolify

Utilizar **`infra/compose.coolify.yaml`**, desde la revisión del repositorio que
se vaya a entregar. En el recurso Git de Coolify, seleccionar la estrategia
**Docker Compose**, Base Directory `/` y Docker Compose Location
`/infra/compose.coolify.yaml`. Mantener el modo normal; no seleccionar Raw.
Guardar y revisar la definición cargada. Es el procedimiento previsto por la
[documentación oficial de Compose en Coolify](https://coolify.io/docs/applications/builds/docker-compose).

Proporcionar POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, APP_DB_USER,
APP_DB_PASSWORD y WEB_ORIGINS en las variables del recurso. Base y propietario
tienen como valor inicial `excel`; el rol de API es `excel_app`. El ejemplo de
variables es `infra/.env.coolify.example`. `pnpm deploy:setup --coolify` prepara
una copia local privada de esas variables para revisar la configuración, no
publica el recurso. No incorporar el `.env` resultante al código.

La arquitectura mantiene web y API en un mismo origen HTTPS. El proxy de Coolify
termina TLS para el dominio configurado y envía el tráfico al servicio web; este
sirve React y dirige `/api` a NestJS por la red interna. La API y PostgreSQL no
necesitan puertos públicos. No asociar un dominio o publicación directa al servicio
de la base ni a la API. Esta separación utiliza las redes de contenedores que
describe [Coolify en su documentación de redes](https://coolify.io/docs/core/networking-in-coolify).

Definir `TRUSTED_PROXY_CIDRS` en el recurso con las IP/CIDR exclusivas del proxy
de Coolify, separadas por espacios, comprobadas en su red real. No usar rangos
privados completos ni `0.0.0.0/0`. El valor inicial solo confía en loopback y no
identifica por sí mismo a los clientes del proxy remoto. Caddy verifica la cadena
de derecha a izquierda y envía una dirección normalizada; la API confía en un
solo salto interno (`TRUST_PROXY_HOPS=1`), sin puerto público. Verificar antes de
recepción que la auditoría refleja la dirección del cliente y que una cabecera
inventada no permite evadir el límite de intentos de acceso. Referencias:
[Caddy](https://caddyserver.com/docs/caddyfile/options#trusted-proxies) y
[Express](https://expressjs.com/en/guide/behind-proxies/).

Las credenciales de **propietario/migrador** y **API** deben ser distintas:
POSTGRES_PASSWORD corresponde a la administración del esquema; APP_DB_PASSWORD
corresponde al rol de ejecución restringido. Esta última exige de 32 a 256
caracteres. `deploy:setup` genera contraseñas aleatorias diferentes. El servicio
normal `api` solo recibe APP_DB_USER/APP_DB_PASSWORD como conexión; no recibe la
contraseña propietaria. El servicio **ops**, del perfil explícito `ops`, utiliza
la conexión propietaria para migraciones, preparación del rol y bootstrap.

Asignar únicamente al servicio **web** el dominio con su puerto interno 8080:
por ejemplo reservado `https://academico.example.com:8080` en el campo Domains.
El visitante abre `https://academico.example.com` sin ese puerto; el sufijo solo
indica a Coolify el puerto interno de recepción. En WEB_ORIGINS utilizar
`https://academico.example.com`, **sin `:8080` ni barra final**. Sustituir ese
ejemplo por el dominio que el equipo haya configurado realmente.

Configurar el origen web exacto con esquema y, si corresponde, puerto. No añadir
una barra final ni una ruta. En producción, `WEB_ORIGINS` exige HTTPS. El navegador
usa cookie HttpOnly con Secure y protección CSRF; el dominio utilizado al ingresar
debe corresponder al origen configurado. Las variables `VITE_*` son públicas y no
deben contener secretos.

Antes del primer arranque operativo:

1. Confirmar dominio/DNS, HTTPS y la ruta del recurso en Coolify.
2. Definir credenciales propias y volumen persistente de PostgreSQL. No reutilizar
   contraseñas de ejemplo ni publicar la conexión de la base.
3. Construir las imágenes y esperar la salud de PostgreSQL.
4. Ejecutar una sola vez el servicio **ops** de esa versión y consultar su estado.
   Su operación predeterminada aplica migraciones y configura los permisos del
   rol de API. Las migraciones no se ejecutan al arrancar cada API.
5. Ejecutar el bootstrap del primer administrador sin guardar la contraseña en
   los registros de ejecución o en un comando con su valor literal.
6. Iniciar los servicios de aplicación, comprobar salud, acceso, cambio de
   contraseña y consulta por rol. Verificar una descarga BORRADOR sintética.
7. Configurar el respaldo diario y ensayar su restauración antes de cargar datos
   institucionales; conservar el resultado y la recepción del responsable.

El servicio ops ejecuta `node dist/database/runtime-role.js`: aplica migraciones
y prepara el rol de API sin permisos de DDL. No cambiar DB_USER/DB_PASSWORD del
servicio API para ejecutar operaciones administrativas. Tampoco ejecutar las
migraciones ni bootstrap desde la terminal de API con su conexión restringida.

En Coolify, el operador debe ejecutar el perfil `ops` como trabajo único sobre la
**definición generada de ese recurso**, con su proyecto, red privada y volumen
reales. No iniciar el Compose fuente como otro proyecto paralelo: podría crear
otra base y aparentar una migración exitosa en el destino equivocado. Registrar
en la entrega el mecanismo operativo y comando resueltos para la versión de
Coolify instalada. Los ejecutables internos de ops son:

```sh
node dist/database/runtime-role.js
node dist/database/migrate.js show
```

Para crear el primer administrador, suministrar BOOTSTRAP_ADMIN_USERNAME y
BOOTSTRAP_ADMIN_PASSWORD por el mecanismo privado del operador, ejecutar
`node dist/database/bootstrap-admin.js` en **ops** y retirar la contraseña temporal del
entorno después. No recompilar dentro de la imagen de ejecución ni ejecutar seed.
No conservar esa contraseña como una variable permanente de la aplicación.

La configuración declarada no publica puertos del host y mantiene PostgreSQL y
API en la red privada. Tras cargarla, revisar también la definición que Coolify
va a desplegar y las redes reales: los cambios del panel no deben conectar esos
dos servicios directamente al proxy público. El dominio concreto y la versión
de Coolify instalada quedan sujetos a la verificación del operador.

Los nombres concretos de servicios, perfiles y comandos son los del apartado de
despliegue en [B21](../B21-despliegue-respaldo.md). El Compose local y sus alias
pnpm sirven para repetir la instalación fuera de Coolify; no se debe ejecutar
una segunda publicación de puertos 80/443 que compita con su proxy.

### Demostración local con HTTPS

El despliegue local aislado utiliza `infra/compose.deploy.yaml` y
`infra/.env.deploy`, distintos de los entornos de desarrollo. Publica únicamente
la web en `https://localhost:8443` por defecto. El certificado local procede de
una autoridad interna; no es el certificado del dominio del VPS.

```sh
pnpm deploy:setup
pnpm deploy:config
pnpm deploy:build
pnpm deploy:db
pnpm deploy:migrate
pnpm deploy:status
```

Después de proporcionar BOOTSTRAP_ADMIN_USERNAME y BOOTSTRAP_ADMIN_PASSWORD de
forma privada como en el ejemplo anterior, utilizar `pnpm deploy:admin` y limpiar
ambas variables. Continuar con:

```sh
pnpm deploy:up
```

Verificar la huella de la autoridad interna antes de confiar en ella en el equipo
de demostración. No desactivar la validación TLS para una operación institucional.
`pnpm deploy:down` detiene el entorno sin eliminar su volumen. Las comprobaciones
realmente ejecutadas sobre estas imágenes se registran en B21.

Después de que web haya generado la autoridad local, se puede extraer únicamente
el certificado público para revisar su huella o usarlo en una prueba local:

```sh
pnpm exec docker compose --env-file infra/.env.deploy -f infra/compose.deploy.yaml cp web:/data/caddy/pki/authorities/local/root.crt .tmp/b21/ca-local.crt
```

Crear previamente la carpeta `.tmp/b21` si aún no existe. No extraer ni compartir
la clave privada de esa autoridad. Las pruebas que omitan la confianza del
certificado local deben registrarlo como limitación; no acreditan el TLS del VPS.

## 4. Respaldo operativo

Los scripts B21 utilizan PostgreSQL 18 y un volcado lógico en formato personalizado.
La copia representa un snapshot consistente. Su manifiesto identifica archivo,
fecha, resultado, checksum, migraciones y comprobaciones de integridad sin listar
datos personales del intento. La evidencia de la ejecución se registra aparte
del archivo físico; conservar ambas partes.

El operador utiliza una copia del repositorio con dependencias instaladas y acceso
autorizado al motor Docker/red privada de la base. El CLI carga `apps/api/.env`
si existe y respeta variables ya presentes en el proceso. La conexión `DB_*`
apunta al entorno que se pretende respaldar, no necesariamente al entorno local.
Revisarla antes de ejecutar: los metadatos se consultan desde Node y el volcado
desde un cliente temporal de PostgreSQL.

En el host Linux del VPS, DB_HOST debe ser una dirección privada alcanzable por
el operador, por ejemplo la IP interna comprobada del contenedor PostgreSQL;
esa dirección puede cambiar al recrearlo. Para el cliente temporal, indicar
BACKUP_DOCKER_NETWORK y BACKUP_DOCKER_DB_HOST con la red y alias internos reales
de Coolify. Ambos destinos deben referir la misma base; no basta con cambiar solo
una de las conexiones. No exponer PostgreSQL a Internet para facilitar este paso.

| Variable | Uso |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión operativa autorizada a la base de origen; usar propietario/rol de respaldo autorizado, no las credenciales restringidas de API |
| `DB_SSL` | `false` para esta conexión local/red privada confiable; el CLI rechaza TLS remoto, que exige configuración de certificados acordada |
| `BACKUP_DIR` | Ruta absoluta de copias fuera del repositorio, con acceso limitado; no se admiten enlaces que terminen dentro del repositorio |
| `BACKUP_ADMIN_ID` y `BACKUP_ADMIN_PASSWORD` | Identidad de un administrador activo y su contraseña, verificadas para atribuir la operación |
| `BACKUP_SERVICE_ID` | Identificador explícito de un proceso de servicio operado con acceso autorizado a la base; no suplanta a un administrador |
| `BACKUP_DOCKER_NETWORK` | Red privada a la que se conecta el cliente temporal de PostgreSQL, si se necesita |
| `BACKUP_DOCKER_DB_HOST` y `BACKUP_DOCKER_DB_PORT` | Destino interno visto desde ese cliente temporal, cuando difiere de la conexión del operador |

Seleccionar **una** forma de identidad: administrador o proceso de servicio.
La cuenta de administrador debe estar activa y haber cambiado su contraseña
temporal. La identidad de aplicación no sustituye la credencial operativa de
conexión a PostgreSQL. Mantener disponible la imagen `postgres:18` en Docker antes
de ejecutar; el cliente y el contenedor de verificación utilizan esa versión.
No colocar contraseñas literales en ejemplos, historial de terminal o parámetros
de una tarea programada. El entorno del proceso debe recibir los secretos por el
medio seguro acordado. Con la configuración ya suministrada:

```sh
pnpm db:backup
```

La salida JSON de éxito contiene id, nombre de archivo, huella, tamaño y
`restauracionVerificada: false`. Comprobar el resultado, la fecha, el archivo y
su ubicación lógica. Un archivo
existente no basta para declarar éxito si la ejecución terminó con error. No
editar manualmente el manifiesto ni los eventos para volver «válida» una copia.
Los dumps pueden contener datos personales y credenciales de la aplicación;
restringir permisos, cifrar su custodia externa y excluirlos de Git y del TAP.
El formato personalizado está comprimido, **no cifrado**. La copia cifrada externa
y sus claves requieren el mecanismo y responsable acordados por el equipo; no
se declaran resueltos por usar `pg_dump`.

### Frecuencia, custodia y retención

Durante periodos activos, ejecutar **al menos un respaldo diario** y otro antes de
migraciones sobre datos institucionales. B21 prepara el mecanismo; no instala una
tarea recurrente sobre el VPS ni atribuye un responsable sin designación del equipo.
El operador debe registrar horario en America/Lima, identidad del proceso, lugar
de la copia externa, aviso de fallos y prueba de restauración.

La propuesta del diseño de 7 copias diarias, 4 semanales y 6 mensuales no es una
política aprobada. Acordar la retención antes de automatizar eliminaciones. Una
copia en el mismo VPS no cubre la pérdida de ese servidor. Conservar al menos la
copia verificada necesaria para la recuperación acordada y comprobar el acceso
a la ubicación externa.

`pnpm db:backup:retention`, con BACKUP_RETENTION_DAYS explícito, presenta candidatos
de retención en JSON; **no borra archivos** ni establece una política por defecto.
Un respaldo que ofrezca Coolify puede complementar esta operación, pero no aparece
como verificado por la aplicación hasta que se haya integrado y ensayado su
recuperación mediante el procedimiento aceptado.

## 5. Ensayo controlado de restauración

El comando B21 **verifica una copia en un contenedor nuevo y aislado**. No admite
como destino la base de desarrollo, la del VPS ni otra base existente. Exige una
copia generada con éxito, registrada y con checksum/manifiesto consistentes.

Mantener la misma configuración privada de conexión, identidad y BACKUP_DIR.
Seleccionar en BACKUP_FILE únicamente el nombre de archivo producido por el
respaldo, sin ruta. Leer la consecuencia y proporcionar la confirmación literal:

```powershell
$env:BACKUP_FILE = Read-Host 'Nombre del archivo de respaldo registrado'
$env:RESTORE_CONFIRM = 'VERIFICAR_EN_CONTENEDOR_NUEVO'
try {
  pnpm db:restore:verify
} finally {
  Remove-Item Env:RESTORE_CONFIRM -ErrorAction SilentlyContinue
  Remove-Item Env:BACKUP_FILE -ErrorAction SilentlyContinue
}
```

La verificación crea un contenedor con nombre aleatorio, sin red, puertos ni
volúmenes persistentes; restaura el archivo y contrasta esquema, conteos y la
integridad del intento académico. El contenedor creado para el ensayo se retira
al finalizar. Si el proceso se interrumpe de forma excepcional, revisar únicamente
el recurso identificado por esa ejecución; no borrar otros contenedores o
volúmenes para «limpiar» el entorno.

El verificador de demostración limita el contenedor a 1 GiB de memoria y tmpfs de
768 MiB. Una copia que supere su capacidad puede fallar sin alterar la base de
origen. Dimensionar y aprobar otro entorno de recuperación antes de usarlo con
un volumen institucional mayor; no afirmar que cualquier tamaño está cubierto.

Conservar el resultado y la fecha del ensayo. Una copia cuya restauración no se
ejecutó permanece **sin recuperación verificada**. Una huella que no coincide,
manifiesto inválido, fallo de restauración o diferencia de datos es una incidencia:
no declarar recuperable ese archivo ni sobreescribir su evidencia.

Este ensayo no implementa una restauración institucional destructiva ni una
pantalla RF57. Para recuperar una base real se necesitan responsable autorizado,
respaldo previo del estado actual, ventana de mantenimiento, destino verificado,
confirmación y un procedimiento aceptado por el equipo. B21 no ejecuta esa
operación sobre el VPS por disponer de acceso al código.

### Consulta desde la aplicación

Administración puede abrir **Respaldos** (`#/respaldos`) para consultar la última
copia exitosa, la última verificación de un intento completo y el historial. Los
filtros distinguen respaldo/restauración e iniciado/exitoso/fallido. La lectura
también exige ADMIN en `/api/v1/control/respaldos`; no basta con ocultar el menú.
La pantalla no ejecuta una restauración ni publica el contenido del dump.

Una operación INICIADO sin final puede indicar interrupción; revisar la ejecución
con su responsable. No se debe convertir manualmente en exitosa. Que una copia
haya terminado no demuestra que ya se haya restaurado: consultar la evidencia
específica de verificación y el intento contrastado.

## 6. Actualización y recuperación ante incidencias

Antes de actualizar una base con datos, registrar la revisión de código, estado
de migraciones y respaldo verificado. Acordar la ventana de mantenimiento. Publicar
la nueva revisión de imágenes, ejecutar el trabajo de migraciones una sola vez,
comprobar su estado y salud y realizar las consultas de aceptación acordadas.

En la primera adopción de B21 sobre una base B01–B20, la tabla de operaciones
todavía no existe: el CLI B21 no sustituye el respaldo previo a esa migración.
El operador debe obtener y ensayar primero una copia mediante su procedimiento
PostgreSQL/plataforma ya autorizado, en un destino aislado, y custodiar su
evidencia externa. Aplicar después B21 y verificar una nueva copia con sus
herramientas. No inventar registros de éxito ni omitir la copia previa para
introducir la tabla de respaldos. En una instalación nueva sin datos, la suite
automática comprueba la aplicación de todas las migraciones desde cero.

`pnpm db:revert` solo afecta a la última migración y rechaza producción. Las
migraciones con evidencia no se revierten borrando datos: pueden rechazar la
reversión para conservar intentos, cierres, resultados y auditoría. No ejecutar
`down -v`, eliminar volúmenes ni modificar datos reales para forzar un despliegue.
Una migración fallida exige revisar su resultado antes de repetirla. La recuperación
del servicio y del esquema debe respetar la compatibilidad entre código y datos.

Si la aplicación no inicia, revisar salud de PostgreSQL, variables del entorno,
migraciones y registros del servicio afectado. Si el acceso devuelve error de
origen/CSRF, verificar el dominio HTTPS utilizado y WEB_ORIGINS; no desactivar
las protecciones para resolverlo. Si un XLSX falla, comprobar que las cuatro
plantillas y su registro acompañan a la API y que el archivo sigue siendo BORRADOR.

| Comprobación periódica | Registro esperado |
| --- | --- |
| Salud de web, API y base | Fecha, resultado e incidencia si existe |
| Capacidad de disco y volumen persistente | Espacio disponible y acción acordada antes de agotarlo |
| Respaldo diario y copia externa | Ejecución, resultado, ubicación lógica y aviso de fallo |
| Restauración ensayada | Copia, fecha, entorno seguro y resultado contrastado |
| Certificado y dominio de Coolify | Renovación y acceso HTTPS verificados |
| Cambios de cuentas y permisos | Responsable, motivo y evidencia persistida |

El horario de mantenimiento, responsable, canal de incidencias, monitoreo,
retención, cifrado y recuperación institucional deben quedar designados antes de
la recepción del entorno real. El ensayo sintético local no los sustituye.

## 7. Verificación y entrega

```sh
pnpm check
pnpm --filter api exec playwright install chromium
pnpm test:db
```

La suite de base utiliza PostgreSQL temporal, distinto de los volúmenes de
desarrollo y despliegue. Los comandos específicos y resultados B21 se documentan
en [B21](../B21-despliegue-respaldo.md). Los informes se conservan en `.tmp/`, sin
versionar datos privados. No se afirma una ejecución remota de CI ni publicación
en Coolify por haber superado las comprobaciones locales.

El [índice de entrega](../evidencias/B21/indice-entrega.md) relaciona manuales,
evidencias y pendientes. Otra persona del equipo debe repetir la instalación y
registrar la recepción. No presentar como completos el piloto humano B20,
la aprobación de criterios y plantillas o todos los 57 requisitos.
