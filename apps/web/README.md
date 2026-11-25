# Cliente Web — Centro de Idiomas Excel

Aplicación frontend construida con **React 19**, **TypeScript** y **Vite**.

## Desarrollo

Ejecutar desde la raíz del monorepositorio junto con la API (`pnpm dev:api`):

```sh
pnpm dev:web
```

Abrir en el navegador: http://127.0.0.1:5173

## Estructura de `src/`

- `app/` — Enrutador (`routes.tsx`), navegación compartida (`navigation-groups.ts`), permisos por rol (`access.ts`) y panel de inicio.
- `features/academic/` — Gestión Académica, Salón 360°, Portal Docente (`TeacherClassesPage.tsx`) y Matriz Curricular (`CurriculumMatrixPage.tsx`).
- `features/enrollments/` — Gestión de matrículas por salón, nómina y asistente de matrícula en 4 pasos.
- `features/vouchers/` — Bandeja clasificada de comprobantes de pago, registro y validación/rechazo.
- `features/attendance/` — Sesiones, registro de asistencia por sesión, matriz mensual de consulta y justificaciones.
- `features/evaluation/` — Configuración de planes de evaluación, registro matricial de notas y cierre de actas académicas.
- `features/reports/` — Previsualización y exportación XLSX de la matriz de notas y el resumen de participantes como borradores.
- `features/students/` — Padrón de estudiantes e historial académico.
- `features/configuration/` — Catálogos institucionales, plana docente y usuarios/roles.
- `shared/` — Cliente HTTP (`api`), navegación y componentes de interfaz reutilizables.
