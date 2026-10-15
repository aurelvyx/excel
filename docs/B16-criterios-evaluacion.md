# B16 — Criterios de evaluación versionados

Sprint 3. Trazabilidad: **B16, RF38/CU14**, RN23, RN27, RN31 y RN34.
Fuentes: `AGENTS.md` y los seis documentos DOCX de requisitos, casos de uso,
modelo, arquitectura, prototipos y backlog. La preparación del acta aporta
una validación para B18; no implementa todavía RF39–RF46 ni cierre de acta.

## Configuración

La configuración comienza vacía. El equipo indicó el **13 de octubre de 2026**
implementar con criterio técnico respetando las reglas existentes; esto no se
interpreta como aprobación de pesos o fórmula concretos del centro. No se
precargan nombres académicos ni porcentajes institucionales supuestos.

Administración crea versiones por nivel en estado **BORRADOR**. Puede guardar
un árbol vacío o sumas incompletas. Las entradas presentes exigen campos válidos:
evaluación con nombre, unidad opcional del mismo nivel, porcentaje, orden e
indicadores; indicador con código, descripción, porcentaje y orden. Las unidades
vinculadas deben estar activas al guardar, aprobar y aplicar.

La fórmula soportada se selecciona explícitamente: **ponderación de indicadores
dentro de su evaluación y de evaluaciones dentro del nivel**, código
`PONDERADA_JERARQUICA_V1`. Es una capacidad del sistema, no política aprobada por
defecto. Otra fórmula requerirá su política y pruebas. B17 implementará el cálculo.

Para registrar aprobación se exige al menos una evaluación y un indicador en cada
evaluación, sumas exactas de **100.00 %** en ambos ámbitos, referencia escrita de
aprobación del centro y confirmación del administrador. Se conservan usuario,
fecha y referencia. La versión aprobada queda inmutable; otra política necesita
otra versión.

Los porcentajes viajan como strings positivos, hasta 100 y con máximo dos
decimales separados por punto. Se normalizan a dos decimales y se suman puntos
base enteros, sin coma flotante. **33.33 + 33.33 + 33.34** es válido; **99.99** y
**100.01** impiden aprobar. Son ejemplos de prueba sintéticos, no reglas del centro.

## Aplicación y permisos

Administración o docente asignado aplica una versión aprobada a un grupo del
mismo nivel. La asignación autoriza esta operación limitada; no permite al docente
aprobar criterios generales ni escribir en grupos ajenos. Secretaría y coordinación
consultan; los lectores adicionales no amplían permisos de escritura docente.
La API revalida sesión, roles y asignación dentro de cada transacción.

La aplicación es **única por grupo**. Copia los criterios a `evaluaciones` e
`indicadores_evaluacion`, con referencia a la versión aprobada. Una versión futura
del nivel no modifica los grupos anteriores. No se sustituyen ni se eliminan
estructuras aplicadas, incluso antes de registrar notas. La rectificación de una
aplicación requiere un flujo posterior autorizado con conservación de evidencia.

Grupo o periodo cerrado, acta cerrada, evaluaciones previas o resultados históricos
impiden aplicar. Los registros anteriores se conservan sin aprobación automática
ni inactivación silenciosa. Su reconciliación queda pendiente. La aplicación puede
prepararse en grupos/periodos planificados; no activa matrículas ni registra notas.

El cierre de **asistencia** de B15 es independiente y no impide preparar criterios.
B16 no altera matrículas, parámetros, marcas, notas, resultados o cierres existentes.

## Preparación del acta

`preparacionActa` devuelve criterios aprobados, matrículas revisables, indicadores
y cantidades de notas esperadas, registradas y pendientes. Revisa matrículas
`ACTIVA` o `CERRADA`, excluyendo solicitudes pendientes/anuladas.
Una nota cero es un registro presente; una nota sin registro sigue pendiente.

Sin configuración aprobada, matrículas, indicadores o todas las notas requeridas,
`puedeCerrar` es false. Este indicador describe completitud, no concede permiso
al lector ni ejecuta cierre. `EvaluationService.requireGradeClosureReady` rechaza
el cierre incompleto y se reutilizará en B18, que añadirá autorización, asistencia,
resultados y cierre real. No hay una ruta simulada de acta ni matriz ficticia de notas.

## Interfaz y REST

Abrir **Criterios de evaluación**, seleccionar nivel, crear **Nueva versión**,
capturar y **Guardar borrador**. Revisar la validación del servidor; cuando el
centro haya aprobado los criterios, usar **Aprobar versión**, indicar referencia,
revisar y confirmar. Desde el grupo, abrir **Evaluaciones**, revisar y aplicar
una versión aprobada. La consulta conserva estructura, responsable y pendientes.

Rutas React: `#/evaluacion/niveles`, `#/evaluacion/niveles/{nivelId}`,
`#/evaluacion/planes/{planId}` y `#/evaluacion/grupos/{grupoId}`.
OpenAPI `0.16.0`: `/api/docs` y `/api/openapi.json`.
Base REST: `/api/v1/evaluacion`.

