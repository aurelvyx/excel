# Centro de Idiomas Excel

Estructura inicial basada en `docs/Arquitectura_del_Sistema.docx`, sección 11.
Preparación parcial de B01 (RNF12–13): proyectos base y PostgreSQL para desarrollo.
Las aplicaciones conservan el contenido de sus generadores oficiales. Las carpetas
reservadas contienen únicamente `.gitkeep`; todavía no hay funciones académicas,
conexión a PostgreSQL, entidades ni migraciones.

```text
apps/
  api/                   NestJS + TypeScript
    src/modules/         auth, usuarios, oferta-academica, personas,
                         matriculas, asistencia, evaluacion, reportes, control
    src/common/          guards, filtros, interceptores, validacion
    src/database/        configuracion, migraciones
  web/                   React + TypeScript (Vite)
    src/features/        auth, estudiantes, matriculas, asistencia, notas, reportes
    src/shared/          componentes, cliente-api, utilidades
packages/contracts/      Reservado para contratos estables compartidos
infra/                   Compose de PostgreSQL; proxy y scripts de respaldo reservados
docs/                    Documentación de diseño; decisiones y OpenAPI reservados
```

## Desarrollo

Requisitos: Node.js 24 o superior, pnpm 11.19.0 y Docker con Compose.
Ejecutar desde la raíz:

```sh
pnpm install
pnpm dev:api
```

En otra terminal:

```sh
pnpm dev:web
```

NestJS usa inicialmente `http://localhost:3000` y Vite `http://localhost:5173`.
Se conserva la ruta de ejemplo `/`; `/api/v1` se configurará al implementar la API.

## PostgreSQL en Docker

Copiar `infra/.env.example` a `infra/.env` y definir `POSTGRES_PASSWORD`.
En PowerShell:

```powershell
Copy-Item infra/.env.example infra/.env
```

Luego de editar la contraseña:

```sh
pnpm db:config
pnpm db:up
pnpm db:logs
pnpm db:down
```

PostgreSQL 18 está disponible en `127.0.0.1:5432`, con base y usuario `excel`
por defecto. Las variables están en `infra/.env`, excluido del control de versiones.
El volumen persiste al ejecutar `pnpm db:down`. La API aún no utiliza esta base.
Compose es una elección local solicitada para esta preparación; no define el
despliegue institucional. No se han creado tablas ni datos iniciales.

## Verificación

```sh
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

Las pruebas incluidas son las de la plantilla NestJS; no verifican requisitos
académicos. B01 sigue pendiente de automatización y revisión del equipo.

Referencias de los generadores: [NestJS CLI](https://docs.nestjs.com/cli/usages),
[Vite](https://vite.dev/guide/) e [imagen PostgreSQL](https://hub.docker.com/_/postgres).
