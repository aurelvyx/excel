# B21 — Índice de entrega y evidencias para el TAP

Preparado el **18 de octubre de 2026**. Este índice organiza la documentación
y las comprobaciones reproducibles; no acredita aceptación institucional, uso
en producción ni conclusión de los 57 requisitos. El equipo indicó que dispone
de un VPS y dominio; faltan su configuración concreta, los accesos operativos y
la verificación de la publicación.

## 1. Documentación que se entrega

| Material | Ubicación | Uso |
| --- | --- | --- |
| Instrucciones de instalación rápida | [README](../../../README.md) | Requisitos y comandos desde una copia nueva |
| Manual de usuario | [usuario.md](../../manuales/usuario.md) | Tareas por rol, errores, cierres y límites reales |
| Instalación, despliegue y recuperación | [instalacion-operacion.md](../../manuales/instalacion-operacion.md) | Preparación local/VPS, configuración y respaldo verificado |
| Alcance y verificación de B21 | [B21](../../B21-despliegue-respaldo.md) | Resultado técnico, pruebas ejecutadas y pendientes de operación |
| Requisitos, casos de uso, modelo y arquitectura | Seis DOCX en `docs/`, referenciados en `AGENTS.md` | Fuentes del análisis y diseño; no son evidencia automática de implementación |
| Decisiones técnicas | [decisiones](../../decisiones/) | Motivos, límites y conservación de reglas/historia |
| Protocolo y mediciones del piloto | [B20](../../B20-piloto-guiado.md) y [instrumento vacío](../B20/mediciones.plantilla.json) | Completar con participantes y observaciones reales, aún pendientes |
| Matriz de aceptación académica | [matriz B20](../B20/matriz-aceptacion.md) | Casos, resultados esperados, referencias técnicas y aceptación humana separada |
| Plantillas facilitadas por el centro | [registro](../../plantillas/registro.json) y [estado](../../plantillas/README.md) | Huellas y mapeos propuestos; muestras originales privadas fuera de Git |

Los manuales se entregan en Markdown versionado. Si se incorporan a los anexos de
la memoria, aplicar la estructura y numeración del esquema TAP de la institución,
sin cambiar su estado de aprobación ni convertir pruebas sintéticas en datos reales.

## 2. Evidencia técnica reproducible

| Comprobación | Cómo se obtiene | Qué demuestra y qué no |
| --- | --- | --- |
| Tipos, análisis y compilación | `pnpm check` | Consistencia del código y suites incluidas; no acredita un piloto humano |
| Flujo React–API–PostgreSQL | `pnpm test:db` | Reglas, permisos, transacciones y recorridos con datos sintéticos en una base temporal |
| Matrícula hasta acta/XLSX EN/PT | `pnpm test:b20` | Integración del flujo prioritario; su duración no es el tiempo del centro |
| Estructura de XLSX propuestos | `pnpm b19:plantillas` | Coincidencia de las cuatro plantillas de demostración con su registro; no aprobación institucional |
| Identidad de muestras privadas | `pnpm b10:plantillas .tmp/b10` si se facilitaron localmente | Coincidencia de huellas de B10; no importación ni autorización de publicación |
| Respaldo y restauración aislada | Procedimiento y pruebas descritos en [B21](../../B21-despliegue-respaldo.md) | Recuperación de la copia ensayada y consulta del intento sintético; no restauración en producción |
| Despliegue de demostración/VPS | Procedimiento del [manual de operación](../../manuales/instalacion-operacion.md) | Solo las verificaciones ejecutadas y registradas en B21; disponer de un Compose no prueba publicación |

Consultar los resultados y fechas exactos en B21. No sumar subconjuntos o
repeticiones como pruebas diferentes. Los informes y capturas se generan en
`.tmp/`, ignorada por Git, y deben conservarse junto con la revisión de código
que los produjo. Una ejecución local no acredita ejecución remota de GitHub Actions.

Para cada ensayo, registrar en una copia de trabajo:

