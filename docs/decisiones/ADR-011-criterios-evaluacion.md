# ADR-011 — Versiones de criterios y aplicación por grupo

Fecha: 13 de octubre de 2026. Estado: decisión implementada y verificada
técnicamente en B16; criterios institucionales concretos y aceptación humana
pendientes.
Trazabilidad: RF38/CU14, RN23, RN27, RN31 y RN34; preparación de cierre para B18.

## Contexto y decisión

El diccionario fija evaluaciones por grupo y pesos por evaluación e indicador.
El backlog exige aprobación por nivel y prohíbe cerrar con criterios/notas
incompletos. Los pesos ilustrativos no son política oficial, y una actualización
de nivel no debe alterar el historial de intentos.

1. Guardar versiones por nivel, con borrador editable y aprobación inmutable.
   Permitir captura incompleta en borrador; exigir entradas presentes válidas.
   Porcentajes como texto decimal, normalizados y sumados en puntos base enteros.
2. Soportar `PONDERADA_JERARQUICA_V1`: indicadores dentro de evaluación y
   evaluaciones dentro del nivel. Selección explícita y aprobación con referencia
   escrita, responsable, fecha y confirmación. No precargar criterios académicos.
3. Aprobar únicamente un árbol completo con sumas exactas 100.00 % en ambos
   ámbitos. Revisión optimista para edición/aprobación; nueva versión para cambios.
4. Aplicación única e inmutable por grupo mediante tabla de referencia y copia a
   las evaluaciones/indicadores existentes. FK compuesta garantiza mismo nivel.
   No sustituir ni inactivar criterios aplicados para sortear su unicidad.
5. Conservar registros anteriores sin aprobación automática. Si el grupo tiene
   criterios o resultados, su reconciliación requiere otro flujo autorizado.
6. ADMIN define y registra aprobación. Docente autorizado por asignación aplica
   únicamente versiones aprobadas a su grupo. Consulta por alcance de cada rol.
7. Validar unidades del nivel y disponibilidad al guardar, aprobar y aplicar;
   conservar consulta histórica si se inactivan después. Grupo/periodo/acta
   cerrado bloquea aplicación; cierre de asistencia no la bloquea.
8. Contexto transaccional local permite la copia inicial; validación diferida al
   commit exige correspondencia exacta y evita copias parciales. Nueva versión
   MVCC del grupo y de las unidades vinculadas protege snapshots anteriores.
   Los bloqueos de unidades siguen el orden de ID en API y BD para evitar
   promociones concurrentes de bloqueo. No editar criterios aplicados.
9. Auditar CREATE/UPDATE/APPROVE_EVALUATION_PLAN y APPLY_EVALUATION_PLAN dentro
   de cada transacción. Un fallo de auditoría o lectura revierte toda la operación.
10. Preparación reutilizable por B18: configuración aprobada, matrículas e
    indicadores y registros completos de notas. Distinguir cero de pendiente.
    No cerrar actas, emitir resultados ni permitir edición de notas en B16.
11. Reutilizar componentes, formularios, guardias y mensajes, sin fórmula oficial
    autónoma en React. Ante 409 conservar captura y exigir recarga explícita.

## Consecuencias

Los grupos conservan una versión estable aunque se publique otra para el nivel.
La aplicación única evita sobrescribir criterios históricos; una rectificación
posterior necesita su propio flujo. La referencia registra la declaración
administrativa; la conformidad institucional real se valida con el centro.

Se mantiene el monolito modular, REST, TypeORM y PostgreSQL, sin dependencias
nuevas. JSONB versiona plantillas y no reemplaza las filas relacionales del grupo.

## Referencias y comprobación

La protección diferida sigue [triggers de PostgreSQL 18](https://www.postgresql.org/docs/18/sql-createtrigger.html).
Los DTO conservan la [validación de NestJS](https://docs.nestjs.com/techniques/validation)
y las mutaciones utilizan solo el gestor de la transacción de TypeORM.
Política, API/BD y navegador comprueban porcentajes, permisos, revisiones,
concurrencia, rollback y conservación histórica. Resultados y límites:
[B16](../B16-criterios-evaluacion.md).
