# B13 — Cálculo de faltas e inasistencia

Sprint 3. Trazabilidad: **B13, RF31–RF32, recálculo de RF30, RF43 parcial,
RN12–RN14, CU11 parcial y UI06**. Fuentes: `AGENTS.md`, backlog, catálogo,
casos de uso, modelo de datos, arquitectura y prototipos del repositorio.

## Comportamiento

La matriz de asistencia y el historial muestran el mismo resumen por intento,
calculado por la API a partir de sesiones, marcas y la versión de reglas asociada
a la matrícula. La interfaz presenta los valores recibidos y reutiliza
`AttendanceSummary`; no mantiene otra fórmula oficial.

- Cada grupo completo de tres tardanzas equivale a una falta. Las tardanzas
  restantes se conservan y las marcas T originales no se reescriben.
- Las faltas computables suman F, equivalencias de T y J computables. Las J
  pendientes de resolución se incluyen provisionalmente; no son faltas confirmadas.
- El denominador incluye todas las sesiones realizadas del grupo hasta hoy en
  **America/Lima**. Se excluyen programadas, canceladas y futuras. No se divide el
  intento por meses ni se filtra por fecha de solicitud de matrícula.
- Las marcas faltantes siguen pendientes, con porcentaje parcial y condición
  pendiente. Sin sesiones computables no hay porcentaje ni condición.
- Con datos completos y resueltos, 30 % exacto conserva la condición dentro del
  límite; más de 30 % señala **Retirado por inasistencia**. La comparación utiliza
  enteros exactos; los dos decimales mostrados no deciden el límite.
- Una solicitud pendiente o anulada nunca se clasifica como retirada por inasistencia.

| Ejemplo sintético, diez sesiones | Faltas computables | Porcentaje | Condición de asistencia |
| --- | --- | --- | --- |
| 3 F y 7 P | 3 | 30,00 % | Dentro del límite |
| 4 F y 6 P | 4 | 40,00 % | Retirado por inasistencia |
| 7 T, 1 F y 2 P | 3; queda 1 T | 30,00 % | Dentro del límite |
| 3 F, 1 J sin resolver y 6 P | 4 provisionales | 40,00 % provisional | Pendiente |
| 4 F, 5 P y una marca pendiente | 4 | 40,00 % parcial | Pendiente |

La condición es la de asistencia actual. No confirma notas, actas, aprobación de
nivel ni un cierre. El registro abierto permite corregir y recalcular. El resumen
aparece separado del resultado académico conservado en el historial.
La sección **Asistencia del resultado confirmado/provisional** conserva visibles
las métricas almacenadas de ese resultado, aunque difieran del resumen actual.

## Uso

1. Abrir **Grupos** o **Mis grupos** → **Sesiones** → **Asistencia**.
2. Consultar la columna **Resumen del intento** y desplegar el desglose para ver
   sesiones, marcas, equivalencias, pendientes, porcentaje y versión de reglas.
3. Registrar o corregir con **Guardar asistencia**. Los cambios sin guardar no
   alteran el resumen. Al confirmar la primera marca de una sesión programada,
   se actualiza el denominador de todas las matrículas.
4. Para consultar intentos anteriores, abrir **Estudiantes** → **Historial** →
   **Consultar intento**. El detalle indica cuáles sesiones computan.

Se mantienen los permisos de B12: docente asignado registra mientras el flujo
está abierto; administración, secretaría y coordinación consultan según su alcance.
El historial de estudiantes conserva sus permisos propios. El servidor revalida
sesión, roles, usuario y asignación; no basta con ocultar botones.

El guardado conserva versiones y auditoría. Un conflicto 409 revierte el lote y
conserva la captura sin recargar. Después de un guardado exitoso se consulta toda
la página, incluidos quienes no estaban en el lote. Si falla esa consulta, se
conserva lo guardado y se ocultan las métricas con **Resumen no actualizado** hasta
recargar; no se presentan cifras antiguas como vigentes.

## Contrato y persistencia

OpenAPI: `/api/docs` y `/api/openapi.json`, versión técnica `0.13.0`.

- `GET /api/v1/asistencia/grupos/{grupoId}/sesiones/{sesionId}/asistencias`
  añade `resumenAsistencia` a cada fila. Paginación y permisos no cambian.
- `PATCH` sobre la misma ruta conserva `{items, sesion}` y añade
  `resumenes: [{matriculaId, resumenAsistencia}]` del lote guardado, calculados
  dentro de la transacción.
- `GET /api/v1/estudiantes/{id}/historial` y su detalle `/{attemptId}` añaden
  `resumenAsistencia` a cada intento. El detalle añade `computable` a las sesiones.
  `resultado` conserva sus datos históricos de notas y no se sobrescribe.

