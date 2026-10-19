# Manual de usuario — Gestión académica

Versión de entrega B21: **18 de octubre de 2026**. Describe las pantallas
implementadas hasta B20. La dirección de acceso y las cuentas las facilita el
administrador; no existen credenciales predeterminadas ni portal del estudiante.
Los ejemplos del manual son sintéticos.

La aplicación administra matrícula del nivel completo, asistencia, justificaciones,
notas y resultados. El pago continúa siendo presencial. Los reportes disponibles
son **BORRADOR**: la matriz de notas y el resumen de participantes de inglés y
portugués no están aprobados como documentos institucionales.

## 1. Acceso y navegación

1. Abrir la dirección indicada para el entorno autorizado e ingresar usuario y
   contraseña. En una cuenta nueva, cambiar la contraseña temporal antes de operar.
2. Revisar el nombre y los roles mostrados en la esquina superior. El menú cambia
   según los permisos. En móvil, abrir **Menú** para mostrar las opciones.
3. Abrir **Mi cuenta** mediante el nombre de usuario para cambiar la contraseña.
   El cambio cierra las sesiones existentes; ingresar nuevamente.
4. Utilizar **Cerrar sesión** al terminar. La sesión dura 15 minutos. Si expira,
   volver a ingresar y consultar el estado guardado antes de repetir una operación.

Las tablas pueden tener más de una página. Los resúmenes que dicen «grupo
completo» incluyen todas las matrículas del padrón, aunque solo se vea una página.
Verificar siempre periodo, idioma, nivel, grupo, turno y sección antes de guardar.
Las teclas Tab y Mayús+Tab recorren campos y acciones; las etiquetas y mensajes de
error identifican el campo que necesita corrección.

| Rol | Trabajo disponible |
| --- | --- |
| Administrador | Cuentas y oferta, asignaciones, criterios, matrícula, cierres y correcciones administrativas; consulta académica y reportes autorizados |
| Secretaría | Estudiantes, vouchers, matrícula y resolución de justificaciones; consulta académica autorizada |
| Docente | Sesiones, asistencia, recuperación de justificaciones, aplicación de criterios aprobados y notas de sus grupos asignados, mientras el registro correspondiente esté abierto |
| Coordinación | Consulta académica, resultados y reportes autorizados; sin edición docente ni corrección administrativa |

La ausencia de un botón puede corresponder al rol, a la asignación del docente o
al estado del registro. La aplicación muestra el motivo cuando corresponde.
Tener acceso de consulta no concede permiso para editar un grupo ajeno.

## 2. Preparación de la oferta y las cuentas

El administrador prepara **Idiomas**, **Niveles**, **Unidades didácticas**,
**Periodos académicos**, **Turnos**, **Secciones**, **Docentes** y **Grupos**.
Crear primero los elementos de los que dependen los siguientes. En el periodo,
revisar las fechas de clases y de matrícula; en el grupo, su nivel, periodo,
turno, sección, estado y capacidad. Asignar el docente correspondiente desde el
grupo y vincular su cuenta a su persona de docente.

Los catálogos se consultan mediante sus búsquedas y filtros. Para modificar un
registro, completar los campos y el motivo solicitado. Los registros con historia
se conservan; la inactivación no borra matrículas, asistencias ni calificaciones.

En **Usuarios**, crear la cuenta con contraseña temporal y uno o varios roles.
Entregar la credencial por el medio privado acordado. Los cambios de cuenta o de
roles invalidan sus sesiones. No compartir cuentas. El restablecimiento
administrativo de contraseña RF05 continúa pendiente; el cambio de contraseña
propia no equivale a esa función.

La matrícula necesita una versión vigente de reglas académicas. Su mantenimiento
administrativo RF13 sigue pendiente. Si aparece **«No existe una versión de reglas
académicas vigente»**, solicitar la preparación al responsable técnico; repetir
la confirmación no crea esa versión. La carga sintética de demostración no es una
aprobación institucional ni debe utilizarse para configurar datos reales.

## 3. Estudiantes, vouchers y matrícula

### Registrar o localizar al estudiante

En **Estudiantes**, buscar por documento, código o nombre antes de registrar.
Seleccionar a la persona existente cuando corresponda: el tipo y número de
documento identifican una sola persona. Completar los datos obligatorios y revisar
los errores del formulario. La ficha conserva el historial separado por matrícula,
intento, nivel y periodo, y permite iniciar **Matricular estudiante**.

