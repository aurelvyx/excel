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
