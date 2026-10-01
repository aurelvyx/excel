# Instrucciones para agentes de desarrollo

Proyecto: **Desarrollo e implementación de un sistema web de gestión académica para la optimización del proceso de matrícula, control de asistencia y notas en el Centro de Idiomas Excel - Cusco 2026**.

Este archivo debe estar en la raíz del repositorio como `AGENTS.md`. Se aplica a todo el proyecto. Su propósito es mantener una implementación coherente con el análisis y el diseño realizados. Si el repositorio ya contiene un archivo con ese nombre, integrar estas reglas con las existentes y resolver contradicciones con el equipo; no sobrescribirlo sin revisar.

## 1. Fuentes y forma de trabajar

1. Antes de comenzar una tarea, leer este archivo y consultar el documento pertinente: `Catalogo_Requisitos_y_Trazabilidad.docx`, `Casos_de_Uso_y_Diagramas.docx`, `Modelo_de_Datos_y_Diccionario.docx`, `Arquitectura_del_Sistema.docx`, `Prototipos_de_Interfaz_y_Navegacion.docx` y `Plan_de_Desarrollo_y_Backlog.docx`. El esquema TAP rige la memoria de titulación. Si esos archivos aún no están en el repositorio, solicitar al equipo que los incorpore o facilite antes de implementar el área que depende de ellos.
2. Relacionar cada cambio funcional con una historia B01–B21, un requisito RF, una regla RN o un caso de uso CU. Una pantalla de muestra no es prueba de que la historia esté implementada: debe funcionar con la API y la base de datos cuando corresponda.
3. Dar prioridad a los flujos de matrícula, asistencia, justificaciones, notas, resultados y XLSX. El plan de cuatro sprints es una estimación, no una autorización para afirmar que los 57 requisitos están terminados. Revisar alcance y horas con el equipo al cierre de cada sprint.
4. Distinguir una **regla acordada** de una **propuesta de diseño** y de un **dato pendiente de confirmación**. Si falta una decisión, avanzar en las partes independientes; registrar el bloqueo y no fabricar un valor académico u oficial.
5. Una instrucción nueva y explícita del equipo o del centro puede modificar estas reglas. Registrar el cambio en los requisitos, la decisión técnica y las pruebas relacionadas. No cambiar una regla de negocio en secreto para que pase una prueba.

## 2. Alcance del producto

- Los usuarios de la primera versión son administrador, secretaría, docente y coordinación o dirección. El estudiante no usa directamente la aplicación en esta versión.
- El pago sigue siendo **presencial**. Secretaría recibe el voucher y registra la matrícula. No agregar pago en línea, portal de autoservicio del estudiante ni integración directa con MINEDU por iniciativa propia.
- El sistema centraliza estudiantes, oferta académica, grupos, vouchers, matrículas, sesiones, asistencias, justificaciones, evaluaciones, notas, resultados, exportaciones y auditoría conforme al alcance aprobado.
- Los reportes se descargan como archivos XLSX a partir de plantillas institucionales aprobadas. El destinatario externo exacto de cada anexo sigue pendiente de confirmación; no rotular una entrega como integración oficial con MINEDU.
- Los documentos y pantallas previos son diseño, no evidencia de funciones ya implementadas. No marcar requisitos como completados hasta probar el comportamiento real.

## 3. Reglas de negocio que no se deben alterar

### 3.1 Voucher y matrícula

- Del voucher se registra **número, fecha e importe**. Validar campos obligatorios e importe positivo. No exigir foto, banco u otros campos sin una decisión del centro.
- Un voucher pendiente o rechazado no activa una matrícula. Registrar estado, persona que lo validó, fecha y observación cuando corresponda.
- Bloquear la repetición ordinaria del número de voucher. Si se aprueba una excepción, solo el administrador la autoriza y debe quedar auditada. No implementar una restricción irreversible que impida toda excepción autorizada ni aceptar duplicados de forma silenciosa.
- Una matrícula cubre **el nivel completo**, no un mes. Asociarla a idioma, nivel, periodo, turno, sección y grupo. Verificar prerrequisito y evitar dos matrículas activas del mismo estudiante en el mismo grupo y periodo.
- Las evaluaciones o notas pueden organizarse por meses dentro del nivel; eso no crea matrículas mensuales ni divide el intento académico.
- Si una persona desaprueba el nivel, puede matricularse nuevamente en **ese nivel**. Crear un nuevo intento; conservar por separado asistencia, notas, resultados y voucher de cada intento. No reiniciar ni sobrescribir el historial anterior.
- Sin voucher validado, la solicitud permanece pendiente o se anula con motivo; no existe matrícula activa. No clasificar una solicitud impaga como «Retirado por inasistencia».
- La activación de matrícula, el uso del voucher, el número de intento y las restricciones de duplicidad se resuelven en una transacción consistente. Ante fallo, no debe quedar una matrícula activa a medias.

