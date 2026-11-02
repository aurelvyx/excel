# B05: acceso, menú por rol y configuración

Implementación React conectada a la API B03/B04 y PostgreSQL. Trazabilidad del
backlog: UI01–UI02 y CU01–CU04. Cubre el acceso y cierre de sesión (RF01–RF02),
gestión de cuentas/roles (RF03–RF04), catálogos (RF06–RF12) y docentes (RF18).
RF05, RF13 y las variantes pendientes del plan no se declaran terminados.

## Iniciar y entrar

Desde la raíz, con los entornos, Docker y migraciones preparados según el README:

```sh
pnpm dev:api
```

En otra terminal:

```sh
pnpm dev:web
```

Abrir http://127.0.0.1:5173. Usar una cuenta activa. Si aún no existe administrador,
seguir el procedimiento de [B03](B03-acceso-y-usuarios.md). No existen credenciales
predeterminadas; el usuario inactivo de la carga DEMO no sirve para ingresar.

El primer acceso con contraseña temporal exige cambiarla antes de abrir cualquier
pantalla de trabajo. Al cambiar la contraseña se cierran todas las sesiones y se
solicita ingresar de nuevo. En **Mi cuenta** también se puede cambiar posteriormente.
Cerrar sesión revoca la sesión en el servidor; si no hay conexión, la interfaz
informa el fallo y permite reintentar, sin afirmar que se cerró remotamente.

La interfaz usa el proxy `/api` de Vite. Debe mantenerse el origen autorizado de
`WEB_ORIGINS`; por defecto funciona en localhost/127.0.0.1:5173. Si cambia el puerto
del frontend, actualizar esa variable de la API. Para producción siguen pendientes
el dominio, HTTPS, proxy y validación de despliegue de B21.

## Pantallas y recorrido

| Rol | Menú y acciones en B05 |
| --- | --- |
| Administrador | Inicio, idiomas, niveles, unidades, periodos, turnos, secciones, grupos, docentes y usuarios/roles. Altas y modificaciones. |
| Secretaría | Inicio y consulta de la oferta académica; sin edición de configuración ni acceso a perfiles docentes o usuarios. |
| Coordinación | Inicio y consulta de la oferta académica; sin edición. |
| Docente | Inicio y sus grupos asignados, con detalle de periodo, idioma/nivel, turno, sección y estado. |

Una cuenta con varios roles obtiene la unión de sus permisos. La API sigue
verificando rol y alcance en cada petición. Las URLs no habilitadas para el rol
muestran «Página no disponible». Las secciones de matrícula, notas y asistencia
se incorporarán cuando existan sus flujos; no hay indicadores académicos ficticios.

Orden sugerido para preparar la oferta:

1. Crear idiomas y niveles. Elegir el idioma, el orden y, si corresponde, un
   prerrequisito del mismo idioma y orden anterior.
2. Registrar unidades del nivel, créditos y horas. Los créditos aceptan punto y
   hasta un decimal; no se aplican pesos de evaluación supuestos.
3. Crear el periodo y sus fechas. Abrirlo para activar grupos.
4. Crear turnos y secciones; los horarios se completan en pareja o quedan vacíos.
5. Crear grupos y elegir sus referencias. La capacidad es opcional.
6. Registrar docentes. Si la persona ya existe, introducir su ID; si es nueva,
   completar los datos personales. Una identidad duplicada se rechaza.
7. En **Grupos → Asignar docentes**, elegir docente, tipo y fecha de asignación,
   estado y motivo. Se pueden consultar y modificar las asignaciones anteriores.
8. En **Usuarios y roles**, crear la cuenta, elegir uno o más roles y vincular la
   persona docente. Entregar su contraseña temporal por un canal apropiado.

Todos los formularios presentan una revisión antes de guardar. Las modificaciones
requieren motivo. La inactivación/cierre explica que se conserva el historial.
La edición de usuarios y roles advierte que se cerrarán sus sesiones. El backend
continúa protegiendo al último administrador y las referencias históricas.

Los formularios muestran errores junto al campo, conservan los datos ante errores
del servidor y distinguen guardado pendiente, éxito y conflicto. Los códigos,
fechas y valores institucionales son introducidos por el administrador.

