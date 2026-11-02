# ADR-013 — Resultados confirmados y corrección del acta

Fecha: 14 de octubre de 2026. Historia: B18, RF43–RF46, CU16–CU18.
Estado: decisión técnica implementada; aceptación humana pendiente.

## Contexto

B15 conserva el cierre de asistencia y B17 calcula notas desde criterios aprobados.
Faltaba confirmar la condición académica, cerrar el intento y permitir correcciones
posteriores que no dejasen resultados desactualizados. El esquema ya incluye
`cierres_academicos` y un resultado por matrícula; no se necesita otra tabla.

## Decisión

Una política de dominio combina las proyecciones existentes. Solo emite condición
calculada con datos completos y reglas conservadas del intento. Da prioridad al
exceso exacto de asistencia; después compara la nota oficial con la mínima guardada.
No confunde consulta, condición calculada y confirmación administrativa.

Cerrar el acta requiere previamente el cierre de asistencia: fija las sesiones y
el tratamiento definitivo de J no recuperadas. Se exige completar todas las notas,
también para retiro, para conservar un acta completa. Se permite consolidar un grupo
o periodo ya cerrado; no se permite PLANIFICADO ni se cambian esos estados.

ADMIN confirma una revisión SHA-256 de todo el grupo. Una transacción con bloqueo
del grupo inserta ACTA y resultados, cierra las matrículas y registra auditoría.
El evento original es inmutable. Los resultados guardan referencias a cierre y
configuración, versión y snapshot de reglas y cálculos. La confirmación corresponde
exactamente a la fecha del cierre; las correcciones conservan esa fecha inicial.

Las correcciones usan el acta y versiones de registro y resultado, motivo obligatorio
y recálculo en la misma transacción. No-op normalizado no cambia versiones.
El flujo B15 de corrección se reutiliza dentro de esta transacción y se bloquea
por su ruta anterior después del cierre de acta. No se habilita reapertura.

La BD verifica al commit la correspondencia entre datos y resultado usando numeric
exacto y la misma fórmula jerárquica aprobada. El contexto de comando es local a la
transacción y no es un sustituto de permisos, sesión, auditoría o protección CSRF.
Las verificaciones diferidas permiten escribir las partes del cierre/corrección
sin permitir que se confirmen parcialmente. Se conservan bloqueos de grupo y
actualización de fila para detectar carreras con snapshots antiguos.

## Consecuencias

El promedio persistido conserva hasta diez decimales. Los registros legacy mantienen
procedencia nula y no se actualizan ni convierten automáticamente en actas aprobadas.
Los helpers de pruebas históricas permanecen limitados a bases sintéticas con
nombre permitido; no se incluye un bypass en la aplicación.

Evaluación importa servicios de asistencia; asistencia no importa evaluación.
Se reutilizan persistencia de notas y corrección de marcas para conservar sus
validaciones e historial. La UI comparte diálogos y componentes de contexto,
campos, tablas, resúmenes y etiquetas de condición. No se agregan dependencias.

El cierre no genera XLSX ni cambia la aprobación institucional de criterios.
La reversión se prueba sin datos y se rechaza con actas o promedios que perderían
precisión al volver a dos decimales, para proteger también el historial legacy.
