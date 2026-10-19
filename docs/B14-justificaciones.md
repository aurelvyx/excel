# B14 — Justificaciones y recuperación

Sprint 3. Trazabilidad: **B14, RF33–RF35, CU12, UI07, RN15–RN18 y RN20**;
**RN19 durante el registro abierto**, con tratamiento del cierre en
[B15](B15-cierre-asistencia.md).
Integra el recálculo de RF30–RF32/B13 y la conservación del historial de B12.
Fuentes consultadas: `AGENTS.md` y los seis documentos DOCX de requisitos,
casos de uso, modelo, arquitectura, prototipos y backlog del repositorio.

## Comportamiento

Una justificación se asocia a una asistencia **J existente**, una sola vez.
Secretaría o administración registra el motivo y la fecha de presentación.
No convierte una F en J ni modifica las marcas del docente. La lista distingue
**Sin solicitud** de **Pendiente**, y conserva visibles los intentos históricos.

| Estado actual   | Acción                               | Rol autorizado                  | Estado nuevo               |
| --------------- | ------------------------------------ | ------------------------------- | -------------------------- |
| J sin solicitud | Registrar motivo y fecha             | Secretaría, administrador       | PENDIENTE                  |
| PENDIENTE       | Aprobar o rechazar con observación   | Secretaría, administrador       | APROBADA o RECHAZADA       |
| APROBADA        | Confirmar si cumplió la recuperación | Docente asignado, administrador | RECUPERADA o NO_RECUPERADA |

El servidor registra usuario y fecha de cada paso. La recuperación permite una
observación opcional. Rechazada, recuperada y no recuperada son decisiones finales
de este flujo: se consultan, pero no se reabren ni se borran. Cada paso conserva
la solicitud y las decisiones anteriores, con versión e historial auditable.

El registro ordinario exige grupo y periodo abiertos, matrícula activa y sesión
realizada no futura. Los demás casos se muestran en consulta con su motivo.
El cierre específico implementado en [B15](B15-cierre-asistencia.md) bloquea la
gestión ordinaria de expedientes. La fecha de presentación
debe estar entre la clase y el día actual del servidor en **America/Lima**; se
valida la cronología, sin inventar un plazo institucional de presentación.

| Situación de J                      | Efecto en asistencia del intento       |
| ----------------------------------- | -------------------------------------- |
| Sin solicitud, PENDIENTE o APROBADA | Falta provisional; condición pendiente |
| RECUPERADA                          | No computa como falta                  |
| RECHAZADA o NO_RECUPERADA           | Computa como falta                     |

La API reutiliza el cálculo exacto de B13 y las reglas asociadas a cada matrícula.
Por ejemplo, **3 F + 1 J + 6 P** muestran 40,00 % provisional; al recuperar J,
quedan 3 faltas y **30,00 %, dentro del límite**. Aprobarla sin confirmar su
recuperación no la descuenta. Las marcas originales y los otros intentos se
conservan. Este resumen actual no sobrescribe resultados académicos almacenados
ni produce notas, actas o una condición académica combinada de B18.

## Uso

1. En **Grupos/Mis grupos**, abrir **Justificaciones**. También hay acceso desde
   **Sesiones** y desde una marca J en la matriz de asistencia.
2. Buscar por estudiante, documento o código de matrícula, y filtrar por estado.
   El contexto de idioma, nivel, periodo, turno, sección y grupo permanece visible.
3. Como Secretaría/administrador, abrir **Registrar justificación**, indicar motivo
   y fecha, revisar los datos y confirmar. Después, usar **Resolver justificación**
   para aprobar o rechazar con observación.
4. Como docente asignado/administrador, abrir una aprobada y **Confirmar
   recuperación**. Elegir recuperada o no recuperada, revisar y confirmar.
5. **Ver detalle** muestra responsables, fechas, observaciones, resumen actual e
   **historial de decisiones**. Coordinación consulta; no resuelve ni recupera.