Las tablas tienen filtros, páginas de 20 registros y acceso a la primera/siguiente
página. El contexto de filtros y cursor se mantiene en la URL, también al recargar
y usar atrás/adelante. Docentes permite filtrar por documento. Los selectores de
referencias recorren la paginación de la API para incluir todos los catálogos.
La consulta de grupos del docente recibe nombres legibles desde la propia API,
sin concederle acceso general a los catálogos.

La navegación usa fragmentos: `/#/`, `/#/configuracion/idiomas`,
`/#/consulta/grupos`, `/#/mis-grupos/grupos` y `/#/cuenta`. No requiere reglas de
reescritura adicionales para abrir enlaces de configuración. Las etiquetas,
foco visible, diálogos nativos y menú móvil permiten usar teclado y pantallas
pequeñas; las tablas se desplazan horizontalmente para conservar columnas legibles.

## Decisiones técnicas y seguridad

- Cliente común en `apps/web/src/shared/api.ts`, componentes de acceso en
  `features/auth` y configuración en `features/configuration`.
- Cookie HttpOnly de B03, CSRF únicamente en memoria y credenciales al mismo
  origen. No se guardan contraseñas, tokens o roles en localStorage/sessionStorage.
- La sesión se recupera al recargar y se comprueba al recuperar foco y cada minuto
  mientras la página está visible. Un 401 de una sesión vigente vuelve al acceso.
  Las respuestas antiguas no restauran una sesión que ya se cerró.
- Formularios explícitos de contrato, no derivados de entidades ORM. Las entradas
  conservan nombres y tipos B04. La proyección opcional `contexto` amplía únicamente
  las respuestas GET de grupos autorizados; no modifica tablas ni permisos.
- Diseño visual propuesto con vocabulario de los documentos. No constituye
  aprobación institucional de identidad visual o datos reales del centro.
- React 19 y APIs del navegador existentes; no se añadieron dependencias de
  producción. Playwright es una dependencia de desarrollo de la API para que la
  prueba integral pueda levantar NestJS, Vite y Chromium sobre la base aislada.

Referencias consultadas: [flujo de datos en React](https://react.dev/learn/thinking-in-react)
y [pruebas de navegador con Playwright](https://playwright.dev/docs/test-assertions).

## Pruebas y aceptación

Verificación local del 26 de septiembre de 2026: `pnpm check` y `pnpm test:db`
terminaron correctamente, sin advertencias de lint. Pasaron **94 pruebas**: 21 de
verificación general y 73 de integración, incluidas 8 con Chromium. Se revisaron
las capturas de inicio, configuración y móvil. Los servicios de prueba se cerraron
y el contenedor PostgreSQL temporal fue eliminado al finalizar.

```sh
pnpm check
pnpm --filter api exec playwright install chromium
pnpm test:db
```

En Linux/CI, usar `pnpm --filter api exec playwright install --with-deps chromium`.
`pnpm test:db` ejecuta las suites B02–B04 y B05 en PostgreSQL temporal. La suite
`apps/api/test/web.integration-spec.ts` inicia API y Vite en puertos locales
temporales, utiliza Chromium y cierra los recursos al terminar. No modifica la base
de desarrollo. Los datos son sintéticos, aunque el recorrido usa servicios reales.

Las ocho pruebas de navegador cubren altas de todos los catálogos, docente,
asignación y cuenta vinculada; persistencia tras recarga y auditoría; conflictos,
validación, inactivación confirmada; contraseña temporal y logout; roles y alcance
docente, sesión vencida; consultas de secretaría/coordinación y menú móvil; errores
de acceso y conexión; usuario sin persona, modificación de roles y paginación.
Las capturas sintéticas se generan en `.tmp/b05/` y no se versionan.

Pendientes para aceptación formal: revisión de otra persona y validación de la
demostración por el equipo/centro. Las pruebas locales no son un piloto institucional
ni una ejecución remota de GitHub Actions. La edición de reglas académicas, el
restablecimiento de contraseña y las funciones de otras historias quedan fuera de B05.
