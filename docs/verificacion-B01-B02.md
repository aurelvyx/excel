# Verificación de B01 y B02

Fecha: 24 de septiembre de 2026. Estado: implementación y verificación local
realizadas; pendiente revisión de otro integrante y aceptación de la demostración.

## Cobertura

| Historia | Referencias | Resultado implementado | Archivos principales |
| --- | --- | --- | --- |
| B01 | RNF12–13; soporte técnico para RF01 | Workspace pnpm, entornos reproducibles, Compose, scripts, CI, salud y OpenAPI | package.json, infra/, .github/workflows/ci.yml, apps/api/src/configure-app.ts, apps/api/src/health/, apps/web/vite.config.ts |
| B02 | RF06–13, RNF05 | Esquema PostgreSQL de identidad y oferta académica, restricciones, índices, migraciones transaccionales, roles y carga sintética opcional | apps/api/src/database/, apps/api/test/database.integration-spec.ts |

### Tablas

Identidad: personas, estudiantes, docentes, usuarios, roles y usuario_roles.
Oferta: idiomas, niveles, unidades_didacticas, periodos_academicos, turnos,
secciones, grupos, grupo_docentes y parametros_academicos.
TypeORM mantiene adicionalmente la tabla migraciones.

### Restricciones verificadas

Identidad y códigos únicos; referencias obligatorias; nivel y prerrequisito del
mismo idioma y orden anterior; horas y créditos no negativos; intervalos válidos;
estado y capacidad de grupo; código de grupo único por periodo; asignación docente
única; rechazo de reactivación para docente inactivo; parámetros versionados e
inmutables; conservación de referencias al inactivar y rechazo de borrado referenciado.

Se verifican también la carga sintética idempotente, rollback de una carga fallida,
cuenta sintética deshabilitada con hash Argon2id, bloqueo del seed en producción,
rollback de una transacción y de una ejecución fallida de migraciones, reversión
completa sobre base vacía y protección de reversión cuando ya existen datos.

## Ejecuciones locales

Entorno de ejecución: Windows, Node.js 24, pnpm 11.19.0, Docker y PostgreSQL 18.
Las pruebas de base se ejecutaron en un contenedor Linux temporal con tmpfs,
credencial aleatoria y puerto efímero. El contenedor y su red se retiraron al finalizar.

| Comando / comprobación | Resultado |
| --- | --- |
| pnpm install --frozen-lockfile | Correcto; lockfile coherente |
| pnpm lint | Correcto en API y web |
| pnpm typecheck | Correcto en API, pruebas y web |
| pnpm build | API y web compiladas |
| pnpm test | 12 pruebas de configuración correctas |
| pnpm test:e2e | 3 pruebas del contrato HTTP correctas; conexión simulada |
| pnpm test:tools | 3 pruebas correctas de entornos nuevos, preservación e idempotencia |
| pnpm test:db | 32 pruebas correctas sobre PostgreSQL real, incluida API con conexión real |
| docker compose config --quiet | Correcto para desarrollo y pruebas con credenciales sintéticas |
| git diff --check | Sin errores de espacios |

Total: 50 pruebas correctas. `pnpm check` agrupa las verificaciones del workspace;
`pnpm test:db` ejecuta la integración aislada. El código de error de PostgreSQL 18
para los borrados impedidos por RESTRICT es 23001; las pruebas comprueban ese rechazo
sin relajar las restricciones del modelo.

## Límites y pendientes

- El workflow de GitHub Actions está creado, pero no se ha ejecutado remotamente.
  No se ha verificado una instalación manual en un segundo equipo ni el despliegue institucional.
- No se ha alterado ni migrado la base persistente del usuario. Los comandos de
  instalación, migración y arranque para esa base están en el README.
- B03–B04 completarán autenticación, permisos, auditoría, entidades/repositorios
  de los CRUD y gestión de la oferta. Crear las tablas no acredita RF01 ni los
  flujos completos de RF06–13.
- Los flujos de matrícula, asistencia, calificaciones, XLSX, respaldos y restauración
  corresponden a las historias siguientes. No se han implementado ni probado como producto.
- Pesos, códigos institucionales y vigencias oficiales siguen pendientes. El seed
  usa datos marcados como sintéticos, sin habilitar una cuenta operativa.
- No se marca ninguna historia como aceptada institucionalmente antes de la revisión
  cruzada y demostración que exige AGENTS.md.

Decisiones y dependencias: [ADR de base técnica](decisiones/ADR-001-base-tecnica.md).
