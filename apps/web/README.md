# Web del Centro de Idiomas Excel

React 19, TypeScript y Vite. Ejecutar `pnpm dev:web` desde la raíz, junto con
`pnpm dev:api` y PostgreSQL configurado. Abrir http://127.0.0.1:5173.

La interfaz B05 incorpora inicio/cierre de sesión, cambio de contraseña, menú por
rol, catálogos académicos, docentes, asignaciones y usuarios/roles. Usa la API real
mediante `/api`; no guarda credenciales en almacenamiento del navegador.

La navegación con fragmentos conserva los filtros al recargar y permite enlaces
directos. El administrador edita configuración; secretaría/coordinación consultan
oferta y el docente solo sus grupos. Los permisos se comprueban nuevamente en NestJS.

Ver [guía B05](../../docs/B05-interfaz-y-configuracion.md) para preparar el acceso,
utilizar cada pantalla, ejecutar pruebas y conocer los límites de esta entrega.

Organización: `src/features/auth`, `src/features/configuration` y `src/shared`
(cliente API, navegación y diálogo). El navegador se verifica mediante
`apps/api/test/web.integration-spec.ts`, iniciado por `pnpm test:db` con PostgreSQL
temporal. Instalar antes Chromium con `pnpm --filter api exec playwright install chromium`.
