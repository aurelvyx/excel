# B11 — Programación de sesiones de clase

Inicio del sprint 3. Trazabilidad: **B11, RF28, CU10 y RN27**.
Fuentes: `Plan_de_Desarrollo_y_Backlog.docx`, `Catalogo_Requisitos_y_Trazabilidad.docx`,
`Casos_de_Uso_y_Diagramas.docx`, `Modelo_de_Datos_y_Diccionario.docx`,
`Arquitectura_del_Sistema.docx` y `Prototipos_de_Interfaz_y_Navegacion.docx`.

## Comportamiento implementado

Administrador y docente asignado pueden programar una o varias fechas explícitas
de clase. Cada fecha queda vinculada al grupo, dentro de las fechas del periodo
académico, incluidos ambos extremos. Se conserva el contexto de idioma, nivel,
periodo, turno y sección. No se crean sesiones a partir de meses, matrículas,
cantidad de alumnos ni horarios supuestos.

El lote admite de 1 a 100 fechas distintas: es un límite técnico por solicitud,
no una cantidad institucional de clases. Se pueden repetir solicitudes para
programar otras fechas. El horario es opcional, común al lote y se registra
únicamente si se indican ambas horas, con inicio anterior a fin. No se asigna
automáticamente el horario referencial del turno.

Cada sesión se crea como `PROGRAMADA`, con usuario creador y un evento inmutable
de auditoría que registra fecha de la operación, IP y valores guardados. No se
puede programar otra sesión en la misma fecha y grupo, incluso si el registro
existente está cancelado. Una colisión, un campo inválido o un fallo de auditoría
revierte el lote completo; no se guardan filas parciales.

## Permisos

| Rol efectivo | Consulta | Programación |
| --- | --- | --- |
| Administrador | Todos los grupos | Grupos y periodos sin cerrar |
| Docente | Sus asignaciones activas | Sus asignaciones activas, sin cierre de grupo o periodo |
| Secretaría | Todos los grupos | Sin permiso por ese rol |
| Coordinación | Todos los grupos | Sin permiso por ese rol |

Se revalidan sesión, usuario y roles en el servidor, dentro de la transacción.
El docente debe tener persona, perfil y asignación activos. Un rol adicional de
consulta amplía la lectura, pero no permite al docente programar grupos ajenos.
Las escrituras usan la protección existente de Origin, sesión HttpOnly y CSRF.

Se permite preparar fechas de grupos y periodos `PLANIFICADO`, además de grupos
`ACTIVO` en periodos `ABIERTO`. La programación anticipada no activa grupos,
matrículas ni asistencias. Grupo o periodo `CERRADO` conserva la consulta y bloquea
la programación, también para administrador; la corrección administrativa posterior
requiere el flujo separado previsto en historias de cierre.

## Uso de la interfaz

1. Abrir **Grupos** o **Mis grupos** y elegir **Sesiones** en la fila del grupo.
2. Revisar el contexto y las fechas permitidas del periodo.
3. Elegir **Programar sesiones**, seleccionar una fecha y pulsar **Añadir fecha**.
   Repetir para cada clase; **Quitar** permite corregir la selección.
4. Opcionalmente indicar las dos horas. Pulsar **Revisar programación**.
5. Verificar el grupo, las fechas y el horario antes de **Confirmar programación**.

La revisión todavía no guarda datos. El formulario conserva las fechas y el
horario cuando la API devuelve un conflicto. La consulta presenta estado de
carga, error con reintento, vacío, éxito y solo lectura. Fechas civiles se muestran
como `DD/MM/YYYY`, sin conversiones de zona horaria. La paginación mantiene el grupo.

Ruta web: `#/asistencia/grupos/{id}`. Se reutilizan `PageHeading`, `ListPanel`,
`DataTable`, `Pagination`, `InputField`, `Button`, `Dialog`, `Feedback` y
`useApiQuery`. Se extrajo `Facts` para reutilizar el detalle en sesiones, matrícula
y ficha de estudiante; el alcance de grupo también se comparte entre API de oferta
y asistencia.

Las pruebas antiguas de reversión comprueban ahora la migración concreta mediante
`migration-test.ts`, dentro de una transacción que siempre se revierte. Así no
dependen de que B09 o B03 sea la última migración disponible y mantienen las
protecciones de historial durante el resto de la suite.

## Contrato REST

Documentado en `/api/docs` y `/api/openapi.json`, sin exportar entidades ORM.

- `GET /api/v1/asistencia/grupos/{grupoId}/sesiones?limit=20&after=0`: devuelve
  `items`, `nextCursor`, `grupo` y `puedeProgramar`, calculado por el servidor.
  El cursor es el ID del último registro, con orden estable de registro ascendente;
  las fechas se ordenan cronológicamente dentro de cada lote al guardarlo.
