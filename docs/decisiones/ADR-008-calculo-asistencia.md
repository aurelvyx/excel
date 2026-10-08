# ADR-008 — Cálculo de asistencia por intento

Fecha: 6 de octubre de 2026. Estado: decisión técnica implementada para B13.
Trazabilidad: RF31–RF32, recálculo de RF30, RF43 parcial, RN12–RN14 y CU11 parcial.

## Contexto

B12 guarda marcas P/F/T/J por sesión y matrícula, con versiones, auditoría y
correcciones transaccionales. B13 debe calcular asistencia sin reemplazar esas
marcas ni mezclar intentos, sin convertir datos pendientes en faltas y sin emitir
resultados de notas. Los estados persistidos de justificación se incorporan en B14
y el cierre específico en B15.

Fuentes consultadas: `AGENTS.md`, los seis documentos de análisis y diseño en
`docs/` y las implementaciones de matrículas, sesiones, asistencia e historial.
El prototipo 5.7 describe la justificación pendiente como computable
provisionalmente; no equivale a una resolución aprobada ni a una recuperación.

## Decisión

### Datos canónicos y cálculo centralizado

Las sesiones, marcas y reglas vinculadas a `matriculas.parametro_id` son la fuente
del cálculo. Un servicio del módulo de asistencia agrega las matrículas solicitadas
en una consulta SQL; una política pura convierte esos conteos en el resumen.
El mismo servicio alimenta la matriz y el historial. No se añade una migración,
una tabla de caché, un endpoint sin alcance ni una segunda fórmula en React.

El resumen es una proyección actual de los datos guardados. Las consultas no
escriben ni auditan exportaciones ficticias, no alteran el estado de matrícula y no
sobrescriben `resultados_academicos`. Esa tabla conserva resultados históricos y
confirmados; el resultado combinado con notas corresponde a B18. El resumen de
asistencia aparece separado del resultado académico conservado.

Tras guardar, el servicio calcula los resúmenes del lote dentro de la misma
transacción que marcas, confirmación de sesión y auditoría. El navegador consulta
después la página completa: confirmar una sesión `REALIZADA` cambia el denominador
también de quienes no fueron enviados. Los intentos de otras páginas se calculan
al consultarlos, sin un agregado persistido que pueda quedar desactualizado.

### Sesiones que entran en el denominador

Se cuentan **todas las sesiones `REALIZADA` del grupo con fecha menor o igual al día
civil actual en America/Lima**, obtenido de PostgreSQL. Se excluyen `PROGRAMADA`,
`CANCELADA` y fechas futuras, incluso si hubiera una marca cargada por una herramienta
externa. El detalle conserva esas sesiones y señala `computable: false`.

Es una decisión técnica explícita basada en la matrícula por nivel completo y las
sesiones reales del grupo. No se divide por meses ni se excluyen sesiones anteriores
a `fecha_matricula`: ese campo representa la fecha de solicitud y no una fecha
institucional de inicio de asistencia. No se inventa una excepción por incorporación
tardía. Si el centro acuerda una, debe modelarse, versionarse y probarse antes de
cambiar este criterio. Una sesión computable sin marca queda pendiente y no se
interpreta como P, F o cero.

### Reglas y precisión

Se aplican la equivalencia y el máximo de la versión referenciada por el intento,
no la configuración más reciente. Las reglas acordadas son tres tardanzas por
falta y 30 % máximo. Los valores distintos usados en pruebas son sintéticos para
comprobar que una versión posterior no altera el intento anterior.

La política cuenta `floor(T / equivalencia)` y conserva el resto. Compara con
enteros `BigInt`:

```text
faltasComputables × 10000 > sesionesComputables × máximoEnCentésimas
```

El 30 % exacto permite continuar. El porcentaje se redondea a dos decimales,
mitad hacia arriba, únicamente para mostrarlo. Puede mostrarse `30.00` y superar
el límite si la fracción exacta es ligeramente mayor: la condición procede de
la comparación exacta, no del texto redondeado. Los valores devueltos son números
enteros o cadenas decimales JSON, sin serializar BigInt.

### Pendientes, justificaciones y alcance del cierre

| Estado del resumen | Tratamiento |
| --- | --- |
| `NO_APLICA` | Solicitud pendiente o anulada; porcentaje y condición nulos. |
| `SIN_SESIONES` | Sin denominador; porcentaje y condición nulos. |
| `INCOMPLETO` | Hay marcas pendientes; porcentaje parcial, condición nula. |
| `PROVISIONAL` | Sin marcas pendientes, pero hay J sin resolver; porcentaje provisional, condición nula. |
| `CALCULADO` | Datos completos y resueltos; condición actual de asistencia. |

Una J sin resolver permanece en las faltas computables provisionales, pero no
en las confirmadas. La política admite categorías recuperada, rechazada y
confirmada no recuperada para su integración posterior: recuperada no cuenta;
rechazada y no recuperada cuentan. Un cierre confirmado hace computables las
pendientes de recuperación. Estos casos se prueban como dominio, sin afirmar que
B13 ya ofrece las decisiones de B14 o el cierre HTTP de B15.

En B13 todas las J persistidas están sin resolver y `cierreConfirmado` es `false`.
Un grupo o intento `CERRADO` no prueba que se ejecutó un cierre específico de
asistencia. La condición calculada durante un registro abierto puede cambiar tras
correcciones o nuevas sesiones; no confirma acta ni resultado final de notas.
Si falta información necesaria no se publica una condición definitiva, incluso
si el numerador provisional supera el límite.

### Permisos y errores

Se conserva el alcance y la revalidación transaccional de B12. Docente escribe y
consulta sus grupos; los otros roles consultan según los permisos existentes.
El historial de estudiantes mantiene sus permisos propios. No se exporta la
entidad ORM al frontend ni se exponen consultas de resumen sin autorización.

Una versión obsoleta conserva HTTP 409 y rollback completo, sin recarga automática
que borre la captura. Si la consulta posterior a un guardado exitoso falla, se
conservan las marcas y versiones guardadas, se ocultan los resúmenes antiguos y se
solicita recargar. Un fallo de cálculo o auditoría dentro del guardado revierte toda
la transacción.

## Referencias técnicas

Se mantienen las versiones y dependencias instaladas. PostgreSQL 18 agrega los
conteos con [FILTER](https://www.postgresql.org/docs/18/sql-expressions.html).
El cálculo agregado se obtiene en una sola sentencia, conforme al
[aislamiento de transacciones](https://www.postgresql.org/docs/18/transaction-iso.html).
El historial conserva su transacción `REPEATABLE READ`; el registro conserva la
autorización y bloqueos existentes. La aritmética exacta utiliza
[BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)
del runtime actual, sin añadir librerías.

## Verificación y límites

Política: fracciones exactas alrededor del 30 %, tardanzas restantes, estados de J,
cero sesiones, pendientes y validación de parámetros. Integración: consultas con
permisos, correcciones, cambio de denominador, intentos, versiones, concurrencia,
rollback y conservación de resultados confirmados. Navegador: matriz, historial,
resúmenes provisionales, móvil y fallo de consulta posterior al guardado.

Resultados ejecutados y demostración reproducible: [B13](../B13-calculo-asistencia.md).
La revisión y aceptación de una persona del equipo siguen pendientes; estas pruebas
usan datos sintéticos y no constituyen un piloto institucional.