| Dato de la ejecución | Valor por completar |
| --- | --- |
| Fecha/hora y zona | Pendiente |
| Revisión de Git y cambios sin confirmar | Pendiente |
| Escenario y comando o recorrido | Pendiente |
| Equipo/entorno y versiones | Pendiente |
| Datos sintéticos utilizados | Pendiente |
| Resultado esperado y obtenido | Pendiente |
| Informe, captura o archivo de referencia | Pendiente |
| Incidencias y repetición, si corresponde | Pendiente |
| Revisor técnico | Pendiente |
| Aceptación del equipo/centro | Pendiente |

## 3. Selección de anexos

La memoria puede incluir el registro de migraciones, matriz de casos críticos,
capturas aprobadas del asistente, asistencia, justificaciones, notas y acta, y
comparación de los dos XLSX propuestos. Añadir el manifiesto y resultado del ensayo
de restauración. Conservar las versiones y referencias de cada evidencia para
poder repetirla.

Las capturas y los ejemplos del TAP utilizan identidades sintéticas o anonimizadas.
No adjuntar `.env`, contraseñas, cookies, tokens, dumps con datos personales,
certificados privados ni las hojas originales de B10. Un respaldo real se custodia
en la ubicación protegida acordada, con acceso limitado; el anexo describe la
operación y su resultado, sin contener la base institucional.

## 4. Alcance pendiente que debe acompañar la entrega

| Área | Estado y tratamiento |
| --- | --- |
| RF05 | Cambio de contraseña propia y credenciales temporales de altas disponibles; restablecimiento administrativo pendiente |
| RF13 | Las matrículas conservan la versión vigente de reglas; mantenimiento administrativo de versiones pendiente |
| RF25/RF26 | Solicitud y detalle individual disponibles; anulación y listado general con todos los filtros pendientes |
| RF37 | Cálculo y condición de asistencia disponibles; alertas anticipadas y notificaciones pendientes |
| RF47/RF48/RF50 | Variantes de ficha, nómina y reporte XLSX de acta fuera del subconjunto B19 |
| RF49/RF51–RF53 | Matriz y resumen basado en Anexo 05 EN/PT como BORRADOR; aprobación, equivalencias, destinatarios y apertura manual en Excel pendientes |
| RF54 | Auditoría persistida para operaciones sensibles; pantalla general de consulta con todos sus filtros pendiente |
| RF56/RNF08 | Herramientas, registro y ensayo conforme al alcance B21; calendario diario real, custodio, retención y copia externa deben configurarse y verificarse antes de operación institucional |
| RF57 | Ensayo aislado de restauración B21; recuperación administrativa sobre la base institucional no habilitada por esta entrega |
| B20/RNF09 | Piloto humano, participantes, mediciones previas/finales, satisfacción y aceptación institucional pendientes |
| RNF06/RNF07/RNF10 | No afirmar rendimiento, disponibilidad o compatibilidad total sin sus escenarios y verificaciones acordados |
| Producción | VPS y dominio indicados; publicación, TLS del dominio real, permisos, responsable de operación, monitoreo y recepción de la entrega aún por verificar |

Esta lista conserva los pendientes identificados en el backlog; no reemplaza la
matriz completa de requisitos. Revisar cobertura y capacidad con el equipo el
**23 de octubre y el 6 de noviembre de 2026**.

## 5. Recepción y aceptación

La revisión de código y las pruebas automáticas son verificaciones técnicas.
La recepción requiere que una persona del equipo repita el procedimiento,
registre incidencias y que el centro valide los flujos, criterios y formatos
correspondientes. Mantener pendiente todo resultado que aún no haya observado
su responsable.

| Acto de recepción | Referencia pendiente |
| --- | --- |
| Instalación desde una copia nueva por otro integrante | Pendiente |
| Revisión del manual con Secretaría, docente y coordinación | Pendiente |
| Configuración y prueba del VPS/dominio real | Pendiente |
| Responsable, horario y retención de respaldos | Pendiente |
| Ensayo de recuperación aceptado por responsable autorizado | Pendiente |
| Aprobación de criterios y plantillas institucionales | Pendiente |
| Acta de demostración y observaciones del piloto | Pendiente |

No completar firmas, nombres, tiempos ni resultados institucionales de antemano.
