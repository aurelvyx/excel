# ADR-006 — Sesiones explícitas y programación atómica

Fecha: 5 de octubre de 2026. Historia B11; RF28, CU10 y RN27.

## Contexto

La asistencia futura requiere fechas reales de clase por grupo. El modelo de datos
y la tabla creada en B06 ya definen sesiones con fecha, horas opcionales, estado,
creador y unicidad por grupo/fecha. CU10 exige validar el periodo, confirmar la
programación y permitir una o varias fechas. No define recurrencias automáticas.

## Decisión

Reutilizar `sesiones_clase` y exponerla mediante el módulo `asistencia`. Registrar
fechas explícitas en lotes atómicos de hasta 100, con horario común opcional.
Crear un evento de auditoría por sesión en la misma transacción. El límite de lote
es técnico y no modifica el número de clases establecido por el centro.

Mantener la política de calendario, rango inclusivo del periodo y horario en una
función de dominio independiente de HTTP. Validar forma y tamaño mediante DTO.
La API revalida permisos y asignación; el frontend usa `puedeProgramar` para reflejar
la autorización. Compartir el alcance docente con la consulta de oferta académica.

Las sesiones nacen `PROGRAMADA`. La preparación de un grupo `PLANIFICADO` es posible
sin activarlo. La programación se bloquea cuando grupo o periodo está `CERRADO`.
El cierre específico de asistencia continúa en B15; B11 no crea un cierre ficticio.

Añadir una migración incremental que valide fechas en PostgreSQL y conserve esa
integridad cuando cambian los límites del periodo o el periodo del grupo. Rechazar
datos anteriores incompatibles antes de instalar los triggers; no reescribirlos.
Conservar las claves y triggers de historial existentes.

## Consecuencias

Una solicitud duplicada o una auditoría fallida no deja sesiones parciales.
El frontend permite revisar todo el lote antes de confirmarlo y conserva la captura
al recibir errores. No se necesitan nuevas dependencias, entidades ORM, colas ni
infraestructura. El cursor por ID conserva la convención de paginación existente.

Programar una fecha no afirma que la clase ocurrió. El denominador computable y
la condición de asistencia se definirán y probarán en B13 con el intento concreto;
las marcas y transiciones a clase realizada corresponden a B12. La cancelación,
reprogramación o corrección de sesiones no se añade como una operación no prevista
en B11. Debe conservar evidencia y coordinarse con asistencia y cierres cuando se
incorpore al alcance.

## Referencias consultadas

- [NestJS: ValidationPipe y DTO](https://docs.nestjs.com/techniques/validation).
- [TypeORM: configuración de migraciones](https://typeorm.io/docs/migrations/setup/).
- [PostgreSQL: bloqueos explícitos](https://www.postgresql.org/docs/current/explicit-locking.html).
- Versiones instaladas: NestJS 12, TypeORM 1.1.1, React 19; PostgreSQL de
  `infra/compose.test.yaml`. Los contratos y mecanismos empleados se conservan
  de las entregas anteriores.
