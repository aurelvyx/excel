# Sistema de Gestión Académica — Centro de Idiomas Excel (Cusco)

Plataforma web integral para la gestión académica, matrículas, control de comprobantes (vouchers), asistencia por sesión, justificaciones, matriz curricular modular, calificaciones, cierre de actas y exportación de formatos oficiales en Excel (`.xlsx`).

Construido como monorepositorio con **pnpm**, **NestJS (TypeScript)**, **React + Vite (TypeScript)** y **PostgreSQL**.

---

## Módulos Principales

- **Seguridad, Usuarios y Roles:** autenticación con sesiones persistidas, control de acceso basado en roles (`ADMIN`, `SECRETARIA`, `DOCENTE`, `COORDINADOR`), protección CSRF y bitácora de auditoría inmutable.
- **Catálogo Curricular y Oferta Académica:** gestión de programas de idiomas, niveles con cadena de prerrequisitos, unidades didácticas (créditos y horas teóricas/prácticas), periodos académicos, turnos, secciones, grupos (salones) y asignación de plana docente.
- **Padrón de Estudiantes y Vouchers:** registro de estudiantes con historial académico por intento y bandeja clasificada de comprobantes de pago (`Por Revisar`, `Disponibles sin Vincular`, `Vinculados a Matrícula`, `Validados` y `Rechazados`).
- **Matrículas:** asistente paso a paso con validación automática de prerrequisitos, control de vacantes, vinculación de vouchers y activación transaccional.
- **Asistencia y Justificaciones:** programación y creación de sesiones de clase por día desde el calendario mensual o desde el Salón 360°, toma de asistencia (`P`, `T`, `F`, `J`), cálculo automático de condición por límite de inasistencia (**DPI 30 %**), flujo de justificaciones y cierre oficial de asistencia.
- **Matriz Curricular, Calificaciones y Actas:** definición de planes de evaluación ponderados por nivel (4 Unidades Didácticas + EFSRT), registro matricial de notas para administración y Portal Docente, emisión de Actas Oficiales de Evaluación y exportación en `.xlsx` (**Acta Oficial UGEL**, **Matriz de Notas** y **Resumen de Participantes**).

---

## Requisitos Previos

- **Node.js** >= 24
- **pnpm** 11.19.0
- **Docker** con Docker Compose v2 (o instancia local de PostgreSQL 16+)

---

## Instalación y Puesta en Marcha

Desde la carpeta raíz del repositorio (`excel/`):

```sh
pnpm install --frozen-lockfile
pnpm env:setup
pnpm db:up
pnpm db:migrate
pnpm db:status
```

- `pnpm env:setup` genera los archivos locales `infra/.env`, `apps/api/.env` y `apps/web/.env` a partir de las plantillas `.env.example` (los archivos `.env` están excluidos de Git).
- `pnpm db:up` levanta el contenedor de PostgreSQL y espera a que esté saludable.
- `pnpm db:migrate` aplica las 16 migraciones del esquema de base de datos.

Para iniciar el entorno de desarrollo en dos terminales:

```sh
pnpm dev:api
pnpm dev:web
```

- **Aplicación Web:** http://127.0.0.1:5173
- **Salud de la API:** http://127.0.0.1:3000/api/v1/health
- **Documentación Swagger:** http://127.0.0.1:3000/api/docs

---

## Carga Masiva de Datos Realistas (Seeder)

Una vez aplicadas las migraciones (`pnpm db:migrate`), puedes poblar las **30 tablas de negocio** con un conjunto amplio y realista de datos ejecutando desde la raíz:

```sh
pnpm db:seed:realistic
```

*(También están disponibles los alias equivalentes `pnpm db:seed:demo`, `pnpm db:seed:academic-demo` y `pnpm db:seed:attendance-grades-demo`, que ejecutan el mismo seeder maestro `apps/api/src/database/seed-realistic.ts`).*

