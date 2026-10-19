# ADR-010 — Cierre específico de asistencia y corrección auditada

Fecha: 12 de octubre de 2026. Estado: decisión técnica implementada y verificada
para B15; aceptación humana pendiente.
Trazabilidad: RF36, CU13, RN14, RN19, RN29 y conservación de RN31;
RN28 parcial para asistencia;
CU18/UI10 parciales para asistencia. Integra B11–B14 sin implementar actas de B18.

## Contexto

Los estados de grupo, periodo y matrícula no acreditan que el administrador revisó
y cerró la asistencia. B13 calcula sobre clases reales hasta hoy y B14 conserva
los expedientes J. Se necesita fijar un corte persistido, bloquear escrituras
ordinarias y permitir una corrección excepcional con evidencia, sin convertir
pendientes en faltas ni sobrescribir resultados académicos históricos.

## Decisión

1. Persistir un evento inmutable en `cierres_academicos`, con grupo, tipo,
   responsable, fecha, motivo opcional, revisión y resumen. B15 admite únicamente
   cierre de asistencia; índice único por grupo. No habilitar reapertura ni actas.
   No cambiar estados de grupo, periodo o matrícula como efecto del cierre.
2. Consultar y revisar el grupo completo, incluidas matrículas activas y cerradas.
   El administrador confirma un token SHA-256 de la revisión obtenida de la API.
   Cambios en sesiones, matrículas, marcas, expedientes o día académico invalidan
   el token y requieren recarga explícita; no actualizarlo silenciosamente.
3. Presentar advertencias por sesiones programadas/futuras, marcas faltantes,
   J pendientes, falta de sesiones computables o matrículas revisables. Exigir
   reconocimiento explícito de esas advertencias. Canceladas se excluyen y se
   muestran como dato informativo. Esta confirmación no inventa evidencia académica.
4. Usar la fecha civil del cierre en America/Lima como corte inmutable. Solo
   sesiones `REALIZADA` con fecha no posterior al corte computan. Compartir ese
   predicado entre resúmenes y detalle, conservar `parametro_id` por intento y
   dejar las reglas de tardanzas/porcentaje en la política de dominio de B13.
5. No registrar F/P por marcas faltantes: conservan `INCOMPLETO` sin condición
   definitiva. J no recuperada al cierre computa como falta, incluso si no tiene
   expediente o sigue pendiente/aprobada; su estado y decisiones no se sustituyen.
   Recuperada sigue excluida; sin sesiones no hay división ni condición.
6. Conservar `cierre.resumen` como revisión **previa aceptada**, con advertencias,
   fecha de corte y resúmenes por intento. Auditar el cierre con
   `resumenesCerrados` posteriores, calculados en la misma transacción. Una
   corrección posterior conserva ambos registros y genera nueva evidencia.
7. Bloquear programación, altas/activaciones de matrícula, edición docente y
   gestión ordinaria de justificaciones tras el cierre. Revalidar autorización
   dentro de la transacción y releer el cierre después del bloqueo del grupo.
   Reforzar con triggers y una nueva versión MVCC del grupo al registrar el evento;
   snapshots antiguos no deben ignorar un cierre por haber esperado un bloqueo.
8. Exponer una ruta separada de corrección exclusiva de administrador. Validar
   cierre vigente, sesión computable, matrícula activa/cerrada, versión leída y
   motivo obligatorio de hasta 400 caracteres. Permitir completar una marca
   inexistente con versión null; una J con expediente conserva J. No corregir
   decisiones del expediente por esta ruta ni permitir edición docente adicional.
9. Reutilizar la persistencia de asistencia: cambio, evidencia anterior/nueva y
   resumen vigente comparten transacción. Activar el contexto de corrección de BD
   únicamente dentro de esa transacción autorizada; no forma parte de los datos
   aceptados del cliente. Auditar `CORRECT_AFTER_CLOSE`, usuario, fecha y motivo.
10. Mantener `resultados_academicos`, notas y actas sin escrituras de B15. El
    resultado combinado y las correcciones de acta con recálculo se integran en
    B18. Un resumen actual no reemplaza la asistencia histórica almacenada de un
    resultado confirmado.
11. Mostrar el cierre en una ruta del grupo y correcciones por fila en matriz
    cerrada. Reutilizar `FormDialog`, guardias, campos, contexto, tablas y
    `AttendanceSummary`; compartir la actualización del guardado docente y la
    corrección. Ante 409 conservar captura y exigir descarte confirmado para
    recargar. Si falla el GET tras guardar, conservar éxito y ocultar métricas viejas.
12. Proyectar historial limitado a marca, observación, versión, acción, autor,
    fecha y motivo. Aplicar alcance en cada consulta. No exponer IP o snapshots
    generales ni agregar motivos de justificación a fichas generales de estudiantes.

## Consecuencias y límites

El denominador cerrado no crece con el paso del tiempo. El administrador puede
rectificar evidencia puntual sin reabrir el registro ni perder su historial.
El cierre puede conservar pendientes reconocidas; no constituye por sí solo un
resultado académico definitivo ni acredita aprobación de notas.

Se conserva el monolito modular, REST, TypeORM, PostgreSQL y las dependencias
existentes. La duodécima migración añade el evento y las protecciones; su reversión
rechaza datos de cierre presentes. RF37 completo, actas, reapertura y corrección
de decisiones cerradas de justificación no se habilitan por esta entrega.

## Comprobación

El bloqueo compartido/exclusivo y el tratamiento de snapshots se contrastaron
con la documentación de [bloqueos de PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html)
y [aislamiento transaccional](https://www.postgresql.org/docs/18/transaction-iso.html).
El evento crea una nueva versión MVCC mediante `codigo=codigo`, conservando el
valor académico del grupo y su identidad generada. Un fallo de serialización o
interbloqueo se traduce a HTTP 409 y exige recargar la revisión.

Política: revisión, reconocimiento de advertencias y efectos de pendientes/J.
API/BD: permisos, versiones, transacciones, concurrencia, corte temporal, integridad
SQL e invariantes de auditoría. Navegador: revisión/confirmación, solo lectura,
captura ante 409, marca faltante, corrección con motivo e historial limitado.

`pnpm check` y `pnpm test:db` finalizaron correctamente: 500 pruebas en total,
incluidas 71 nuevas de B15, y doce migraciones aplicadas desde cero, revertidas y
reaplicadas. Resultados y límites: [B15](../B15-cierre-asistencia.md).
Referencias históricas preservadas: [ADR-006](ADR-006-sesiones-clase.md),
[ADR-008](ADR-008-calculo-asistencia.md) y [ADR-009](ADR-009-justificaciones.md).
