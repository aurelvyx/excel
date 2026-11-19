# Integración de la interfaz del PR #21

Primera integración en `codex/pr21-integracion`, sobre `develop` con B21.
Ampliación en `codex/front1-recuperacion`, solicitada el 19 de noviembre de 2026.
Alcance: cambios de presentación y navegación del
[PR #21](https://github.com/aurelvyx/excel/pull/21), con las reglas y los
controles ya acordados. No cambia la aprobación institucional de plantillas,
criterios de evaluación ni el estado de la puesta en producción.

| Área | Decisión de integración |
| --- | --- |
| Matrícula y oferta (B04, B08–B10) | Se conserva la nómina por grupo con paginación de servidor. La consulta de coordinación no incluye los datos del voucher. El intento conserva su grupo, nivel, periodo e historial. |
| Asistencia y justificaciones (B11–B15) | La nueva navegación enlaza las operaciones existentes. Una asistencia pendiente no se guarda como presente; solo el docente asignado registra en sesiones habilitadas. La resolución conserva su motivo y el registro posterior al cierre conserva su auditoría. |
| Notas y actas (B16–B18) | Se usa el cálculo del servidor, los criterios aprobados, el mínimo de 13 y la prioridad de asistencia. Las notas incompletas no se presentan como resultado definitivo. |
| Reportes (B19) | Se recuperan los diseños de acta EN/PT de front/1 como `ACTA_DEMOSTRACION`, anonimizados y marcados **BORRADOR**. La matriz y el resumen existentes completan seis plantillas. La nota y los componentes usan los cálculos del servidor; la condición confirmada procede de B18. |
| Datos de demostración (B02, B20) | Se conserva `pnpm db:seed:demo` con habilitación explícita y carga no destructiva. No se añade el reemplazo masivo de datos ni sus credenciales de ejemplo. |
| Operación (B21) | Se mantienen la consulta de respaldos para administración, el aislamiento del despliegue y la verificación con PostgreSQL, Chromium, HTTPS y restauración. |

Las migraciones aplicadas y las plantillas vigentes de B19 se conservan. La API
con el rol limitado de B21 puede registrar una descarga sin modificar el esquema.

## Recuperación ampliada

La primera integración había sustituido varias vistas del PR por los componentes
anteriores. La ampliación recupera la presentación y sus interacciones mediante
los contratos actuales de la API.

| Vista del PR | Adaptación funcional |
| --- | --- |
| Matrículas por periodo y salón | `/matriculas` presenta los grupos. El asistente conserva las entradas directas y la preselección de estudiante o grupo. La entrada desde el listado permite abrirlo en una ventana. |
| Asistente, selectores de estudiante, voucher y grupo | Se recuperan tarjetas, pasos y resumen lateral. Se conserva la secuencia estudiante → voucher → grupo → confirmación y el reintento de una misma solicitud. |
| Fichas y comprobantes | Se recuperan las tarjetas, filtros, detalle del voucher e historial por intento con consulta semanal de asistencia. |
| Catálogos y gestión académica | Se recuperan la guía de preparación, acciones por salón, campos agrupados y cambios de estado con motivo y confirmación. Las sugerencias de código son editables. |
| Sesiones y asistencia | Se recuperan calendario, tarjetas, matriz, edición desde el detalle y contexto de retorno. Los datos pendientes conservan ese estado y los cambios se validan en la API. |
| Salón 360° y notas | Se recuperan resumen, matrices y accesos a justificaciones y cierres. La vista completa de evaluaciones comparte la captura y sus controles de conflicto y permisos. |
| Criterios y resultados | Se recupera la presentación de componentes, pesos y actas. Los cálculos oficiales corresponden al servidor y al cierre académico. |
| Reportes | Se recuperan tarjetas, pestañas y vista previa del acta. Las descargas usan todos los registros autorizados del grupo y registran cada exportación. |

## Actas de demostración

Las dos plantillas derivadas conservan el diseño de front/1 y usan encabezados
de demostración y campos institucionales pendientes. El bloque de estudiantes
crece para conservar la nómina completa y desplazar el pie y las firmas. La
plantilla admite hasta ocho componentes de evaluación; una configuración mayor
recibe un error explícito y puede utilizar la matriz de notas.

Administración y coordinación pueden exportar el acta. El docente puede hacerlo
para sus grupos asignados. La exportación revalida la sesión y la asignación.
Los promedios incompletos y las condiciones pendientes quedan identificados en
la vista previa; las notas pendientes se exportan vacías y el cero registrado
se conserva como número.

La migración `1790208017000-acta-demostracion` habilita el tipo adicional en la
restricción de exportaciones. La reversión conserva la evidencia de actas ya
generadas. Aplica las migraciones antes de usar la nueva descarga.

La integración incluye pruebas de acceso docente al Salón 360°, paginación de
matrículas y visibilidad del voucher según el rol. Los recorridos de inglés y
portugués de B20 y el ensayo aislado de restauración de B21 se ejecutaron con
Chromium y PostgreSQL. GitHub Actions verifica la rama con la suite completa.

Para reproducir las verificaciones desde la raíz:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm --filter api exec playwright install chromium
pnpm test:db
pnpm deploy:setup
pnpm deploy:config
pnpm deploy:build
pnpm test:deploy
```