La API comprueba permisos y asignación en cada petición; los botones reflejan
las capacidades recibidas. Un docente con otro rol de consulta no adquiere por
ello permiso de recuperación de grupos ajenos. En la matriz, J con expediente
mantiene su marca, incluida la acción masiva **Marcar presentes**; su observación
de asistencia sigue editable bajo los permisos normales de B12.

Los formularios conservan la captura ante errores y conflictos 409. La recarga
es explícita y requiere descartar el borrador si existe. Se protegen cierre del
diálogo, navegación y salida de sesión con cambios pendientes. Después de guardar
se refresca la página completa; si esa consulta falla, se conserva lo guardado,
se ocultan las métricas desactualizadas y se bloquean nuevas decisiones hasta
recargar. No se presentan cifras anteriores como vigentes.

## Contrato REST

OpenAPI: `/api/docs` y `/api/openapi.json`, versión técnica **0.14.0**.
Base: `/api/v1/asistencia/grupos/{grupoId}/justificaciones`.

| Método y ruta              | Datos de entrada                                                     | Respuesta                         |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| GET base                   | `q`, `estado`, `after`, `limit` (máximo 100)                         | `{items, nextCursor, grupo, hoy}` |
| GET `/{id}`                | Identificador de justificación                                       | Fila e `historial` de decisiones  |
| POST base                  | `asistenciaId`, `asistenciaVersion`, `motivo`, `fechaPresentacion`   | 201, fila actualizada             |
| PATCH `/{id}/resolucion`   | `version`, `estado` APROBADA/RECHAZADA, `observacion`                | 200, fila actualizada             |
| PATCH `/{id}/recuperacion` | `version`, `estado` RECUPERADA/NO_RECUPERADA, `observacion` opcional | 200, fila actualizada             |

El cursor corresponde al **asistencia_id**, no al identificador de expediente;
incluye las J sin solicitud. Los estados de filtro son `SIN_SOLICITUD` y los cinco
estados del expediente. La búsqueda trata `%` y `_` como texto literal.

Cada fila contiene sesión, estudiante, matrícula e intento, la `justificacion`
o null, capacidades `puedeRegistrar`, `puedeResolver`,
`puedeConfirmarRecuperacion`, `motivoSoloLectura` y `resumenAsistencia` de B13.
Los identificadores bigint viajan como texto; las versiones son enteros.
Motivo: obligatorio, máximo 500 caracteres. Observación de resolución:
obligatoria, máximo 300. Observación de recuperación: opcional, máximo 300.
La fecha tiene formato estricto `YYYY-MM-DD` y debe ser una fecha válida.

Versión desactualizada, duplicado, transición inválida o registro de solo lectura
producen 409 sin escritura parcial. La API distingue además datos inválidos (400),
sesión ausente (401), permiso insuficiente (403) y registro fuera del grupo (404).
El detalle de asistencia en el historial del estudiante y la matriz incorporan
`justificacionId` y `justificacionEstado`, sin exponer allí motivos u observaciones.

## Persistencia y refactorización

La migración **`1790208010000-justificaciones.ts`** añade `justificaciones`, una
fila por asistencia, responsables, fechas y versión. Una clave foránea compuesta
exige que la asistencia conserve J incluso ante escrituras concurrentes. Las
restricciones y triggers protegen fechas, estados, versiones, origen y decisiones;
impiden eliminar el historial. La reversión rechaza expedientes existentes.
No se crea automáticamente una solicitud para las J anteriores.

Solicitud, resolución/recuperación, auditoría y cálculo de la respuesta comparten
una transacción. Se revalidan roles, asignación y contexto; se bloquean sesión,
matrícula, asistencia y expediente según la operación. Un fallo de auditoría o
cálculo revierte toda la decisión. El historial público proyecta acciones,
responsables, fechas, estados y motivo; no expone IP ni snapshots completos.

Archivos principales:

- API: `justifications.controller.ts`, `justifications.dto.ts`,
  `justifications.schema.ts`, `justifications.service.ts` y `justification.policy.ts`
  en `apps/api/src/modules/asistencia/`; módulo y OpenAPI actualizados.
