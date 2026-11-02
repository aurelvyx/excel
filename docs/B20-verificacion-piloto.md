# B20 — Verificación integral y preparación del piloto

Fecha de la entrega: **17 de octubre de 2026**. Referencias: B20, **RNF09 y RNF16**,
flujo prioritario CU05–CU19 y reglas de matrícula, asistencia, notas y resultados.
Fuentes: los seis documentos de requisitos y diseño indicados en `AGENTS.md`,
especialmente el plan de desarrollo, apartados 5.4, 6 y 7.

El equipo confirmó **«Aún no; preparar el piloto»**: no dispone todavía de los
participantes ni de las diez mediciones del procedimiento anterior. Esta entrega
prepara instrumentos y verifica el software con datos sintéticos. No acredita
piloto humano, satisfacción, ahorro de tiempo ni aceptación institucional.

## Recorridos integrales

La nueva suite `apps/api/test/b20-workflow.integration-spec.ts` sigue el mismo
intento académico entre módulos, desde React hasta PostgreSQL y el archivo XLSX:

1. Secretaría registra estudiante, voucher presencial y matrícula del nivel.
2. Docente registra sesiones y marcas de asistencia de su grupo.
3. Secretaría resuelve una justificación y docente confirma su recuperación.
4. Docente registra las notas con criterios sintéticos explícitamente aprobados
   para la prueba; administración cierra asistencia y acta.
5. Coordinación consulta y descarga matriz y resumen de participantes como
   **BORRADOR**, con comprobaciones de celdas, resultado e historial persistidos.
6. La repetición del nivel crea otro intento y conserva la evidencia anterior.

Los casos de inglés y portugués son independientes. Las cuentas, oferta, reglas
y criterios previos se preparan como fixtures aisladas; el recorrido operativo
utiliza la interfaz. No se atribuye al usuario la preparación automática de esa
configuración. Los tiempos del navegador son duraciones técnicas, no mediciones
del procedimiento del centro.

| Recorrido sintético | Asistencia | Nota y resultado esperado |
| --- | --- | --- |
| Inglés | Cuatro sesiones, T/T/T/J recuperada: una falta equivalente, 25 % | 12.4 → 12, Desaprobado; nueva matrícula conserva el intento anterior |
| Portugués | Cuatro sesiones, T/T/T/J recuperada: una falta equivalente, 25 % | 12.5 → 13, Aprobado |

Se comprueba también la confirmación por teclado, la recuperación del foco al
cerrar el modal de voucher, el contexto entre módulos, el bloqueo docente después
del acta y la denegación de reportes a un docente ajeno. Las notas y los resultados
proceden de las reglas y servicios existentes; el test no añade otra fórmula.

Se reutilizan las suites de B01–B19 para límites, permisos, concurrencia,
transacciones, errores y datos pendientes. No se duplican todas esas variantes
en una prueba larga. [Matriz de aceptación](evidencias/B20/matriz-aceptacion.md).

## Ejecución reproducible

Desde la raíz, con las dependencias y Chromium de Playwright instalados y Docker
en ejecución:

```sh
pnpm check
pnpm test:b20
pnpm test:db
```

`test:b20` selecciona únicamente los recorridos integrales. `test:db` los incluye
junto al resto de las pruebas, migraciones, restricciones y contratos. Ambos
reutilizan el mismo ejecutor y PostgreSQL temporal, con puerto y contraseña
aleatorios; no emplean la base ni el volumen local de desarrollo. El contenedor
y la red se retiran al terminar. No se crean migraciones ni dependencias nuevas.
La API conserva sus contratos existentes.

El informe específico se escribe en `.tmp/b20/pruebas.json`; el general, en
`.tmp/verificacion/pruebas.json`. Se elimina el informe anterior antes de iniciar
el entorno para no confundir una ejecución fallida con un resultado antiguo.
Las capturas sintéticas de los recorridos quedan en `.tmp/b20/`, fuera de Git.
CI incluye estos recorridos y conserva las capturas con su evidencia técnica.
Cada navegador registra su versión real en `entorno-{navegador}.json`. Las
descargas se conservan como `BORRADOR-{navegador}-{grupo}-{tipo}.xlsx` para revisión;
no se publican los archivos privados que el centro entregó en B10.

Para repetir solo B20 en **Microsoft Edge instalado**, en PowerShell:

```powershell
$env:B20_BROWSER = 'msedge'
pnpm test:b20
Remove-Item Env:B20_BROWSER
```