### Registrar y revisar el voucher

Secretaría o administración abre **Vouchers** o el paso correspondiente del
asistente. Registrar **número, fecha e importe positivo** del comprobante recibido.
Revisar el estudiante y, después de comprobar el pago presencial, validar o rechazar
el voucher con la observación que solicite el formulario.

Un voucher pendiente o rechazado no permite activar matrícula. Un número repetido
se rechaza por la vía ordinaria; no cambiarlo para eludir el control. La excepción
administrativa de duplicidad sigue pendiente de decisión y de implementación.
Un voucher utilizado en otra matrícula no puede reutilizarse.

### Completar los cuatro pasos

1. **Estudiante:** buscar y seleccionar, o **Registrar estudiante** sin duplicar
   su documento.
2. **Voucher:** elegir uno del estudiante o registrar otro. **Revisar voucher**
   permite su decisión. **Continuar sin voucher** solo prepara una solicitud.
3. **Grupo:** elegir periodo, idioma y nivel, y seleccionar el grupo. El sistema
   revalida fecha de matrícula, vacante, prerrequisito y duplicados al confirmar.
4. **Confirmación:** comprobar el resumen y marcar la aceptación explícita. Con
   voucher validado usar **Confirmar matrícula**; en otro caso, **Guardar solicitud
   pendiente**. Esperar el resultado antes de iniciar **Nueva matrícula**.

La solicitud pendiente no es una matrícula activa ni ocupa un intento académico
con asistencia o notas. No se clasifica como retirada por inasistencia. Se conserva
su identidad y número de intento al retomar y activar. **Retomar solicitud** en el
historial recupera una solicitud guardada incluso después de recargar.

La matrícula activa cubre **todo el nivel**. Su código utiliza la base acordada
`MAT-NroDocumento-Correlativo`, por ejemplo sintético `MAT-00123456-42`. El sufijo
identifica la matrícula y no es el número de intento. Si se desaprueba y corresponde
repetir, crear una nueva matrícula del mismo nivel con otro voucher; el intento
anterior y sus registros permanecen separados.

El asistente conserva las selecciones al usar **Anterior**. Cambiar de estudiante
limpia voucher y grupo para evitar asociaciones equivocadas. El borrador sin guardar
está en memoria y puede perderse al recargar. Si se pierde la respuesta final,
consultar el detalle o retomar la solicitud antes de iniciar otra: el asistente
incluye protección para reintentar sin duplicar el alta.

La anulación de solicitudes RF25 y el listado general con todos los filtros RF26
siguen pendientes. La ficha e historial individuales no cubren esas variantes.

## 4. Sesiones y asistencia

Desde **Grupos** o **Mis grupos**, abrir **Sesiones**. El docente asignado programa
las fechas reales de clase de su grupo dentro del periodo y revisa la confirmación.
No duplicar una sesión del grupo en la misma fecha. El horario es opcional.

Abrir la sesión para registrar la matriz de asistencia. Elegir una sola marca por
matrícula: **P** presente, **F** falta, **T** tardanza y **J** falta justificada.
Usar las acciones masivas cuando corresponda y revisar las excepciones individuales.
**Guardar asistencia** confirma que la clase se realizó. Una sesión futura o
cancelada no se registra como una clase realizada.

Una fila pendiente no equivale a P ni a F. Consultar el resumen que devuelve el
servidor: cada tres tardanzas del intento equivalen a una falta; las marcas T
originales se conservan. Con **30 % exacto** se permanece dentro del límite;
con **más de 30 %**, la condición de asistencia es retiro. El porcentaje mostrado
puede estar redondeado, pero la comparación utiliza el valor preciso.

El resumen indica si faltan marcas, sesiones computables o decisiones sobre J.
Mientras falten datos necesarios, una cifra provisional no es una condición
académica definitiva. Las alertas anticipadas y notificaciones de RF37 continúan
pendientes; no existe un umbral de aviso adicional aprobado.

## 5. Justificaciones

La gestión parte de una **J ya registrada** por el docente; Secretaría no convierte
una F en J desde este flujo.

1. Secretaría o administrador abre **Justificaciones**, localiza la fila J y usa
   **Registrar justificación**. Indicar motivo y fecha de presentación, revisar
   y confirmar. La fecha debe estar entre la clase y el día actual del sistema.
2. En una solicitud pendiente, usar **Resolver justificación** para aprobar o
   rechazar, con observación y confirmación.
