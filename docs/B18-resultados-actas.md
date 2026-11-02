# B18 — Resultados académicos y cierre de actas

Implementación del sprint 4 solicitada el **14 de octubre de 2026**.
Trazabilidad: **B18, RF43–RF46, CU16–CU18**, RN13–RN14, RN21–RN29 y RN31,
con las reglas de `AGENTS.md`. Se consultaron los seis
documentos de requisitos, casos de uso, modelo, arquitectura, prototipos y backlog.
No acredita finalización del sprint ni aceptación institucional.

## Resultado por intento

La API combina el resumen de asistencia B13/B15 y el cálculo exacto de notas B17.
Utiliza la versión de reglas guardada en la matrícula y los criterios aprobados
aplicados al grupo en B16. No propone porcentajes ni aprueba criterios al cerrar.
El navegador muestra las decisiones de la API sin mantener otra fórmula académica.

Primero se comprueba la asistencia: **más de 30 %** produce
`RETIRADO_INASISTENCIA`, incluso con nota aprobatoria. Con **30 % exacto** o menos,
nota oficial menor que 13 produce `DESAPROBADO`; desde 13, `APROBADO`.
Se compara el cociente exacto; el porcentaje de dos decimales es para mostrar.
Cada tres tardanzas equivalen a una falta sin cambiar las marcas originales.
La J recuperada no cuenta; al cierre, las pendientes o no recuperadas sí cuentan.

El promedio conserva hasta diez decimales y se redondea directamente al entero:
`12.4 → 12`, `12.5 → 13`, `12.495 → 12`. No se redondea primero a dos decimales.
Una nota cero es registrada; una nota pendiente nunca se sustituye por cero.
Sin sesiones computables, con marcas o notas pendientes, o sin criterios aprobados,
la condición queda pendiente. También se exige completar las notas antes de
confirmar un retiro: el cierre conserva un registro académico completo.

Antes del cierre puede consultarse una condición calculada cuando los datos sean
suficientes. Se distingue del resultado confirmado y no activa prerrequisitos ni
escribe resultados por consultar. Una J provisional mantiene la condición pendiente.

## Revisión y cierre

Desde **Grupos**, **Sesiones**, **Criterios**, **Calificaciones** o **Asistencia**,
abrir **Acta y resultados**, ruta `#/evaluacion/grupos/{grupoId}/acta`.
La revisión muestra contexto, pendientes, totales del grupo completo y padrón
paginado de 20 matrículas. La revisión SHA-256 cubre todo el grupo, no solo la página.
Cada intento permite consultar notas, sesiones y su historial de resultados.

Solo ADMIN confirma el cierre. Requiere asistencia cerrada, al menos una matrícula
ACTIVA/CERRADA, todos los datos completos, criterios aprobados y ausencia de un acta
o resultados previos. Los grupos ACTIVO/CERRADO y periodos ABIERTO/CERRADO permiten
consolidación administrativa; PLANIFICADO no. No se cambian esos estados al cerrar.

Una transacción bloquea el grupo, vuelve a calcular la revisión e inserta el evento
ACTA, sus resultados confirmados, la transición ACTIVA → CERRADA y la auditoría.
Si cambia cualquier entrada o falla un paso, no queda un cierre parcial.
Dos cierres concurrentes no crean dos actas. No se incorpora reapertura.

El evento conserva para siempre la revisión inicial completa. La página distingue
esa evidencia del resultado vigente tras una corrección. Cada resultado guarda
la procedencia del acta y criterios, las reglas y resúmenes utilizados y su versión.

## Correcciones administrativas

Después del cierre, solo ADMIN puede corregir una nota existente o una marca de
una sesión computable, con **motivo obligatorio**. Debe enviar la versión del
registro y del resultado que consultó y el identificador del acta vigente.
Una versión antigua se rechaza aunque se envíe el mismo valor.
Con valor normalizado idéntico y versiones vigentes no se crean eventos ni versiones.

La corrección, su evidencia antes/después y el recálculo del resultado comparten
transacción. Se conservan autor y fecha originales, la confirmación inicial del
resultado y el evento inmutable de cierre. La versión del resultado avanza incluso
si la nueva nota o marca no cambia su condición. Grupo o periodo cerrado no impide
la corrección administrativa con procedencia válida.

Una J con expediente conserva su protección: no se sustituye la marca ni se borra
la justificación. No se cambian decisiones de justificación después del cierre.
La corrección de asistencia B15 permanece disponible antes de cerrar el acta;
después se utiliza B18 para que el resultado no quede desactualizado.
Los resultados antiguos sin procedencia siguen en consulta y no se reconcilian
silenciosamente ni se sustituyen por resultados nuevos. Si todavía no existe ACTA,
B15 conserva su corrección de asistencia: cambia la proyección de asistencia
vigente y conserva separado el resultado histórico almacenado. Solo B18 corrige
un resultado vinculado al acta actual y lo recalcula junto con sus datos.

Los diálogos comparten motivo, reconocimiento explícito, validación, protección de
captura y manejo de conflictos. Un error conserva la captura; un 409 exige recargar
con descarte explícito. Si falla la reconsulta después de guardar, se oculta la
revisión anterior hasta recuperar datos actuales.

## Contratos y persistencia

