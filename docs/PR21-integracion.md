# Integración de la interfaz del PR #21

Rama de integración: `codex/pr21-integracion`. Base: `develop` con B21.
Alcance: cambios de presentación y navegación del
[PR #21](https://github.com/aurelvyx/excel/pull/21), con las reglas y los
controles ya acordados. No cambia la aprobación institucional de plantillas,
criterios de evaluación ni el estado de la puesta en producción.

| Área | Decisión de integración |
| --- | --- |
| Matrícula y oferta (B04, B08–B10) | Se conserva la nómina por grupo con paginación de servidor. La consulta de coordinación no incluye los datos del voucher. El intento conserva su grupo, nivel, periodo e historial. |
| Asistencia y justificaciones (B11–B15) | La nueva navegación enlaza las operaciones existentes. Una asistencia pendiente no se guarda como presente; solo el docente asignado registra en sesiones habilitadas. La resolución conserva su motivo y el registro posterior al cierre conserva su auditoría. |
| Notas y actas (B16–B18) | Se usa el cálculo del servidor, los criterios aprobados, el mínimo de 13 y la prioridad de asistencia. Las notas incompletas no se presentan como resultado definitivo. |
| Reportes (B19) | Se mantienen la matriz y el resumen EN/PT como **BORRADOR**. La variante rotulada como acta oficial requiere aprobación del centro y un mapeo validado; no se incorpora. El cierre académico de B18 se mantiene. |
| Datos de demostración (B02, B20) | Se conserva `pnpm db:seed:demo` con habilitación explícita y carga no destructiva. No se añade el reemplazo masivo de datos ni sus credenciales de ejemplo. |
| Operación (B21) | Se mantienen la consulta de respaldos para administración, el aislamiento del despliegue y la verificación con PostgreSQL, Chromium, HTTPS y restauración. |

Las migraciones aplicadas y las plantillas vigentes de B19 se conservan. La API
con el rol limitado de B21 puede registrar una descarga sin modificar el esquema.

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