3. El docente asignado o administrador abre una aprobada y usa **Confirmar
   recuperación** para registrar recuperada o no recuperada.
4. **Ver detalle** muestra responsables, fechas e historial de decisiones.

Aprobar no descuenta todavía la falta. La J recuperada no computa como falta;
la rechazada o no recuperada sí. Antes del cierre, una J sin resolver conserva
su carácter provisional; al cierre, una J no recuperada computa como falta.
El registro cerrado bloquea las decisiones ordinarias. Las decisiones finales
no se borran ni reabren por este flujo.

## 6. Cierre de asistencia

El administrador abre **Cierre de asistencia** desde el grupo. Revisar todas las
advertencias, el padrón y los datos pendientes. Si el cierre permite reconocer
pendientes, leer su efecto antes de aceptar la confirmación adicional. El cierre
fija un corte temporal y bloquea la edición docente; no registra notas ni cierra
por sí mismo el acta académica.

Antes de cerrar el acta, una corrección de asistencia cerrada usa **Corregir
asistencia**, solo para administración, con motivo e historial antes/después.
Una J con expediente conserva su protección y no se reemplaza para borrar la
justificación. No existe una reapertura general del registro.

## 7. Criterios y captura de notas

### Preparar criterios aprobados

En **Criterios de evaluación**, el administrador selecciona el nivel, crea **Nueva
versión** y guarda las evaluaciones e indicadores en **Guardar borrador**. La
fórmula disponible pondera indicadores dentro de cada evaluación y evaluaciones
dentro del nivel. Los pesos no vienen aprobados por defecto.

Solo después de la aprobación real del centro, usar **Aprobar versión** con su
referencia escrita y confirmación. Las sumas de pesos deben ser 100 % en ambos
ámbitos. Una versión aprobada queda inmutable; un cambio posterior requiere otra
versión. Los ejemplos de pruebas no son una referencia válida de aprobación real.

Desde **Evaluaciones** del grupo, administración o docente asignado puede **Aplicar
versión aprobada** del mismo nivel. Revisar antes de confirmar: la aplicación es
única por grupo y no se sustituye silenciosamente aunque aún no haya notas.

### Registrar notas

En **Calificaciones**, revisar la evaluación y sus indicadores. Ingresar valores
de **0 a 20**, con hasta dos decimales, y usar **Guardar calificaciones**. Un cero
es una nota registrada; una celda vacía es pendiente. Vaciar una nota ya guardada
no la elimina: el formulario exige conservarla o corregirla mediante un valor.

La API calcula el promedio exacto y su nota oficial. Por ejemplo, `12,4 → 12` y
`12,5 → 13`; `12,495 → 12` no se convierte primero en `12,50` para redondear.
La calificación mínima aprobatoria es 13. Si faltan notas o criterios aprobados,
el resumen muestra el pendiente y no confirma un resultado.

El docente solo captura en sus grupos y con acta abierta. Si falla el envío, la
captura se mantiene para corregir o reintentar. Si falla la reconsulta después
del guardado, el resumen anterior se oculta hasta recuperar datos actuales.

## 8. Resultados, acta y correcciones

Abrir **Acta y resultados** desde el grupo o las pantallas académicas. Revisar los
pendientes y los totales de todo el grupo. El sistema evalúa primero la asistencia:
si supera 30 %, el resultado es **Retirado por inasistencia**; en caso contrario,
la nota oficial determina **Desaprobado** o **Aprobado**. Se distingue una condición
calculada de un resultado confirmado.

Solo el administrador usa **Cerrar acta**. Se exige asistencia cerrada, criterios
aprobados y marcas y notas completas, incluso para confirmar un retiro. Revisar
el resumen y confirmar. El cierre confirma los resultados y cierra sus matrículas
en una sola operación; no altera por sí mismo el estado del periodo o grupo.

Después del acta, el docente conserva consulta. Solo administración puede usar
**Corregir nota** o **Corregir asistencia** con motivo y confirmación. El sistema
conserva el valor anterior, el nuevo, responsable, fecha y resultado recalculado.
La evidencia original del cierre permanece visible por separado. No se pueden
corregir por este flujo resultados históricos sin procedencia del acta vigente.

Ante un conflicto de revisión, no confirmar con datos antiguos. Recargar requiere
descartar explícitamente la captura pendiente; revisar de nuevo antes de enviar.

## 9. Descargar reportes de demostración

