# ADR-003: oferta académica y docentes (B04)

Fecha: 2026-09-25. Estado: decisiones técnicas implementadas; pendientes de revisión
del equipo. Alcance: RF06–RF12 y RF18. No cambian las reglas de notas o matrícula.

## Decisiones

- Mantener el monolito NestJS y las tablas de B02. Los módulos `oferta-academica` y
  `personas` exponen controladores REST y servicios transaccionales. La identidad
  docente reutiliza `personas`; no duplica perfiles cuando ya existe el documento.
- Usar el DataSource/EntityManager de TypeORM con SQL parametrizado, igual que B03.
  La lista de tablas y columnas estática es la única fuente de identificadores SQL.
  No se agregan entidades ORM al frontend ni se añade otra librería de persistencia.
- Reutilizar control de sesión/roles, Origin y CSRF de B03. Revalidar permisos dentro
  de la transacción, compartiendo el bloqueo de administración de usuarios; aplicar
  el alcance docente en la consulta antes de paginar. El bloqueo serializa estas
  operaciones administrativas; revisar su granularidad si la carga lo exige.
- Conservar filas y auditar cada escritura en la misma transacción. Inactivar un
  docente no inactiva su persona, porque puede tener otros roles. El usuario debe
  estar vinculado a esa persona para obtener acceso docente a sus grupos.
- Mantener inmutables el idioma del nivel, el nivel de la unidad y el contexto
  periodo/nivel/turno/sección de un grupo. Es una **decisión técnica preventiva**
  para evitar reinterpretar historial: crear otro registro para otro contexto.
  Se permite corregir nombres, códigos, horarios y datos no identificadores con
  motivo. B04 no sustituye las versiones de reglas académicas por matrícula.
- Para referencias nuevas o reactivación, exigir catálogos activos; para activar
  un grupo, exigir periodo ABIERTO. Es una **política de disponibilidad propuesta**,
  no una regla académica oficial nueva. Un grupo puede prepararse PLANIFICADO en un
  periodo PLANIFICADO. Las referencias históricas siguen consultables al inactivar.
  CERRADO en el catálogo no equivale al cierre de actas ni autoriza a editarlas;
  esos permisos y transiciones se integrarán en las historias correspondientes.
- No exigir que matrícula y clases compartan intervalo: solo validar inicio ≤ fin
  en cada par, conforme al modelo. No inventar códigos, pesos, capacidad ni una
  restricción de un único docente titular. La capacidad es opcional.
- No exponer cambio de documento/identidad en PATCH docente. Diseñar por separado
  una corrección de identidad que preserve referencias si el centro la requiere.

## Contratos y comprobación

Los DTO validan campos y rechazan propiedades desconocidas; las restricciones
PostgreSQL verifican también unicidad, fechas y prerrequisitos. Los créditos usan
texto decimal y NUMERIC(4,1); los BIGINT usan cadenas para conservar precisión.
OpenAPI describe los cuerpos, filtros y respuestas. No existe migración nueva.

La suite B04 recorre por HTTP el almacenamiento real y verifica permisos,
inactivación, múltiples docentes, concurrencia, errores y rollback de auditoría.
Se conservan las suites B01–B03. Guía: [B04](../B04-oferta-y-docentes.md).

Se consultó la documentación aplicable a NestJS 12 y TypeORM 1.1.1 instalados:
[validación NestJS](https://docs.nestjs.com/techniques/validation),
[tipos parciales OpenAPI](https://docs.nestjs.com/openapi/mapped-types) y
[API de repositorio TypeORM](https://typeorm.io/docs/working-with-entity-manager/repository-api/).
Las pruebas verifican explícitamente PATCH parcial con null y el retorno de SQL
de la versión instalada. UPDATE usa una CTE con SELECT para obtener filas de forma
consistente, sin confundirlas con el contador de filas afectadas del driver.
