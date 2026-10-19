# B10 — Verificación de matrícula y preparación de evidencias

Sprint 2. El backlog pide probar matrícula completa y fallida, medir el procedimiento
actual, preparar casos ficticios y mapear XLSX. Trazabilidad: RF14–RF27 y RNF16;
CU05–CU08, RN01–RN10 y RN30. Esta entrega prepara y verifica la parte técnica.
La observación del procedimiento del centro, la aprobación de plantillas y la revisión
por otra persona siguen pendientes. No se ha realizado un piloto institucional.

## Pruebas y evidencia reproducible

```sh
pnpm check
pnpm --filter api exec playwright install chromium
pnpm test:b10
pnpm test:db
```

`test:b10` selecciona cuatro suites existentes: estudiantes, vouchers, matrícula HTTP
y asistente de navegador. Usa la misma preparación y limpieza Docker de `test:db`,
con PostgreSQL temporal, contraseña y puerto aleatorios. No usa datos ni volúmenes
institucionales. `test:db` ejecuta además las pruebas de migraciones y del resto del sistema.

Los informes JSON conservan nombre del caso, resultado, fecha de inicio, fallos y
duración técnica. Se elimina el informe anterior antes de iniciar cada ejecución:
si el entorno no arranca, un informe antiguo no se presenta como resultado nuevo.

| Evidencia | Ubicación local |
| --- | --- |
| Pruebas del paquete B10 | `.tmp/b10/pruebas.json` |
| Suite completa | `.tmp/verificacion/pruebas.json` |
| Confirmación e historial de portugués | `.tmp/b10/portugues-confirmacion.png`, `portugues-historial.png` |
| Conflicto de matrícula activa | `.tmp/b10/matricula-duplicada.png` |
| Confirmación de inglés, móvil y prerrequisito | `.tmp/b09/confirmacion.png`, `confirmacion-movil.png`, `prerrequisito.png` |

