# ADR-014 — XLSX de demostración y generación registrada

Fecha: 15 de octubre de 2026. Historia B19, RF49/RF51–RF53, CU19.
Estado: decisión técnica implementada; formato institucional pendiente.

## Contexto y autorización

El registro B10 mantiene cuatro muestras privadas sin aprobación. El equipo indicó
explícitamente usar **formatos de demostración por ahora**. Se priorizan matriz
de notas y resumen de participantes basado en Anexo 05, EN/PT. No se amplían a
ficha, nómina, todos los anexos ni emisión oficial.

## Decisión

Se preparan cuatro plantillas nuevas, sin datos de personas ni macros, con una
hoja útil por libro y un registro versionado de hashes/mapeos. No se copian las
fórmulas académicas defectuosas ni las hojas operativas de los XLSM. Todos los
archivos dicen BORRADOR y no existe una opción para emitirlos como oficiales.
Los datos institucionales faltantes quedan pendientes.

Un adaptador ExcelJS4.4.0 completa la instantánea persistida autorizada; los
cálculos académicos pertenecen a los servicios existentes. La matriz es dinámica
y el resumen conserva una sola fila del grupo. Los conteos por intento, la
equivalencia idioma/programa y nivel/módulo y las fechas del periodo se presentan
como propuestas, sin convertirlas en definiciones institucionales.

El POST vuelve a autorizar rol/propiedad y comprobar revisión dentro de una
transacción que bloquea el contexto. Generar, registrar metadatos y auditar son
atómicos; un fallo no devuelve un archivo como generado correctamente. Una vez
confirmada la transacción, la pérdida de la respuesta no borra la evidencia ni
prueba entrega. No se guardan binarios ni datos personales en `exportaciones`.

El cliente reutiliza sesión, CSRF y errores del cliente compartido; recibe el
binario sin base64, valida cabeceras y libera la URL temporal. El historial respeta
los permisos por tipo y grupo, también para combinaciones de roles.

## Consecuencias

Una sola dependencia nueva de API, encapsulada; sin dependencias de web ni nueva
infraestructura. Los assets se distribuyen junto al servidor. Hash y versión
permiten identificar la plantilla usada sin modificar generaciones anteriores.
La evidencia es inmutable y su reversión falla si existe historial.

La migración y el flujo se prueban con PostgreSQL temporal. La compatibilidad se
comprueba reabriendo XLSX, comparando datos y con renderizado independiente; eso
no equivale a una revisión manual de Microsoft Excel. La aceptación institucional
y las variantes no priorizadas siguen pendientes.