- `POST /api/v1/asistencia/grupos/{grupoId}/sesiones`: devuelve `{items}` con HTTP 201.

```json
{
  "fechas": ["2026-10-05", "2026-10-06"],
  "horaInicio": "09:15",
  "horaFin": "11:30"
}
```

Las horas se omiten si no se necesita horario. Se rechazan campos adicionales,
fechas imposibles, timestamps, lotes vacíos, más de 100 fechas, fechas repetidas
dentro del cuerpo y horarios incompletos o invertidos (HTTP 400). Una fecha ya
guardada produce HTTP 409. HTTP 403 indica falta de permisos o grupo ajeno;
HTTP 401 requiere autenticación; HTTP 404 indica grupo inexistente en el alcance
autorizado. No existen rutas de eliminación ni de modificación en B11.

`grupo.asistencia_cerrada` refleja únicamente `grupo.estado = CERRADO` en esta
entrega; no representa un cierre específico de asistencia ya implementado.
La tabla y operación de cierre de asistencia se incorporarán en B15.

## Migración y puesta en marcha local

La novena migración, `1790208008000-sesiones.ts`, reutiliza `sesiones_clase`, su
unicidad y la protección de historial creadas en B06. Agrega validación de rango
en PostgreSQL, tanto al registrar/modificar una fecha como al cambiar los límites
del periodo o el periodo del grupo. Comparte bloqueos sobre grupo y periodo para
mantener consistencia frente a cambios concurrentes.

Antes de añadir las restricciones, comprueba las sesiones previas. Si alguna queda
fuera del periodo, falla con un mensaje explícito y no corrige datos automáticamente.
La reversión retira solamente las tres protecciones nuevas, sin eliminar sesiones.
Las migraciones antiguas no se modifican.

En la base local de desarrollo, aplicar desde la raíz:

```sh
pnpm db:migrate
pnpm dev:api
pnpm dev:web
```

API y web se ejecutan en terminales separadas. La verificación automatizada usa
PostgreSQL temporal y no migra ni modifica el volumen local de desarrollo.

## Verificación y límites

```sh
pnpm check
pnpm test:db
```

`session.policy.spec.ts` cubre extremos del periodo, calendario real, año bisiesto
y horarios. `sessions.integration-spec.ts` verifica HTTP con PostgreSQL: permisos,
roles combinados, asignaciones y usuarios inactivos, sesiones revocadas/vencidas,
CSRF, duplicados concurrentes, atomicidad de auditoría, restricciones SQL,
paginación y OpenAPI. `sessions-web.integration-spec.ts` verifica confirmación,
persistencia, conflictos y lectura autorizada en React con Chromium, escritorio y móvil.

Informe de integración: `.tmp/verificacion/pruebas.json`. Capturas sintéticas:
`.tmp/b11/sesiones-docente.png`, `sesiones-movil.png` y `conflicto-sesiones.png`.
Estos archivos no representan datos ni aprobación institucional.

Verificación local finalizada el **6 de octubre de 2026**:

- `pnpm check`: lint, tipos y compilación correctos; 56 pruebas unitarias, 3 de
  HTTP sin base y 14 de herramientas aprobadas.
- `pnpm test:db`: 148 pruebas aprobadas en 11 suites, incluidas 22 de integración
  HTTP de B11 y 5 recorridos nuevos de navegador. Las nueve migraciones se aplican
  desde cero, se revierten y se reaplican en la suite de base limpia.
- Tras los ajustes finales: `pnpm lint`, `pnpm typecheck` y
  `pnpm --filter web build` correctos. `git diff --check` sin errores.
- 221 pruebas en total, sin sumar las ejecuciones repetidas. De ellas, 43 son
  nuevas de B11 (16 de política y 27 de integración).
- Capturas de escritorio, móvil y conflicto revisadas visualmente.

El workflow incluye B11 y sus capturas, pero no se ha ejecutado remotamente en
GitHub Actions durante esta implementación. La base local existente no se modificó.

B11 construye la base persistida de sesiones. Todavía no registra marcas P/F/T/J
(B12), ni calcula el denominador computable, tardanzas o retiros (B13), ni resuelve
justificaciones (B14), ni cierra asistencia (B15). Una sesión programada no equivale
por sí sola a una clase realizada ni determina la condición de un estudiante.
La revisión y aceptación del equipo/centro siguen pendientes.

Decisiones técnicas: [ADR-006](decisiones/ADR-006-sesiones-clase.md).