Las capturas contienen datos sintéticos. CI ejecuta la suite completa y conserva
solo sus informes y capturas sintéticas durante catorce días. No publica los XLSM/XLSX
recibidos del centro. La ejecución remota requiere un push; el resultado local no
demuestra una ejecución en GitHub Actions.
El workflow declara archivos específicos bajo `.tmp` y permite esas rutas ocultas,
conforme al [contrato de upload-artifact v4](https://github.com/actions/upload-artifact/blob/v4/README.md).

| Criterio de aceptación | Comprobación automatizada | Alcance |
| --- | --- | --- |
| Alta, búsqueda y actualización sin duplicar identidad | Suite `students.integration-spec.ts` | RF14–RF17; CU05–CU06 |
| Voucher con número, fecha, importe, decisión y responsable | Suite `vouchers.integration-spec.ts` | RF19–RF20; CU07 |
| Matrícula completa de inglés y portugués | Navegador → React → API → PostgreSQL, consulta del historial | RF16, RF17, RF19–RF21, RF24, RF27 |
| Voucher pendiente/rechazado no activa | HTTP y navegador; rechazo con motivo, solicitud sin voucher, sin resultado definitivo | RF20–RF21; RN01–RN04 |
| Rechazo y recuperación con otro voucher | Mismo id, código e intento; se conserva el comprobante rechazado y CREATE/ACTIVATE | RF20, RF21, RF24, RF27 |
| Duplicado de voucher o matrícula activa | Conflicto visible; campos conservados; segundo voucher queda libre | RF19, RF23 |
| Grupo cerrado, plazo, vacante y prerrequisito | Revalidación HTTP; recuperación de activación fallida; concurrencia de última vacante | RF21–RF23 |
| Repetición de nivel | Otro intento conserva asistencia, notas y resultado anterior | RF17, RF24 |
| Error transaccional o respuesta perdida | Rollback de auditoría; reintento idempotente; consulta de activación confirmada | RF21, RF24, RF27; RN30 |
| Permisos | Docente y coordinación denegados en UI y API; administrador/secretaría autorizados | RNF16 y permisos de CU07–CU08 |
| Oferta y docentes | Suite académica incluida en `test:db` | RF18, dependencias B04 |

El soporte de navegador comparte selección de idioma y decisión de voucher.
Reutiliza sesiones comprobadas entre contextos aislados y recupera CSRF por `/auth/me`:
no desactiva el límite de acceso real para hacer pasar doce recorridos en un minuto.
No se añaden endpoints, tablas, migraciones ni dependencias para B10.

RF25 (anulación con motivo) y RF26 (listado general filtrado) siguen pendientes;
la consulta individual y el historial no equivalen a cubrirlos completamente.
No se afirma que RF14–RF27 ni los 57 requisitos estén terminados por ejecutar estas pruebas.

## Diez tareas sintéticas y línea base

Los datos están en [casos-sinteticos.json](evidencias/B10/casos-sinteticos.json).
M01–M05 usan inglés y M06–M10 portugués; cada caso tiene documento, código y voucher
propios. M01/M06 requieren alta nueva; los otros requieren un estudiante preexistente.
Se varía búsqueda por documento, nombre y código. Todos persiguen una matrícula
completa del primer nivel. El importe es un dato sintético, sin moneda institucional supuesta.

Preparar los mismos estudiantes y oferta en dos entornos equivalentes antes de cronometrar.
Para el sistema, el catálogo DEMO puede prepararse con B04 y la carga sintética existente;
administración debe abrir un periodo dentro del plazo, activar los grupos y verificar
la versión vigente. No cambiar datos institucionales para preparar una demostración.
No reutilizar una matrícula activa de una ejecución anterior como si fuera un caso nuevo.

Los casos sintéticos sirven para una simulación guiada y para definir las tareas.
El centro debe seleccionar o anonimizar al menos diez matrículas representativas de
su procedimiento actual para la línea base observada. Registrar su correspondencia
con M01–M10; si se necesitan perfiles adicionales, usar M11 en adelante y conservar
la misma tarea al repetirla en el piloto. La representatividad no queda aprobada por
haber preparado diez datos ficticios.

Copiar [mediciones.plantilla.json](evidencias/B10/mediciones.plantilla.json) a una carpeta
de evidencia local. Sus tiempos, fechas y participantes están vacíos deliberadamente.
Usar `tipoEvidencia: OBSERVACION` para datos observados y `SIMULACION` para ensayo guiado.
Cada observación contiene fecha real `YYYY-MM-DD`, participante anónimo `P01`, resultado
`COMPLETADA` o `FALLIDA`, referencia a evidencia anonimizada y conteos de correcciones/incidencias.
No guardar nombres o documentos reales en el instrumento ni en un commit.

| Etapa, segundos | Inicio | Fin |
| --- | --- | --- |
| `busqueda` | Recibir identidad y empezar búsqueda | Estudiante identificado o registrado; incluye alta si el caso la requiere |
| `voucher` | Comenzar registro del comprobante físico | Número, fecha, importe y decisión registrados |
| `grupo` | Comenzar búsqueda de oferta | Grupo y contexto seleccionados, con las comprobaciones del procedimiento |
| `confirmacion` | Empezar revisión final | Matrícula confirmada o fallo identificado |

Las etapas se registran sin solaparse. El total es su suma; incluir espera, reintentos
y correcciones dentro de la etapa afectada. Anotar interrupciones externas en la evidencia.
Cronometrar de la misma manera en ambos procedimientos; registrar fecha, participantes,
tareas, orden de ejecución y condiciones para poder discutir aprendizaje y variabilidad.
El procedimiento actual que no permita validación completa debe registrarse tal como se
observó, con su incidencia, sin simular que ofrece una garantía que no tiene.

Para el piloto añadir observaciones `SISTEMA` con los mismos identificadores de caso.
Un intento fallido se registra como tal y no sirve para demostrar ahorro de tiempo.
La herramienta informa observaciones incompletas, fechas, participantes, etapas,
correcciones e incidencias; requiere diez tareas actuales completadas para la línea base
y diez pares de tareas completadas para comparar. No reemplazar fallos u observaciones
previas para mejorar la cifra: conservar las hojas originales y crear otro archivo de
ensayo con su referencia cuando corresponda.

```sh
pnpm b10:mediciones .tmp/b10/mediciones.json
```

Rechaza tiempos negativos o no numéricos, fechas imposibles, participantes con nombres,
conteos inválidos y duplicados caso/procedimiento. `null` es pendiente; cero es observado.
Una línea base cero no produce división por cero. La reducción puede ser negativa.
La comparación usa solamente tareas emparejadas; las simulaciones mantienen su etiqueta.
La herramienta resume lo declarado y no certifica la autenticidad de la observación.
Las duraciones de Vitest/Playwright no sustituyen tiempos de secretaría ni resultados TAP.

## Plantillas de inglés y portugués

El equipo facilitó cuatro archivos en `.tmp/b10`. Se inspeccionaron sus hojas,
cabeceras, combinaciones y fórmulas sin ejecutar macros ni modificar los originales.
El inventario versionado contiene nombres y huellas, sin registros personales.
Detalle: [mapeo y preparación de plantillas](plantillas/README.md).

Se prepararon mapas comunes declarativos para las fichas y el resumen de participantes,
con variantes por idioma, y se registró la diferencia de filas de las matrices operativas.
El verificador detecta una fuente ausente o distinta de la versión mapeada y valida
referencias, duplicados y límites de celdas. No genera un XLSX ni aprueba una fórmula.
La generación y comparación de reportes oficiales siguen en B19, tras acordar plantillas,
reglas de evaluación, datos institucionales y criterios de conteo/desborde.

## Cierre del sprint

Verificación local del 30 de septiembre de 2026: `pnpm test:b10` pasó 45 pruebas;
`pnpm test:db` pasó 121 pruebas, con migraciones desde base limpia y 24 recorridos
de navegador. `pnpm check` pasó lint, tipos, compilación y 57 pruebas; el total
sin contar dos veces el subconjunto B10 es de 178 pruebas. Se revisaron visualmente
las capturas de confirmación en portugués y del conflicto de matrícula activa.
El registro verificó las cuatro huellas de los archivos recibidos.
La plantilla de medición informó muestra cero y línea base pendiente, como corresponde.
Estos resultados son evidencia técnica con datos sintéticos, no tiempos del centro.

Registrar una revisión por otra persona, una demostración verificable, diez mediciones
observadas y la aprobación o cambios de mapeo antes de dar B10 por terminada.
Mantener la revisión de alcance prevista para el 23 de octubre de 2026 y evaluar RF25,
RF26, reglas/plantillas pendientes y capacidad del equipo para los siguientes sprints.
No hay cambios de reglas académicas en esta entrega.