- Dominio: política pura compartida de estados, transiciones, versiones y fechas;
  cálculo agregado de `attendance-calculation.service.ts` reutilizado por matriz,
  justificaciones e historial, sin una segunda fórmula en React.
- Integración: `attendance.service.ts` protege J con expediente y los contratos
  de asistencia/historial incluyen su estado.
- Web: `JustificationsPage.tsx`, `JustificationDialog.tsx` y
  `justification-model.ts`, enlaces desde grupos/sesiones/matriz y estado en historial.
- Reutilización: `shared/FormDialog.tsx` centraliza revisión, envío, conflictos y
  protección del borrador en los tres formularios; `TextAreaField` conserva las
  convenciones accesibles de campos, y se reutilizan tablas, contexto y resúmenes.
- Pruebas: `justification.policy.spec.ts`, `justifications.integration-spec.ts` y
  `justifications-web.integration-spec.ts`; pruebas de esquema y fixture actualizadas.
- `README.md`, esta guía, ADR-009 y workflow B01–B14 documentan alcance y evidencias.

No se añaden dependencias.

## Verificación y puesta en uso local

Desde la raíz:

```sh
pnpm check
pnpm test:db
```

`test:db` usa PostgreSQL temporal y datos sintéticos; aplica las once migraciones
desde cero, revierte y reaplica. No modifica el volumen de desarrollo.
Informe: `.tmp/verificacion/pruebas.json`; capturas: `.tmp/b14/`.

Verificación local finalizada el **7 de octubre de 2026**:

- `pnpm check`: lint, tipos y compilación correctos; **142 pruebas unitarias**,
  **3 de contrato HTTP sin base** y **14 de herramientas** aprobadas.
- `pnpm test:db`: **270 pruebas aprobadas en 17 suites**, con las once migraciones
  aplicadas desde cero, revertidas y reaplicadas. Incluye **44 casos API/BD de B14**
  y **9 recorridos de navegador de B14**.
- **429 pruebas en total**, sin sumar ejecuciones repetidas; **93 nuevas de B14**:
  40 de política, 44 API/BD y 9 de navegador.
- Verificados permisos y asignación revocados, roles combinados, duplicados y
  decisiones concurrentes, rollback ante fallo de auditoría/cálculo, fechas,
  versiones, estados de solo lectura, restricciones SQL, preservación de J,
  intentos, reglas versionadas y resultados académicos almacenados.
- Verificados por navegador registro/resolución/recuperación, ejemplo 40 % → 30 %,
  responsables e historial, filtros y paginación 20/21, captura conservada ante 409,
  descarte explícito y fallo de consulta posterior al guardado con recarga.
- Capturas sintéticas de contexto, historial, conflicto y móvil revisadas
  visualmente; comprobado que la página móvil no desborda su ancho.
- Revisión técnica independiente por otros agentes de API, migración, políticas,
  permisos, interfaz y documentación. `git diff --check` sin errores de espacios.

No se modificó la base de desarrollo. El contenedor y la red temporales se
eliminaron al terminar. La demostración se reproduce con los comandos anteriores;
sus datos son sintéticos.

Para utilizar B14 en la base local existente, aplicar la migración antes de
iniciar la aplicación:

```sh
pnpm db:migrate
```

## Límites y pendientes

[B15](B15-cierre-asistencia.md) incorpora el cierre específico y la corrección
administrativa de marcas. `cierreConfirmado` es true únicamente cuando existe
ese evento; no se interpreta un grupo cerrado como evidencia de cierre de
asistencia. Las J sin recuperación confirmada computan como falta al cierre,
conforme a RN19, conservando sus estados. B14 las muestra provisionales mientras
el registro está abierto. La corrección B15 no sustituye decisiones del expediente.
Las evidencias originales fechadas de B14 y ADR-009 se conservan.

La revisión y aceptación de una persona del equipo y el piloto institucional
siguen pendientes. Las pruebas locales no constituyen evidencia institucional
ni una ejecución remota de GitHub Actions.

Decisiones técnicas: [ADR-009](decisiones/ADR-009-justificaciones.md).