El informe de Edge es `.tmp/b20/pruebas-msedge.json`. Solo se aceptan `chromium`
y `msedge`; no se instala ni se actualiza un navegador automáticamente.
La selección utiliza el [canal de navegador de Playwright](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-channel),
con la versión instalada en el repositorio. Chromium no acredita Google Chrome;
las verificaciones pendientes en Chrome y Firefox se registran por separado.

## Piloto guiado y mediciones

El [protocolo del piloto](B20-piloto-guiado.md) establece preparación, tareas,
roles, comienzo y fin del cronometraje, incidencias y revisión con el centro.
Los instrumentos vacíos están en `docs/evidencias/B20/`. Copiarlos a una carpeta
local de evidencia y mantener los originales sin resultados fabricados.

```sh
pnpm b20:mediciones docs/evidencias/B20/mediciones.plantilla.json
```

La medición reutiliza el análisis de B10 para comparar diez pares de tareas de
matrícula equivalentes. Añade consolidación de asistencia, consolidación de notas,
preparación XLSX y errores detectados antes del cierre. Registra fecha, participante
anónimo, rol, escenario, resultado esperado y obtenido, correcciones, incidencias
y referencia a evidencia. Un pendiente permanece vacío; cero representa un valor
observado. Una simulación mantiene su etiqueta y no se convierte en observación
institucional.

## Verificación de la entrega

Verificación local del **17 de octubre de 2026**, con datos sintéticos:

| Comprobación | Resultado |
| --- | --- |
| `pnpm check` | Análisis, tipos y compilación API/web correctos; 349 pruebas unitarias, 3 HTTP y 26 de herramientas aprobadas |
| `pnpm test:b20` | Dos recorridos completos EN/PT aprobados con Chromium **153.0.8010.12** |
| `B20_BROWSER=msedge` y `pnpm test:b20` | Los mismos dos recorridos aprobados en Microsoft Edge **155.0.4283.45** |
| `pnpm test:db` | **571 pruebas aprobadas en 28 archivos**, sin fallos; incluye B20 y las suites anteriores |
| Migraciones existentes | Base limpia, reversión y reaplicación verificadas; se conservan 16 migraciones y 31 tablas |
| Instrumento vacío | `INSTRUMENTO_PENDIENTE`, cero pares completos, ninguna participación registrada, conteos observados y aceptación pendientes |
| Revisión de evidencia | Capturas de actas/reportes y cuatro descargas de Chromium reabiertas y renderizadas con Artifact Tool; celdas y presentación comprobadas |

Total sin duplicar los subconjuntos: **949 pruebas aprobadas**. La ejecución en
Edge añade dos repeticiones de los mismos casos, no dos requisitos nuevos. Los
tipos y el análisis de API también se repitieron después de los ajustes finales
de la suite.

Las primeras ejecuciones ajustaron la sincronización del recorrido con la
reconsulta posterior al guardado y la confirmación adicional que solo aparece
cuando hay pendientes de asistencia. Se corrigieron las expectativas del test,
sin modificar las reglas ni las protecciones del producto. La revisión cruzada
detectó y corrigió la pérdida de conteos declarados en mediciones incompletas;
su regresión está automatizada, con totales parciales explícitos.

Otro agente revisó la lógica de medición y los recorridos. Se conservaron la API,
los componentes y el esquema existentes. Los datos privados de B10 no se modificaron
ni se publicaron. Los informes y archivos de comprobación quedan en `.tmp/b20/`
y `.tmp/verificacion/`; no acreditan una ejecución remota de GitHub Actions.

Las capturas de acta muestran contexto, cierre y totales; el piloto deberá encuadrar
también la tabla completa al documentar el detalle de estudiantes. La importación
y el renderizado no sustituyen la apertura manual en Excel. La revisión por otro
agente no sustituye la aceptación del equipo y del centro.

## Límites para el cierre de B20

- El piloto con secretaría, docente y coordinación y las mediciones observadas
  siguen pendientes; RNF09 no se declara aceptado por ejecutar un navegador.
- Las plantillas B19 siguen propuestas y los XLSX dicen BORRADOR. Falta aprobación
  institucional, apertura manual en Excel y cotejo con la versión aceptada.
- RNF10 requiere verificaciones de navegadores reales; no se completa por inferencia.
  Tampoco se afirma rendimiento RNF06 sin escenario de carga acordado.
- Despliegue, respaldo y restauración corresponden a B21. No se amplía esta entrega
  a RF54/RF57 ni a variantes de reportes pendientes.
- Registrar la revisión humana y el acta de demostración. Mantener los controles
  de alcance del **23 de octubre y 6 de noviembre de 2026**. La preparación técnica
  de B20 no da por terminados el piloto, el sprint 4 ni los 57 requisitos.
