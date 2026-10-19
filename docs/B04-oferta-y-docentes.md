# B04: oferta académica y docentes

Implementación de API y persistencia de la historia B04 del plan. Las pantallas de
configuración corresponden a B05. Esta entrega no implementa matrícula, sesiones,
notas, cierre de actas ni reportes; tampoco declara aceptación institucional.

## Trazabilidad

| Requisito | Comportamiento implementado |
| --- | --- |
| RF06 | Crear, consultar, editar e inactivar idiomas conservando registros. |
| RF07 | Niveles por idioma, orden único y prerrequisito del mismo idioma y orden anterior. |
| RF08 | Unidades por nivel, créditos decimales exactos y horas no negativas. |
| RF09 | Periodos con fechas válidas y estado planificado, abierto o cerrado. El control efectivo de solicitudes de matrícula se integrará en B08. |
| RF10 | Turnos con horarios opcionales coherentes y secciones activas/inactivas. |
| RF11 | Grupos con nivel —y por este su idioma—, periodo, turno y sección; código único por periodo. |
| RF12 | Uno o varios docentes por grupo; consulta limitada a asignaciones activas. Las operaciones de asistencia y notas se protegerán en sus historias. |
| RF18 | Identidad personal única, alta, edición e inactivación de docentes sin borrar asignaciones. |

Fuentes: catálogo de requisitos, modelo de datos, arquitectura y plan de desarrollo
en esta carpeta. Decisiones de implementación: [ADR-003](decisiones/ADR-003-oferta-docentes.md).

## Uso de la API

Preparar entornos y migraciones según el README y crear un administrador con
`pnpm admin:bootstrap`. Iniciar con `pnpm dev:api`. Autenticarse y cambiar la clave
temporal siguiendo [B03](B03-acceso-y-usuarios.md).
Contratos de entradas, respuestas y filtros: `/api/docs` y `/api/openapi.json`.

Todas las rutas siguientes tienen prefijo `/api/v1`. El navegador conserva la cookie
HttpOnly. Las escrituras requieren JSON, Origin permitido y `X-CSRF-Token` de la sesión.

| Ruta | Operaciones |
| --- | --- |
| `/oferta/idiomas`, `/oferta/niveles`, `/oferta/unidades` | GET lista, POST alta, GET `/:id`, PATCH `/:id` |
| `/oferta/periodos`, `/oferta/turnos`, `/oferta/secciones`, `/oferta/grupos` | Las mismas operaciones |
| `/docentes` | GET lista, POST alta, GET `/:id`, PATCH `/:id` |
| `/oferta/grupos/:id/docentes` | GET asignaciones activas e históricas |
| `/oferta/grupos/:id/docentes/:docenteId` | PUT alta, modificación, inactivación o reactivación de la asignación |

El administrador realiza todas las escrituras y consulta los perfiles docentes.
Secretaría y coordinación consultan la oferta. Un usuario con solo rol DOCENTE
consulta únicamente `/oferta/grupos` y su detalle si tiene una asignación activa,
su perfil docente está activo y su persona está activa. La vinculación de su cuenta
a `personaId` se administra en `/usuarios/:id` (B03). Inactivar el perfil docente
retira acceso a grupos, pero no deshabilita la cuenta ni los otros roles de esa persona.

Las listas devuelven `{ items, nextCursor }`. `after` es el cursor anterior, y
`limit` acepta 1–100 (predeterminado 50). El cursor no nulo permite solicitar otra
página, que puede estar vacía. El filtro de permisos se aplica antes de paginar.
Filtros: `activo=true|false` en catálogos con inactivación; `estado` en periodos y
grupos; `idiomaId` en niveles; `nivelId` en unidades; `periodoId`, `nivelId`, `turnoId`
y `seccionId` en grupos. Docentes admite `activo`, `tipoDocumento` y `numeroDocumento`.