OpenAPI **0.18.0**, disponible en `/api/docs` y `/api/openapi.json`.
Base `/api/v1/evaluacion/grupos/{grupoId}/acta`:

| Método | Ruta | Operación |
| --- | --- | --- |
| GET | Base | Revisión, resultados, totales e historial; `after`/`limit` |
| POST | Base | Cierre con `revision` y `motivo` opcional |
| GET | `/{matriculaId}` | Detalle de notas, sesiones e historial del intento |
| PATCH | `/correccion-nota` | Nota existente, motivo, acta y versiones |
| PATCH | `/correccion-asistencia` | Marca computable, motivo, acta y versiones |

Leen ADMIN, SECRETARIA y COORDINADOR; DOCENTE solo sus grupos asignados y activos.
Cada escritura revalida ADMIN, sesión, Origin y CSRF en el servidor.
HTTP 400 entrada inválida; 401/403 acceso; 404 registro ajeno al contexto;
409 revisión/versiones obsoletas o estado incompatible. No se revelan IP en historial.

La migración **`1790208014000-actas-resultados.ts`**, decimoquinta, no crea tablas.
Añade procedencia, versión y snapshot a `resultados_academicos`; conserva resultados
previos con procedencia nula. `promedio` pasa a numeric con rango 0–20 y escala máxima
10 para evitar pérdida del cálculo exacto. Se mantiene una sola ACTA por grupo.
Las restricciones y verificaciones diferidas impiden confirmar resultados que
divergen de notas/asistencia persistidas o un acta sin todos sus resultados.
La reversión rechaza actas existentes y promedios cuya precisión se perdería al
volver a dos decimales, incluso en registros legacy. Nunca elimina evidencia para
retirar B18.

Se reutilizan cálculos, autorización, ámbito por grupo, actualización de notas y
persistencia de correcciones de asistencia. El módulo evaluación orquesta la
transacción y consume servicios exportados de asistencia, sin dependencia circular.
Decisión: [ADR-013](decisiones/ADR-013-resultados-actas.md).

## Verificación y pendientes

Verificación local del **14 de octubre de 2026**:

- `pnpm check`: lint sin avisos, tipos y compilación de API/web aprobados;
  **329** pruebas unitarias en 13 archivos, **3** de contrato HTTP y **14** de
  herramientas. Las unitarias incluyen **41** casos de la política B18.
- `pnpm test:db`: **540/540** pruebas aprobadas, sin omisiones, en **25** archivos.
  Incluye **99** casos B18 de API/PostgreSQL y **12** recorridos B18 con Chromium,
  además de las regresiones de historias anteriores. Total de ambas verificaciones:
  **886 pruebas**, sin sumar repeticiones.
- Las **15 migraciones** se aplicaron, revirtieron y reaplicaron sobre una base
  temporal limpia; se conservan **30 tablas**, incluida la tabla de migraciones.
  Se verificó que la reversión rechaza actas y promedios que perderían precisión.
- Casos de 30 % exacto y exceso, tardanzas y todos los estados J; notas cero,
  pendientes, `12.4`, `12.5` y persistencia de `12.495`; procedencia de reglas,
  permisos/CSRF, versiones, concurrencia, rollback y snapshots consistentes al commit.
- Recorridos de inglés y portugués, cierre de todo el padrón incluso fuera de la
  primera página, notas/asistencia corregidas, historial, conflictos, validación,
  reintento, reconsulta fallida y protección de captura al navegar/cerrar sesión.
- Revisión técnica independiente de política, migración, API y UI; se corrigió la
  disponibilidad del cierre con periodo planificado y resultados legacy fuera del
  padrón. No quedaron hallazgos funcionales bloqueantes en la revisión final.

Informe de la suite completa: `.tmp/verificacion/pruebas.json`.
Capturas revisadas de escritorio, móvil, evidencia original, corrección e historial
en `.tmp/b18/`: `acta-ingles-escritorio.png`, `acta-ingles-movil.png`,
`acta-portugues-corregida.png`, `acta-historial-correccion.png` y
`acta-conflicto-cierre.png`. El workflow conserva esas capturas como artefactos.
La compilación web también se repitió después del ajuste final de redacción.
Después se ejecutaron nuevamente los **12/12** recorridos B18 en otra base temporal,
regenerando las cinco capturas con los textos finales. Informe adicional:
`.tmp/b18/pruebas-web-final.json`; no se suma esa repetición a las 886 pruebas.

La primera corrida diagnóstica permitió adaptar las fixtures históricas a los
triggers diferidos, comprobar OpenAPI mediante su referencia de DTO y conservar
la prueba de inmutabilidad ante la nueva FK. Se corrigieron las pruebas, sin
relajar reglas de negocio. Un timeout aislado del acceso de coordinación en B13
no se reprodujo en la suite final; no se alteraron sus aserciones ni tiempos.

Datos únicamente sintéticos; no constituye un acta institucional, piloto ni
aprobación de pesos. No se utilizó el volumen local ni se afirma una ejecución
remota de GitHub Actions.
La aceptación humana, plantillas definitivas y aprobación institucional de los
criterios siguen pendientes. XLSX/B19, piloto/B20 y despliegue/respaldo/B21 conservan
su alcance. Antes de usar esta versión en la base local, ejecutar `pnpm db:migrate`.
