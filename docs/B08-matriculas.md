# B08 — Matrícula transaccional

Implementación del sprint 2: RF21–RF24 y RF27, CU08, RN03, RN06–RN10 y RN30.
El asistente visual de estudiante → voucher → grupo → confirmación corresponde a
B09. Esta entrega habilita la API real y alimenta el historial existente de B06.

## Preparación y uso

Aplicar `pnpm db:migrate`: la séptima migración amplía el código a 50 caracteres
y protege su identidad y origen. No renumera registros históricos ni habilita
excepciones de voucher. ADMIN y SECRETARIA pueden usar estas rutas con sesión,
Origin y CSRF para escrituras. Swagger: `/api/docs`.

La oferta debe tener periodo abierto, plazo vigente y grupo activo, y existir una
versión vigente en `parametros_academicos`. Para una demostración local, la carga
opcional `pnpm db:seed:demo` de B02 aporta una versión y oferta sintéticas (requiere
`ALLOW_DEMO_SEED=true`); abrir periodo/grupo y ajustar fechas mediante B04. No usar
esa carga como configuración institucional. El mantenimiento administrativo de
versiones de reglas no se añade en B08; su ausencia produce un conflicto explícito.

1. `POST /api/v1/matriculas` con `{"estudianteId":"1","grupoId":"2"}` crea una
   solicitud `PENDIENTE`. Devuelve id, código, intento, versión de reglas y contexto
   de periodo, idioma, nivel, turno, sección y grupo. No reserva vacante ni voucher.
2. Registrar y validar el voucher mediante B07. La solicitud puede existir sin
   voucher, pero no es una matrícula activa ni produce una condición de retiro.
3. `PATCH /api/v1/matriculas/:id/activar` con
   `{"voucherId":"3","confirmado":true}` confirma la activación. Si cualquier
   validación o auditoría falla, la solicitud sigue pendiente y el voucher no se usa.
4. `GET /api/v1/matriculas/:id` devuelve el detalle a administración y secretaría.
   La consulta del historial mantiene sus permisos previos. No se amplían permisos
   del docente ni se implementa el listado general RF26 o la anulación RF25.

Los ids del ejemplo son ilustrativos; usar los ids reales devueltos por la API.
Errores: 400 para DTO/confirmación inválidos, 401 sin sesión, 403 sin permiso,
404 para recursos ausentes y 409 para conflictos de negocio.

## Reglas verificadas

- Estudiante y persona activos; grupo ACTIVO y periodo ABIERTO; idioma, nivel,
  turno y sección activos. La fecha local de Cusco (`America/Lima`) debe estar
  dentro del plazo de matrícula, incluidos ambos extremos.
- Si hay capacidad, las matrículas ACTIVA/CERRADA ocupan vacante. Las pendientes
  no la reservan. La disponibilidad se verifica nuevamente al activar.
- El prerrequisito requiere un resultado APROBADO confirmado de una matrícula
  CERRADA del mismo estudiante y nivel previo. Un resultado provisional no basta.
  B08 consulta resultados persistidos; no implementa cierres ni inventa notas.
- Solo un voucher VALIDADO del mismo estudiante, sin vínculo previo a otra
  matrícula, permite activar. Se conserva el uso único también en PostgreSQL.
- No hay dos matrículas activas para el mismo estudiante y grupo/periodo.
  El intento se asigna como máximo histórico del estudiante/nivel más uno;
  incluye solicitudes pendientes y anuladas para no reutilizar identidades.
- La versión de parámetros se fija al crear la solicitud y no cambia al activar.
  Se elige la vigente con fecha de inicio más reciente, con versión como desempate.
  Si no hay una vigente, se bloquea la solicitud. No se inventa una fórmula de notas.
- Alta y activación tienen auditoría en su misma transacción, con actor y datos
  antes/después. Bloqueos de estudiante, grupo y voucher resuelven la concurrencia;
  las restricciones de la base siguen protegiendo duplicados e identidad del intento.

## Código basado en documento

El 29 de septiembre de 2026 el equipo indicó la base `MAT-NroDocumento`.
Para identificar distintas matrículas de una persona, se implementa
`MAT-NroDocumento-Correlativo`, por ejemplo sintético `MAT-00123456-42`.
El sufijo usa la secuencia global de matrículas, no el número de intento por nivel,
y evita colisiones incluso entre personas con distintos tipos de documento.
Preserva los ceros iniciales del documento. No se reinicia por año o periodo.

El código se asigna al crear la solicitud y se conserva al activarla. Una
transacción fallida puede dejar saltos en la secuencia; no deja una matrícula
parcial ni un voucher consumido. Los códigos históricos no se transforman.
La ampliación a 50 caracteres admite el documento de 25 caracteres y un bigint.
La reversión de B08 se rechaza si existen matrículas para conservar protecciones.

## Verificación y límites

`pnpm check` verifica lint, tipos, compilación, dominio y HTTP.
`pnpm test:db` ejecuta las migraciones en PostgreSQL temporal y prueba el recorrido
HTTP completo estudiante/voucher → solicitud → activación, permisos, concurrencia,
vacantes, prerrequisitos, rollback de auditoría y conservación del historial.
Las pruebas de navegador existentes siguen ejecutándose; B08 no agrega una pantalla.

Verificado el 29 de septiembre de 2026: `pnpm check` pasó lint, tipos, compilación
y 46 pruebas; `pnpm test:db` pasó 108 pruebas con PostgreSQL temporal, incluyendo
migraciones desde cero y reversión segura. Total: 154 pruebas. No se aplicaron
migraciones a la base local de desarrollo ni a datos institucionales.

La interfaz B09, anulación, excepciones de voucher, cierre de resultados y pesos
de evaluación quedan en sus historias o decisiones correspondientes. La revisión
de otra persona y la aceptación del centro siguen pendientes. Las pruebas usan
datos sintéticos y no representan un piloto institucional.
