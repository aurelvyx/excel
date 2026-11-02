# B19 — Reportes XLSX de demostración

Implementación solicitada el **15 de octubre de 2026**. El equipo eligió
explícitamente **«Formatos de demostración por ahora»**. Las plantillas y todos
los archivos descargados permanecen como **BORRADOR**, sin emisión oficial.
Trazabilidad: B19, RF49, subconjunto RF51, RF52–RF53, CU19, RN32–RN33.
Fuentes: `AGENTS.md`, los seis documentos de análisis/diseño y el inventario B10.

## Alcance y uso

En **Reportes**, seleccionar el grupo y el tipo de reporte. También hay enlaces
desde grupos, calificaciones y acta. La vista conserva periodo, idioma, nivel,
grupo, turno y sección. La página de 20 intentos no limita la descarga: los
conteos y el archivo incluyen el grupo completo. Revisar los pendientes y la
confirmación antes de **Generar XLSX**. El historial identifica cada generación.

| Reporte | Usuarios | Idiomas | Contenido |
| --- | --- | --- | --- |
| Matriz de notas | Administrador, coordinación y docente asignado activo | EN/PT | Notas por indicador, promedio exacto, nota calculada, asistencia y condición confirmada |
| Resumen de participantes, basado en Anexo 05 | Administrador y coordinación | EN/PT | Una fila por grupo, unidades/créditos/horas, fechas del periodo e intentos/aprobados |

Secretaría no recibe permisos de estos dos reportes: ficha y nómina, previstos
para ese rol, quedan fuera de este primer conjunto. Un rol adicional sin permiso
B19 no amplía el alcance docente. Se protegen consulta, generación e historial
en el servidor, incluso al revocar sesión, rol, persona o asignación.

Una lectura no registra una exportación. Cada generación válida registra usuario,
tipo, grupo, filtros, fecha, plantilla/versiones, revisión, cantidad de intentos,
nombre y SHA-256 del archivo, además de un evento `EXPORT_XLSX`. La transacción
termina antes de responder con el binario. No se almacenan copias del archivo ni
datos personales en ese registro. Un registro acredita **generación**, no recepción
efectiva: perder la respuesta o el archivo local no elimina su historial.

## Datos y reglas conservadas

La API utiliza los servicios de B13/B15 y B17 y los resultados persistidos B18.
No se leen celdas de las muestras como fuente de datos. El libro no recalcula
notas, redondeo, faltas ni condición mediante otra fórmula académica.

- Nota registrada cero: celda numérica `0.00`. Pendiente: celda vacía.
- Promedio con hasta diez decimales; `12.495` no se convierte primero en 12.50.
  La nota oficial calculada viene de B17. La condición solo aparece para resultados
  confirmados con la procedencia del acta, configuración y plan actuales.
- Un resultado histórico sin esa procedencia no se atribuye al acta actual.
  Si falta cualquier resultado confirmado, los conteos de aprobados, desaprobados
  y retirados quedan pendientes; no se sustituyen por cero. Cero real se conserva.
- Se incluyen intentos ACTIVA/CERRADA, también retirados; se excluyen solicitudes
  PENDIENTE y ANULADA. Una repetición sigue siendo otro intento. El conteo propuesto
  no representa personas únicas y se identifica así en la vista y el XLSX.
- Las notas requieren criterios aprobados aplicados al grupo para exportar la
  matriz. El resumen puede mostrar datos aún incompletos como borrador.
- La asistencia abierta, incompleta o con justificaciones pendientes puede ser
  parcial/provisional; se advierte en la vista y el libro. No produce por sí sola
  una condición académica confirmada.
- Créditos y horas proceden de las unidades activas del nivel. Si faltan créditos,
  se conserva el pendiente. Son datos actuales del catálogo, no una certificación
  histórica de la malla curricular de cada intento.

Se proponen idioma como programa y nivel como módulo, y fechas del periodo como
fechas de referencia. No se afirma que sean equivalencias institucionales aprobadas
ni fechas reales de clases. Institución, código modular, resolución, director,
DRE/GRE, UGEL, familia CNOF, tipo de programa y modalidad permanecen pendientes.
No se inventan ni se copian responsables, documentos o firmas de los originales.

## Plantillas y mantenimiento

Los cuatro diseños de ejecución están en `apps/api/templates/reportes/`:
matriz y resumen EN/PT, una hoja cada uno. `registro.json` fija identificador,
versión, idioma, tipo, hoja, filas y hash. Una alteración sin actualizar/revisar
la versión impide exportar. La validación reproducible es:

```sh
pnpm b19:plantillas
```

Son diseños nuevos propuestos, basados en los campos observados en B10. No son
copias exactas ni versiones aprobadas de los originales. La matriz admite los
indicadores configurados y todas las filas permitidas, preserva encabezado e
identidad al desplazarse y agrega un conteo del padrón completo. El resumen tiene
una fila por grupo, sin duplicarla en una fila de totales. Formatos de número,
porcentaje y fecha conservan tipos numéricos; documentos y códigos son texto.

Las muestras privadas de `.tmp/b10` no se modificaron ni se incorporaron a Git.
Los XLSM contienen registros y responsables; además, sus fórmulas de indicadores,
promedio final y distribución de notas tienen rangos incompletos. Se conservan
como referencia, sin macros ni importación automática. El [registro B10](plantillas/README.md)
sigue manteniendo sus propias huellas y estado de aprobación pendiente.

