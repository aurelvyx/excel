# B17 — Calificaciones abiertas y promedio exacto

Sprint 4 iniciado por instrucción del equipo el **14 de octubre de 2026**.
Trazabilidad: **B17, RF39–RF42, CU15/UI08**, RN21, RN23, RN27, RN28 y RN31.
Fuentes: `AGENTS.md` y documentos DOCX de requisitos, casos de uso, modelo,
arquitectura, prototipos y backlog. No acredita finalización del sprint 4.

## Registro y cálculo

La matriz utiliza exclusivamente la versión de criterios aprobada y aplicada al
grupo en B16. No precarga pesos ni convierte configuraciones antiguas en políticas
aprobadas. La fórmula soportada es `PONDERADA_JERARQUICA_V1`: indicadores dentro
de cada evaluación y evaluaciones dentro del nivel, con sumas exactas de 100 %.

Las notas se registran por **matrícula e indicador**, separadas por intento.
Aceptan valores entre **0 y 20** con hasta **dos decimales**, precisión del
diccionario existente. La captura admite coma o punto; el cliente transmite punto
decimal y la API devuelve notas normalizadas a dos decimales. Se rechazan números
JSON, notación científica, negativos, notas fuera de rango y precisión adicional.

Una casilla sin registro es pendiente; una nota **0.00** es registrada. No se
rellenan pendientes con cero ni se permite vaciar/borrar una nota existente.
La corrección abierta sustituye el valor con versión y auditoría antes/después.
Con valor normalizado idéntico y versión vigente no hay cambio de versión, fecha
ni auditoría; una versión obsoleta se rechaza incluso si coincide el valor.

El cálculo utiliza aritmética entera `BigInt`: nota en centésimas multiplicada por
los pesos de indicador y evaluación en puntos base. El promedio conserva la
fracción exacta con denominador **10^10**, hasta diez decimales. La nota oficial
redondea **directamente esa fracción** al entero más cercano; 0,5 sube.
No se redondean componentes ni se usa el promedio mostrado para otro redondeo.

- `12.4 → 12`, `12.5 → 13` y `0.00 → 0`.
- `12.495 → 12`: no se transforma primero en 12.50 para producir un 13 incorrecto.
- Si falta una nota, `promedio` y `notaOficial` siguen en null; se cuentan pendientes.

Promedio y nota oficial se recalculan desde los datos guardados y la versión
aplicada, en la misma transacción que la escritura. Son una proyección consultable;
no confirman una condición académica ni escriben `resultados_academicos`.
Una nueva versión futura del nivel no modifica los criterios de grupos anteriores.

## Permisos, estados y conservación

Solo **DOCENTE asignado y activo** registra o modifica notas ordinarias. ADMIN,
SECRETARIA y COORDINADOR consultan; un rol lector adicional no amplía la escritura
docente a grupos ajenos. ADMIN con DOCENTE asignado actúa como docente. Se revalidan
sesión, roles, perfil y asignación dentro de la transacción, además de CSRF/Origin.

La escritura requiere grupo **ACTIVO**, periodo **ABIERTO**, matrícula **ACTIVA**,
indicador de la versión aplicada y acta sin cierre. El cierre de **ASISTENCIA**
es independiente y permite continuar registrando notas. Inactivar una unidad,
nivel o idioma después de aplicar los criterios no reemplaza su versión histórica.

Matrículas cerradas/inactivas y calificaciones previas permanecen en consulta.
Si el intento ya conserva un resultado académico, B17 bloquea su edición para
evitar invalidarlo. Los datos legacy sin aprobación se consultan en el historial;
no se emite su promedio oficial ni se habilita su edición. Su reconciliación sigue
requiriendo un flujo posterior autorizado.

El cierre real de acta, condición combinada con asistencia y corrección
administrativa posterior corresponden a **B18**. No se agrega un cierre simulado,
reapertura ni botón de corrección cerrada en B17.

## Interfaz y contratos