### 3.2 Asistencia y justificaciones

- Las marcas son `P` presente, `F` falta, `T` tardanza y `J` falta justificada. Solo hay una marca por estudiante y sesión.
- Una `T` cuenta inicialmente como presencia. **Cada tres tardanzas acumuladas en el intento equivalen a una falta**; usar grupos completos de tres y conservar las tardanzas restantes. No cambiar las marcas originales para representar el cálculo.
- El máximo permitido es **30 % de inasistencias**. Con 30 % exacto se cumple el límite; con **más de 30 %** la condición es `Retirado por inasistencia`. Comparar con valores precisos y redondear únicamente para mostrar el porcentaje. Sin sesiones computables, no dividir entre cero ni determinar una condición definitiva.
- Una `J` tiene un proceso de resolución: pendiente → aprobada o rechazada; si se aprueba, se confirma recuperada o no recuperada. Secretaría o administrador aprueban o rechazan; docente o administrador confirman la recuperación.
- La `J` recuperada **no** computa como falta. La `J` aprobada todavía no recuperada permanece pendiente de descontar; al cierre, si no fue recuperada, computa como falta. La justificación rechazada se trata como falta injustificada. Mantener la marca y el historial de decisiones; calcular su efecto sin borrar evidencia.
- Solo el docente asignado puede registrar o corregir asistencias de su grupo mientras el registro esté abierto. Tras el cierre, únicamente el administrador puede corregir con motivo y auditoría.
- Determinar el porcentaje a partir de sesiones reales del grupo y ausencias computables del intento correspondiente. Mantener explícito qué sesiones entran en el denominador y probar los casos límite.

### 3.3 Notas, resultados y cierre

- Las notas están en escala de **0 a 20** y la mínima aprobatoria es **13**. Aceptar decimales válidos; rechazar valores fuera del rango y distinguir nota pendiente de cero.
- El promedio utiliza los pesos y la fórmula **aprobados para el nivel**. Los valores `30 % / 40 % / 30 %` vistos en un wireframe son ilustrativos: no se convierten en política oficial por aparecer en la pantalla. No cerrar actas ni emitir notas oficiales con pesos no aprobados.
- Redondear la nota oficial al entero más cercano; los valores terminados en `0,5` suben. Casos obligatorios: `12,4 → 12` y `12,5 → 13`. Usar aritmética decimal con precisión definida, evitando que errores de coma flotante cambien el resultado.
- Calcular primero la condición de asistencia. Si se supera 30 %, el resultado es `Retirado por inasistencia`; en caso contrario, nota oficial menor que 13 es `Desaprobado` y nota oficial igual o mayor que 13 es `Aprobado`. No concluir un resultado definitivo si faltan notas o datos necesarios.
- El docente solo edita notas de sus grupos con acta abierta. El administrador cierra el acta. Una corrección posterior al cierre exige administrador y registra usuario, fecha, motivo, valor anterior y nuevo; recalcula resultados afectados dentro de la misma transacción.
- Conservar la versión de las reglas académicas aplicable a cada matrícula. Cambiar un parámetro para un periodo futuro no altera retroactivamente resultados ya obtenidos.

## 4. Arquitectura y límites técnicos

| Capa | Regla de implementación |
| --- | --- |
| Web | React con TypeScript; componentes por función y acceso a la API mediante un cliente compartido. La interfaz muestra cálculos, pero la API determina el resultado oficial. |
| API | NestJS con TypeScript, un **monolito modular** y REST bajo `/api/v1`. Validar DTO en entrada, responder errores consistentes y documentar contratos con OpenAPI. |
| Dominio | Encapsular políticas de matrícula, asistencia, justificaciones y notas en funciones o servicios que puedan probarse, independientes de HTTP y de componentes React. |
| Persistencia | PostgreSQL con integridad referencial, índices y transacciones. TypeORM con migraciones versionadas es la opción del diseño actual; mantener `synchronize` desactivado en producción. |
| Reportes | Generar XLSX desde datos persistidos y plantillas aprobadas; no leer celdas arbitrarias como fuente de verdad del sistema. Registrar cada exportación. |

Organizar los módulos alrededor de **auth y usuarios, oferta académica, personas, matrículas, asistencia, evaluación, reportes y control**. Cada módulo expone únicamente lo necesario a los otros. Los controladores no alojan fórmulas académicas ni consultas SQL improvisadas. Los tipos compartidos representan contratos estables; no exportar entidades del ORM al frontend.

Si se cambia una decisión propuesta —por ejemplo ORM, transporte de sesión o despliegue— explicar por qué, registrar la decisión, actualizar configuración y pruebas, y comprobar que los contratos existentes siguen funcionando. No agregar microservicios, colas o infraestructuras nuevas sin una necesidad concreta aceptada por el equipo.

