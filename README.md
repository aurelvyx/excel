# Centro de Idiomas Excel

Monorepositorio con pnpm: API NestJS, web React con TypeScript y PostgreSQL.
Organización basada en `docs/Arquitectura_del_Sistema.docx`.

## Alcance actual

- **B01:** configuración de entornos, Compose de desarrollo y pruebas, API con salud
  técnica y OpenAPI, proxy web y workflow de verificación automática.
- **B02:** tres migraciones TypeORM para las 15 tablas de identidad y oferta académica,
  claves, índices y restricciones; cuatro roles iniciales y carga sintética opcional.
- **B03:** acceso y cierre de sesión, gestión administrativa de usuarios y roles,
  cambio de contraseña propia, protección CSRF y auditoría básica inmutable.
- **B04:** API de idiomas, niveles, unidades, periodos, turnos, secciones y grupos;
  gestión de docentes y asignaciones, permisos por grupo y auditoría transaccional.
- **B05:** interfaz React de acceso, contraseña, menú por rol y configuración de
  oferta, docentes y cuentas, conectada a la API y verificada con navegador.
- **B06:** registro, búsqueda y actualización de estudiantes, auditoría e historial
  persistido separado por intento, nivel y periodo; interfaz y permisos por rol.
- **B07:** registro y decisión de vouchers para administración y secretaría, con
  importes exactos, bloqueo de duplicados y auditoría transaccional.
- **B08:** API de solicitud y activación transaccional de matrícula, prerrequisitos,
  vacantes, intentos, código basado en documento y conservación del historial.
- **B09:** asistente de matrícula con búsqueda/alta de estudiante, voucher, grupo y
  confirmación; recuperación de solicitudes pendientes y reintentos sin duplicados.
- **B10:** verificación ampliada de matrícula, informe automático, diez casos
  sintéticos, instrumento de medición y registro de plantillas con mapas comunes.
  Los tiempos observados y la aprobación institucional de los formatos siguen pendientes.
- **B11:** programación de fechas de clase por grupo, horario opcional y confirmación;
  permisos docentes, rango del periodo, duplicados y auditoría en API, BD e interfaz.
- **B12:** matriz de asistencia P/F/T/J por sesión, registro masivo y correcciones
  con versiones, conservación de intentos, permisos y auditoría transaccional.
- **B13:** cálculo por intento de tardanzas, faltas computables y porcentaje exacto,
  condición por límite del 30 %, resúmenes compartidos en matriz e historial y
  distinción de marcas pendientes y justificaciones provisionales.
- Justificaciones, cierres, notas y reportes se
  desarrollan en historias posteriores.

Consulta [decisiones y límites](docs/decisiones/ADR-001-base-tecnica.md) y
[trazabilidad y verificación](docs/verificacion-B01-B02.md).
Para crear el primer administrador y utilizar los endpoints de acceso, consulta
[B03: acceso y usuarios](docs/B03-acceso-y-usuarios.md).
Para la configuración académica, consulta [B04: oferta y docentes](docs/B04-oferta-y-docentes.md).
Para utilizar las pantallas, consulta [B05: interfaz y configuración](docs/B05-interfaz-y-configuracion.md).
Para iniciar el sprint 2, consulta [B06: estudiantes e historial](docs/B06-estudiantes-historial.md).
Para los comprobantes de pago, consulta [B07: vouchers](docs/B07-vouchers.md).
Para la activación de matrícula, consulta [B08: matrículas](docs/B08-matriculas.md).
Para utilizar el asistente, consulta [B09: matrícula por pasos](docs/B09-asistente-matricula.md).
Para las evidencias del sprint 2, consulta [B10: pruebas, medición y plantillas](docs/B10-verificacion-matricula.md).
Para iniciar el sprint 3, consulta [B11: sesiones de clase](docs/B11-sesiones-clase.md).
Para registrar las marcas, consulta [B12: asistencia por sesión](docs/B12-registro-asistencia.md).
Para consultar los cálculos, consulta [B13: faltas e inasistencia](docs/B13-calculo-asistencia.md).

## Instalación desde cero

Requisitos: Git, Node.js 24, pnpm 11.19.0 y Docker con Compose v2 en ejecución
(contenedores Linux, tanto en Windows como en Linux). Usa la carpeta raíz del repositorio.

```sh
pnpm install --frozen-lockfile
pnpm env:setup
pnpm db:up
pnpm db:migrate
pnpm db:status
```

`pnpm env:setup` crea `infra/.env`, `apps/api/.env` y `apps/web/.env` desde los ejemplos.
Genera una contraseña aleatoria local y la comparte entre Compose y la API.
No reemplaza archivos existentes ni imprime secretos. Si ya existe `infra/.env`,
debe tener POSTGRES_PASSWORD; si cambias usuario, puerto o contraseña después,
actualiza también `apps/api/.env`. Los archivos `.env` no se versionan.

