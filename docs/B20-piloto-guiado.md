# B20 — Protocolo de piloto guiado y mediciones

Este instrumento prepara el piloto de secretaría, docente y coordinación de B20
(RNF09 y RNF16). Reutiliza los casos de matrícula de B10 y permite medir también
consolidación de asistencia, notas y preparación de XLSX. Se relaciona con CU05–CU08,
CU11–CU19, RF14–RF24, RF27–RF46 y el subconjunto RF49/RF51–RF53 de B19; esta
trazabilidad identifica los flujos observados, no declara todos esos requisitos completos.
La comprobación técnica y la matriz de aceptación se describen en
[B20 — Verificación y piloto](B20-verificacion-piloto.md).

Decisión del equipo del **17 de octubre de 2026**: «Aún no; preparar el piloto».
No hay observaciones, tiempos finales ni participación institucional registrados.
La plantilla incluye asignaciones previstas y valores pendientes; no es evidencia
de que el centro haya ejecutado o aceptado las tareas.

## Preparación

1. Acordar con el centro fecha, entorno, responsable de observar, participantes,
   criterios de equivalencia y alcance. Definir quién puede aceptar la evidencia.
2. Usar un entorno de demostración aislado y datos sintéticos o anonimizados.
   Registrar la revisión del código desplegada, navegador, equipo, conexión y
   condiciones. No usar una base institucional para ensayar cierres y correcciones.