Desde **Mis grupos / Grupos**, abrir **Calificaciones**; también existe el enlace
en sesiones y criterios del grupo. Ruta: `#/evaluacion/grupos/{grupoId}/calificaciones`.
Seleccionar evaluación conserva las notas capturadas de las otras evaluaciones.
El guardado reúne las celdas modificadas de toda la página, con 20 matrículas y
hasta 100 indicadores aplicados. El resumen global siempre viene de la API.

Se muestran estados pendiente, sin guardar, guardando, error, conflicto, éxito y
solo lectura. Navegación, paginación, recarga y cierre de sesión protegen la captura.
Ante conflicto se conserva y se exige recarga con descarte explícito. Si falla
la consulta posterior a un guardado confirmado, se ocultan los cálculos antiguos
hasta recuperarlos. El historial de cada celda identifica autor, fecha y valores.
El historial académico comparte **Notas guardadas del intento**, separado del
resultado académico almacenado o confirmado.

OpenAPI **0.17.0**: `/api/docs` y `/api/openapi.json`.
Base: `/api/v1/evaluacion/grupos/{grupoId}/calificaciones`.

| Método | Ruta                                                 | Operación                                                        |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| GET    | Base                                                 | Matriz, criterios, contexto de acta y promedios; `after`/`limit` |
| PATCH  | Base                                                 | Guardar 1–2000 celdas, recalcular y auditar atómicamente         |
| GET    | `/{matriculaId}/indicadores/{indicadorId}/historial` | Historial de una celda dentro del alcance del grupo              |

PATCH recibe `registros: [{matriculaId, indicadorId, nota, version}]`.
`version: null` crea una nota; la versión consultada permite editarla.
No se repite el par matrícula/indicador. El lote entero se valida antes de escribir.
GET devuelve filas con `calificaciones` y `resumenNotas`; PATCH devuelve notas,
resúmenes de los intentos afectados y `preparacionActa` reutilizada de B16.
`resumenNotas` distingue configuración aprobada, notas esperadas/registradas/
pendientes, promedio exacto, nota oficial y motivo pendiente.

La paginación admite 1–100 filas, con 50 por defecto; la web solicita 20.
El parser JSON permite **512 KiB**, suficiente para 2000 celdas con IDs completos;
es un límite técnico, no una política académica. HTTP 400: entrada inválida;
401/403: sesión/permiso; 404: grupo, matrícula o indicador fuera del contexto;
409: revisión obsoleta o escritura no disponible; 413: solicitud demasiado grande.
Los errores de JSON y tamaño conservan la respuesta uniforme sin revelar contenido.

## Persistencia y reutilización

Migración **`1790208013000-calificaciones-abiertas.ts`**, decimocuarta del esquema;
no crea tablas. Añade `version`, índice por grupo y validación de fechas.
Conserva todas las fechas y notas previas, incluida `actualizado_at: null`.
Para impedir redondeo silencioso en una escritura SQL, `nota` pasa de
`numeric(4,2)` a `numeric` con CHECK de rango y `scale(nota) <= 2`.
La API mantiene el mismo contrato de dos decimales.

Los triggers protegen matrícula/criterio/origen, avance de versión, aprobación,
estados y resultado histórico. Grupo, notas, resultado y acta comparten bloqueo;
las versiones MVCC rechazan escrituras con snapshots anteriores. DELETE/TRUNCATE
y reversión con calificaciones existentes se rechazan para conservar historial.
`CREATE_GRADE` y `UPDATE_GRADE` comparten transacción con notas y cálculo.

Archivos principales: `grade.policy`, `grade-calculation.service` y
`grades.{controller,dto,repository,schema,service}` en el módulo de evaluación;
migración, contratos e integración con historial de personas. Frontend:
`features/evaluation/GradesPage`, `GradeSummary`, `GradeHistoryDialog` y modelos;
rutas, enlaces y estilos. `AcademicCells` y `CaptureToolbar` se comparten con
asistencia. Se reutilizan cliente API, campos, tablas, contexto y guardia de cambios.
No se agregan dependencias.

