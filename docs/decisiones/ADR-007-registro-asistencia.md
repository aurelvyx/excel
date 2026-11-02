# ADR-007 — Registro transaccional y versiones de asistencia

Fecha: 6 de octubre de 2026. Historia B12; RF29 y registro/corrección de RF30.
Estado: decisión técnica de implementación; aceptación del equipo pendiente.

## Contexto

B11 permite programar clases, pero una fecha programada no confirma que la clase
ocurrió. El modelo B06 ya conserva una marca por sesión e intento, con origen y
fecha de modificación. La captura masiva necesita preservar pendientes, auditoría
y cambios concurrentes sin sobrescribir registros ajenos.

## Decisión

Reutilizar `asistencias` y `sesiones_clase`, con GET/PATCH por sesión, lotes limitados
y validación anidada. Usar versiones enteras: `null` para crear y la versión leída
para corregir. Comparar versiones con las filas bloqueadas antes de persistir el
lote. Cualquier conflicto o error revierte todas las filas. Un envío sin cambios
con versión vigente no genera otra revisión.

El primer guardado de una marca confirma `PROGRAMADA` → `REALIZADA`, con aviso
explícito en la interfaz y auditoría en la misma transacción. No se registra en
fechas futuras según America/Lima, sesiones canceladas, matrículas no activas,
grupos no activos o periodos no abiertos. Es una protección técnica de la captura
de clases ocurridas; no establece qué sesiones se computan en el porcentaje de B13.

Mantener origen inmutable y eventos anterior/nuevo con editor y fecha. Agregar una
migración incremental de versión positiva y protección de identidad/origen. Su
reversión rechaza historial para no retirar el control de concurrencia sobre datos
persistidos. Las claves y prohibición de borrado existentes se conservan.

Aplicar autorización y alcance de grupo en servidor dentro de la transacción.
El registro ordinario abierto requiere rol docente y asignación activa, incluso
si la cuenta también es administradora. ADMIN por sí solo conserva la consulta;
la corrección administrativa posterior al cierre corresponde al flujo separado
de B15, con motivo y auditoría. Esta separación sigue AGENTS.md 3.2 y RF29–RF30.
Bloquear contexto, sesión, intentos y marcas durante la escritura. Los permisos
de lectura no amplían el permiso docente para registrar grupos ajenos.

Compartir contexto académico en API y web; extraer la política independiente de
HTTP y el guardado de navegación con cambios pendientes en un hook reutilizable.
El frontend consume permisos y versiones de la API y no calcula resultados académicos.
No se añaden bibliotecas, infraestructura ni tablas de cierre.

## Consecuencias y alcance pendiente

Las filas sin marca siguen pendientes. La acción masiva afecta solo la página
visible y requiere guardado explícito. Un conflicto conserva la captura y exige
recargar antes de reenviar. El historial de otros intentos permanece separado.

El cierre específico y las correcciones administrativas con motivo dependen de
B15. B13 determina el denominador y los cálculos; B14 resuelve las justificaciones.
No se publica un retiro, porcentaje ni descuento de `J` desde esta entrega.

Referencias de implementación: [validación NestJS](https://docs.nestjs.com/techniques/validation),
[select controlado React](https://react.dev/reference/react-dom/components/select) y
[bloqueos PostgreSQL 18](https://www.postgresql.org/docs/18/explicit-locking.html).