`pnpm db:up` espera a que PostgreSQL esté saludable antes de terminar.
Los cambios de POSTGRES_PASSWORD no
modifican automáticamente la contraseña de una base ya inicializada en el volumen.

En dos terminales separadas:

```sh
pnpm dev:api
pnpm dev:web
```

- Web: http://127.0.0.1:5173 (acceso y configuración por rol).
- Salud API: http://127.0.0.1:3000/api/v1/health.
- Swagger: http://127.0.0.1:3000/api/docs.
- OpenAPI JSON: http://127.0.0.1:3000/api/openapi.json.
- PostgreSQL: 127.0.0.1:5432 por defecto, base y usuario `excel`.

La API escucha solo en localhost para esta demostración. El proxy de Vite dirige
`/api` a la API local; API_PROXY_TARGET se ajusta en `apps/web/.env` si cambia el puerto.
El esquema se modifica únicamente mediante migraciones; arrancar la API no crea tablas.

## Migraciones y datos de prueba

```sh
pnpm db:migrate
pnpm db:status
pnpm db:revert
```

`db:revert` revierte **solo la última migración**. Rechaza producción; las migraciones
estructurales rechazan tablas con datos y los roles no se retiran si están asignados.
La reversión completa sobre una base vacía se verifica automáticamente en `test:db`.
Antes de migrar una base institucional, respaldar y acordar el procedimiento de recuperación.

Las migraciones solo crean los roles ADMIN, SECRETARIA, DOCENTE y COORDINADOR.
No crean credenciales de acceso ni catálogos institucionales supuestos.
Para cargar ejemplos sintéticos en desarrollo, en PowerShell:

```powershell
$env:ALLOW_DEMO_SEED = 'true'
pnpm db:seed:demo
Remove-Item Env:ALLOW_DEMO_SEED
```

En Linux/macOS: `ALLOW_DEMO_SEED=true pnpm db:seed:demo`.
La carga es transaccional e idempotente. Crea idiomas, niveles, unidades, un periodo,
turno, sección, docente, dos grupos y una versión de reglas 13/30/3 para demostración.
Todos los códigos son DEMO; la cuenta de referencia está deshabilitada y su contraseña
aleatoria no se conserva. No es una cuenta para iniciar sesión. No se fijan pesos de evaluación.

## Verificación automática

```sh
pnpm check
pnpm --filter api exec playwright install chromium
pnpm test:db
```

`check` ejecuta lint, tipos, compilación, pruebas unitarias, contrato HTTP y configuración
local. `test:db` crea un PostgreSQL temporal con puerto y contraseña aleatorios, migra,
revierte, reaplica y prueba restricciones, rollback, carga sintética y la API con conexión
real. Limpia su contenedor y red al terminar. No usa `infra/.env` ni el volumen local.
Incluye recorridos React–API–PostgreSQL de configuración, matrícula, sesiones y asistencia con Chromium. En Linux/CI, instalar
Chromium con `pnpm --filter api exec playwright install --with-deps chromium`.

`pnpm test:b10` ejecuta las suites de estudiantes, vouchers y matrícula en otra
base temporal. Guarda el informe JSON en `.tmp/b10/pruebas.json`; la suite completa
usa `.tmp/verificacion/pruebas.json`. Los tiempos del runner son evidencia técnica.
El procedimiento para observar los tiempos del centro está en la documentación B10.

`pnpm b10:plantillas [carpeta]` comprueba las versiones de los cuatro archivos
facilitados por el equipo contra `docs/plantillas/registro.json`. La carpeta por
defecto es `.tmp/b10`; los archivos originales permanecen sin versionarse.
`pnpm b10:mediciones <archivo.json>` resume las observaciones registradas con la
plantilla de `docs/evidencias/B10/`. No genera cifras cuando faltan mediciones.

El workflow `.github/workflows/ci.yml` ejecuta ambas verificaciones en push y pull request.
Su ejecución remota requiere publicar el repositorio en GitHub; los resultados locales
no se presentan como una ejecución ya realizada en GitHub Actions.

## Estructura

```text
apps/api/src/
  database/             Configuración, migraciones y carga sintética
  health/               Estado técnico de la API y PostgreSQL
  modules/              Auth, usuarios, control, oferta, personas, matrículas y asistencia
  common/               Filtro de errores e infraestructura compartida
apps/web/src/
  features/             Acceso, configuración, estudiantes, vouchers, matrícula y asistencia
  shared/               Cliente API, navegación y diálogos
packages/contracts/     Reservado para contratos compartidos
infra/
  compose.yaml          PostgreSQL persistente de desarrollo
  compose.test.yaml     PostgreSQL temporal de verificación
  scripts/              Preparación de entornos y pruebas aisladas
  proxy/                Reservado para despliegue posterior
  scripts/respaldo/     Reservado para B21
```

Para detener la base: `pnpm db:down`; conserva el volumen. Para consultar logs:
`pnpm db:logs`. Para validar Compose: `pnpm db:config`.
La infraestructura de producción, respaldos y restauración siguen en B21.
