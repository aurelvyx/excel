# API del Centro de Idiomas Excel

NestJS 12 y TypeScript. Ejecutar desde la raíz del workspace con pnpm.
Consulta el [README principal](../../README.md) para entornos, PostgreSQL,
migraciones, datos sintéticos, pruebas y comandos de inicio.

B01 expone `/api/v1/health` y `/api/docs`. B02 integra PostgreSQL mediante
TypeORM con migraciones explícitas. B03 incorpora login, logout, sesiones,
gestión de usuarios y roles, CSRF y auditoría. B04 incorpora los catálogos académicos,
docentes y asignaciones con alcance por grupo y auditoría transaccional.
Consulta [B03: acceso y usuarios](../../docs/B03-acceso-y-usuarios.md).
Consulta [B04: oferta y docentes](../../docs/B04-oferta-y-docentes.md) para rutas,
permisos, ejemplos y límites de esta entrega.

B06 añade `/api/v1/estudiantes`: alta, búsqueda, edición auditada e historial
persistido por intento/nivel/periodo. Aplicar la quinta migración antes de iniciar.
Ver [B06: estudiantes e historial](../../docs/B06-estudiantes-historial.md).

B07 incorpora registro y decisión de vouchers en /api/v1/vouchers, con auditoría y protección transaccional. Aplicar la sexta migración. Ver [guía B07](../../docs/B07-vouchers.md).

B08 incorpora `/api/v1/matriculas`: solicitud pendiente, consulta individual y
confirmación de activación con voucher validado, prerrequisito y vacante.
Aplicar la séptima migración. Ver [guía B08](../../docs/B08-matriculas.md).