Las fixtures históricas exclusivamente sintéticas cargan filas anteriores a B17
en una transacción que deshabilita y restaura solo el nuevo trigger de escritura.
Verifican entorno, base real y nombre permitido. No hay excepción productiva,
importación de datos reales ni aprobación automática de legacy.

## Verificación y uso local

```sh
pnpm check
pnpm test:db
```

Verificación local ejecutada el **14 de octubre de 2026**, con datos sintéticos:

- `pnpm check`: análisis estático, tipos y compilaciones sin errores; **288**
  pruebas unitarias, **3** de contrato HTTP y **14** de herramientas aprobadas.
- `pnpm test:db`: **429 pruebas aprobadas en 23 archivos**, sin fallos ni casos
  omitidos. Las **14 migraciones** se aplicaron desde cero, se revirtieron y se
  reaplicaron sobre PostgreSQL temporal. Contenedor y red retirados al terminar.
- Total: **734 pruebas**, incluidas **138 nuevas de B17**: 70 de dominio,
  57 de API/BD y 11 recorridos React–API–PostgreSQL con Chromium.
- Comprobados `12.4 → 12`, `12.5 → 13`, `12.495 → 12` y promedio exacto con
  pesos fraccionarios; cero/pendiente, permisos y revocaciones, estados cerrados,
  versiones y no-op, lotes atómicos, conflictos concurrentes, rollback, historial,
  independencia de asistencia y conservación de intentos/resultados/versiones.
- Lote de **2000 celdas** mayor de 100 KiB confirmado completo, sin truncamiento;
  entradas fuera de rango/precisión, JSON malformado y tamaño excesivo rechazados
  sin escritura. SQL valida precisión y origen, conserva historial y rechaza
  snapshots anteriores a acta/resultado y una reversión con notas persistidas.
- Inglés y portugués verificados de extremo a extremo; captura por evaluación,
  actualización, conflictos, reintento, reconsulta fallida, roles, paginación,
  navegación/logout e historial del estudiante. Cinco capturas de escritorio,
  móvil e historial revisadas visualmente.
- Revisión técnica independiente de política, migración, API, interfaz y
  documentación por otros agentes. La aceptación humana sigue pendiente.

Informe: `.tmp/verificacion/pruebas.json`. Capturas en `.tmp/b17/`:
`notas-ingles-escritorio.png`, `notas-ingles-movil.png`, `notas-historial.png`,
`notas-conflicto.png` y `notas-portugues-asistencia-cerrada.png`.
No se usa el volumen local ni se acredita una ejecución en GitHub Actions o piloto.

### Revisión del caso de validación en navegador — 14 de octubre de 2026

Tras el fallo intermitente comunicado por el equipo en GitHub Actions se revisó
el caso de rangos, precisión y conservación de notas. La prueba comprobaba el
foco inmediatamente después de observar el error, aunque el formulario lo asigna
en una tarea posterior. Se cambió esa aserción a `expect.poll`, que espera a que
el campo reciba realmente el foco. Conserva las seis entradas inválidas, el valor
capturado, la ausencia de PATCH y la protección de una nota guardada al vaciarla.

Nueva verificación local: `pnpm check` aprobado y **429/429** pruebas de BD/navegador
en la suite completa (**734** pruebas contando las verificaciones anteriores).
El caso ajustado pasó además **tres ejecuciones aisladas consecutivas**, cada una
con PostgreSQL temporal independiente; se filtró únicamente ese caso y se omitieron
los otros diez en esas repeticiones. Informes: `.tmp/verificacion/notas-foco-*.json`.
No se cambian reglas académicas, código de producto ni tiempos globales de CI.
El extracto compartido no incluye la aserción fallida del run original; la carrera
detectada es una causa posible y queda pendiente verificar el cambio en Actions.

Para actualizar una base local antes de iniciar la aplicación:

```sh
pnpm db:migrate
```

Aprobación institucional de valores concretos, aceptación humana y piloto siguen
pendientes. RF43–RF46/B18, XLSX/B19, piloto/B20 y despliegue/respaldo/B21 conservan
su alcance. Decisión técnica: [ADR-012](decisiones/ADR-012-notas-exactas.md).