Las entradas usan camelCase. Las respuestas académicas mantienen nombres snake_case
explícitos en OpenAPI; el objeto `persona` del detalle docente usa camelCase. Los
BIGINT se devuelven como cadenas y los SMALLINT como números. Todos los IDs de
referencias enviados en JSON son cadenas. Los créditos son cadenas decimales
(`"1.5"`), con un decimal como máximo, sin redondeo silencioso. Fechas: `AAAA-MM-DD`;
horarios de entrada: `HH:mm`, de salida: `HH:mm:ss`.

PATCH requiere al menos un campo y `motivo`. Permite `null` solo en campos anulables.
No hay DELETE. Inactivar usa `activo:false`; periodos y grupos usan `estado:CERRADO`.
Los nuevos periodos y grupos quedan PLANIFICADO si se omite el estado. La capacidad
es opcional y no se inventa un cupo. Las restricciones de cupo al matricular quedan
para B08. Los errores usan el formato común de B03: 400 entrada inválida, 401 sin
sesión, 403 permiso/CSRF, 404 referencia inexistente, 409 duplicidad o conflicto.

Ejemplo de docente con persona nueva (datos sintéticos):

```json
{
  "codigoDocente": "DEMO-DOC-01",
  "persona": {
    "tipoDocumento": "DEMO",
    "numeroDocumento": "DEMO-001",
    "nombres": "Persona sintética",
    "apellidoPaterno": "Prueba"
  }
}
```

Si la persona ya existe, enviar `personaId` en lugar de `persona`. Una identidad
repetida produce conflicto; se debe reutilizar el ID existente. El alta no crea una
cuenta automáticamente. PATCH permite corregir nombres y contacto, no sustituir
el documento o la persona del docente. Una corrección de identidad requiere un
flujo específico posterior para evitar fusionar historiales accidentalmente.

Ejemplo de asignación (PUT):

```json
{
  "esTitular": true,
  "fechaAsignacion": "2026-09-25",
  "activo": true,
  "motivo": "Asignación sintética para demostración"
}
```

Cada escritura registra usuario, fecha, acción, valores anteriores y nuevos y el
motivo de las modificaciones. Auditoría y datos comparten transacción; un fallo
revierte todo. Al reasignar la misma pareja docente–grupo se actualiza su estado
sin duplicar la relación, y la bitácora conserva las decisiones anteriores.

## Verificación y límites

Resultado local del 25 de septiembre de 2026: `pnpm check` y `pnpm test:db`
finalizaron correctamente. Pasaron 86 pruebas: 21 de verificación general y 65 de
integración con PostgreSQL, incluidas las 12 de B04. El contenedor temporal se
eliminó al terminar. Esto no constituye revisión independiente ni aceptación del centro.

`pnpm check`: lint, tipos y compilaciones API/web; 15 pruebas unitarias, 3 HTTP y
3 de preparación del entorno. `pnpm test:db`: migraciones sobre PostgreSQL limpio,
reversión/reaplicación, restricciones de B02, acceso B03 y flujo B04 con datos
sintéticos. La nueva suite `apps/api/test/offer.integration-spec.ts` cubre:

- Alta → consulta → edición → inactivación de todos los catálogos.
- Prerrequisitos, duplicados, campos obligatorios, null, fechas, horas y créditos.
- Referencias inactivas, contexto histórico, asignación de varios docentes.
- Permisos de los cuatro roles, alcance por grupo, paginación y retiro de acceso.
- Identidad personal compartida, conservación de asignaciones y auditoría.
- Rollback por fallo de auditoría y altas concurrentes duplicadas.
- Contratos OpenAPI de entradas y respuestas.

No se modifica el esquema: se reutilizan las cuatro migraciones existentes con
`synchronize:false`. No se añaden dependencias ni datos al volumen de desarrollo.
La demostración automatizada es HTTP–API–PostgreSQL; falta la interfaz B05 y la
revisión de otra persona para dar la historia por aceptada según AGENTS.md.
No se afirma despliegue, prueba con datos del centro ni ejecución remota de CI.
