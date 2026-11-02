# B09 — Asistente de matrícula

Sprint 2, UI04 y CU07–CU09: interfaz de los flujos existentes B06–B08, vinculada
a RF14–RF24/RF27, RN01–RN10 y RN30. La API conserva las reglas oficiales.

## Preparación

Aplicar `pnpm db:migrate` antes de iniciar web/API: la octava migración agrega una
clave opcional y única para reintentar una solicitud. ADMIN y SECRETARIA tienen
acceso a **Matrículas**. La oferta y versión vigente de reglas deben estar
preparadas como se explica en [B08](B08-matriculas.md).

## Recorrido

1. **Estudiante:** buscar por documento, código o nombre y seleccionarlo, o usar
   **Registrar estudiante**. La comprobación de documento y el formulario son los
   mismos de B06. Un estudiante ya existente se selecciona sin duplicar su persona.
   La ficha del estudiante también ofrece **Matricular estudiante**.
2. **Voucher:** elegir un comprobante del estudiante o registrar número, fecha e
   importe. **Revisar voucher** abre el flujo de validación/rechazo de B07. Se
   muestran estado, importe y uso; un voucher ya vinculado no puede seleccionarse.
   **Continuar sin voucher** permite preparar una solicitud pendiente.
3. **Grupo:** elegir periodo abierto, idioma y nivel, y seleccionar un grupo
   activo. Se conserva el periodo, idioma, nivel, turno, sección y grupo en el
   contexto visible. El servidor revalida plazo, vacante, prerrequisito y duplicado.
4. **Confirmación:** revisar el resumen y marcar la aceptación explícita antes de
   **Confirmar matrícula** con un voucher validado. Sin validación, la acción es
   **Guardar solicitud pendiente**. No se activa ni se asigna retiro por inasistencia.

**Anterior** conserva selecciones y filtros. Cambiar estudiante limpia voucher y
grupo; cambiar filtros del grupo limpia una selección incompatible. Los formularios
conservan campos ante errores de API. Un duplicado muestra el conflicto y permite
corregirlo. Guardar deshabilita acciones repetidas mientras se procesa.
Tras una activación exitosa, **Nueva matrícula** inicia otro borrador limpio.

Una solicitud persistida conserva estudiante, grupo, intento, código y versión.
Si falla su activación, puede reintentarse con el mismo id. **Retomar solicitud**
en el historial abre `#/matriculas/:id`, incluso tras recargar la página. Se revisa
el voucher para continuar. Una matrícula ya activada se muestra en modo consulta.

Los datos del borrador se mantienen en memoria mientras se usan los pasos; no se
guardan datos personales en localStorage. Un borrador aún no persistido se pierde
al abandonar/recargar la página. Las solicitudes guardadas se recuperan del servidor.

## Contrato y reintentos

B09 usa las rutas de estudiantes, vouchers y oferta existentes. Añade a
`POST /api/v1/matriculas` el campo opcional `claveSolicitud` (UUID v4). El asistente
reutiliza la clave al reintentar el alta tras un error de conexión.

- La misma clave con el mismo actor, estudiante y grupo devuelve la misma
  matrícula, sin incrementar intento ni repetir la auditoría CREATE.
- Reutilizar la clave con otros datos o actor devuelve 409. El índice UNIQUE y
  la transacción protegen altas concurrentes. La clave persistida es inmutable.
- Si se pierde la respuesta de activación, el asistente consulta el id. Solo
  confirma éxito si la API devuelve ACTIVA y el mismo voucher solicitado.
- El campo es opcional para mantener los contratos B08 existentes. Los códigos y
  matrículas anteriores no se modifican; la columna histórica comienza en null.

La migración puede revertirse en base vacía; con matrículas persistidas se bloquea
la reversión para conservar las garantías de reintento e historial.

## Reutilización y pruebas

`StudentSearch` funciona en el asistente y dentro de `StudentPicker`.
`RegisterStudent`, `VoucherForm` y `VoucherDetail` comparten altas y decisiones con
sus pantallas originales. La conversión de persona de detalle a fila de selección
se centraliza en `features/persons/student.ts`. Se reutilizan botones, campos,
tablas, diálogos, paginación y estados de carga/error existentes, sin dependencias nuevas.

Ejecutar `pnpm check` y `pnpm test:db`. Las pruebas B09 usan Chromium con API real
y PostgreSQL temporal: alta completa, navegación entre pasos, móvil, pendiente y
recuperación desde historial, prerrequisito, duplicado de voucher, activación fallida,
respuestas de alta/activación perdidas y permisos. Las capturas sintéticas se guardan
en `.tmp/b09/`, sin versionarse.

Verificación del 30 de septiembre de 2026: `pnpm check` pasó lint, tipos,
compilación y 46 pruebas; `pnpm test:db` pasó 117 pruebas, incluidas ocho nuevas
de navegador del asistente. Total: 163 pruebas. Se revisaron las capturas de
escritorio y móvil y la migración desde una base limpia. No se aplicó la
migración a la base local de desarrollo ni a datos institucionales.

La anulación RF25, listado general RF26 y excepciones de voucher siguen fuera de
esta entrega. B09 cubre consulta individual y recuperación de solicitudes; no afirma
la cobertura completa de CU09. La revisión por otra persona y aceptación del centro
siguen pendientes. No se realizaron mediciones institucionales ni un piloto B10.