3. Preparar oferta y diez casos equivalentes conforme a
   [B10 — Casos y línea base](B10-verificacion-matricula.md#diez-tareas-sintéticas-y-línea-base).
   M01–M05 corresponden a inglés y M06–M10 a portugués. El centro debe confirmar
   su representatividad antes de considerarlos una muestra observada.
4. Preparar los mismos padrones, sesiones, marcas y capturas de notas para los
   procedimientos actual y del sistema. Registrar cantidades de matrículas,
   sesiones e indicadores y el tipo de reporte en la evidencia de cada tarea.
   Los códigos `G-EN` y `G-PT` identifican contextos anónimos del guion; reemplazarlos
   o ampliarlos de forma consistente si se usan otros grupos.
5. Verificar cuentas, permisos, asignación del docente, periodo abierto y reglas
   aplicables. Los criterios de evaluación de un ensayo deben identificarse como
   sintéticos. La autorización para preparar el piloto no aprueba pesos ni plantillas.
6. Dar una explicación y un ensayo de aprendizaje separados de las mediciones.
   Registrar el orden de ejecución; alternarlo cuando sea viable para discutir
   el efecto del aprendizaje. No reutilizar una matrícula activa del ensayo como
   una nueva tarea cronometrada.

Copiar [mediciones.plantilla.json](evidencias/B20/mediciones.plantilla.json) a una
carpeta local, por ejemplo `.tmp/b20/piloto.json`. El original versionado debe
seguir vacío. Nunca añadir nombres, DNI, vouchers reales ni secretos a un commit.
Los códigos `P01`/`P02`/`P03` son asignaciones previstas de secretaría, docente y
coordinación: no se cuentan como participación hasta que existan tareas completas
del sistema con esos participantes. Se pueden añadir más códigos anónimos.

## Ejecución y cronometraje

Usar `tipoEvidencia: SIMULACION` para un ensayo y `OBSERVACION` solamente para tareas
observadas del personal. Conservar archivos separados para ambos; no mezclar sus
mediciones ni renombrar un ensayo como resultado del piloto. Completar `contexto`
con entorno, revisión desplegada, condiciones y referencia de evidencia anonimizada.
Las fechas de cada observación son reales, con formato `YYYY-MM-DD`.

| Tarea                             | Participante previsto | Inicio y fin del cronometraje                                                                                     | Comprobación                                                                                          |
| --------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| M01–M10, matrícula                | Secretaría            | Etapas `busqueda`, `voucher`, `grupo`, `confirmacion` de B10; total = suma sin solapamiento                       | Intento correcto y voucher validado; no duplicación ni alteración de intentos previos                 |
| `ASISTENCIA-EN` / `ASISTENCIA-PT` | Docente               | Desde comenzar la consolidación de las mismas sesiones hasta tener el resumen comprobado o identificar el fallo   | Marcas y justificaciones preservadas; faltas computables y estado de cierre correspondientes          |
| `NOTAS-EN` / `NOTAS-PT`           | Docente               | Desde comenzar la consolidación de las mismas capturas hasta tener el resumen comprobado o identificar el fallo   | Pendiente distinto de cero; promedio exacto y nota calculada conforme a criterios del ensayo          |
| `XLSX-EN` / `XLSX-PT`             | Coordinación          | Desde comenzar la preparación del paquete de reportes hasta abrir y cotejar ambos archivos o identificar el fallo | Matriz y resumen priorizados; contexto, filas, celdas y totales pertinentes; sistema siempre BORRADOR |

Registrar `ACTUAL` y `SISTEMA` para cada caso, con el mismo contexto, idioma, actividad
y resultado esperado. Las referencias de evidencia deben detallar la cantidad de
filas/sesiones/indicadores y las condiciones que permiten considerar las tareas
equivalentes. Si el procedimiento actual no puede realizar una tarea, registrar
`FALLIDA` con su incidencia; no inventar una duración equivalente para obtener ahorro.

Incluir espera, reintentos y correcciones dentro del tiempo observado. Documentar
interrupciones externas. No descontarlas retrospectivamente para mejorar el resultado;
si se necesita repetir, conservar el instrumento original y generar otro archivo
de ensayo con su referencia. Un caso/procedimiento se registra una sola vez por archivo.

En las actividades registrar `esperado`, `obtenido`, `evidencia`, `segundos`,
`correcciones`, `erroresAntesDelCierre` e `incidencias`. El resultado es `COMPLETADA`
o `FALLIDA`. La evidencia de matrícula usa el resultado y la referencia de B10,
con el detalle esperado/obtenido en su hoja o captura de aceptación. Una corrección
es una captura que el participante vuelve a modificar durante la tarea; un error
antes del cierre es una discrepancia detectada al cotejar los datos antes de cerrar.
Evitar contar dos veces el mismo cambio dentro de una observación y explicar el
criterio de conteo acordado en `contexto.condiciones`.

`null` significa pendiente; `0` significa una cantidad observada igual a cero. Un
fallo conserva tiempo, correcciones y errores: no se borra para mejorar el promedio.
Las duraciones de las pruebas automáticas no son tiempos de trabajo del personal.

## Incidencias y evidencia

Cada incidencia contada en una observación necesita una entrada en `incidencias`.
Usar códigos `I01`, `I02`, etc. La entrada contiene `caso`, `procedimiento`, `fecha`,
`participante`, `impacto` (`CRITICA`, `ALTA`, `MEDIA`, `BAJA`), `descripcion`, `estado`
(`ABIERTA`, `EN_CURSO`, `RESUELTA`), `evidencia` y `resolucion`. Una incidencia
resuelta exige describir la corrección y referenciar la comprobación posterior;
se conserva su registro y su conteo. La bitácora debe coincidir con el número de
incidencias declarado para cada caso y procedimiento.

Las referencias pueden ser códigos de evidencia o rutas relativas a una carpeta
local anonimizada. Conservar por separado: hoja de observación, captura del resultado,
archivo XLSX generado, comparación de celdas y nota de resolución cuando aplique.
El analizador valida la estructura de las referencias; **no abre los archivos ni
certifica su contenido**. Otra persona debe cotejar la evidencia y los resultados.

La matriz [de aceptación B20](evidencias/B20/matriz-aceptacion.md) separa pruebas
técnicas, observación de uso y aceptación. Revisar también mensajes de error,
estados pendientes, navegación con teclado y lectura en pantalla pequeña. No
considerar una captura aislada como prueba de que todo el flujo funciona.

## Análisis reproducible

```sh
pnpm b20:mediciones docs/evidencias/B20/mediciones.plantilla.json
pnpm b20:mediciones .tmp/b20/piloto.json
pnpm test:tools
```

La herramienta solo lee el JSON e imprime su resumen; no se conecta a la API,
no modifica datos y no crea archivos de evidencia. Puede guardarse su salida para
acompañarla al instrumento original. El análisis exige participantes anónimos,
fechas válidas, segundos finitos no negativos y conteos enteros no negativos.
Rechaza duplicados, participantes fuera del rol previsto, pares que cambian de
tarea/contexto/idioma/resultado esperado e incidencias sin correspondencia.

La matrícula reutiliza el analizador B10: requiere **diez pares completados** para
comparar. Para asistencia, notas y XLSX informa comparaciones descriptivas de los
pares completos disponibles y desglosa inglés/portugués. El guion incluye un par
por actividad e idioma; ese tamaño no permite generalizar mejoras institucionales.
Ampliar la muestra con nuevos casos si el centro acuerda un protocolo mayor.

Cada comparación muestra tamaño de muestra, promedio actual y del sistema,
diferencia media de segundos y reducción porcentual de la suma de tiempos
emparejados. Se redondea la presentación a dos decimales. Con línea base cero,
el porcentaje es `null`; si el sistema es más lento, es negativo. Las tareas
fallidas o incompletas se excluyen de la comparación temporal y sus conteos válidos
declarados permanecen en el control general, el desglose por procedimiento y la
bitácora, aunque falten segundos. `control.parcial` identifica observaciones
incompletas y `conteosPendientes` indica cuántas filas aún no declaran cada conteo:
un total parcial no prueba ausencia de errores o correcciones. No mezclar el
control general de ambos procedimientos con un indicador de mejora; revisar
también el desglose por procedimiento.

La salida distingue instrumento pendiente, simulación y observaciones declaradas.
Siempre conserva `aceptacionInstitucional: PENDIENTE_REVISION_DEL_CENTRO`:
ni completar el JSON ni pasar las pruebas equivale a la aprobación del centro.
Las tareas sin datos conservan promedio y conteos observados pendientes, sin
convertirse en ceros. El listado `pendientes` identifica falta de contexto, pares,
participación, observaciones incompletas/fallidas e incidencias abiertas.

## Revisión y cierre

El observador y otra persona deben contrastar las tareas con las evidencias,
revisar incidencias y recoger la conformidad o reservas de secretaría, docente y
coordinación. Conservar fecha, referencia de revisión y alcance aceptado en un
acta anonimizada. B19 sigue limitado a formatos BORRADOR de matriz y resumen;
este piloto no autoriza emisión oficial ni acredita todos los anexos del catálogo.

La preparación técnica puede verificarse con pruebas sintéticas. Los tiempos
finales, la usabilidad observada y el piloto institucional continúan pendientes
hasta ejecutar este protocolo con personal y evidencias disponibles. Para el TAP,
informar tamaño de muestra, fechas, participantes por código, contexto, limitaciones
y resultados negativos; no atribuir mejoras generales a una muestra pequeña.
