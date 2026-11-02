# B15 — Cierre de asistencia y corrección administrativa

Sprint 3. Trazabilidad: **B15, RF36, CU13, RN14, RN19 y RN29**;
**RN28 parcial**, para asistencia;
**CU18/UI10 parciales**, únicamente para corrección de asistencia posterior al
cierre. Integra RF30–RF32/B12–B13, RF33–RF35/B14 y conservación de historial de RN31.
Fuentes: `AGENTS.md` y los seis documentos de requisitos, casos de uso, modelo,
arquitectura, prototipos y backlog; textos consultados en `.tmp/b15/`.

## Comportamiento y alcance

El cierre de asistencia es un evento propio del grupo. **No cierra el grupo, el
periodo, la matrícula ni el acta de notas**. Un grupo con estado `CERRADO` sin
evento de cierre no constituye evidencia de que la asistencia se cerró.

El administrador revisa el grupo completo y confirma los datos de la misma
revisión. Se conserva un único cierre de asistencia, con usuario, fecha, motivo
opcional y evidencia. No existe reapertura ni sustitución del evento en B15.

La revisión muestra sesiones computables, programadas, futuras y canceladas;
matrículas revisables; marcas faltantes y J pendientes de resolución o recuperación.
Se requiere reconocer expresamente las advertencias cuando hay sesiones
programadas/futuras, marcas o justificaciones pendientes, ninguna sesión computable
o ninguna matrícula revisable. Las canceladas se muestran como excluidas; por sí
solas no exigen ese reconocimiento. No se inventa un plazo académico para cerrar.

Cerrar con pendientes no fabrica evidencia:

- Una marca faltante sigue pendiente; no se crea una F ni una P. El resumen sigue
  `INCOMPLETO` y no determina una condición definitiva de asistencia.
- J sin solicitud, pendiente o aprobada sin recuperación confirmada computa como
  falta al cierre. La solicitud conserva su estado y sus decisiones.
- J recuperada no computa como falta; rechazada o confirmada no recuperada sí.
- Sin sesiones computables se mantiene `SIN_SESIONES`, sin dividir entre cero ni
  determinar porcentaje o condición.

Después del cierre se bloquean programación, nuevas matrículas/activaciones,
registro docente y gestión ordinaria de justificaciones. La consulta conserva el
alcance de cada rol. Solo administración dispone de la corrección separada de
asistencia, con motivo obligatorio e historial anterior/nuevo.

La corrección admite una matrícula `ACTIVA` o `CERRADA` del grupo y una sesión
`REALIZADA` incluida en el corte del cierre. Puede completar una marca faltante o
corregir una existente. Una J con expediente conserva J; su observación puede
corregirse, pero este flujo no cambia las decisiones del expediente. No corrige
sesiones programadas, canceladas o posteriores al corte, ni solicitudes pendientes
de matrícula o anuladas.

## Cálculo y evidencia del cierre

Mientras el registro está abierto, el denominador utiliza sesiones `REALIZADA`
hasta el día actual en **America/Lima**. Una vez cerrado, utiliza la fecha civil
del evento `realizado_at` en Lima, conservada como `fecha_corte`. El paso del tiempo
no incorpora sesiones futuras al cálculo cerrado. Matriz, justificaciones e
historial comparten el mismo predicado de sesiones computables.

El resumen añade `fechaCorte` y utiliza
`REALIZADAS_DEL_GRUPO_HASTA_EL_CIERRE` cuando `cierreConfirmado=true`; abierto utiliza
`REALIZADAS_DEL_GRUPO_HASTA_HOY`. Mantiene la versión académica del intento, grupos
completos de tres T, comparación exacta con 30 % y redondeo solo de presentación.

Hay tres evidencias distintas:

1. `cierre.resumen` conserva **la revisión previa aceptada**: advertencias, fecha
   de corte e indicadores por intento tal como se revisaron antes de confirmar.
2. El evento de auditoría `CLOSE_ATTENDANCE` añade `resumenesCerrados` calculados
   después de registrar el cierre, dentro de la misma transacción.
3. Una corrección posterior recalcula el resumen vigente del intento dentro de su
   transacción. Conserva tanto el cierre original como su auditoría y registra
   `CORRECT_AFTER_CLOSE` con motivo, antes, después, usuario y fecha.

El cierre y la corrección **no escriben `resultados_academicos`**, notas ni actas.
La combinación oficial de asistencia y notas, su cierre y recálculo de resultados
confirmados corresponde a B18. Las métricas históricas del resultado siguen
separadas del resumen actual de asistencia en el historial del estudiante.

## Uso de la interfaz

Ruta: `#/asistencia/grupos/{grupoId}/cierre`. Hay acceso **Cierre de asistencia**
desde grupos, sesiones y matriz, sin un menú global adicional.

1. Abrir el cierre del grupo y revisar contexto, advertencias y cada intento.
2. Administración elige **Cerrar asistencia**, indica un motivo opcional y, cuando
   corresponde, **Confirmo que revisé los pendientes y las advertencias**.
