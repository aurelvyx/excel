# Componentes y datos compartidos

Refactorización de B03–B06: acceso, configuración, docentes y estudiantes.
Conserva contratos REST, permisos, reglas académicas y persistencia. Sigue la
organización por características de `Arquitectura_del_Sistema.docx`. Sin nuevas
dependencias ni migraciones.

## Frontend

Los elementos visuales reutilizables están en `apps/web/src/shared/ui`:

| Componente | Responsabilidad |
| --- | --- |
| `Button` | Variantes visuales y estado ocupado. Por defecto `type="button"`; declarar `type="submit"` para enviar formularios. |
| `InputField`, `SelectField` | Etiqueta, identificador, obligatoriedad, ayuda y error asociado mediante ARIA. Conservan propiedades nativas del control. |
| `DataTable<T>` | Contenedor con desplazamiento y acceso por teclado, título accesible, encabezados, filas y estado vacío. Cada pantalla define sus columnas y acciones. |
| `Pagination` | Primera/siguiente página, cursor y controles deshabilitados. No decide los filtros ni realiza peticiones. |
| `Feedback`, `Loading` | Avisos, errores, éxito, reintento y estado de carga. |
| `PageHeading` | Encabezado, descripción y acción principal comunes a configuración y estudiantes. |
| `ListPanel` | Un solo panel para filtros, tabla, carga/error/vacío y paginación. Mantiene el diseño de ResourcePage. |
| `StatusBadge` | Etiqueta visual de estado activo/inactivo compartida por los listados. |

`shared/Dialog.tsx` conserva el diálogo nativo, Escape, bloqueo durante guardado y
restauración del foco. Usa un identificador único para su título. No se crea un
segundo sistema de modales.

`shared/useApiQuery.ts` centraliza consultas GET simples: carga, error, reintento,
cancelación al cambiar la consulta/desmontar y descarte de respuestas antiguas.
Mientras carga puede conservar los datos anteriores para mantener opciones de
filtro; las pantallas ocultan el resultado principal hasta finalizar la petición.
Las escrituras y las cargas coordinadas de catálogos siguen en sus características.

`shared/form-types.ts` contiene los tipos de campos y recursos. Los campos comunes
de identidad están en `features/persons/fields.ts`; docentes y estudiantes los
componen con sus campos específicos. Estudiantes ya no extrae campos de la
configuración de docentes.

Para nuevas pantallas, reutilizar estas piezas cuando corresponda. Las políticas,
permisos, formularios particulares y columnas pertenecen a cada característica;
no añadir condiciones de negocio dentro de los componentes visuales compartidos.

## API

En `apps/api/src/modules/personas`:

- `person.dto.ts`: validaciones comunes de persona y edición, conservando las
  restricciones existentes. La normalización propia del alta de estudiante
  permanece en `StudentPersonDto`.
- `person.schema.ts`: esquema OpenAPI compartido por docentes y estudiantes.
- `person.persistence.ts`: correspondencia común entre campos de persona y
  columnas de PostgreSQL. Los valores continúan parametrizados en cada servicio.

Las transacciones, autorización y auditoría permanecen explícitas en los servicios.
No se introduce un controlador CRUD genérico ni se mezclan sus permisos.

## Verificación

Ejecutar desde la raíz con pnpm:

```sh
pnpm check
pnpm test:db
```

La regresión de navegador cubre formularios, edición, duplicados, paginación,
asignaciones, acceso por rol e historial. Se amplió el caso de formulario inválido
para comprobar la asociación accesible del error con el campo y la restauración
del foco al cerrar el modal. PostgreSQL utiliza datos sintéticos y un contenedor
aislado. La revisión por otra persona sigue pendiente.

Resultado del 2026-09-28: `pnpm check` aprobado (análisis, tipos, compilación y
21 pruebas); `pnpm test:db` aprobado (85 pruebas, incluidos 11 recorridos de
navegador). Total: 106 pruebas. Tras corregir el indicador visual de campo
obligatorio para conservar el texto de las etiquetas, también se recompiló el
frontend y se revisaron las capturas de acceso y ficha móvil. `git diff --check`
sin errores.

La unificación posterior de `StudentsPage` y `ResourcePage` reutiliza encabezado,
panel de listado y etiquetas de estado. Filtros, tabla y contador/paginación se
presentan en un solo panel; el espaciado específico de la ficha se limita a
`student-profile`. Se comprobaron búsqueda sin resultados, limpieza de filtros,
registro y consulta, con 85 pruebas de integración aprobadas, lint y compilación
web correctos. Capturas revisadas: `.tmp/b06/listado.png` y `listado-movil.png`.
