# ADR-005 — Solicitud y activación de matrícula B08

Fecha: 2026-09-29. Estado: implementado; revisión del equipo pendiente.

## Contexto

B08 cubre RF21–RF24/RF27 y CU08. La base B06 dispone de matrículas e historial y
B07 registra vouchers. RN30 exige conservar la solicitud pendiente si no se activa.
B09 implementará el asistente visual. Se mantienen NestJS, TypeORM y PostgreSQL,
sin nuevas dependencias.

## Decisiones técnicas

- Separar alta pendiente y confirmación explícita de activación. El código, intento
  y versión se fijan en la transacción de alta, bajo bloqueo de estudiante; la
  activación bloquea la misma identidad y revalida grupo, prerrequisito y voucher.
  Una solicitud no reserva cupo ni voucher. Los fallos de activación no borran la
  solicitud ni liberan/reasignan un intento histórico.
- Mantener el contexto a través del grupo y nivel. B04 ya impide editar periodo,
  nivel, turno y sección del grupo. No duplicar esa configuración en el frontend.
- Seleccionar la versión vigente de inicio más reciente; desempatar por versión.
  La referencia permanece inmutable. Las fórmulas de evaluación pendientes no se
  completan con valores ilustrativos ni son requisito para emitir un resultado aquí.
- Considerar aprobado únicamente el resultado confirmado de matrícula cerrada.
  No tomar el borrador de un promedio como aprobación del prerrequisito.
- Regla acordada por mensaje del equipo: base `MAT-NroDocumento`. Detalle técnico
  para unicidad: añadir el correlativo global de matrícula, independiente de los
  intentos por nivel. Usar la secuencia identity existente dentro de la transacción;
  aceptar saltos por rollback. No renumerar historial. Actualizar AGENTS y pruebas.
- Ampliar `codigo` a 50 caracteres y protegerlo junto con fecha y registrador.
  Impedir cambiar el voucher de una matrícula ya activada. No restringir futuros
  cierres/correcciones de resultados, que tendrán sus propios comandos auditados.

## Consecuencias

La primera solicitud ya obtiene un número de intento; pendientes y anuladas
participan del máximo histórico. Esto es una decisión técnica de identidad, no
una afirmación de que una solicitud pendiente haya cursado el nivel. Las lecturas
muestran su estado. La matrícula activa abarca el nivel completo, nunca un mes.

Permisos, errores y auditoría reutilizan los servicios comunes. El dominio de
disponibilidad y numeración es independiente de HTTP. Pruebas reales de PostgreSQL
cubren decisiones concurrentes, rollback, prerrequisitos y repetición sin alterar
asistencias/notas previas. Detalle operativo: [B08](../B08-matriculas.md).
