# B03 Acceso, usuarios, roles y auditoría

Implementación backend de RF01–RF04 y RF55, CU01–CU02. La pantalla de acceso y
el menú por rol corresponden a B05. No hay portal del estudiante.

## Preparar el primer administrador

Después de preparar los entornos descritos en el README:

```sh
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
```

Desde PowerShell, solicitar la contraseña sin mostrarla ni escribirla en el historial:

```powershell
$env:BOOTSTRAP_ADMIN_USERNAME = Read-Host 'Nombre del administrador'
$env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Contraseña temporal (12–128 caracteres)' -AsSecureString)).Password
try {
  pnpm admin:bootstrap
} finally {
  Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:BOOTSTRAP_ADMIN_USERNAME -ErrorAction SilentlyContinue
}
```

El comando requiere las migraciones, crea una cuenta temporal y su evento de auditoría
en una transacción, y falla si ya hay un administrador activo. No tiene credenciales
predeterminadas y no convierte la cuenta inactiva del seed B02 en una cuenta operativa.
No guardar BOOTSTRAP_ADMIN_PASSWORD en archivos versionados.

Iniciar la API con `pnpm dev:api`. Swagger está en
http://127.0.0.1:3000/api/docs y el contrato en /api/openapi.json.

## Contratos

Todas las rutas siguientes usan el prefijo `/api/v1`.

| Método y ruta | Entrada | Permiso y resultado |
| --- | --- | --- |
| POST /auth/login | nombreUsuario, password | Público; cookie HttpOnly, usuario y csrfToken |
| GET /auth/me | Cookie | Sesión válida; usuario y csrfToken |
| POST /auth/password | passwordActual, passwordNueva | Cambia la propia clave, revoca todas las sesiones; 204 |
| POST /auth/logout | JSON vacío | Revoca sesión y borra cookie; 204 |
| GET /usuarios | after y limit opcionales | ADMIN; lista de hasta 100 usuarios y nextCursor |
| GET /usuarios/roles | — | ADMIN; catálogo activo de roles |
| POST /usuarios | nombreUsuario, passwordTemporal, roles, personaId opcional | ADMIN; crea cuenta temporal y roles; 201 |
| PATCH /usuarios/:id | nombreUsuario, activo o personaId; motivo obligatorio | ADMIN; actualiza e invalida sesiones |
| PUT /usuarios/:id/roles | roles y motivo | ADMIN; reemplaza roles e invalida sesiones |

Las escrituras requieren `Content-Type: application/json` y `Origin` autorizado.
Login requiere `X-Requested-With: Excel-Web`. Después de entrar, enviar
`X-CSRF-Token` con el csrfToken recibido en cada POST, PATCH o PUT autenticado.
El navegador administra la cookie HttpOnly. En clientes HTTP manuales se debe
conservar la cookie y enviar explícitamente Origin, JSON y las cabeceras indicadas.

Para probar desde Swagger: ejecutar login con X-Requested-With, conservar el csrfToken
de la respuesta y usarlo en /auth/password. Tras cambiar la clave, iniciar sesión
nuevamente. Las cookies del mismo origen las conserva el navegador; no se copia el
token de sesión a almacenamiento de JavaScript. El primer administrador no puede
gestionar cuentas hasta cambiar su contraseña temporal.

Los roles válidos son ADMIN, SECRETARIA, DOCENTE y COORDINADOR; se admiten varios.
`personaId` referencia una persona existente y se puede desvincular con null al editar.
Las cuentas se inactivan; no existe borrado físico. Ninguna respuesta contiene hashes
ni contraseñas. El usuario se identifica con cadenas BIGINT.

Errores: 400 entrada inválida, 401 credenciales/sesión inválidas, 403 permisos o CSRF,
404 usuario inexistente, 409 duplicado o intento de retirar el último administrador,
429 límite de intentos. Formato uniforme: `statusCode` y `message`.

La sesión expira a los 15 minutos. Los cambios de cuenta o roles exigen volver a
iniciar sesión. Cambiar la propia contraseña invalida también las otras sesiones.
`WEB_ORIGINS` acepta orígenes exactos separados por comas; en producción es obligatorio
y todos deben ser HTTPS. Ver ejemplos en `apps/api/.env.example`.

## Verificación y límites

Ejecutar desde la raíz:

```sh
pnpm check
pnpm test:db
```

La suite usa PostgreSQL temporal y bases separadas para B02 y B03; no migra la base
persistente. Comprueba login, logout, expiración, manipulación de tokens, contraseñas
temporales, revocación de sesiones, CSRF, límites de intentos, DTO, permisos de cada
rol, gestión de cuentas, múltiples roles, auditoría inmutable, rollback si falla la
auditoría y protección del último administrador bajo concurrencia. Incluye el
contrato OpenAPI y la creación/reversión/reaplicación de las cuatro migraciones.

Resultados locales de esta entrega: 15 pruebas unitarias, 3 de contrato HTTP,
3 de herramientas y 53 de integración PostgreSQL (32 B02 + 21 B03), además de tipos,
lint y compilación. Las comprobaciones PostgreSQL pasaron; el contenedor y su red
se eliminaron al finalizar. El workflow incluye estas suites, pero su ejecución
remota en GitHub y la revisión cruzada siguen pendientes.

No se ha creado una cuenta operativa ni ejecutado la migración sobre tu base local.
La interfaz B05, el restablecimiento administrativo RF05, la consulta de auditoría
RF54 y los permisos sobre operaciones académicas futuras siguen fuera de esta entrega.
La aceptación formal requiere la revisión y demostración previstas en AGENTS.md.

Decisiones técnicas: [ADR de B03](decisiones/ADR-002-acceso-roles-auditoria.md).