### ¿Qué realiza el seeder?
1. **Compila la API** (`pnpm --filter api build`) y ejecuta `dist/database/seed-realistic.js`.
2. **Conserva la sesión activa de `admin`:** preserva el hash de contraseña y las sesiones activas del usuario `admin` para evitar cerrar tu sesión en el navegador.
3. **Limpia datos previos de forma segura:** vacía las tablas de negocio reiniciando secuencias (`RESTART IDENTITY CASCADE`) y reactiva todos los triggers de integridad de PostgreSQL antes de insertar los nuevos registros.
4. **Inserta datos realistas en las 30 tablas de negocio:**
   - **Personal y Estudiantes:** 4 `roles`, 314 `personas`, 14 `usuarios`, 16 `usuario_roles`, 46+ `sesiones_usuario`, **9 `docentes`** (8 activos + 1 inactivo) y **300 `estudiantes`**.
   - **Oferta Académica y Matriz Curricular:** 2 versiones de `parametros_academicos`, 4 `idiomas` (`ING`, `POR`, `QUE`, `FRA`), 10 `niveles`, **40 `unidades_didacticas`** (4 UDs por nivel), 3 `periodos_academicos` (`2025-II` cerrado, `2026-I` abierto y `2026-II` planificado), 5 `turnos`, 4 `secciones`, **18 `grupos`** y 22 asignaciones en `grupo_docentes`.
   - **Vouchers y Matrículas:** **391 `vouchers`** (validados vinculados, validados disponibles sin vincular, pendientes por revisar y rechazados) y **351 `matriculas`** (`CERRADA`, `ACTIVA`, `PENDIENTE` y `ANULADA`).
   - **Asistencia, Evaluación y Cierres:** **199 `sesiones_clase`**, **3,432 `asistencias`**, **90 `justificaciones`**, **14 `planes_evaluacion`**, 15 `configuraciones_evaluacion_grupo`, 75 `evaluaciones`, 225 `indicadores_evaluacion`, **4,350 `calificaciones`**, **16 `cierres_academicos`**, **144 `resultados_academicos`**, **18 `exportaciones`** y **258 `auditoria_eventos`**.

### Credenciales de Prueba

| Rol | Usuarios disponibles | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin`, `soporte_ti` | `Admin123!` *(o tu clave actual de `admin`)* |
| **Docente (Portal Docente)** | `doc_carlos`, `doc_elena`, `doc_roberto`, `doc_valeria`, `doc_jorge`, `doc_patricia`, `doc_miguel`, `doc_claudia` | `Docente123!` |
| **Secretaría** | `sec_lucia`, `sec_carmen` | `Secretaria123!` |
| **Coordinación** | `coord_marco` | `Coord123!` |

### Escenarios Listos para Probar en el Ciclo Activo (`2026-I`)
- **Cerrar Asistencia en 1 clic:** grupos `G-2026I-ING-I1-A` y `G-2026I-QUE-B1-A`.
- **Emitir Acta Oficial en 1 clic:** grupos `G-2026I-ING-B2-A` y `G-2026I-POR-B2-A`.
- **Exportar Acta Oficial UGEL / Matriz XLSX:** grupos `G-2026I-ING-B1-INT` y `G-2026I-POR-B1-INT` (además de los 5 grupos cerrados de `2025-II`).
- **Operación diaria de Docente y Secretaría:** grupos `G-2026I-ING-I2-A`, `G-2026I-ING-AV-A`, `G-2026I-POR-IN-A` y `G-2026I-FRA-B1-A`.

---

## Comandos Útiles

| Comando | Descripción |
| :--- | :--- |
| `pnpm dev:api` | Inicia el servidor NestJS en modo desarrollo (`watch`) |
| `pnpm dev:web` | Inicia el cliente React + Vite en modo desarrollo |
| `pnpm db:migrate` | Ejecuta las migraciones pendientes en PostgreSQL |
| `pnpm db:status` | Muestra el estado de las migraciones |
| `pnpm db:seed:realistic` | Limpia e inserta la carga masiva realista en toda la base de datos |
| `pnpm typecheck` | Verifica tipos TypeScript en `apps/api` y `apps/web` |
| `pnpm lint` | Ejecuta el linter en todo el monorepositorio |
| `pnpm build` | Compila producción para API y Web |
| `pnpm check` | Ejecuta lint, typecheck, build y suites de verificación |

---

## Estructura del Proyecto

```text
apps/
  api/src/
    database/           Configuración TypeORM, migraciones y seeder realista
    health/             Endpoint de salud técnica
    modules/            Auth, usuarios, control, oferta, personas, matrículas, asistencia, evaluación y reportes
    common/             Filtros y validaciones compartidas
  web/src/
    app/                Enrutador, barra lateral, control de acceso por rol y vistas principales
    features/           Módulos de gestión académica, matriz curricular, matrículas, vouchers, asistencia, notas, actas y reportes
    shared/             Cliente HTTP, paginación y componentes reutilizables
infra/
  compose.yaml          Definición de contenedor PostgreSQL de desarrollo
  scripts/              Scripts de configuración de entorno y verificación
```
