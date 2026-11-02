# ADR-004: estudiantes e historial B06

Fecha: 2026-09-27. Estado: implementación técnica; pendiente revisión del equipo.

## Contexto y trazabilidad

Sprint 2, B06, RF14–RF17, CU05–CU06, UI03 del plan, catálogo, modelo de datos y
prototipos. Personas y estudiantes existen desde B02. RF17 necesita consultar
matrículas, asistencias, notas y resultados persistidos; sus flujos de escritura
pertenecen a historias posteriores. Un historial vacío fijo no cubre ese requisito.

## Decisión técnica

- Mantener identidad compartida: un estudiante por persona y documento único
  por tipo/número. Se permite vincular una persona docente existente. Se recortan
  espacios exteriores del documento y código al registrar estudiante; no se
  impone catálogo de documentos, longitud de DNI ni conversión de mayúsculas no
  acordados. Los registros anteriores no se reescriben.
- Código de estudiante introducido por el operador, sin generador institucional
  supuesto. Documento, código y fecha de alta no se cambian desde esta pantalla.
  Nombres y contactos pueden corregirse con motivo y auditoría transaccional.
  Es una identidad compartida: corregirla también afecta su perfil docente.
- Administrador y secretaría registran/modifican; coordinación consulta identidad
  e historial, sin dirección, teléfono, correo ni nacimiento. Docente no accede
  al directorio general. La consulta docente de su grupo corresponde a otro flujo.
- Agregar una migración de soporte de lectura con las ocho tablas descritas por
  el modelo: vouchers, matrículas, sesiones, asistencias, evaluaciones,
  indicadores, calificaciones y resultados. No se exponen comandos para ellas.
  Las muestras se insertan únicamente en bases aisladas de pruebas.
- Matrícula conserva `parametro_id`, estudiante, nivel, grupo y número de intento.
  `nivel_id` redundante permite unicidad estudiante/nivel/intento; una FK compuesta
  garantiza que coincide con el grupo. `grupo_id` redundante en indicadores,
  asistencias y calificaciones impide cruces entre grupos con FKs compuestas.
- No eliminar físicamente esos registros; revertir la migración solo si las
  tablas nuevas están vacías. No hay cascadas destructivas. Índices cubren la
  búsqueda por estudiante/matrícula y las relaciones más consultadas.
- Importe `numeric(10,2)` positivo; nota `numeric(4,2)` entre 0 y 20; pesos
  `numeric(5,2)` sin valores por defecto. Los decimales viajan como cadenas.
  Resultado ausente y nota sin registrar permanecen pendientes, nunca cero.
  B06 no redondea ni calcula promedios, equivalencias ni resultados oficiales.
- Voucher ordinario único mediante índice parcial; se conserva el espacio de
  excepción del modelo, sin habilitar su autorización. La activación básica
  exige voucher validado del mismo estudiante y no reutilizado. La transacción
  completa de matrícula, prerrequisito, numeración y excepción auditada siguen
  pendientes de sus historias; estas tablas no prueban esas funciones.
- Lecturas de historial con instantánea consistente; filtros por nivel/periodo
  y cursor de intento. Verificación conjunta estudiante/intento evita consultar
  un historial ajeno cambiando el identificador de la URL.

## Límites y consecuencias

La persistencia anticipada es necesaria para demostrar RF17 con datos reales de
PostgreSQL. Habrá migraciones adicionales para justificaciones, cierre y reglas
aprobadas al implementar sus historias. La tabla de resultados admite valores
provisionales; B06 distingue confirmados de provisionales y no tiene una acción
para confirmar ni emitir actas. Los pesos de la muestra son sintéticos.

No se ha aprobado un formato institucional de código de matrícula ni fórmula de
evaluación; no se generan valores oficiales ni se habilitan pagos, importaciones
o exportaciones. La ausencia de matrículas en una base nueva es un estado válido:
las futuras historias alimentarán el historial mediante sus propios flujos.

Referencias técnicas: [migraciones TypeORM](https://typeorm.io/docs/migrations/setup/),
[validación NestJS](https://docs.nestjs.com/techniques/validation), APIs instaladas
en el repositorio. Sin dependencias nuevas.
