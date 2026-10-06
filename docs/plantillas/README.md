# Registro y mapeo de plantillas — B10

Los cuatro archivos facilitados por el equipo son referencias recibidas; su aprobación
institucional no fue confirmada. [registro.json](registro.json) fija cada nombre,
idioma, versión, SHA-256 y hojas. `aprobacion: null` conserva esa decisión pendiente.
Los originales pueden contener información personal y permanecen en `.tmp/b10`,
fuera de Git. No se ejecutaron macros, se importaron alumnos ni se sobrescribieron archivos.

| Familia | Idiomas | Hojas por archivo | Uso observado |
| --- | --- | --- | --- |
| `OK_FORMAC_CONTINUA_FORMATO (1) FINAL … .xlsx` | Inglés, portugués | 11 | Ficha de matrícula; anexos de programa, organización curricular y resumen |
| `FormacionContinua-2025-… .xlsm` | Inglés, portugués | 16 | Libro operativo: alumnos, registro, matrícula, nómina, matriz, acta y asistencia |

El nombre `FINAL` no equivale a aprobación. Los códigos CNOF, resoluciones, DRE/UGEL,
modalidad y responsables no se inventan a partir del nombre del proyecto. Las notas
de ejemplo y fórmulas de los XLSM no constituyen una política académica aprobada.

## Organización reutilizable

1. Mantener un XLSX de diseño por familia e idioma, anonimizado y aprobado, sin macros
   ni filas institucionales de ejemplo. La estructura se conserva como referencia visual.
2. Fijar su versión y huella en el registro; cambiar una fuente exige revisar el mapeo
   y registrar una nueva versión, no actualizar su hash silenciosamente.
3. Compartir la definición de campos y tablas en [mapas.json](mapas.json). El idioma
   selecciona la plantilla y las diferencias reales de posición; no duplica el exportador.
4. B19 debe convertir datos persistidos autorizados a un contrato de reporte y usar un
   único adaptador XLSX para aplicar el mapa. Las fórmulas oficiales y resultados vienen
   de la API. Para nuevos diseños pueden usarse rangos con nombres como `EstudianteDocumento`
   para evitar coordenadas repetidas en código; no se añadieron esos rangos a los originales.
5. Comparar valores, formatos, combinaciones, encabezados, totales y apertura contra la
   versión aceptada. La huella valida identidad del archivo, no apertura en Excel ni cálculos.

```sh
pnpm b10:plantillas
pnpm b10:plantillas .tmp/b10
```

El comando no necesita Excel ni una dependencia nueva. Lee los archivos para comprobar
su hash; responde `VERSION_DIFERENTE` o `ARCHIVO_PENDIENTE` y código de salida 1 si no
coinciden. Validación de celdas y mapas se ejecuta en `pnpm test:tools`, también sin
los archivos privados. No descarga ni genera un reporte institucional.

## Mapeo inicial comprobado

`ANEXO N° 01` tiene el mismo diseño en ambos XLSX. Se escribe en la celda superior
izquierda de cada combinación y se preservan etiquetas y estilos.

| Ubicación | Fuente persistida propuesta | Tratamiento |
| --- | --- | --- |
| `C9` | `personas.apellido_paterno`, `apellido_materno`, `nombres` por `estudiantes.persona_id` | Orden apellidos y nombres; omitir apellido materno ausente |
| `C10` | `personas.numero_documento` | Texto; conservar ceros y tipo de documento en el contexto del reporte |
| `E9` | `periodos_academicos.nombre` mediante `matriculas.grupo_id` | Texto; seleccionar el intento y periodo correctos |
| `E6`, `E8` | Programa/módulo relacionado con idioma y nivel | Confirmar equivalencia del término programa/módulo con el catálogo |
| `E10` | Fechas reales del periodo/grupo | Confirmar que fechas del periodo representan las clases del grupo |
| `B13:B21` | `unidades_didacticas.nombre` por nivel | Nueve espacios; acordar paginación/desborde antes de exportar |
| `E13:E21` | `unidades_didacticas.creditos` | Decimal; ausente no equivale a cero |
| `F13:F21` | `horas_teoricas + horas_practicas` | Horas; mantener unidades y significado |
| `C3:C8`, `E3:E5`, `E7` | Configuración institucional aprobada | No está modelada en B01–B09; pendiente |
| `G13:G21` | Observación de la unidad | Criterio pendiente; no inventar texto académico |

`ANEXO N° 05` tiene cabecera en fila 10 y datos a partir de 11 en ambos archivos.
Columnas C/D: programa/módulo; G/H: créditos/horas; I/J: inicio/fin; K/L:
matriculados/aprobados. Definir el ámbito de agregación por periodo, idioma y nivel,
el tratamiento de grupos y repeticiones y si se cuentan personas o intentos.
Los aprobados deben partir de resultados confirmados, nunca notas pendientes o cero supuesto.
Las columnas B/E/F y los campos institucionales requieren configuración/aprobación.

## Libros operativos XLSM

| Hoja | Inglés | Portugués | Fuente y pendiente |
| --- | --- | --- | --- |
| `Matriz` | Cabecera fila 9; estudiantes desde 10 | Cabecera fila 8; estudiantes desde 9 | A ordinal, B documento, C apellidos/nombres; BY contiene PROM FINAL de referencia |
| `Matriz`, indicadores | D:H, J:N, P:T, etc. | Mismas columnas; otra fila inicial | Relacionar cada UD/indicador con una configuración aprobada por nivel; no fijar doce UDs o cinco indicadores como norma |
| `Nomina` | Cabecera fila 15 | Cabecera fila 15 | B código de matrícula; E nombre; J sexo; K nacimiento; L edad; M condición; N unidades; O créditos |
| `RegMatricula` | Cabecera fila 1 | Cabecera fila 1 | D periodo; G programa; H módulo; J/K créditos/horas; L/M fechas; P/Q turno/sección; R documento; S nombre |

La condición de `Nomina!M` necesita interpretar la leyenda institucional; no asumir
que es el resultado `Aprobado/Desaprobado/Retirado`. Edad requiere acordar la fecha de
referencia; sexo H/M requiere validar la equivalencia con los datos de persona.
El código de matrícula procede de `matriculas.codigo` sin regenerarlo durante la exportación.

Las hojas auxiliares y las filas masivas de alumnos/registro no son fuentes de verdad
para los reportes web. La matriz depende de fórmulas y datos de otras hojas; no basta
copiar una hoja XLSM a XLSX para asegurar que funciona o preserva sus validaciones.
Se observaron referencias de anexos de otros niveles al anexo básico para créditos/horas
en los XLSX. Pueden ser intencionales o requerir corrección: cotejar con el centro antes
de reutilizarlas. No se corrigieron fórmulas del material facilitado.

## Pendientes de aprobación antes de B19

- Seleccionar matriz y anexos prioritarios; confirmar niveles y versión definitiva.
- Entregar copias anonimizadas para versionar las plantillas de ejecución.
- Aprobar hojas, campos, totales, términos programa/módulo, leyendas y política de desborde.
- Confirmar códigos y datos institucionales; definir conteos de matriculados/aprobados.
- Aprobar la fórmula por nivel y usar resultados persistidos/confirmados.
- Probar apertura sin corrupción en Excel y comparación de inglés y portugués con datos sintéticos.

El mapeo cubre un subconjunto: ficha y resumen propuestos, más ubicaciones de matriz,
nómina y registro. No demuestra exportación RF47–RF53 ni aceptación institucional.
