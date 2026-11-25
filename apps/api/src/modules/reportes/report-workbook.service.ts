import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ConflictException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { actSheetLayout, populateDemonstrationAct } from './report-acta.js';
import { buildActPreview } from './report-act-preview.js';
import type {
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
      manifest.version !== 1 ||
      entry.estado !== 'PROPUESTA' ||
      !Number.isSafeInteger(entry.version) ||
      entry.version < 1 ||
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
  private async populatedWorkbook(snapshot: ReportSnapshot, offset = 0) {
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
    if (
      book.worksheets.length !== 1 ||
      book.worksheets[0]!.name !== entry.hoja ||
      book.worksheets[0]!.state !== 'visible'
    )
      throw new ConflictException(
        'La estructura de plantilla no coincide con su versión',
      );
    const sheet = book.worksheets[0]!;
    book.creator = 'Centro de Idiomas Excel';
    book.lastModifiedBy = 'Sistema de gestión académica';
    book.created = new Date();
    book.modified = new Date();
    sheet.getCell('A2').value =
      'BORRADOR. Formato de demostración pendiente de aprobación institucional.';
    if (snapshot.tipo === 'MATRIZ_NOTAS') this.matrix(sheet, entry, snapshot);
    else if (snapshot.tipo === 'RESUMEN_PARTICIPANTES')
      this.summary(sheet, snapshot);
    else populateDemonstrationAct(sheet, snapshot, offset);
    return { book, sheet };
  }

  async previewAct(snapshot: ReportSnapshot, offset: number) {
    const { book, sheet } = await this.populatedWorkbook(snapshot, offset);
    return buildActPreview(book, sheet, snapshot.items.length);
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
    if (
      snapshot.tipo === 'ACTA_DEMOSTRACION' &&
      (!snapshot.componentes.length ||
        snapshot.componentes.length > actSheetLayout.components)
    )
      throw new ConflictException(
        'El formato de acta admite de uno a ocho componentes aprobados',
      );
    const { book } = await this.populatedWorkbook(snapshot);
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  private matrix(
    sheet: ExcelJS.Worksheet,
    entry: TemplateEntry,
    snapshot: ReportSnapshot,
  ) {
    const { grupo, indicadores, items, resumen } = snapshot;
    const titleText = sheet.getCell('A1').text || 'Matriz de notas';
    const rawMerges = [...((sheet.model.merges as string[] | undefined) ?? [])];
    for (const range of rawMerges) {
      sheet.unMergeCells(range);
    }

    const headers = [
      'N°',
      'Documento',
      'Estudiante',
      ...indicadores.map(
        (i) =>
          `${i.codigo}\n${i.descripcion}\n(${i.pesoEvaluacion}% / ${i.pesoIndicador}%)`,
      ),
      'Promedio exacto',
      'Nota oficial calculada',
      'Inasistencia',
      'Condición confirmada',
      'Código de matrícula',
      'Intento',
      'Estado del resultado',
    ];

    const bannerSpan = Math.max(12, headers.length);
    const applyRowBorder = (
      rowNum: number,
      fromCol: number,
      toCol: number,
      border: Partial<ExcelJS.Borders>,
    ) => {
      const row = sheet.getRow(rowNum);
      for (let c = fromCol; c <= toCol; c++) {
        row.getCell(c).border = border;
      }
    };

    // Bloque superior institucional y resumen (filas 1..6)
    sheet.mergeCells(1, 1, 1, bannerSpan);
    const r1 = sheet.getRow(1);
    r1.height = 34;
    const c1 = sheet.getCell('A1');
    c1.value = titleText;
    c1.font = {
      name: 'Arial',
      size: 14,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    c1.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF064E3B' },
    };
    c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    sheet.mergeCells(2, 1, 2, bannerSpan);
    const r2 = sheet.getRow(2);
    r2.height = 22;
    const c2 = sheet.getCell('A2');
    c2.value =
      'BORRADOR. Formato de demostración pendiente de aprobación institucional.';
    c2.font = {
      name: 'Arial',
      size: 9.5,
      italic: true,
      color: { argb: 'FF92400E' },
    };
    c2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFBEB' },
    };
    c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    applyRowBorder(2, 1, bannerSpan, {
      bottom: { style: 'thin', color: { argb: 'FFFDE68A' } },
    });

    sheet.mergeCells(3, 1, 3, bannerSpan);
    const r3 = sheet.getRow(3);
    r3.height = 22;
    const c3 = sheet.getCell('A3');
    c3.value = groupLabel(grupo);
    c3.font = {
      name: 'Arial',
      size: 9.5,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    c3.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
    c3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    applyRowBorder(3, 1, bannerSpan, {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    });

    sheet.mergeCells(4, 1, 4, bannerSpan);
    const r4 = sheet.getRow(4);
    r4.height = 22;
    const c4 = sheet.getCell('A4');
    c4.value = `Programa: ${snapshot.anexo.idioma} — ${snapshot.anexo.nivel}   |   Periodo: ${formatDateDmy(snapshot.anexo.fechaInicio)} al ${formatDateDmy(snapshot.anexo.fechaFin)}`;
    c4.font = { name: 'Arial', size: 9.5, color: { argb: 'FF334155' } };
    c4.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
    c4.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    applyRowBorder(4, 1, bannerSpan, {
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    });

    sheet.mergeCells(5, 1, 5, bannerSpan);
    const r5 = sheet.getRow(5);
    r5.height = 22;
    const c5 = sheet.getCell('A5');
    const confirmedSummary =
      resumen.aprobados === null
        ? 'Resultados confirmados: Pendiente de cierre'
        : `Aprobados: ${resumen.aprobados}  |  Desaprobados: ${resumen.desaprobados ?? 0}  |  Retirados: ${resumen.retirados ?? 0}`;
    c5.value = `Intentos matriculados: ${resumen.matriculas}   |   ${confirmedSummary}   |   Pendientes de confirmación: ${resumen.resultadosPendientes}`;
    c5.font = {
      name: 'Arial',
      size: 9.5,
      bold: true,
      color: { argb: 'FF065F46' },
    };
    c5.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFECFDF5' },
    };
    c5.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    applyRowBorder(5, 1, bannerSpan, {
      bottom: { style: 'thin', color: { argb: 'FFA7F3D0' } },
    });

    sheet.mergeCells(6, 1, 6, bannerSpan);
    const r6 = sheet.getRow(6);
    r6.height = 20;
    const c6 = sheet.getCell('A6');
    c6.value =
      'Notas y promedios calculados con los criterios aprobados del grupo (celda vacía = pendiente; inasistencia provisional hasta el cierre).';
    c6.font = {
      name: 'Arial',
      size: 8.5,
      italic: true,
      color: { argb: 'FF64748B' },
    };
    c6.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    if (entry.filaCabecera >= 9) {
      const spacerRow = sheet.getRow(entry.filaCabecera - 2);
      spacerRow.height = 8;
      for (let col = 1; col <= bannerSpan; col++) {
        spacerRow.getCell(col).value = null;
        spacerRow.getCell(col).fill = { type: 'pattern', pattern: 'none' };
        spacerRow.getCell(col).border = {};
      }
    }

    // Agrupación contigua de indicadores por unidad/evaluación
    const unitGroups: {
      evaluacion: string;
      pesoEvaluacion: string;
      startCol: number;
      endCol: number;
    }[] = [];
    indicadores.forEach((ind, idx) => {
      const col = 4 + idx;
      const last = unitGroups[unitGroups.length - 1];
      if (last && last.evaluacion === ind.evaluacion) {
        last.endCol = col;
      } else {
        unitGroups.push({
          evaluacion: ind.evaluacion,
          pesoEvaluacion: ind.pesoEvaluacion,
          startCol: col,
          endCol: col,
        });
      }
    });
    const unitStartCols = new Set(unitGroups.map((g) => g.startCol));
    const resultsStartCol = 4 + indicadores.length;

    // Super-cabecera agrupada en la fila inmediatamente superior a filaCabecera
    const superRowNum = entry.filaCabecera - 1;
    const superRow = sheet.getRow(superRowNum);
    superRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
    });

    sheet.mergeCells(superRowNum, 1, superRowNum, 3);
    superRow.getCell(1).value = 'IDENTIFICACIÓN DEL ESTUDIANTE';
    for (let c = 1; c <= 3; c++) {
      const cell = superRow.getCell(c);
      cell.font = {
        name: 'Arial',
        size: 9,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'thin', color: { argb: 'FF334155' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    }

    unitGroups.forEach((ug, uIdx) => {
      const label = `${ug.evaluacion} (${Number(ug.pesoEvaluacion)}%)`;
      if (ug.endCol > ug.startCol) {
        sheet.mergeCells(superRowNum, ug.startCol, superRowNum, ug.endCol);
      }
      superRow.getCell(ug.startCol).value = label;
      const bg = uIdx % 2 === 0 ? 'FF0F766E' : 'FF115E59';
      for (let c = ug.startCol; c <= ug.endCol; c++) {
        const cell = superRow.getCell(c);
        cell.font = {
          name: 'Arial',
          size: 9,
          bold: true,
          color: { argb: 'FFFFFFFF' },
        };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF2D6A5E' } },
          bottom: { style: 'thin', color: { argb: 'FF2D6A5E' } },
          left: {
            style: c === ug.startCol ? 'medium' : 'thin',
            color: { argb: c === ug.startCol ? 'FFCBD5E1' : 'FF2D6A5E' },
          },
          right: { style: 'thin', color: { argb: 'FF2D6A5E' } },
        };
      }
    });

    sheet.mergeCells(superRowNum, resultsStartCol, superRowNum, headers.length);
    superRow.getCell(resultsStartCol).value = 'RESULTADOS Y ESTADO ACADÉMICO';
    for (let c = resultsStartCol; c <= headers.length; c++) {
      const cell = superRow.getCell(c);
      cell.font = {
        name: 'Arial',
        size: 9,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'thin', color: { argb: 'FF334155' } },
        left: {
          style: c === resultsStartCol ? 'medium' : 'thin',
          color: { argb: c === resultsStartCol ? 'FFCBD5E1' : 'FF334155' },
        },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    }

    superRow.height = Math.min(
      56,
      Math.max(
        28,
        ...unitGroups.map(
          (u) =>
            wrappedLines(
              `${u.evaluacion} (${Number(u.pesoEvaluacion)}%)`,
              (u.endCol - u.startCol + 1) * 18,
            ) *
              13 +
            10,
        ),
      ),
    );

    // Cabecera principal de columnas
    const header = sheet.getRow(entry.filaCabecera);
    header.eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
    });
    headers.forEach((value, i) => {
      header.getCell(i + 1).value = value;
    });
    header.height = Math.min(
      409,
      Math.max(
        54,
        ...headers.map(
          (value, idx) => wrappedLines(value, idx < 3 ? 18 : 16) * 14 + 20,
        ),
      ),
    );
    for (let col = 1; col <= headers.length; col++) {
      const cell = header.getCell(col);
      const isSectionStart =
        unitStartCols.has(col) || col === resultsStartCol;
      cell.font = {
        name: 'Arial',
        size: 9,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: col >= resultsStartCol ? 'FF14532D' : 'FF194D43' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF2D6A5E' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: {
          style: isSectionStart ? 'medium' : 'thin',
          color: { argb: isSectionStart ? 'FFCBD5E1' : 'FF2D6A5E' },
        },
        right: { style: 'thin', color: { argb: 'FF2D6A5E' } },
      };
    }

    // Filas de datos
    items.forEach((item, index) => {
      const confirmed =
        !!item.resultado?.cierre_id &&
        !!item.resultado.confirmado_at &&
        !!item.resultado.configuracion_id &&
        !!item.resultado.calculo;
      const condText =
        confirmed && item.resultado?.condicion
          ? conditions[item.resultado.condicion]
          : null;
      const stateText = confirmed
        ? 'Confirmado en acta'
        : item.resultado
          ? 'Histórico sin procedencia de acta'
          : 'Sin confirmar';

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
        condText,
        item.codigo,
        item.intento,
        stateText,
      ];
      row.height = Math.max(
        24,
        wrappedLines(item.estudiante, 30) * 14 + 8,
        wrappedLines(`${item.tipoDocumento} ${item.documento}`, 17) * 14 + 8,
        wrappedLines(item.codigo, 21) * 14 + 8,
      );

      const zebraArgb = index % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      const officialCol = 5 + indicadores.length;
      const condCol = 7 + indicadores.length;
      const stateCol = 10 + indicadores.length;

      for (let col = 1; col <= headers.length; col++) {
        const cell = row.getCell(col);
        const isSectionStart =
          unitStartCols.has(col) || col === resultsStartCol;
        let fontColor = 'FF0F172A';
        let bold = false;
        let bgArgb = zebraArgb;

        if (col >= 4 && col < 4 + indicadores.length) {
          const val = cell.value;
          if (typeof val === 'number' && val < 11) {
            fontColor = 'FFB91C1C';
            bold = true;
          }
        } else if (col === officialCol) {
          bgArgb = 'FFF0FDF4';
          bold = true;
          const val = cell.value;
          fontColor =
            typeof val === 'number' && val < 11 ? 'FFB91C1C' : 'FF065F46';
        } else if (col === condCol && condText) {
          bold = true;
          if (item.resultado?.condicion === 'APROBADO') {
            bgArgb = 'FFDCFCE7';
            fontColor = 'FF166534';
          } else if (item.resultado?.condicion === 'DESAPROBADO') {
            bgArgb = 'FFFEE2E2';
            fontColor = 'FF991B1B';
          } else if (item.resultado?.condicion === 'RETIRADO_INASISTENCIA') {
            bgArgb = 'FFFEF3C7';
            fontColor = 'FF9A3412';
          }
        } else if (col === stateCol) {
          if (confirmed) {
            fontColor = 'FF166534';
            bold = true;
          } else {
            fontColor = 'FF64748B';
          }
        }

        cell.font = {
          name: 'Arial',
          size: 10,
          bold,
          color: { argb: fontColor },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgArgb },
        };
        cell.alignment =
          col === 3
            ? { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
            : { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: {
            style: isSectionStart ? 'medium' : 'thin',
            color: { argb: isSectionStart ? 'FF94A3B8' : 'FFE2E8F0' },
          },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }

      row.getCell(2).numFmt = '@';
      for (let column = 4; column < 4 + indicadores.length; column++)
        row.getCell(column).numFmt = '0.00';
      row.getCell(4 + indicadores.length).numFmt = '0.00########';
      row.getCell(5 + indicadores.length).numFmt = '0';
      row.getCell(6 + indicadores.length).numFmt = '0.00%';
      row.getCell(8 + indicadores.length).numFmt = '@';
    });

    const resultWidths = [15, 15, 13, 22, 24, 10, 22];
    headers.forEach((_value, index) => {
      if (index === 0) sheet.getColumn(1).width = 6;
      else if (index === 1) sheet.getColumn(2).width = 18;
      else if (index === 2) sheet.getColumn(3).width = 34;
      else if (index < 3 + indicadores.length)
        sheet.getColumn(index + 1).width = 20;
      else
        sheet.getColumn(index + 1).width =
          resultWidths[index - (3 + indicadores.length)] ?? 20;
    });

    const lastRow = entry.primeraFila + items.length - 1;
    const totalRow = lastRow + 2;

    sheet.mergeCells(totalRow, 1, totalRow, 2);
    const totalLabelCell = sheet.getCell(totalRow, 1);
    totalLabelCell.value = 'Total de intentos';
    for (let c = 1; c <= 3; c++) {
      const cell = sheet.getCell(totalRow, c);
      cell.font = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: 'FF064E3B' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFECFDF5' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFA7F3D0' } },
        bottom: { style: 'thin', color: { argb: 'FFA7F3D0' } },
        left: { style: 'thin', color: { argb: 'FFA7F3D0' } },
        right: { style: 'thin', color: { argb: 'FFA7F3D0' } },
      };
    }
    totalLabelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getCell(totalRow, 3).value = {
      formula: `COUNT(A${entry.primeraFila}:A${lastRow})`,
      result: items.length,
    };
    sheet.getCell(totalRow, 3).alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };
    sheet.getRow(totalRow).height = 22;

    sheet.mergeCells(totalRow + 1, 1, totalRow + 1, 4);
    const summaryLabelCell = sheet.getCell(totalRow + 1, 1);
    summaryLabelCell.value =
      'Resultados confirmados: aprobados / desaprobados / retirados';
    if (bannerSpan >= 6) {
      sheet.mergeCells(totalRow + 1, 5, totalRow + 1, 6);
    }
    const summaryValueCell = sheet.getCell(totalRow + 1, 5);
    summaryValueCell.value =
      resumen.aprobados === null
        ? 'Pendiente'
        : `${resumen.aprobados} / ${resumen.desaprobados} / ${resumen.retirados}`;
    const summaryEndCol = bannerSpan >= 6 ? 6 : 5;
    for (let c = 1; c <= summaryEndCol; c++) {
      const cell = sheet.getCell(totalRow + 1, c);
      cell.font = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: 'FF1E293B' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    }
    summaryLabelCell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      indent: 1,
    };
    summaryValueCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(totalRow + 1).height = 22;

    sheet.mergeCells(totalRow + 3, 1, totalRow + 3, bannerSpan);
    const footerCell = sheet.getCell(totalRow + 3, 1);
    footerCell.value =
      'Documento completo por intento. El archivo refleja los datos guardados al generarlo; no modifica el acta.';
    footerCell.font = {
      name: 'Arial',
      size: 9,
      italic: true,
      color: { argb: 'FF64748B' },
    };
    footerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(totalRow + 3).height = 20;

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
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${entry.filaCabecera}:${entry.filaCabecera}`,
      printTitlesColumn: 'A:C',
      printArea: `A1:${sheet.getColumn(bannerSpan).letter}${totalRow + 3}`,
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
