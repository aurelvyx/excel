# ADR-009 — Expediente de justificación y recuperación por asistencia

Fecha: 7 de octubre de 2026. Estado: decisión técnica implementada para B14.
Trazabilidad: RF33–RF35, CU12, UI07, RN15–RN18 y RN20; RN19 parcial hasta
el cierre de B15. Integración con B12/B13.

## Contexto

B12 conserva las marcas originales y B13 calcula asistencia por intento. El modelo
de datos relaciona una única justificación con una asistencia J. Secretaría
registra y resuelve solicitudes; docente asignado o administrador confirma su
recuperación. Hace falta conservar cada decisión y actualizar su incidencia sin
reescribir la marca ni resultados académicos históricos.

## Decisión

1. Añadir una tabla `justificaciones` con relación única a asistencia, motivo,
   fecha de presentación, estado, versión y usuario/fecha de registro, resolución
   y recuperación. No migrar automáticamente las J existentes a solicitudes.
2. Permitir únicamente `PENDIENTE → APROBADA|RECHAZADA` y
   `APROBADA → RECUPERADA|NO_RECUPERADA`. No permitir editar la solicitud ni reabrir
   decisiones finales en este flujo. Conservar la aprobación original al recuperar.
3. Registrar fecha de presentación explícita y marcas de tiempo del servidor para
   decisiones. Validar fecha real, entre clase y hoy en America/Lima. Esto controla
   cronología; no crea un plazo institucional. Exigir observación al resolver;
   la observación de recuperación es opcional. Longitudes: motivo 500, observación
   300, siguiendo el diccionario y las convenciones existentes.
4. Crear solicitudes solo sobre J. Secretaría no convierte F en J: esa edición
   sigue en la matriz, a cargo del docente asignado mientras esté abierta. Una vez
   registrado el expediente, conservar J y permitir únicamente corregir su
   observación de asistencia con las reglas de B12.
5. Proteger el vínculo en BD mediante `UNIQUE(id,codigo)` en asistencias y una FK
   compuesta desde `(asistencia_id,codigo_asistencia)` con código interno constante
   J. Un trigger ofrece error explícito al intentar sustituir una J con expediente;
   la FK mantiene la integridad incluso si otra transacción comenzó antes de ver
   el expediente. No confiar en un CHECK que consulte otra tabla ni solo en React.
6. Mantener el dominio puro de transiciones, versiones, fechas y contexto separado
   de HTTP. Reutilizar autorización, alcance de grupos, contexto académico,
   auditoría y cálculo de B13. Compartir resolución y recuperación en una operación
   interna, conservando sus permisos, DTO y rutas distintos.
7. Resolver cada mutación en una transacción: revalidar sesión/roles/asignación,
   bloquear el contexto necesario y asistencia, releer el expediente después de
   bloquearlo, verificar versión/estado, escribir decisión, auditoría y calcular
   resumen. No escribir resultados académicos como efecto de una consulta.
8. Calcular J recuperada como cero faltas, rechazada/no recuperada como falta;
   J sin solicitud/pendiente/aprobada con recuperación pendiente permanece
   provisional. Mantener la regla de más de 30 %, el denominador y `parametro_id`
   del intento. Cierre de asistencia específico y tratamiento final de aprobadas
   sin recuperación se integran en B15; no inferirlo del estado de grupo o matrícula.
9. Exponer el flujo bajo `/api/v1/asistencia/grupos/:grupoId/justificaciones`.
   Paginar todas las J por asistencia_id con búsqueda y estado, mostrar permisos
   calculados por API y proyectar un historial limitado de auditoría. Conservar
   motivos en esta pantalla sin agregarlos a los listados generales de estudiantes.
10. Reutilizar `FormDialog` para los tres formularios con revisión, borrador,
    conflictos y envío, además de `TextAreaField`, `GroupContext`, `DataTable` y
    `AttendanceSummary`. No duplicar reglas académicas en el frontend. Ante 409
    conservar la captura y exigir recarga explícita. Si falla la consulta posterior
    a un guardado exitoso, ocultar métricas antiguas hasta actualizar.

## Consecuencias

La asistencia conserva una fuente persistida y una sola fórmula de cálculo. La
recuperación actualiza el resumen del intento sin alterar las otras matrículas ni
los resultados almacenados. La base impide expedientes huérfanos o sin marca J,
transiciones inválidas y borrado de decisiones; la reversión rechaza datos presentes.

Se mantiene el monolito modular, REST y las dependencias instaladas. El código J
constante de la FK es un detalle interno, no un campo de formulario o contrato.
Las correcciones excepcionales posteriores se definirán con motivo y auditoría en
B15; no se habilita aquí una vía de modificación silenciosa de evidencia.

## Referencias y comprobación

La integridad referencial y la limitación de CHECK a la fila propia se basan en
[restricciones de PostgreSQL 18](https://www.postgresql.org/docs/18/ddl-constraints.html).
Los triggers siguen la documentación de
[PL/pgSQL](https://www.postgresql.org/docs/18/plpgsql-trigger.html).
La entrada HTTP conserva la
[validación de NestJS](https://docs.nestjs.com/techniques/validation) y los
decoradores/guards existentes del repositorio.

Política: transiciones, versiones, cronología y contextos de solo lectura.
API/BD: permisos reales, roles combinados, concurrencia, rollback, incidencia por
intento, SQL directo e historial inmutable. Navegador: registro, resolución,
recuperación, filtros, consulta, conflictos, captura y matriz con J protegida.
Ejecuciones y límites: [B14](../B14-justificaciones.md).