## 5. Datos, integridad y migraciones

- Usar una sola identidad de persona por tipo y número de documento, conservando registros académicos históricos aunque la persona o el grupo se inactiven. No eliminar físicamente intentos, calificaciones, asistencias ni auditoría para «corregir» datos.
- Impedir duplicados donde corresponda: estudiante por documento, sesión por grupo y fecha, asistencia por sesión y matrícula, y calificación por indicador y matrícula. Para la matrícula, la regla de unicidad debe considerar su estado; los intentos históricos del mismo nivel siguen siendo válidos.
- Usar tipos decimales para importes y notas. Documentar unidades, redondeo y restricciones de base de datos. No confiar solo en validaciones de la interfaz.
- Crear migraciones pequeñas, reversibles cuando sea seguro, y ejecutarlas contra una base limpia durante el desarrollo. Nunca editar manualmente datos reales para que una migración «pase». Hacer respaldo antes de migraciones en entornos con información institucional.
- Si se importan datos desde las hojas del centro, mapear campos y códigos con una muestra anonimizada, detectar duplicados y documentar filas rechazadas. No importar automáticamente datos reales ni tratar las macros `.xlsm` como una especificación aprobada de exportación.
- Mantener una bitácora inmutable para validaciones de voucher, cierres, correcciones, cambios de reglas y exportaciones. El historial debe permitir identificar usuario, fecha, acción, registro afectado y motivo cuando proceda.

## 6. Permisos y seguridad

| Rol | Acciones previstas |
| --- | --- |
| Administrador | Configuración, usuarios, grupos, reglas, cierres, correcciones posteriores al cierre, auditoría y respaldo. |
| Secretaría | Estudiantes, vouchers, matrículas y resolución de justificaciones; consulta y reportes autorizados. |
| Docente | Solo sus grupos: sesiones, asistencia, recuperación de justificaciones y notas mientras el registro correspondiente esté abierto. |
| Coordinación o dirección | Consulta académica, revisión de resultados y exportaciones autorizadas; sin edición docente ni corrección administrativa. |

- Proteger **cada endpoint y cada consulta**, no solo ocultar botones. Comprobar rol y propiedad del grupo en el servidor; la UI refleja esos permisos.
- Guardar contraseñas con hash resistente, como Argon2id; jamás texto plano, tokens o secretos en el repositorio. Usar variables de entorno y un ejemplo sin credenciales reales.
- Emplear sesiones de corta duración y transporte seguro. Si se usan cookies HttpOnly, aplicar también protección frente a CSRF; usar HTTPS en despliegue. No exponer PostgreSQL a Internet.
- Usar datos sintéticos o anonimizados en desarrollo, pruebas, capturas, commits y anexos del TAP. Mostrar solo los datos personales necesarios para la función del usuario.
- Mantener respaldo diario durante periodos activos y ensayar la restauración en un entorno seguro. No considerar verificado un respaldo que nunca se restauró.

## 7. Contratos, interfaz y XLSX

- Conservar el contexto de periodo, idioma, nivel, grupo y estado durante las tareas. La matrícula usa los pasos estudiante → voucher → grupo → confirmación; nunca activar antes de confirmar con voucher validado.
- Las matrices de asistencia y notas permiten registro masivo. Mostrar pendiente, cargando, error, conflicto, éxito y solo lectura cuando aplique. Etiquetas persistentes, navegación con teclado y mensajes asociados a campos inválidos.
- El servidor devuelve promedios, nota oficial, faltas computables y condición; el frontend no mantiene una segunda versión autónoma de las reglas oficiales.
- Los XLSX deben abrir sin aviso de corrupción y conservar estructura, encabezados y datos de las plantillas que apruebe el centro. Probar al menos las variantes de **inglés y portugués** que se hayan priorizado, con comparación de celdas y totales. No afirmar que todos los anexos están cubiertos cuando se implementó solo un subconjunto.
- Registrar usuario, tipo, filtros y fecha de exportación. Respetar el alcance de datos de cada rol también al generar el archivo, no solo al mostrar la vista previa.

## 8. Pruebas y definición de terminado

Para cada historia, implementar pruebas proporcionales al riesgo y al comportamiento. Las reglas críticas requieren pruebas de dominio y, donde haya base de datos o permisos, pruebas de integración. Los casos de uso prioritarios necesitan al menos una prueba funcional de principio a fin con datos sintéticos.

Casos mínimos que deben quedar automatizados o documentados como prueba de aceptación:

