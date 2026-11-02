# Acceso, roles y auditoría de B03

Estado: implementado y probado localmente; pendiente revisión del equipo.
Fuentes: B03 del Plan de Desarrollo, RF01–RF04 y RF55 del Catálogo, CU01–CU02,
diccionario de usuarios/roles/auditoria_eventos y AGENTS.md. La interfaz de acceso
está planificada en B05 y la consulta de auditoría en RF54.

## Sesiones y seguridad

Se concreta el transporte por cookie HttpOnly propuesto en arquitectura. Se sustituye
el JWT sugerido por un token opaco aleatorio de 256 bits y sesiones persistidas en
PostgreSQL. Es una decisión técnica: permite revocar inmediatamente en logout,
cambio de contraseña, inactivación o cambio de roles sin añadir infraestructura.
No cambia ninguna regla académica. La nueva migración es aditiva y mantiene las
migraciones B01–B02 y sus restricciones.

La sesión dura 15 minutos absolutos, sin renovación silenciosa. Se guarda solo el
SHA-256 del token. La cookie excel_session es HttpOnly, SameSite=Strict, host-only,
Path=/api/v1 y Secure en producción. El servidor consulta estado y roles activos
en cada solicitud. No hay tokens en localStorage ni contraseñas en respuestas.

Las escrituras exigen JSON y Origin exacto de WEB_ORIGINS. Login exige además
X-Requested-With: Excel-Web; las escrituras autenticadas requieren X-CSRF-Token.
El CSRF se deriva con SHA-256 de un prefijo de propósito y el token secreto de sesión,
y se compara en tiempo constante. Se entrega en login y GET /auth/me para permitir
recargar la interfaz; no se almacena en auditoría. La API no habilita CORS y el
desarrollo usa el proxy de Vite. En producción los orígenes deben usar HTTPS.

Argon2id almacena las contraseñas (19 MiB, 2 iteraciones, paralelismo 1, salt aleatoria).
La política técnica inicial acepta 12–128 caracteres en nuevas contraseñas y nombres
de usuario de 3–60 caracteres ASCII alfanuméricos, punto, guion y guion bajo.
Se conservan mayúsculas/minúsculas: la identidad del nombre es exacta en PostgreSQL.
El cambio de la contraseña propia exige la actual y revoca todas las sesiones.
Toda cuenta creada por administrador usa contraseña temporal y solo puede consultar
su sesión, cambiarla o salir hasta completar el cambio.

Se limita login a 10 solicitudes por minuto e IP y el cambio de contraseña a 5.
El almacenamiento del limitador es en memoria, coherente con el monolito de una
instancia; se reinicia al reiniciar el proceso. No se confía en X-Forwarded-For.
Antes de desplegar detrás de un proxy se debe definir expresamente la confianza
en ese proxy; no habilitar trust proxy indiscriminadamente. No hay bloqueos permanentes
de cuentas ni restablecimiento de contraseña (RF05 sigue pendiente).

## Permisos y consistencia

Un guard global deniega rutas sin una política explícita. Health y login son públicos;
Swagger expone solo documentación. Usuarios y roles son exclusivamente ADMIN.
DOCENTE, SECRETARIA y COORDINADOR no pueden operar esos endpoints ni escalar sus
propios permisos mediante cuerpos HTTP. Los IDs y roles vienen de la sesión consultada
en la base, nunca del cliente. Cada operación de usuarios vuelve a comprobar al actor
dentro de su transacción.

El bootstrap y las mutaciones administrativas se serializan con un bloqueo asesor
transaccional. Se impide dejar el sistema sin administradores activos, incluso con
solicitudes concurrentes. Se pueden asignar varios roles, todos pertenecientes al
catálogo activo. El reemplazo de roles revoca sesiones y conserva antes/después en
auditoría. La inactivación conserva identidad e historial.

La autorización por pertenencia a grupos se implementará al exponer sus operaciones
en B04 y las historias académicas. No se publican endpoints académicos en B03.

## Auditoría y migración

La cuarta migración crea sesiones_usuario y auditoria_eventos conforme al diccionario,
con índices por usuario, entidad y fecha. Un trigger rechaza UPDATE, DELETE y TRUNCATE
de auditoría. Una cuenta con privilegios de DBA puede alterar el esquema; estos controles
no sustituyen la separación de credenciales de migración y operación en producción.
No existe endpoint para editar o eliminar auditoría.

Eventos implementados: BOOTSTRAP_ADMIN, LOGIN, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED,
ACCESS_DENIED, CREATE, UPDATE, INACTIVATE y ROLES_CHANGED. Las mutaciones y su evento
se confirman o revierten juntos. Los snapshots contienen solo atributos permitidos:
identificador, nombre de usuario, persona vinculada, estado, cambio requerido y roles.
No se registra el cuerpo completo, contraseña, hash de contraseña, cookie, token ni CSRF.
Para un login de cuenta inexistente no se guarda el nombre intentado.

La reversión de esta migración se rechaza cuando ya hay sesiones o eventos; no se
elimina evidencia para forzar un rollback. El historial anterior permanece intacto.

## Dependencias y contratos

Se añaden class-validator/class-transformer para DTO, cookie-parser para cookies
y @nestjs/throttler para limitación de intentos. Se reutilizan Argon2 y TypeORM.
Los controladores delegan las consultas parametrizadas y transacciones a los servicios.
OpenAPI documenta entradas, sesiones y respuestas de usuarios; se comprueba por HTTP.

Referencias consultadas: [autorización NestJS](https://docs.nestjs.com/security/authorization),
[validación](https://docs.nestjs.com/techniques/validation),
[cookies](https://docs.nestjs.com/techniques/cookies),
[limitación de solicitudes](https://docs.nestjs.com/security/rate-limiting) y
[protección CSRF de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
