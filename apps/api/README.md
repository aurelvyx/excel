# API Backend — Centro de Idiomas Excel

Servidor backend construido con **NestJS 12**, **TypeScript**, **TypeORM** y **PostgreSQL**.

Consulta el [README principal](../../README.md) para las instrucciones completas de instalación, variables de entorno, migraciones y ejecución del seeder de carga masiva realista (`pnpm db:seed:realistic`).

## Endpoints de referencia en desarrollo

- **Salud técnica:** `GET http://127.0.0.1:3000/api/v1/health`
- **Documentación Swagger:** `http://127.0.0.1:3000/api/docs`
- **Especificación OpenAPI JSON:** `http://127.0.0.1:3000/api/openapi.json`

## Módulos (`src/modules/`)

- `auth/` — Inicio/cierre de sesión, cookies HTTP-only, validación CSRF y guardias de autorización por rol.
- `usuarios/` — Administración de cuentas y asignación de roles.
- `control/` — Servicio centralizado de auditoría transaccional inmutable (`auditoria_eventos`).
- `oferta-academica/` — Idiomas, niveles, unidades didácticas, periodos académicos, turnos, secciones, grupos y asignación docente.
- `personas/` — Padrón de estudiantes, búsqueda e historial académico por intento.
- `matriculas/` — Gestión de vouchers (registro, validación, rechazo, duplicados autorizados) y matrículas (solicitud, activación, anulación).
- `asistencia/` — Sesiones de clase, matriz de asistencia (`P`, `T`, `F`, `J`), cálculo de condición por inasistencia (DPI 30 %), justificaciones y cierre de asistencia.
- `evaluacion/` — Planes de evaluación versionados por nivel, aplicación a grupos, registro matricial de calificaciones, cálculo de resultados y cierre de Actas Oficiales.
- `reportes/` — Generación y evidencia inmutable de reportes `.xlsx` (`ACTA_UGEL`, `MATRIZ_NOTAS`, `RESUMEN_PARTICIPANTES`).