1. Voucher pendiente, rechazado o repetido no activa matrícula; un voucher validado activa exactamente un intento. Error transaccional no deja registros activos parciales.
2. Repetir nivel crea otro intento; asistencia y notas del intento anterior no cambian.
3. Tres tardanzas equivalen a una falta; 30 % exacto permite continuar y más de 30 % produce retiro. Justificación recuperada no cuenta y la no recuperada al cierre sí.
4. Notas fuera de 0 a 20 se rechazan; `12,4` se convierte en `12` y `12,5` en `13`. Una nota pendiente no equivale a cero.
5. Docente ajeno al grupo y docente después del cierre reciben denegación; la corrección de administrador conserva antes, después, fecha y motivo.
6. XLSX de muestra de inglés y portugués abre correctamente y coincide con el mapeo aprobado; un usuario sin permiso no puede descargarlo.
7. Un respaldo de prueba restaura datos y permite consultar un intento académico completo.

Una historia está **terminada** cuando el flujo funciona de extremo a extremo, sus validaciones y permisos se comprueban, las migraciones y pruebas relevantes pasan, la documentación de API o usuario se actualiza, otra persona revisa el cambio y existe una demostración verificable. Si una verificación no se ejecutó, informar esa limitación; no escribir «probado» por inferencia.

## 9. Protocolo para cada agente

1. Identificar la historia, RF/CU/RN implicados, archivos afectados y dependencias. Revisar el código existente antes de crear archivos o modificar la base.
2. Explicar en pocas líneas el resultado que se implementará y cualquier decisión pendiente que cambie su comportamiento. Avanzar en trabajo independiente mientras se resuelve la decisión.
3. Hacer cambios pequeños y coherentes; conservar las convenciones del repositorio. No introducir dependencias nuevas sin justificar su función, impacto y mantenimiento.
4. Ejecutar las pruebas pertinentes, el análisis de tipos y la compilación de lo afectado. Al modificar tablas, probar la migración desde una base limpia y revisar restricciones.
5. Informar al terminar: archivos cambiados, comportamiento implementado, pruebas ejecutadas con resultado, requisitos cubiertos, decisiones tomadas y asuntos pendientes. No presentar prototipos, datos ficticios o resultados de un piloto no realizado como evidencia institucional.

## 10. Decisiones abiertas y control del alcance

Estas cuestiones requieren respuesta del centro o del equipo; hasta entonces siguen **pendientes**, no son valores por defecto:

| Cuestión | Tratamiento mientras se confirma |
| --- | --- |
| Pesos, componentes y fórmula de evaluación por nivel | Modelar configuración; probar con datos declarados como sintéticos. No emitir acta oficial con pesos supuestos. |
| Versión definitiva de plantillas y códigos de los XLSX | Conservar copia de muestra y mapeo propuesto; solicitar aprobación de hojas, columnas y totales. |
| Excepción por voucher repetido | Bloquear la vía ordinaria y registrar la decisión antes de habilitar excepciones. |
| Destinatario externo de cada anexo | Exportar el formato que apruebe el centro; no crear integración automática ni afirmar un destinatario confirmado. |
| Infraestructura, dominio, responsable de respaldos y acceso al piloto | Preparar ejecución reproducible de demostración; registrar limitaciones antes de afirmar puesta en producción. |

El backlog distingue lo comprometido para la demostración de variantes pendientes, como restablecimiento de contraseña, ciertas opciones de anulación y consulta, alertas anticipadas, todos los formatos de RF47–RF51 y algunas interfaces de auditoría o restauración. Conservar su trazabilidad y revisar alcance el **23 de octubre y 6 de noviembre de 2026**. Agregar funciones solamente tras estimar su impacto y ajustar el plan con el equipo.

### Decisión de código de matrícula — 29 de septiembre de 2026

El equipo indicó usar como base `MAT-NroDocumento` (DNI u otro documento).
La implementación B08 añade un correlativo global de matrícula para cumplir RF27
sin colisiones entre niveles, idiomas, tipos de documento o repeticiones:
`MAT-NroDocumento-Correlativo`. El correlativo es independiente del número de
intento por nivel, puede tener saltos transaccionales y no se reinicia por periodo.
Conservar códigos históricos. Detalle y pruebas: `docs/B08-matriculas.md` y
`docs/decisiones/ADR-005-matricula-transaccional.md`.

## 11. Documentación técnica de referencia

Consultar siempre la documentación de la versión instalada en el repositorio al ejecutar comandos o elegir una API concreta:

- [NestJS: autorización](https://docs.nestjs.com/security/authorization) y [validación](https://docs.nestjs.com/application/validation).
- [TypeORM: migraciones](https://typeorm.io/docs/migrations/setup/) y [razones para no sincronizar esquemas en producción](https://typeorm.io/docs/migrations/why/).
- [React: diseño de componentes y flujo de datos](https://react.dev/learn/thinking-in-react).
- [PostgreSQL: respaldo y restauración](https://www.postgresql.org/docs/current/backup.html) y [`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html).