En **Reportes**, seleccionar el grupo y el tipo disponible. Administración y
coordinación pueden generar **Matriz de notas** y **Resumen de participantes**;
el docente asignado solo la matriz de sus grupos. Secretaría no tiene un formato
B19 autorizado; su ficha y nómina siguen pendientes.

Revisar contexto, advertencias, pendientes y vista previa, y descargar el XLSX.
Las plantillas de inglés y portugués tienen la etiqueta **BORRADOR**. Los pendientes
se conservan como tales, sin sustituirlos por ceros ni inventar datos institucionales.
Si los datos cambiaron desde la vista previa, recargar y revisar antes de descargar.

**Historial de exportaciones** conserva autor, fecha, tipo y datos técnicos de la
generación. Un registro de generación no demuestra que el destinatario recibió
el archivo. No existe descarga de una copia histórica desde ese historial.
Los XLSX de demostración no deben presentarse como actas oficiales ni como
integración con MINEDU. La apertura manual en Excel y la aprobación institucional
de hojas, columnas, equivalencias y destinatarios continúan pendientes.

## 10. Problemas frecuentes

| Mensaje o situación | Qué hacer |
| --- | --- |
| Sesión expirada o credenciales inválidas | Ingresar nuevamente; consultar el estado persistido antes de repetir una confirmación |
| No autorizado o página no disponible | Revisar cuenta y asignación con administración; no intentar cambiar identificadores para acceder a otro grupo |
| Error junto a un campo | Corregir ese valor y volver a revisar; un fallo no confirma que los demás datos estén guardados |
| Documento, voucher o sesión repetidos | Buscar el registro existente; contrastar el dato original antes de modificarlo |
| Sin versión vigente de reglas | Solicitar preparación al responsable técnico; no sustituir las reglas por valores inventados |
| Sin criterios aprobados o aplicados | Revisar la configuración del nivel y grupo con administración |
| Conflicto o versión desactualizada | Conservar lo que se necesite revisar, recargar con descarte explícito y comprobar el nuevo estado |
| Error de conexión al guardar | Esperar y utilizar el reintento disponible; verificar el detalle si se perdió la respuesta |
| Error al consultar después de guardar | Reintentar la consulta; un resumen oculto evita mostrar el anterior como vigente |
| Registro en solo lectura | Leer el motivo de cierre, estado, fecha o permiso; una corrección posterior exige el flujo administrativo correspondiente |

Para reportar una incidencia, anotar fecha y hora, pantalla, grupo o código
sintético de referencia, acción y mensaje. No adjuntar contraseñas, cookies ni
datos personales innecesarios. El responsable y canal de soporte institucional
deben acordarse antes de la operación real.

## 11. Alcance y preparación del piloto

Las pantallas implementadas no equivalen a aceptación institucional. El piloto
humano, participantes, diez mediciones previas y observaciones finales siguen
pendientes. Utilizar el [piloto guiado B20](../B20-piloto-guiado.md) y sus instrumentos
vacíos, sin convertir duraciones de tests en tiempos observados del centro.

Administración dispone de **Respaldos** para consultar la última copia exitosa,
la última verificación de un intento completo y el historial, con filtros de tipo
y estado. Son registros independientes: comprobar a qué archivo corresponde
cada verificación. La pantalla no
descarga dumps ni ejecuta restauraciones. Una copia generada sin ensayo de
restauración no figura como recuperación verificada. El operador autorizado
ejecuta esas tareas mediante el [manual de instalación y operación](instalacion-operacion.md).

La pantalla general de auditoría RF54, las variantes RF47–RF51 y los demás
pendientes se mantienen en el [índice de entrega](../evidencias/B21/indice-entrega.md).

Trazabilidad de los flujos: [B03](../B03-acceso-y-usuarios.md),
[B04](../B04-oferta-y-docentes.md), [B05](../B05-interfaz-y-configuracion.md),
[B06](../B06-estudiantes-historial.md), [B07](../B07-vouchers.md),
[B08](../B08-matriculas.md), [B09](../B09-asistente-matricula.md),
[B11](../B11-sesiones-clase.md), [B12](../B12-registro-asistencia.md),
[B13](../B13-calculo-asistencia.md), [B14](../B14-justificaciones.md),
[B15](../B15-cierre-asistencia.md), [B16](../B16-criterios-evaluacion.md),
[B17](../B17-calificaciones-promedio.md), [B18](../B18-resultados-actas.md) y
[B19](../B19-reportes-xlsx.md).
