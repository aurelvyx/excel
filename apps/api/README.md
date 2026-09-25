# API del Centro de Idiomas Excel

NestJS 12 y TypeScript. Ejecutar desde la raíz del workspace con pnpm.
Consulta el [README principal](../../README.md) para entornos, PostgreSQL,
migraciones, datos sintéticos, pruebas y comandos de inicio.

B01 expone `/api/v1/health` y `/api/docs`. B02 integra PostgreSQL mediante
TypeORM con migraciones explícitas. B03 incorpora login, logout, sesiones,
gestión de usuarios y roles, CSRF y auditoría. No hay aún endpoints académicos.
Consulta [B03: acceso y usuarios](../../docs/B03-acceso-y-usuarios.md).
