# B12 — Registro de asistencia por sesión

Sprint 3. Trazabilidad: **B12, RF29, registro y corrección de RF30, CU11 parcial,
UI06, RN11 y RN27**. Fuentes: backlog, catálogo de requisitos, casos de uso,
modelo de datos, arquitectura y prototipos de interfaz del repositorio.
El recálculo asociado a RF30 se implementará con B13; B12 no produce resultados
académicos ni porcentajes oficiales.

## Comportamiento y permisos

La matriz identifica el grupo, idioma, nivel, periodo, turno, sección y sesión.
Incluye matrículas activas y conserva en solo lectura las marcas existentes de
intentos ahora cerrados o anulados. Una solicitud pendiente no aparece en el padrón
ni admite registrar asistencia. Cada fila corresponde a un intento, incluso si
una persona tiene historial y otro intento activo en el grupo.

Se registran `P` presente, `F` falta, `T` tardanza o `J` falta justificada, con
observación opcional de hasta 250 caracteres. Una fila sin marca permanece pendiente;
no se convierte automáticamente en falta, presencia ni cero. La opción **Marcar
presentes** modifica únicamente las filas editables de la página visible y requiere
**Guardar asistencia** para persistir. Los lotes admiten entre 1 y 100 filas distintas;
la interfaz presenta 20 por página. Son límites técnicos, no reglas académicas.

| Rol efectivo | Consulta | Registro/corrección abierta |
| --- | --- | --- |
| Administrador | Todos los grupos | No por ese rol |
| Docente | Sus asignaciones activas | Sus asignaciones activas |
| Secretaría | Todos los grupos | No por ese rol |
| Coordinación | Todos los grupos | No por ese rol |

Los permisos se comprueban en cada endpoint y dentro de la transacción, con la sesión,
roles, usuario, persona, docente y asignación vigentes. Un docente con otro rol de
consulta puede leer otros grupos, pero sigue escribiendo únicamente en sus asignaciones.
Un administrador con rol docente también debe tener una asignación activa para
utilizar el registro ordinario abierto. El rol administrativo no sustituye esa
asignación, conforme a AGENTS.md 3.2, RF29–RF30 y CU11.
Se reutiliza la protección de cookie HttpOnly, Origin y CSRF.

Para registrar, el grupo debe estar `ACTIVO`, el periodo `ABIERTO` y la matrícula
`ACTIVA`. La sesión no puede estar `CANCELADA` ni tener fecha posterior al día civil
actual en **America/Lima**, obtenido del servidor de base de datos. Al guardar la
primera marca, la sesión `PROGRAMADA` pasa a `REALIZADA`; la interfaz explica que el
guardado confirma que la clase ocurrió. Esta transición, las marcas y sus eventos
de auditoría se guardan en una sola transacción.

Grupo o periodo cerrado conserva la consulta y bloquea el guardado ordinario
del docente. `grupo.asistencia_cerrada` continúa reflejando el estado del grupo.
El cierre específico de asistencia y las correcciones administrativas posteriores
con motivo corresponden a **B15**; no se simula ese flujo en esta entrega.

## Correcciones, concurrencia e historial

Cada alta conserva `registrado_por` y `registrado_at`, con versión 1. Una corrección
cambia código u observación, incrementa la versión y actualiza `actualizado_at`, sin
alterar el autor o fecha originales. La auditoría inmutable identifica al editor,
la fecha, IP, versión y valores anterior/nuevo dentro de la misma transacción.
Un guardado que no modifica valores no cambia versión, fecha ni auditoría.

El cliente envía la versión que consultó; `null` indica una marca nueva. Si otra
persona ya creó o corrigió el registro, el lote completo recibe HTTP 409. Ninguna
fila del lote se guarda parcialmente. Los bloqueos sobre sesión, grupo, periodo,
matrículas y registros mantienen consistencia frente a cambios concurrentes.
Un fallo de auditoría revierte también la transición a `REALIZADA`.

El frontend conserva la captura ante errores. Después de un conflicto impide
reenviar hasta recargar y revisar la información vigente. Si hay cambios sin guardar,
navegar, paginar o recargar requiere descartarlos explícitamente en un diálogo;
cerrar o recargar la pestaña utiliza la advertencia nativa del navegador.

No existen rutas de eliminación. PostgreSQL conserva la unicidad por sesión e
intento, las referencias al mismo grupo, los cuatro códigos y la longitud de
observación. La décima migración `1790208009000-asistencia.ts` añade una versión
entera positiva y protege la identidad y origen de las marcas frente a reasignaciones.
No modifica las migraciones anteriores. Su reversión se permite sobre una tabla
vacía y se rechaza cuando ya existe historial de asistencia.

## Uso y contrato REST

1. Abrir **Grupos** o **Mis grupos** → **Sesiones** → **Asistencia**.
2. Revisar fecha y contexto; elegir marcas individuales o **Marcar presentes**.
3. Añadir observaciones si se necesitan y pulsar **Guardar asistencia**.
4. Corregir mientras el registro esté abierto. Ante conflicto, revisar y recargar.

Ruta web: `#/asistencia/grupos/{grupoId}/sesiones/{sesionId}`.
API documentada en `/api/docs` y `/api/openapi.json`:

- `GET /api/v1/asistencia/grupos/{grupoId}/sesiones/{sesionId}/asistencias?limit=20&after=0`
  devuelve `items`, `nextCursor`, `grupo`, `sesion`, `puedeEditar` y `motivoSoloLectura`.
  Cada fila identifica matrícula, estudiante, documento, número de intento, estado,
  permiso de edición y una marca `asistencia` o `null`. El cursor es el último ID de
  matrícula, con orden estable y sin repetir intentos.
- `PATCH` sobre la misma ruta devuelve `{items, sesion}` con las marcas guardadas,
  nuevas versiones y estado actualizado de la sesión.

```json
{
  "registros": [
    {"matriculaId": "123", "codigo": "P", "observacion": null, "version": null},
    {"matriculaId": "124", "codigo": "T", "observacion": "Ingreso tardío", "version": 2}
  ]
}
```

La versión es obligatoria: `null` para alta o entero positivo para corrección.
Omitir la observación conserva la existente; `null` o texto en blanco la borra.
DTO y validación anidada rechazan códigos, versiones, IDs, lotes y campos adicionales
inválidos (400). Matrícula ajena produce 400; sesión de otro grupo, 404; falta de
autenticación, 401; permiso insuficiente, 403; versión obsoleta o registro bloqueado,
409. Los errores internos no exponen detalles de base de datos.

## Refactorización y verificación

La API comparte `academic-context.ts` entre sesiones y asistencia y encapsula
restricciones y detección de cambios en `attendance.policy.ts`, independientes de HTTP.
La web reutiliza tablas, campos, botones, avisos y diálogos existentes; `GroupContext`
comparte el contexto académico y `useUnsavedChanges` protege la captura.
No se incorporaron dependencias nuevas.

Archivos principales afectados:

- `apps/api/src/modules/asistencia/attendance.*`: controlador, DTO, contrato
  OpenAPI, servicio transaccional y política con pruebas; `academic-context.ts`
  comparte consultas con `sessions.service.ts`.
- `apps/api/src/database/migraciones/1790208009000-asistencia.ts` y la configuración
  de migraciones; `database.integration-spec.ts` verifica la reversión completa.
- `apps/web/src/features/attendance/AttendancePage.tsx`, `GroupContext.tsx`, modelo
  y enlace en `SessionsPage.tsx`; rutas, estilos y navegación compartida en la web.
- `shared/useUnsavedChanges.tsx` conserva cambios al navegar o cerrar sesión;
  `shared/navigation.ts` consulta el guard antes de notificar una nueva ruta a React.
- `attendance.fixture.ts`, `attendance.integration-spec.ts` y
  `attendance-web.integration-spec.ts`: datos y pruebas de integración.
- `README.md`, configuración OpenAPI y workflow B01–B12: alcance y verificación.

Aplicar la migración en la base local desde la raíz y ejecutar API/web en terminales
separadas:

```sh
pnpm db:migrate
pnpm dev:api
pnpm dev:web
```

Verificación reproducible: `pnpm check` y `pnpm test:db`. La segunda utiliza un
PostgreSQL temporal, migra, revierte y reaplica desde cero; no modifica el volumen
local. Las pruebas cubren política, contratos HTTP, permisos, atomicidad, concurrencia,
historial, restricciones SQL y recorridos React–API–PostgreSQL con Chromium.
Informe: `.tmp/verificacion/pruebas.json`. Capturas sintéticas: `.tmp/b12/`.

Verificación local finalizada el **6 de octubre de 2026**:

- `pnpm check`: lint, tipos y compilación correctos; 70 pruebas unitarias, 3 de
  contrato HTTP sin base y 14 de herramientas aprobadas.
- `pnpm test:db`: 190 pruebas aprobadas en 13 suites, incluidas 33 de API/BD de B12
  y 9 recorridos nuevos de navegador. Las diez migraciones se aplican desde cero,
  se revierten y se reaplican en la suite de base limpia.
- **277 pruebas en total**, sin sumar ejecuciones repetidas; 56 nuevas de B12:
  14 de política y 42 de integración. Se probaron roles combinados, cambio de
  editor con origen conservado, guardado masivo de 20 filas y la fila 21 pendiente,
  navegación por hash, Atrás, paginación y cancelación de salida de sesión.
- Capturas de escritorio, móvil y conflicto revisadas visualmente.
  `git diff --check` sin errores de espacios.
- Revisión técnica adicional por otro agente: validación, transacciones,
  contratos y permisos contrastados con AGENTS.md y RF29–RF30.

La base local existente no se modificó; aplicar `pnpm db:migrate` antes de usar
el nuevo flujo allí. La revisión de una persona del equipo y su aceptación siguen
pendientes. No se realizó un piloto institucional ni se ejecutó remotamente
GitHub Actions durante esta implementación.

**B13** incorporará sesiones computables, tardanzas, faltas y límite del 30 %;
**B14**, el proceso de resolución y recuperación de `J`; **B15**, cierres y
correcciones posteriores. Registrar `J` en B12 conserva la marca y no aprueba una
justificación, descuenta faltas ni determina una condición académica.

Decisiones técnicas: [ADR-007](decisiones/ADR-007-registro-asistencia.md).