`resumenAsistencia` incluye estado (`NO_APLICA`, `SIN_SESIONES`, `INCOMPLETO`,
`PROVISIONAL`, `CALCULADO`), conteos, equivalencias y restos, marcas pendientes,
justificaciones pendientes/recuperadas/computables, faltas confirmadas/computables,
`inasistenciaPct` decimal o null, `excedeLimite` exacto o null, condición de asistencia
o null, reglas del intento, `cierreConfirmado` y criterio de sesiones.
El porcentaje puede ser parcial/provisional y `excedeLimite` puede ser true sin que
exista una condición definitiva. Consultar siempre el estado y `condicion`.

El resumen se deriva de datos persistidos en una consulta agregada; no introduce
tablas, dependencias ni migraciones. No escribe resultados académicos al consultar,
no cambia el estado de la matrícula ni altera marcas para representar equivalencias.
Cada intento usa su `parametro_id`, incluso si existe una versión posterior.

## Archivos y refactorización

- `apps/api/src/modules/asistencia/attendance-calculation.policy.ts`: dominio puro
  y pruebas de fracciones exactas, tardanzas, pendientes y justificaciones.
- `attendance-calculation.service.ts`: agregación compartida, detalle computable
  y lectura de reglas por intento. `academic-context.ts` centraliza el día académico.
- `attendance.service.ts` y `student-history.service.ts`: integración del mismo
  cálculo con autorización y transacciones existentes.
- `attendance-calculation.schema.ts`: contrato reutilizado en asistencia e historial;
  controladores y configuración OpenAPI actualizados.
- `apps/web/src/features/attendance/AttendanceSummary.tsx`: componente reutilizable
  en matriz y `StudentHistory.tsx`; estados guardados, desactualizados y pendientes.
- `attendance-calculation.integration-spec.ts` y
  `attendance-calculation-web.integration-spec.ts`: API/BD y recorridos React reales.
- `README.md` y workflow B01–B13: alcance y evidencias de CI.

## Verificación reproducible

Desde la raíz:

```sh
pnpm check
pnpm test:db
```

La suite de base utiliza PostgreSQL temporal, aplica las diez migraciones desde
cero, revierte y reaplica; no toca el volumen de desarrollo. Los recorridos utilizan
Chromium y datos sintéticos. Informe: `.tmp/verificacion/pruebas.json`.
Capturas generadas: `.tmp/b13/`.

Verificación local finalizada el **6 de octubre de 2026**:

- `pnpm check`: lint, tipos y compilación correctos; 102 pruebas unitarias, 3 de
  contrato HTTP sin base y 14 de herramientas aprobadas.
- `pnpm test:db`: 217 pruebas aprobadas en 15 suites. Incluye 18 casos API/BD
  nuevos de B13 y 9 recorridos nuevos de navegador. Las diez migraciones se
  aplicaron desde cero, se revirtieron y se reaplicaron.
- **336 pruebas en total**, sin sumar ejecuciones repetidas; 59 nuevas de B13:
  32 de política y 27 de integración. Las fracciones ligeramente superiores e
  inferiores al 30 % se probaron aunque ambas se muestren como 30,00 %.
- Se verificaron correcciones, cambio de denominador en filas fuera del lote y de
  la página, versiones de reglas e intentos separados, concurrencia, rollback,
  permisos revocados y conservación de resultados académicos confirmados.
- Capturas sintéticas de matriz, historial, justificación provisional y resumen
  desactualizado revisadas visualmente, incluidas escritorio y móvil. El caso de
  historial muestra 25 % almacenado frente a 100 % actual con etiquetas separadas.
- Revisión técnica independiente por otros agentes de política, consultas,
  integración, permisos e interfaz; corregida la pérdida de visibilidad de las
  métricas históricas en el frontend. `git diff --check` sin errores de espacios.

No se añadieron dependencias ni migraciones. La base local existente no se modificó.
La demostración se reproduce con los comandos anteriores; sus datos son sintéticos.

## Límites y pendientes

B14 incorpora la solicitud, aprobación/rechazo y recuperación de J. En B13 una
marca J guardada permanece sin resolver, no se simula una aprobación ni se descuenta
automáticamente. La política ya prueba categorías recuperada/rechazada/no recuperada
y el efecto al cierre, pero todavía no existe su flujo persistido HTTP.

B15 incorpora el cierre específico y correcciones administrativas posteriores;
`cierreConfirmado` permanece false en B13. Un grupo o intento cerrado no sustituye
ese proceso. El resultado combinado de asistencia y notas de RF43 corresponde a
B18. B13 no completa ese requisito ni emite actas con pesos supuestos.

La revisión y aceptación de una persona del equipo y el piloto institucional siguen
pendientes. Las evidencias locales no son una ejecución remota de GitHub Actions.

Decisiones y criterio del denominador: [ADR-008](decisiones/ADR-008-calculo-asistencia.md).