Las plantillas se prepararon con Artifact Tool y se normalizó únicamente el
prefijo XML de SpreadsheetML a namespace predeterminado para compatibilidad con
ExcelJS; no cambian nombres expandidos, valores ni relaciones OOXML. Los cuatro
libros se reabren en el adaptador y sus exports se verifican por celdas y totales.
ExcelJS **4.4.0**, nueva dependencia exclusiva de API, se encapsula en un solo
adaptador para conservar formato y no mantener un escritor ZIP/XML propio en
producción. Contrato consultado: [documentación de ExcelJS](https://github.com/exceljs/exceljs/tree/v4.4.0#reading-xlsx).

En una futura distribución del servidor se debe incluir `apps/api/templates/`
junto a `apps/api/dist/`; la ruta se resuelve desde el módulo, no desde el directorio
de ejecución. Los originales privados no son necesarios para ejecutar los reportes.
Cambiar un diseño requiere nueva versión y revisión de celdas/estructura/huella,
sin reescribir el historial de archivos ya generados.

## Contratos e integridad

OpenAPI **0.19.0**. Base `/api/v1/reportes/grupos/{grupoId}`:

| Método | Ruta | Operación |
| --- | --- | --- |
| GET | Base, `tipo`, `after` y `limit` | Vista previa y revisión de todo el grupo |
| POST | `/exportaciones`, `{tipo, revision}` | XLSX binario y registro transaccional |
| GET | `/exportaciones`, `after` y `limit` | Historial autorizado de metadatos |

Solo se aceptan `MATRIZ_NOTAS` y `RESUMEN_PARTICIPANTES`. No hay modo oficial ni
endpoint de aprobación. Los códigos de idioma soportados son EN/PT y DEMO-EN/PT;
no se adivina el idioma a partir del nombre. Otro código necesita un mapeo revisado.
El POST exige sesión, Origin y CSRF, devuelve Content-Disposition seguro,
`X-Exportacion-Id` y `Cache-Control: no-store`. El cliente comparte el mismo
tratamiento de errores/sesión que JSON y revoca las URLs temporales de descarga.

La revisión cubre el grupo entero, configuración, datos y versiones, resultados,
unidades y plantilla; no depende de la página visible. Un cambio obliga a revisar
de nuevo. Los límites técnicos son **5000 intentos y 100 indicadores**; se rechaza
el exceso antes de exportar, sin truncar silenciosamente. HTTP 400: entrada inválida;
401/403: acceso; 404: grupo inexistente; 409: revisión/plantilla/estado incompatibles.

La migración **`1790208015000-exportaciones.ts`**, decimosexta, crea `exportaciones`:
el esquema pasa a **31 tablas**. Impide UPDATE, DELETE y TRUNCATE de esa evidencia.
La reversión rechaza registros o auditoría de exportación existentes. Antes de
utilizar esta versión sobre la base local, ejecutar `pnpm db:migrate`.
Decisión técnica: [ADR-014](decisiones/ADR-014-reportes-demostracion.md).

## Verificación y pendientes

Verificación local del **15 de octubre de 2026**, con datos sintéticos:

| Comprobación | Resultado |
| --- | --- |
| `pnpm check` | Análisis, tipos y compilación API/web correctos; 349 pruebas unitarias, 3 HTTP y 14 de herramientas aprobadas |
| `pnpm test:db` | 569 pruebas aprobadas en 27 archivos, sin fallos; incluye 21 de API B19 y 8 de navegador B19 |
| Migraciones | 16 desde base limpia, 31 tablas; reversión completa y reaplicación correctas; evidencia de exportaciones protegida |
| `pnpm b19:plantillas` | Las cuatro estructuras y huellas coinciden con su registro |
| `pnpm b10:plantillas .tmp/b10` | Las cuatro fuentes privadas conservan sus huellas y aprobación pendiente |
| Revisión XLSX independiente | Cuatro archivos generados reabiertos y renderizados con Artifact Tool; celdas, fórmulas de conteo y presentación comprobadas |
| Revisión visual web | Inglés/portugués, escritorio/móvil, paginación y conflicto de revisión comprobados con navegador real |

Total: **935 pruebas aprobadas**. La primera ejecución detectó tres errores de
preparación de pruebas: lectura incorrecta del retorno de UPDATE en portugués y
una modificación de resultado cerrado que las restricciones rechazaban. Se
corrigieron las fixtures y se repitió toda la suite de base de datos correctamente,
sin debilitar las reglas académicas ni las restricciones. El informe de la última
ejecución queda en `.tmp/verificacion/pruebas.json`; capturas y archivos sintéticos
de comprobación quedan en `.tmp/b19/`, fuera de Git.

Otro agente revisó el motor, los permisos y las pantallas. Estas verificaciones
no acreditan apertura manual en Microsoft Excel, aceptación humana, piloto
institucional ni ejecución remota de GitHub Actions.

RF49/RF52/RF53 quedan implementados para esta demostración; RF51 se limita al
resumen basado en Anexo 05 de ambos idiomas. Siguen pendientes aprobación de
formatos y equivalencias, campos institucionales y destinatarios, cotejo con una
versión institucional aceptada, prueba manual en Excel y aceptación humana.
No se da por implementado todo RF47–RF53 ni por cerrado el sprint 4.