3. Elegir **Revisar cierre** y verificar la consecuencia antes de **Confirmar cierre**.
4. La consulta muestra **Asistencia cerrada**, responsable, fecha e historial.

Para corregir después del cierre, abrir una sesión computable y elegir
**Corregir asistencia** en la fila autorizada. Completar **Nueva marca**,
**Observación** opcional y **Motivo de corrección**; revisar y confirmar. El botón
**Ver historial de asistencia** muestra únicamente los valores de esa asistencia,
responsable, fecha, acción y motivo.

Ante 409 se conserva la captura y no se cambia silenciosamente la revisión ni la
versión. **Recargar cierre/asistencia** requiere confirmar el descarte del borrador.
La navegación, regreso y cierre de sesión respetan esa protección. Un guardado
exitoso conserva su mensaje y marca persistida aunque falle el GET posterior;
las métricas se ocultan como **Resumen no actualizado** hasta recargar.

## Contrato REST

OpenAPI: `/api/docs` y `/api/openapi.json`, versión técnica `0.15.0`.
Sesión HttpOnly, Origin y CSRF conservan las protecciones de acceso existentes.

### Revisión y cierre

`GET /api/v1/asistencia/grupos/{grupoId}/cierre` devuelve `grupo`, `hoy`, `cierre`
nullable, `revision`, `puedeCerrar`, `motivoSoloLectura`, `advertencias`, `items` del
grupo completo e `historial`. Solo el docente asignado puede consultar por su rol;
administración, secretaría y coordinación conservan sus permisos de lectura.

`cierre` incluye `id`, `grupo_id`, `tipo: ASISTENCIA`, `estado: CERRADO`, `motivo`,
`realizado_por`, `realizado_at`, `realizado_nombre`, `fecha_corte`, `revision` y
`resumen`. `grupo.cierre_asistencia` expone ese evento y `asistencia_cerrada` refleja
su existencia, independientemente del estado del grupo o periodo.

`POST` en la misma ruta, exclusivo de administración, devuelve la misma vista
recalculada con HTTP 201:

```json
{
  "revision": "<revision de 64 caracteres recibida en GET>",
  "motivo": "Revisión de asistencia del grupo",
  "confirmarPendientes": true
}
```

`revision` es un token SHA-256 de los datos revisados, no un resultado académico.
`motivo` es opcional, nullable y admite hasta 400 caracteres. `confirmarPendientes`
es booleano obligatorio; debe ser true cuando existan las advertencias indicadas.
Una revisión obsoleta, falta de reconocimiento o cierre existente produce 409.

### Corrección y consulta de historial

La matriz GET existente añade `puedeCorregir` y `corregible` por fila. Estos flags
los calcula la API; `puedeEditar` sigue false tras el cierre.

`PATCH /api/v1/asistencia/grupos/{grupoId}/sesiones/{sesionId}/asistencias/correccion`,
exclusivo de administración, recibe una fila:

```json
{
  "matriculaId": "<matricula del grupo>",
  "codigo": "P",
  "observacion": null,
  "version": 1,
  "motivo": "Rectificación tras contrastar el registro de clase",
  "cierreId": "<cierre vigente>"
}
```

Código P/F/T/J; observación opcional, nullable, máximo 250. Omitir observación
conserva la anterior; null la borra. `version` es la leída o null para completar
una marca inexistente. `motivo` es obligatorio, no vacío y máximo 400.
La respuesta conserva `{items, sesion, resumenes}` de asistencia; las versiones
y resúmenes se calculan dentro de la transacción.

`GET .../asistencias/{matriculaId}/historial` devuelve `asistencia` nullable,
`cierre` y `items`: `id`, `accion`, `usuario_id`, `nombre_usuario`, `ocurrido_at`,
`motivo`, `valor_anterior` nullable y `valor_nuevo`. Cada valor contiene solo
`codigo`, `observacion` y `version`; no expone IP ni snapshots generales.

HTTP 400 indica entrada inválida; 401 falta de sesión; 403 falta de rol o grupo
ajeno; 404 referencia fuera del grupo; 409 revisión/versión/estado incompatible.
Los conflictos de serialización o interbloqueo también se presentan como 409 con
recarga, sin afirmar que la operación quedó guardada.

## Persistencia y reutilización

La **duodécima migración**, `1790208011000-cierres-asistencia.ts`, agrega
`cierres_academicos`, índice único de cierre de asistencia por grupo y protección
inmutable. Aunque reserva tipos del modelo, B15 solo admite insertar cierre de
asistencia; no habilita actas ni reaperturas. La reversión rechaza cierres existentes.

Los triggers bloquean sesiones, matrículas/activaciones y expedientes después del
cierre. La escritura de asistencia requiere el contexto administrativo local de
la transacción de corrección. La API revalida roles, propiedad, cierre, corte,
matrícula y versión antes de escribir; los DTO no permiten al cliente proporcionar
usuario, fecha de auditoría o eludir ese contexto.