| Método y ruta                          | Entrada/operación                                      | Permiso                            |
| -------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| GET `/niveles`                         | Niveles accesibles                                     | Lectores; docente según asignación |
| GET `/niveles/{nivelId}/planes`        | Versiones y unidades                                   | Mismo alcance                      |
| GET `/planes/{planId}`                 | Plan, validación e historial                           | Mismo alcance                      |
| POST `/niveles/{nivelId}/planes`       | `nombre`, `formula`, `estructura`                      | Administrador                      |
| PATCH `/planes/{planId}`               | Mismos campos y `revision`                             | Administrador                      |
| POST `/planes/{planId}/aprobacion`     | `revision`, `referenciaAprobacion`, `confirmado: true` | Administrador                      |
| GET `/grupos/{grupoId}/configuracion`  | Estructura y preparación del acta                      | Lectores; docente asignado         |
| POST `/grupos/{grupoId}/configuracion` | `planId`, `confirmado: true`                           | Administrador o docente asignado   |

`estructura.evaluaciones` contiene `nombre`, `unidadId` nullable, `pesoPct`,
`orden` e `indicadores` con `codigo`, `descripcion`, `pesoPct` y `orden`.
Se recortan nombres/códigos y ordenan los arrays. Nombres, códigos y órdenes no se
repiten dentro de su ámbito. Límites técnicos: 20 evaluaciones, 30 indicadores
por evaluación y 100 en total. Bigint y porcentajes se transmiten como texto.

HTTP 400 indica entrada inválida; 401 falta de sesión; 403 falta de permiso;
404 referencia inexistente. Revisión obsoleta, aprobación incompleta, unidad
ajena/inactiva, plan no aprobado o grupo ocupado producen 409. Se conserva el
borrador y la recarga exige descarte explícito. El historial no expone IP ni secretos.

## Persistencia y reutilización

La migración **`1790208012000-planes-evaluacion.ts`** añade `planes_evaluacion`,
`configuraciones_evaluacion_grupo` y referencia nullable en `evaluaciones`.
Las filas anteriores conservan null; no se convierten en criterios aprobados.
Las claves compuestas relacionan el nivel del plan y grupo. La reversión rechaza
planes/aplicaciones existentes para no eliminar historial.

Triggers validan estructura, porcentajes, unidades y estados. La copia se valida
al commit: debe corresponder íntegramente al plan, sin registros faltantes o extras.
La aprobación y criterios aplicados son inmutables. Creación, edición, aprobación
y aplicación comparten transacción con auditoría; un fallo no deja datos parciales.

API: `evaluation.{controller,dto,module,policy,repository,schema,service}.ts` en
`apps/api/src/modules/evaluacion/`, migración y pruebas. Web:
`apps/web/src/features/evaluation/`, rutas y enlaces. Se reutilizan autorización,
contexto, auditoría, `FormDialog`, guardias, campos y tablas. La política de sumas
y preparación es pura. No se añaden dependencias.

## Verificación y actualización

```sh
pnpm check
pnpm test:db
```

Verificación local ejecutada el **13 de octubre de 2026**, con datos sintéticos:

- `pnpm check`: análisis estático, tipos y compilaciones sin errores; **218**
  pruebas unitarias, **3** de contrato HTTP y **14** de herramientas aprobadas.
- `pnpm test:db`: **361 pruebas aprobadas en 21 archivos**, sin fallos ni casos
  omitidos. PostgreSQL temporal; las **13 migraciones** se aplicaron desde cero,
  se revirtieron y se reaplicaron. El contenedor y su red se retiraron al terminar.
- Total: **596 pruebas**, incluidas **96 nuevas de B16**: 48 de dominio, 40 de
  API/BD y 8 recorridos React–API–PostgreSQL con Chromium.
- Comprobados pesos exactos en ambos ámbitos, DTO y permisos por rol/asignación,
  aprobación y aplicación concurrentes, revisión obsoleta, unidades inactivas,
  snapshots anteriores, conservación de versiones y rollback ante fallo de
  auditoría o lectura. La preparación distingue nota cero, pendiente y ausencia
  de matrículas; el guard interno rechaza criterios o notas incompletos.
- Recorridos sintéticos de inglés y portugués; captura vacía, aprobación,
  aplicación al grupo, independencia del cierre de asistencia, conflictos,
  reintento, solo lectura e historial. Capturas de escritorio y móvil revisadas
  visualmente. Revisión técnica independiente de política, API, migración y
  documentación por otros agentes; la aceptación humana sigue pendiente.

Informe: `.tmp/verificacion/pruebas.json`. Capturas en `.tmp/b16/`:
`criterios-grupo-ingles.png`, `criterios-grupo-portugues.png`,
`criterios-grupo-movil.png`, `criterios-aprobados-historial.png`,
`criterios-borrador-recargado.png` y `criterios-aprobacion-conflicto.png`.
La comprobación local no acredita una ejecución en GitHub Actions ni un piloto.

Para usar B16 en una base local existente, antes de iniciar la aplicación:

```sh
pnpm db:migrate
```

Valores institucionales concretos, aceptación humana y piloto siguen pendientes.
B17 implementará notas/promedios; B18 integrará resultado, acta y correcciones.
La estructura persistida de RF38 no acredita aprobación institucional ni completa
RF39–RF46. Decisión técnica: [ADR-011](decisiones/ADR-011-criterios-evaluacion.md).
