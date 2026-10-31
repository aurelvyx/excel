import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ConflictException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type {
  ReportIndicator,
  ReportLanguage,
  ReportSnapshot,
  ReportTemplateInfo,
  ReportType,
} from './report.model.js';

type TemplateEntry = ReportTemplateInfo & {
  archivo: string;
  hoja: string;
  filaCabecera: number;
  primeraFila: number;
};
const directory = new URL('../../../templates/reportes/', import.meta.url);
const conditions: Record<string, string> = {
  APROBADO: 'Aprobado',
  DESAPROBADO: 'Desaprobado',
  RETIRADO_INASISTENCIA: 'Retirado por inasistencia',
};
export const reportLimits = { filas: 5000, indicadores: 100 } as const;

/** Adaptador XLSX único: presenta la instantánea, sin recalcular reglas académicas. */
@Injectable()
export class ReportWorkbookService {
  private async source(tipo: ReportType, idioma: ReportLanguage) {
    const manifest = JSON.parse(
      await readFile(new URL('registro.json', directory), 'utf8'),
    ) as { version: number; plantillas: TemplateEntry[] };
    const entry = manifest.plantillas.find(
      (item) => item.tipo === tipo && item.idioma === idioma,
    );
    if (
      !entry ||
      entry.estado !== 'PROPUESTA' ||
      entry.version !== 1 ||
      !/^[a-z0-9-]+\.xlsx$/.test(entry.archivo)
    )
      throw new ConflictException(
        'La plantilla de demostración no está disponible',
      );
    const data = await readFile(new URL(entry.archivo, directory));
    if (createHash('sha256').update(data).digest('hex') !== entry.sha256)
      throw new ConflictException(
        'La plantilla cambió y requiere revisar su versión antes de exportar',
      );
    return { entry, data };
  }
  async template(
    tipo: ReportType,
    idioma: ReportLanguage,
  ): Promise<ReportTemplateInfo> {
    const { entry } = await this.source(tipo, idioma);
    return {
      id: entry.id,
      tipo: entry.tipo,
      idioma: entry.idioma,
      version: entry.version,
      estado: entry.estado,
      sha256: entry.sha256,
    };
  }
  async render(snapshot: ReportSnapshot): Promise<Buffer> {
    if (
      !snapshot.items.length ||
      snapshot.items.length > reportLimits.filas ||
      snapshot.indicadores.length > reportLimits.indicadores
    )
      throw new ConflictException(
        'El reporte excede el límite de filas o indicadores, o no contiene matrículas',
      );
    const { entry, data } = await this.source(
      snapshot.tipo,
      snapshot.plantilla.idioma,
    );
    if (
      entry.sha256 !== snapshot.plantilla.sha256 ||
      entry.id !== snapshot.plantilla.id ||
      entry.tipo !== snapshot.plantilla.tipo ||
      entry.idioma !== snapshot.plantilla.idioma ||
      entry.version !== snapshot.plantilla.version ||
      entry.estado !== snapshot.plantilla.estado
    )
      throw new ConflictException(
        'La versión de plantilla cambió desde la consulta',
      );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(data).buffer);
    if (book.worksheets.length !== 1 || book.worksheets[0]!.name !== entry.hoja)
      throw new ConflictException(
        'La estructura de plantilla no coincide con su versión',
      );
    const sheet = book.worksheets[0]!;
    book.creator = 'Centro de Idiomas Excel';
    book.lastModifiedBy = 'Sistema de gestión académica';
    book.created = new Date();
    book.modified = new Date();
    if (snapshot.tipo === 'MATRIZ_NOTAS') {
      sheet.getCell('A2').value =
        'BORRADOR. Formato de demostración pendiente de aprobación institucional.';
      this.matrix(sheet, entry, snapshot);
    } else if (snapshot.tipo === 'RESUMEN_PARTICIPANTES') {
      sheet.getCell('A2').value =
        'BORRADOR. Formato de demostración pendiente de aprobación institucional.';
      this.summary(sheet, snapshot);
    } else {
      this.actaUgel(sheet, entry, snapshot);
    }
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  private actaUgel(
    sheet: ExcelJS.Worksheet,
    entry: TemplateEntry,
    snapshot: ReportSnapshot,
  ) {
    const { anexo, grupo, indicadores, items, resumen } = snapshot;
    const context = (grupo.contexto as Record<string, string> | null) ?? {};
    const periodo = context.periodo ?? anexo.fechaInicio.slice(0, 4);
    const yearMatch = /\d{4}/.exec(periodo);
    const year = yearMatch ? yearMatch[0] : anexo.fechaInicio.slice(0, 4);
    const programaNombre = `${anexo.idioma} ${anexo.nivel}`.toUpperCase();

    // Encabezado oficial UGEL / CETPRO
    sheet.getCell('P1').value = `- ${year}`;
    sheet.getCell('W4').value = programaNombre;
    sheet.getCell('W5').value = programaNombre;
    sheet.getCell('W6').value = 'Presencial';
    sheet.getCell('T11').value = formatDateDmy(anexo.fechaInicio);
    sheet.getCell('Y11').value = formatDateDmy(anexo.fechaFin);
    sheet.getCell('AC11').value = periodo;

    // Agrupación de notas por unidad / evaluación en las 5 columnas oficiales (J, K, L, O, Q)
    const unitColumns = [10, 11, 12, 15, 17] as const;
    const evalGroups = groupIndicatorsForUgel(indicadores);

    // Orden alfabético por apellidos y nombres
    const sortedItems = [...items].sort((a, b) =>
      a.estudiante.localeCompare(b.estudiante, 'es', { sensitivity: 'base' }),
    );

    let aprobadosCount = 0;
    let desaprobadosCount = 0;
    let retiradosCount = 0;

    const totalTemplateRows = Math.max(36, sortedItems.length);
    for (let index = 0; index < totalTemplateRows; index++) {
      const rowNum = entry.primeraFila + index;
      const row = sheet.getRow(rowNum);
      const item = sortedItems[index];

      row.getCell(1).value = index + 1;
      if (!item) {
        row.getCell(2).value = null;
        row.getCell(3).value = null;
        for (const col of unitColumns) row.getCell(col).value = null;
        row.getCell(18).value = null;
        row.getCell(19).value = null;
        row.getCell(20).value = null;
        row.getCell(21).value = null;
        row.getCell(22).value = null;
        row.getCell(23).value = null;
        continue;
      }

      row.getCell(2).value = item.documento;
      row.getCell(3).value = item.estudiante.toUpperCase();

      let sumUnitGrades = 0;
      let countUnitGrades = 0;

      unitColumns.forEach((col, unitIdx) => {
        const group = evalGroups[unitIdx];
        if (!group || !group.length) {
          row.getCell(col).value = null;
          return;
        }
        const grade = computeUnitGrade(item.notas, group);
        row.getCell(col).value = grade;
        if (grade !== null) {
          sumUnitGrades += grade;
          countUnitGrades += 1;
        }
      });

      const notaOficial =
        item.resultado?.nota_oficial ??
        item.resumenNotas.notaOficial ??
        (countUnitGrades > 0
          ? Math.round(sumUnitGrades / countUnitGrades)
          : null);

      row.getCell(18).value = countUnitGrades > 0 ? sumUnitGrades : null;
      row.getCell(19).value = notaOficial;

      const effectiveCond =
        item.resultado?.condicion ??
        (item.resumenAsistencia.excedeLimite
          ? 'RETIRADO_INASISTENCIA'
          : notaOficial !== null
            ? notaOficial >= 11
              ? 'APROBADO'
              : 'DESAPROBADO'
            : null);

      row.getCell(20).value = effectiveCond === 'APROBADO' ? 'X' : null;
      row.getCell(21).value = effectiveCond === 'DESAPROBADO' ? 'X' : null;
      row.getCell(22).value =
        effectiveCond === 'RETIRADO_INASISTENCIA' ? 'X' : null;
      row.getCell(23).value =
        effectiveCond === 'RETIRADO_INASISTENCIA'
          ? 'Inhabilitado por inasistencia (DPI)'
          : null;

      if (effectiveCond === 'APROBADO') aprobadosCount += 1;
      else if (effectiveCond === 'DESAPROBADO') desaprobadosCount += 1;
      else if (effectiveCond === 'RETIRADO_INASISTENCIA') retiradosCount += 1;
    }

    // Resumen Estadístico y Metadatos del Grupo
    sheet.getCell('Y12').value = items.length;
    sheet.getCell('Y13').value = resumen.aprobados ?? aprobadosCount;
    sheet.getCell('Y14').value = resumen.desaprobados ?? desaprobadosCount;
    sheet.getCell('Y15').value = resumen.retirados ?? retiradosCount;
    sheet.getCell('AC12').value = numeric(anexo.creditos) ?? 6;
    sheet.getCell('AC13').value = anexo.horas ?? 176;
    sheet.getCell('AC14').value = context.turno ?? 'Noche';
    sheet.getCell('AC15').value = context.seccion ?? 'A';
  }
  private matrix(
    sheet: ExcelJS.Worksheet,
    entry: TemplateEntry,
    snapshot: ReportSnapshot,
  ) {
    const { grupo, indicadores, items, resumen } = snapshot;
    sheet.getCell('A3').value = groupLabel(grupo);
    sheet.getCell('A4').value =
      `${snapshot.anexo.idioma}   ${snapshot.anexo.nivel}   Fechas del periodo: ${snapshot.anexo.fechaInicio} al ${snapshot.anexo.fechaFin}`;
    sheet.getCell('A5').value =
      'Notas y promedios calculados con los criterios aprobados aplicados al grupo. Una celda vacía significa pendiente.';
    sheet.getCell('A6').value =
      `Intentos matriculados: ${resumen.matriculas}. Resultados pendientes de confirmación: ${resumen.resultadosPendientes}.`;
    sheet.mergeCells('A7:L7');
    sheet.getCell('A7').value =
      'La inasistencia puede ser parcial o provisional mientras falten marcas, justificaciones o el cierre de asistencia.';
    const headers = [
      'N°',
      'Documento',
      'Estudiante',
      ...indicadores.map(
        (i) =>
          `${i.evaluacion}\n${i.codigo}: ${i.descripcion}\nPesos ${i.pesoEvaluacion}% / ${i.pesoIndicador}%`,
      ),
      'Promedio exacto',
      'Nota oficial calculada',
      'Inasistencia',
      'Condición confirmada',
      'Código de matrícula',
      'Intento',
      'Estado del resultado',
    ];
    const header = sheet.getRow(entry.filaCabecera);
    header.eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
    });
    headers.forEach((value, i) => {
      header.getCell(i + 1).value = value;
    });
    header.height = Math.min(
      409,
      Math.max(64, ...headers.map((value) => wrappedLines(value, 21) * 13 + 8)),
    );
    this.header(header, headers.length);
    items.forEach((item, index) => {
      const confirmed =
        !!item.resultado?.cierre_id &&
        !!item.resultado.confirmado_at &&
        !!item.resultado.configuracion_id &&
        !!item.resultado.calculo;
      const row = sheet.getRow(entry.primeraFila + index);
      row.values = [
        index + 1,
        `${item.tipoDocumento} ${item.documento}`,
        item.estudiante,
        ...indicadores.map((indicator) =>
          numeric(item.notas[indicator.id] ?? null),
        ),
        numeric(item.resumenNotas.promedio),
        item.resumenNotas.notaOficial,
        item.resumenAsistencia.inasistenciaPct === null
          ? null
          : Number(item.resumenAsistencia.inasistenciaPct) / 100,
        confirmed && item.resultado?.condicion
          ? conditions[item.resultado.condicion]
          : null,
        item.codigo,
        item.intento,
        confirmed
          ? 'Confirmado en acta'
          : item.resultado
            ? 'Histórico sin procedencia de acta'
            : 'Sin confirmar',
      ];
      row.height = Math.max(
        32,
        wrappedLines(item.estudiante, 30) * 13 + 8,
        wrappedLines(`${item.tipoDocumento} ${item.documento}`, 20) * 13 + 8,
        wrappedLines(item.codigo, 18) * 13 + 8,
      );
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      row.getCell(2).numFmt = '@';
      for (let column = 4; column < 4 + indicadores.length; column++)
        row.getCell(column).numFmt = '0.00';
      row.getCell(4 + indicadores.length).numFmt = '0.00########';
      row.getCell(5 + indicadores.length).numFmt = '0';
      row.getCell(6 + indicadores.length).numFmt = '0.00%';
      row.getCell(8 + indicadores.length).numFmt = '@';
    });
    headers.forEach((_value, index) => {
      sheet.getColumn(index + 1).width =
        index === 0
          ? 6
          : index === 2
            ? 34
            : index === 1
              ? 24
              : index < 3 + indicadores.length
                ? 24
                : 22;
    });
    const lastRow = entry.primeraFila + items.length - 1;
    const totalRow = lastRow + 2;
    sheet.getCell(totalRow, 1).value = 'Total de intentos';
    sheet.getCell(totalRow, 3).value = {
      formula: `COUNT(A${entry.primeraFila}:A${lastRow})`,
      result: items.length,
    };
    sheet.getCell(totalRow + 1, 1).value =
      'Resultados confirmados: aprobados / desaprobados / retirados';
    sheet.getCell(totalRow + 1, 5).value =
      resumen.aprobados === null
        ? 'Pendiente'
        : `${resumen.aprobados} / ${resumen.desaprobados} / ${resumen.retirados}`;
    sheet.getCell(totalRow + 3, 1).value =
      'Documento completo por intento. El archivo refleja los datos guardados al generarlo; no modifica el acta.';
    sheet.autoFilter = {
      from: { row: entry.filaCabecera, column: 1 },
      to: { row: lastRow, column: headers.length },
    };
    sheet.views = [
      {
        state: 'frozen',
        xSplit: 3,
        ySplit: entry.filaCabecera,
        showGridLines: false,
      },
    ];
    sheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      scale: 100,
      printTitlesRow: `${entry.filaCabecera}:${entry.filaCabecera}`,
      printTitlesColumn: 'A:C',
      printArea: `A1:${sheet.getColumn(Math.max(12, headers.length)).letter}${totalRow + 3}`,
    };
  }
  private summary(sheet: ExcelJS.Worksheet, snapshot: ReportSnapshot) {
    const { anexo, grupo } = snapshot;
    sheet.getCell('A9').value = groupLabel(grupo);
    const row = sheet.getRow(11);
    row.values = [
      1,
      null,
      anexo.idioma,
      anexo.nivel,
      null,
      null,
      numeric(anexo.creditos),
      anexo.horas,
      new Date(`${anexo.fechaInicio}T00:00:00Z`),
      new Date(`${anexo.fechaFin}T00:00:00Z`),
      anexo.matriculados,
      anexo.aprobados,
    ];
    row.height = 56;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { wrapText: true, vertical: 'middle' };
    });
    row.getCell(7).numFmt = '0.00';
    row.getCell(8).numFmt = '0';
    row.getCell(9).numFmt = 'dd/mm/yyyy';
    row.getCell(10).numFmt = 'dd/mm/yyyy';
    row.getCell(11).numFmt = '0';
    row.getCell(12).numFmt = '0';
    sheet.getCell('A13').value =
      'Conteo propuesto: intentos de matrículas activas o cerradas del grupo, incluidos los retirados. No cuenta personas únicas.';
    sheet.getCell('A14').value =
      'Programa = idioma y módulo = nivel son equivalencias propuestas. Las fechas corresponden al periodo, no a clases certificadas.';
    sheet.getCell('A15').value =
      'Campos institucionales, familia CNOF, tipo de programa y modalidad: pendientes de configurar y aprobar.';
    sheet.getCell('A16').value =
      anexo.aprobados === null
        ? 'Aprobados pendientes: faltan resultados confirmados de todos los intentos del acta actual.'
        : `Resultados confirmados: ${anexo.aprobados} aprobados de ${anexo.matriculados} intentos.`;
    sheet.getCell('A17').value =
      anexo.creditos === null || anexo.horas === null
        ? 'Créditos u horas pendientes: las unidades del nivel tienen datos incompletos.'
        : 'Créditos y horas proceden de las unidades didácticas del nivel.';
    this.header(sheet.getRow(10), 12);
    sheet.views = [{ state: 'normal', showGridLines: false }];
    sheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printArea: 'A1:L18',
    };
  }
  private header(row: ExcelJS.Row, count: number) {
    for (let i = 1; i <= count; i++) {
      const cell = row.getCell(i);
      cell.font = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF194D43' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
    }
  }
}
function numeric(value: string | null): number | null {
  return value === null ? null : Number(value);
}
function wrappedLines(value: string, width: number): number {
  return value
    .split('\n')
    .reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / width)),
      0,
    );
}
function groupLabel(group: ReportSnapshot['grupo']): string {
  const context = group.contexto as Record<string, string> | null;
  return `Grupo: ${group.codigo}. Periodo: ${context?.periodo ?? group.periodo_id}. Turno: ${context?.turno ?? 'Pendiente'}. Sección: ${context?.seccion ?? 'Pendiente'}. Estado: ${group.estado}.`;
}
function formatDateDmy(iso: string): string {
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function groupIndicatorsForUgel(
  indicadores: ReportIndicator[],
): ReportIndicator[][] {
  if (!indicadores.length) return [];
  const byEval = new Map<string, ReportIndicator[]>();
  for (const ind of indicadores) {
    const list = byEval.get(ind.evaluacion) ?? [];
    list.push(ind);
    byEval.set(ind.evaluacion, list);
  }
  // Si hay múltiples evaluaciones (ej. Unidad 1..4 + EFSRT), cada evaluación es una columna
  if (byEval.size >= 2) {
    return Array.from(byEval.values()).slice(0, 5);
  }
  // Si solo hay una evaluación con varios indicadores, cada indicador es una columna
  return indicadores.slice(0, 5).map((ind) => [ind]);
}
function computeUnitGrade(
  notas: Record<string, string | null>,
  group: ReportIndicator[],
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const ind of group) {
    const raw = notas[ind.id];
    if (raw === null || raw === undefined) continue;
    const val = Number(raw);
    const weight = Number(ind.pesoIndicador) || 1;
    weightedSum += val * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}
