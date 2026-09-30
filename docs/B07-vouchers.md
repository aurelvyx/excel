# B07 — Registro y decisión de vouchers

Trazabilidad: B07, RF19–RF20, CU07 y RN01–RN04/RN29 del catálogo y backlog.
El pago es presencial. Administración y secretaría registran número, fecha e
importe para un estudiante activo; el registro nace pendiente. Tras revisar el
comprobante físico, validan o rechazan y se conserva responsable, fecha y observación.

## Uso y contrato

Aplicar `pnpm db:migrate` antes de iniciar la API y la web. La sexta migración
agrega protección de vouchers e índices; no altera los intentos históricos.
Entrar a **Vouchers → Registrar voucher**, buscar un estudiante, completar los
datos y confirmar. Desde su ficha, el enlace **Vouchers** conserva el estudiante.
En **Revisar voucher**, seleccionar la decisión y confirmarla. El listado permite
búsqueda literal por número, documento, código o nombre, estado y paginación.

Todas las rutas requieren sesión de ADMIN o SECRETARIA; escrituras también Origin
y CSRF. Docente y coordinación no tienen acceso a este directorio financiero.

| Método | Ruta bajo `/api/v1` | Contrato |
| --- | --- | --- |
| GET | `/vouchers` | `q`, `estudianteId`, `estado`, `after`, `limit`; devuelve `items` y `nextCursor` |
| GET | `/vouchers/:id` | Detalle, decisión, responsable y matrícula vinculada si existe |
| POST | `/vouchers` | `estudianteId`, `numero`, `fechaPago` (`YYYY-MM-DD`), `importe` (cadena decimal) |
| PATCH | `/vouchers/:id/decision` | `estado`: `VALIDADO` o `RECHAZADO`; `observacion` hasta 300 caracteres |

Ejemplo sintético de alta:

```json
{"estudianteId":"1","numero":"SINTETICO-001","fechaPago":"2026-09-28","importe":"150.25"}
```

El importe admite de 0.01 a 99999999.99, sin redondeo ni coma flotante. Se envía
como cadena con punto decimal y se persiste en NUMERIC(10,2). Se recortan espacios
exteriores del número, conservando mayúsculas/minúsculas. No se exige banco, foto
ni campos adicionales. La validación de DTO rechaza campos desconocidos.

## Integridad y decisiones de implementación

- Alta y decisión se guardan junto con auditoría en una transacción; si esta falla,
  toda la operación se revierte. Las decisiones concurrentes bloquean la fila.
- El número no se reutiliza en el flujo ordinario, incluso si ya fue rechazado.
  Las altas concurrentes se protegen también en PostgreSQL.
- Como decisión técnica de esta entrega, rechazar exige observación y solo se
  permite una decisión desde pendiente. La identidad del comprobante y las
  decisiones resueltas se conservan; no existe edición ni eliminación en B07.
- Un voucher vinculado no puede resolverse de nuevo. La base conserva además las
  restricciones de B06 sobre uso único y voucher validado para matrícula activa.
- La reversión de B07 solo se admite sin vouchers; con historial falla de forma
  explícita para conservar las protecciones. Probar reversiones en base desechable.

La excepción administrativa de número repetido sigue pendiente de decisión del
centro. Se conserva el soporte del esquema para una excepción futura auditada,
pero B07 no expone una ruta para autorizarla. El diseño de correcciones posteriores
también requiere definir un flujo específico; no se sustituyen decisiones.
Validar un voucher **no activa matrícula**: la transacción de matrícula corresponde
a B08 y el recorrido completo de matrícula a B09.

## Componentes y verificación

La interfaz reutiliza formulario con confirmación, diálogos, tablas, campos,
botones, paginación y estados compartidos. `StudentPicker` permite reutilizar la
selección de estudiantes; la API comparte búsqueda literal con estudiantes.
Las pruebas de navegador comparten el servidor de desarrollo y selección de puerto.

Ejecutar `pnpm check` y `pnpm test:db`. Las pruebas B07 incluyen reglas decimales,
validaciones, permisos, rechazo motivado, duplicados y decisiones concurrentes,
rollback por fallo de auditoría, historial inmutable, filtros y OpenAPI. Un recorrido
React → API → PostgreSQL registra y valida como secretaría y revisa contexto y móvil.
Las capturas sintéticas se guardan en `.tmp/b07/` (no versionado).

Verificado el 28 de septiembre de 2026: `pnpm check` pasó lint, tipos,
compilación y 37 pruebas; `pnpm test:db` pasó 95 pruebas, incluidas las de
navegador, con PostgreSQL temporal y migraciones desde una base limpia.
Se revisaron las capturas de escritorio y móvil. No se migró la base local
de desarrollo ni un entorno institucional durante esta verificación.

La revisión de otra persona y aceptación del centro siguen pendientes; estas
pruebas de desarrollo no constituyen evidencia de piloto o puesta en producción.
