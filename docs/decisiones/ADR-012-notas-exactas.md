# ADR-012 — Notas versionadas y promedio exacto

Fecha: **14 de octubre de 2026**. Estado: implementado y verificado técnicamente;
aceptación humana y criterios institucionales concretos pendientes.
Trazabilidad: B17, RF39–RF42, CU15/UI08, RN21, RN23, RN27–RN28 y RN31.

## Contexto y decisión

El esquema existente conserva notas por matrícula/indicador con dos decimales.
B16 proporciona una versión aprobada e inmutable por grupo. RN23 exige que 0,5
suba; un promedio redondeado antes de calcular la nota oficial puede cambiarla.

1. Mantener la precisión de entrada de dos decimales y transmitir notas como texto.
   Captura coma/punto, transporte punto y salida normalizada a dos decimales.
   Cero es una nota; pendiente es ausencia de registro. No borrar notas guardadas.
2. Aplicar la fórmula jerárquica aprobada de B16 con `BigInt`. Nota en centésimas
   por dos pesos en puntos base produce denominador 10^10. Conservar el promedio
   exacto y redondear una sola vez la fracción para la nota oficial.
3. No calcular un promedio parcial que repondere las notas presentes. Si falta
   una calificación, promedio/nota oficial quedan pendientes. No usar pesos futuros.
4. Derivar el promedio de notas persistidas en la API y reutilizarlo en matriz e
   historial. No persistir una condición ni modificar resultados académicos en B17.
5. Solo docente asignado registra notas abiertas. Otros roles consultan; después
   del cierre nadie modifica notas mediante B17. B18 añadirá el flujo administrativo.
6. Mantener independencia de asistencia/acta. Estados de grupo/periodo y matrícula
   gobiernan la escritura; un resultado académico existente del intento la bloquea.
7. Usar revisión por celda y lotes atómicos. No-op con versión vigente no genera
   modificaciones falsas; revisión obsoleta siempre produce conflicto. Auditoría
   y recálculo pertenecen a la misma transacción que cada nota.
8. Sustituir el typmod de `numeric(4,2)` por CHECK de rango y escala en `numeric`:
   SQL no puede transformar silenciosamente una entrada con precisión adicional.
   La precisión admitida y datos existentes se mantienen. Normalizar las lecturas
   a dos decimales también cuando la nota provenga de SQL con escala cero.
9. Versionar notas y conservar identidad, origen y fechas anteriores. Un cambio
   fija su fecha de corrección. Grupo compartido como exclusión de escrituras,
   resultados y actas; versiones MVCC protegen snapshots anteriores. No implementar
   cierre/reapertura real ni un mecanismo de excepción a notas cerradas.
10. Limitar lote a 2000 celdas y JSON a 512 KiB para una página de 20×100 criterios;
    permisos/DTO siguen validándose. Respuestas uniformes para JSON inválido y tamaño.
11. Reutilizar celdas, barra de captura, resumen, tabla, campos y guardia de cambios.
    React no contiene fórmula académica oficial. Matriz muestra una evaluación por
    vez y conserva capturas de las demás hasta guardar la página.

## Consecuencias y límites

`12.495` conserva esa media exacta y produce nota oficial 12; no pasa primero por
12.50. Valores incompletos no se interpretan como cero. La calificación de otro
intento o una nueva versión del nivel no altera el historial anterior.

Los resultados académicos almacenados se conservan: integración con asistencia,
confirmación de condición, acta y correcciones corresponden a B18. Plantillas,
piloto y respaldo conservan sus historias. No se agregan dependencias.

Las fixtures históricas usan únicamente bases aisladas sintéticas, con ajuste de
trigger transaccional y restauración automática por rollback si falla. Esa capacidad
no se expone en producción ni acredita una importación o aprobación institucional.

## Referencias y comprobación

Se consultaron los métodos de Nest Express 12 instalados y el
[límite del parser de NestJS](https://docs.nestjs.com/faq/raw-body#body-parser-size-limit).
El CHECK evita la conversión por escala descrita en
[numeric de PostgreSQL 18](https://www.postgresql.org/docs/18/datatype-numeric.html).
Las operaciones usan únicamente el gestor de la transacción de TypeORM.

Política, API/BD y navegador prueban límites, exactitud, permisos, revisiones,
rollback y conservación de intentos. Resultados y limitaciones:
[B17](../B17-calificaciones-promedio.md).
