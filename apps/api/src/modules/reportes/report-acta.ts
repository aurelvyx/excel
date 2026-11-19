import { ConflictException } from '@nestjs/common';
import type ExcelJS from 'exceljs';
import type { ReportSnapshot } from './report.model.js';

/** Conserva el diseño recuperado del PR21 con los valores calculados por la API. */
export function populateDemonstrationAct(
  sheet: ExcelJS.Worksheet,
  snapshot: ReportSnapshot,
) {
  const { grupo, anexo, componentes, resumen } = snapshot;
  if (!componentes.length || componentes.length > 8)
    throw new ConflictException(
      'El formato de acta admite de uno a ocho componentes aprobados',
    );
  const context = grupo.contexto as Record<string, string> | undefined;
  const period =
    context?.periodo ??
    (typeof grupo.periodo === 'string' ? grupo.periodo : grupo.periodo_id);
  const extra = Math.max(0, snapshot.items.length - 35);
  const footerMerges = sheet.model.merges.filter(
    (range) => Number(/\d+/.exec(range)![0]) >= 52,
  );
  for (const range of sheet.model.merges)
    if (Number(/\d+/.exec(range)![0]) >= 17) sheet.unMergeCells(range);
  if (extra)
    sheet.spliceRows(52, 0, ...Array.from({ length: extra }, () => []));
  for (const range of footerMerges)
    sheet.mergeCells(
      range.replace(/\d+/g, (value) => String(Number(value) + extra)),
    );

  // La cinta de la fila 2 identifica el borrador; la celda A1 queda bajo el logo.
  sheet.getCell('A1').value = null;
  sheet.mergeCells('P1:V1');
  sheet.getCell('P1').value = period;
  sheet.getCell('P1').style = {
    ...sheet.getCell('P1').style,
    font: { name: 'Arial', size: 9, bold: true },
    alignment: { wrapText: true, horizontal: 'center', vertical: 'middle' },
  };
  sheet.getRow(1).height = Math.max(sheet.getRow(1).height ?? 0, 28);
  sheet.getCell('W4').value = anexo.idioma;
  sheet.getCell('W5').value = anexo.nivel;
  sheet.getCell('T11').value = anexo.fechaInicio;
  sheet.getCell('Y11').value = anexo.fechaFin;
  sheet.getCell('AC11').value = period;
  for (const reference of ['T11', 'Y11', 'AC11']) {
    const cell = sheet.getCell(reference);
    cell.style = {
      ...cell.style,
      font: { name: 'Arial', size: 10 },
      alignment: { wrapText: true, horizontal: 'center', vertical: 'middle' },
    };
  }
  sheet.getRow(11).height = Math.max(
    sheet.getRow(11).height ?? 0,
    Math.ceil(String(period ?? '').length / 17) * 12,
  );
  for (const reference of ['R16', 'S16']) {
    const cell = sheet.getCell(reference);
    cell.style = {
      ...cell.style,
      font: { name: 'Arial', size: 8, bold: true },
      alignment: { wrapText: true, horizontal: 'center', vertical: 'middle' },
    };
  }
  sheet.getCell('Y12').value = resumen.matriculas;
  sheet.getCell('Y13').value = resumen.aprobados;
  sheet.getCell('Y14').value = resumen.desaprobados;
  sheet.getCell('Y15').value = resumen.retirados;
  sheet.getCell('AC12').value =
    anexo.creditos === null ? null : Number(anexo.creditos);
  sheet.getCell('AC13').value = anexo.horas;
  sheet.getCell('AC14').value = context?.turno ?? 'Pendiente';
  sheet.getCell('AC15').value = context?.seccion ?? 'Pendiente';
  sheet.getCell(`T${53 + extra}`).value = new Date();
  sheet.getCell(`T${53 + extra}`).numFmt = 'dd/mm/yyyy';
  const dateLabel = sheet.getCell(`Q${53 + extra}`);
  dateLabel.style = {
    ...dateLabel.style,
    font: { name: 'Arial', size: 10, bold: true },
    alignment: { wrapText: true, horizontal: 'right', vertical: 'middle' },
  };
  sheet.getCell(`B${55 + extra}`).value =
    `Grupo ${grupo.codigo}. ${resumen.resultadosPendientes} resultados pendientes de confirmación. Fechas del periodo académico.`;
  sheet.mergeCells(`B${55 + extra}:AC${55 + extra}`);
  sheet.getRow(55 + extra).height = 28;
  sheet.getCell(`B${55 + extra}`).alignment = {
    wrapText: true,
    vertical: 'middle',
  };
  for (let index = 0; index < 8; index++) {
    const component = componentes[index];
    sheet.getCell(4, 10 + index).value = component
      ? `${component.nombre}\nPeso ${component.pesoPct}%`
      : null;
    sheet.getCell(13, 10 + index).value = component?.nombre ?? null;
    sheet.getCell(4, 10 + index).alignment = {
      wrapText: true,
      vertical: 'middle',
      horizontal: 'center',
      textRotation: 90,
    };
  }
  const styles = Array.from({ length: 29 }, (_, index) =>
    structuredClone(sheet.getCell(17, index + 1).style),
  );
  const sorted = [...snapshot.items].sort((a, b) => {
    const byName = a.estudiante.localeCompare(b.estudiante, 'es', {
      sensitivity: 'base',
    });
    if (byName) return byName;
    return BigInt(a.matriculaId) < BigInt(b.matriculaId)
      ? -1
      : BigInt(a.matriculaId) > BigInt(b.matriculaId)
        ? 1
        : 0;
  });
  const rowCount = Math.max(35, sorted.length);
  for (let index = 0; index < rowCount; index++) {
    const number = 17 + index;
    const row = sheet.getRow(number);
    for (let column = 1; column <= 29; column++) {
      const cell = row.getCell(column);
      cell.value = null;
      cell.style = structuredClone(styles[column - 1]!);
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = {
        wrapText: true,
        vertical: 'middle',
        horizontal: column === 3 || column === 23 ? 'left' : 'center',
      };
    }
    sheet.mergeCells(`C${number}:I${number}`);
    sheet.mergeCells(`W${number}:AC${number}`);
    row.height = 30;
    const item = sorted[index];
    if (!item) continue;
    row.getCell(1).value = index + 1;
    row.getCell(2).value = item.documento;
    row.getCell(2).numFmt = '@';
    row.getCell(3).value = item.estudiante;
    componentes.forEach((component, componentIndex) => {
      const value = item.notasComponentes[component.id];
      row.getCell(10 + componentIndex).value =
        value === null || value === undefined ? null : Number(value);
      row.getCell(10 + componentIndex).numFmt = '0.00########';
    });
    row.getCell(18).value =
      item.resumenNotas.promedio === null
        ? null
        : Number(item.resumenNotas.promedio);
    row.getCell(18).numFmt = '0.00########';
    row.getCell(19).value = item.resumenNotas.notaOficial;
    row.getCell(19).numFmt = '0';
    const condition = item.resultado?.condicion;
    row.getCell(20).value = condition === 'APROBADO' ? 'X' : null;
    row.getCell(21).value = condition === 'DESAPROBADO' ? 'X' : null;
    row.getCell(22).value = condition === 'RETIRADO_INASISTENCIA' ? 'X' : null;
    const observation = `${item.codigo} · intento ${item.intento}. ${condition ? 'Resultado confirmado en acta' : 'Resultado pendiente de confirmación'}.`;
    row.getCell(23).value = observation;
    row.height = Math.max(
      30,
      Math.ceil(item.estudiante.length / 32) * 14 + 6,
      Math.ceil(item.documento.length / 12) * 14 + 6,
      Math.ceil(observation.length / 44) * 14 + 6,
    );
  }
  sheet.views = [
    { state: 'frozen', xSplit: 2, ySplit: 16, showGridLines: false },
  ];
  sheet.pageSetup = {
    ...sheet.pageSetup,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:16',
    printArea: `A1:AC${61 + extra}`,
  };
}
