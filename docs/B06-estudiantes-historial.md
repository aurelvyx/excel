# B06: estudiantes e historial académico

Inicio del sprint 2. RF14 (alta), RF15 (actualización), RF16 (búsqueda), RF17
(historial), CU05–CU06 y UI03. Implementación web → API → PostgreSQL.

## Preparación y recorrido

Con Docker y los entornos configurados, aplicar la nueva migración:

```sh
pnpm db:migrate
pnpm dev:api
```

En otra terminal: `pnpm dev:web`. Entrar con cuenta de administrador o secretaría.

1. Abrir **Estudiantes**. Buscar por documento, código o nombre; filtrar por
   activos/inactivos. Listado de 20 elementos, primera/siguiente página.
2. Elegir **Registrar estudiante** y comprobar tipo/número de documento. Si ya
   es estudiante, abrir su ficha; si existe como persona, vincularla sin duplicar
   identidad; si no existe, completar sus datos. La API vuelve a comprobar la
   unicidad al guardar, incluso ante dos altas simultáneas.
3. Introducir el código asignado y la fecha de registro; revisar y confirmar.
   Este registro no crea matrícula ni cuenta de acceso.
4. En **Ficha → Editar estudiante**, corregir nombres/contactos o inactivar con
   motivo. Código, documento, fecha e historial permanecen conservados. Los
   datos de persona se comparten con su posible perfil docente.
5. En **Historial académico**, filtrar nivel/periodo y consultar cada intento.
   Se muestran grupo, turno, sección, matrícula, marcas originales, notas y
   resultado persistido. Nota cero difiere de pendiente. Resultado sin confirmar
   se rotula provisional; el navegador no ejecuta fórmulas académicas.

Coordinación puede consultar; no recibe contactos, dirección ni nacimiento.
Docente no tiene acceso al directorio general ni a sus endpoints. Los permisos
se comprueban en el servidor, además del menú. Datos de muestra solo en pruebas.

Enlaces: `/#/estudiantes`, `/#/estudiantes/:id`. Al volver a la lista se conserva
la búsqueda y el cursor. Los filtros dentro del historial corresponden a la
ficha abierta. Hay estados vacío, carga, error/reintento, conflicto y éxito.

## Contrato de API

Base `/api/v1/estudiantes`. Cookie, CSRF y protección de origen de B03; contrato
OpenAPI en `/api/docs` y `/api/openapi.json`.

| Método/ruta | Uso | Permisos |
| --- | --- | --- |
| GET `/` | `q`, `activo`, `tipoDocumento`, `numeroDocumento`, `after`, `limit` | Admin, secretaría, coordinación |
| GET `/documento` | Tipo y número exactos; persona existente y posible estudiante | Admin, secretaría |
| POST `/` | `persona` nueva o `personaId`, `codigoEstudiante`, `fechaRegistro` | Admin, secretaría |
| GET `/:id` | Ficha con proyección por rol | Admin, secretaría, coordinación |
| PATCH `/:id` | `persona` editable, `activo`, `motivo` obligatorio | Admin, secretaría |
| GET `/:id/historial` | `nivelId`, `periodoId`, `after`, `limit`; opciones del estudiante | Admin, secretaría, coordinación |
| GET `/:id/historial/:attemptId` | Intento, asistencias y calificaciones | Admin, secretaría, coordinación |

Paginación por ID ascendente, límite 1–100 (50 por defecto), `nextCursor: null`
al finalizar. Identificadores bigint como cadenas. Búsqueda parcial literal sin
interpretar `%` o `_` como comodines; nombres también en orden apellidos/nombres.
Alta/edición y auditoría se confirman en una sola transacción.

Respuestas: 400 campos/fechas/filtros inválidos; 401 sin sesión; 403 rol denegado;
404 estudiante o intento inexistente/ajeno; 409 documento/código duplicado o
persona inactiva. No existe endpoint DELETE.

## Verificación reproducible

```sh
pnpm check
pnpm test:db
```

- `students.integration-spec.ts`: alta/edición por secretaría, motivo/auditoría,
  identidad inmutable, duplicados concurrentes, rollback completo, reutilización
  de persona, búsqueda/paginación, DTO inválidos y permisos/privacidad.
- Historial con dos intentos sintéticos del mismo nivel en distintos periodos:
  faltas/notas/resultados separados, cero frente a pendiente, filtros y rechazo
  de intento de otro estudiante. Conservación al inactivar y restricciones de BD.
- `students-web.integration-spec.ts`: tres recorridos Chromium con React, API y
  PostgreSQL reales; registro/edición/búsqueda/duplicado, consulta de coordinación,
  detalle por intento y denegación docente. Capturas locales `.tmp/b06/` (ignoradas).
- `database.integration-spec.ts`: cinco migraciones desde cero, reversión segura
  en base vacía y reaplicación; las tablas nuevas no admiten reversión con datos.

## Alcance y pendientes

Verificación ejecutada el 2026-09-28: `pnpm check` aprobó análisis de código,
tipos, compilación y 21 pruebas (15 unitarias, 3 HTTP y 3 de herramientas).
`pnpm test:db` aprobó 85 pruebas de integración, incluyendo 11 recorridos de
navegador (3 nuevos de B06). Total: 106 pruebas aprobadas. Migraciones aplicadas,
revertidas en base vacía y reaplicadas sobre PostgreSQL aislado. Revisadas las
capturas de ficha, intento y móvil. No se migró la base local de desarrollo.

La nueva migración añade soporte de historial, no los flujos B07 y posteriores.
Los vouchers, activación de matrículas, registro de asistencia, configuración y
cálculo de notas/resultados se implementarán en sus historias. No hay actas ni
políticas académicas inventadas. En una base nueva el historial estará vacío
hasta registrar intentos mediante esos flujos.

Ver [ADR-004](decisiones/ADR-004-estudiantes-historial.md). La revisión por otra
persona y aceptación del centro siguen pendientes; las pruebas sintéticas no
equivalen a un piloto institucional.