El cierre bloquea el grupo, relee el evento y valida la revisión. Las operaciones
académicas comparten ese bloqueo y la autorización transaccional existente. Se
mantienen comprobación de MVCC y errores de concurrencia consistentes. Cierre,
auditoría y cálculo son atómicos; un fallo no deja un cierre o corrección parcial.

Archivos principales:

- API: `attendance-closure.{controller,dto,policy,schema,service}.ts`,
  `academic-closure.ts`, `academic-date.ts` y contratos de contexto académico.
- Integración: `attendance.service.ts` comparte persistencia docente y corrección;
  cálculo, sesiones, justificaciones y matrícula utilizan el cierre específico.
- Web: `AttendanceClosurePage.tsx`, `ClosureWarnings.tsx`,
  `AttendanceCorrectionDialog.tsx`, `AttendanceHistoryDialog.tsx` y contratos.
- Reutilización: `FormDialog`, campos, guardias, `GroupContext`, `Facts`, tablas,
  mensajes y `AttendanceSummary`; callback común de actualización de la matriz y
  formateo de fechas académicas. No se duplican fórmulas oficiales en React.

No se añaden dependencias. El total de migraciones es **12**.

## Verificación reproducible y resultados

Desde la raíz, con Docker en ejecución:

```sh
pnpm check
pnpm test:db
```

`test:db` utiliza PostgreSQL temporal y datos sintéticos, separado del volumen de
desarrollo. Verificación local finalizada el **12 de octubre de 2026**:

- `pnpm check`: lint, tipos y compilación correctos; **170 pruebas unitarias**,
  **3 de contrato HTTP sin base** y **14 de herramientas** aprobadas.
- `pnpm test:db`: **313 pruebas aprobadas en 19 suites**, con las doce migraciones
  aplicadas desde cero, revertidas y reaplicadas. Incluye **35 casos API/BD de B15**
  y **8 recorridos de navegador de B15**.
- **500 pruebas en total**, sin sumar ejecuciones repetidas; **71 nuevas de B15**:
  18 de política, 10 de traducción de errores HTTP, 35 API/BD y 8 de navegador.
- Verificados revisión obsoleta, doble cierre y correcciones concurrentes,
  permisos y sesión revocados, motivos/versiones, corte histórico fijo, 30 % exacto,
  tres tardanzas y efecto de los estados J sin sustituir sus marcas o decisiones.
- Verificados bloqueo de sesiones, matrículas y decisiones ordinarias; restricciones
  SQL, contexto de corrección local, snapshot anterior al cierre, inmutabilidad y
  reversión segura. Un fallo de auditoría o cálculo revierte la operación completa.
- Verificados en navegador cierre con pendientes y confirmación explícita,
  consulta por rol, recálculo 30 % → 40 %, historial, captura conservada ante 409 y
  recarga con descarte explícito. Una matrícula histórica `CERRADA` con marca faltante
  permanece visible y puede completarse con versión null y motivo administrativo.
- Capturas sintéticas de escritorio, móvil, historial y conflictos revisadas
  visualmente; comprobado que la página móvil no desborda su ancho.
- Revisión técnica independiente por otros agentes de API, migración, política,
  permisos, interfaz y documentación. `git diff --check` sin errores de espacios.

Reverificación del **13 de octubre de 2026**: `pnpm check` y `pnpm test:db`
volvieron a aprobar las **500 pruebas**, incluidas las doce migraciones desde
una base limpia. Se reforzaron las comprobaciones de conservación de J y de
inmutabilidad del cierre para exigir el error SQL `23001`, en lugar de aceptar
cualquier error. También se comprobó el rechazo de `TRUNCATE cierres_academicos`
y la conservación de los registros. Los 35 casos API/BD y ocho recorridos de
navegador de B15 pasaron; no se añaden casos al contador por estas aserciones.

Informe: `.tmp/verificacion/pruebas.json`; capturas: `.tmp/b15/`. No se modificó
la base de desarrollo. El contenedor y la red temporales se eliminaron al terminar.
No se afirma una ejecución remota de GitHub Actions ni uso de datos institucionales.

Para utilizar B15 en la base local existente, aplicar la migración antes de iniciar
la aplicación:

```sh
pnpm db:migrate
```

## Pendientes

RF37 sigue pendiente en su alcance de alertas anticipadas y notificación; no se
inventa un umbral adicional por debajo de 30 %. Las advertencias de revisión y la
condición de B13 no se presentan como cobertura completa de RF37.

B16–B18 mantienen configuración de evaluación aprobada, notas, resultado combinado
y cierre/corrección de actas. B15 no implementa todo CU18 ni RF43–RF46. Tampoco
permite corregir decisiones de justificación cerradas o reabrir asistencia.
Reportes, piloto, despliegue y respaldo/restauración siguen en sus historias.

La aceptación humana del equipo/centro y el piloto institucional permanecen
pendientes. Las comprobaciones técnicas con datos sintéticos no equivalen a esa
aprobación ni a evidencia de optimización observada en el centro.

Decisión técnica: [ADR-010](decisiones/ADR-010-cierre-asistencia.md).
