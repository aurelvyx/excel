import type ExcelJS from 'exceljs';
import type { ReportRow, ReportSnapshot } from './report.model.js';

export const actSheetLayout = {
  columns: 29,
  headerRows: 16,
  rosterRows: 35,
  footerRows: 10,
  components: 8,
} as const;

export function compareActRows(a: ReportRow, b: ReportRow) {
  const byName = a.estudiante.localeCompare(b.estudiante, 'es', {
    sensitivity: 'base',
  });
  if (byName) return byName;
  const first = BigInt(a.matriculaId);
  const second = BigInt(b.matriculaId);
  return first < second ? -1 : first > second ? 1 : 0;
}

/** Conserva el diseño recuperado del PR21 con los valores calculados por la API. */
export function populateDemonstrationAct(
  sheet: ExcelJS.Worksheet,
  snapshot: ReportSnapshot,
  offset = 0,
) {
  const { grupo, anexo, componentes, resumen } = snapshot;
  const layout = actSheetLayout;
  const visibleComponents = componentes.slice(0, layout.components);
  const context = grupo.contexto as Record<string, string> | undefined;
  const period =
    context?.periodo ??
    (typeof grupo.periodo === 'string' ? grupo.periodo : grupo.periodo_id);
  const rosterStart = layout.headerRows + 1;
  const footerStart = rosterStart + layout.rosterRows;
  const extra = Math.max(0, snapshot.items.length - layout.rosterRows);
  const footerMerges = sheet.model.merges.filter(
    (range) => Number(/\d+/.exec(range)![0]) >= footerStart,
  );
  for (const range of sheet.model.merges)
    if (Number(/\d+/.exec(range)![0]) >= rosterStart) sheet.unMergeCells(range);
  if (extra)
    sheet.spliceRows(
      footerStart,
      0,
      ...Array.from({ length: extra }, () => []),
    );
  for (const range of footerMerges)
    sheet.mergeCells(
      range.replace(/\d+/g, (value) => String(Number(value) + extra)),
    );

  if (!sheet.getCell('A2').isMerged) sheet.mergeCells('A2:AC2');
  sheet.getCell('A2').alignment = {
    wrapText: true,
    horizontal: 'center',
    vertical: 'middle',
  };
  sheet.getCell('A2').font = {
    name: 'Arial',
    size: 10,
    color: { argb: 'FF8A3719' },
    bold: true,
  };
  sheet.getRow(2).height = Math.max(sheet.getRow(2).height ?? 0, 18);
  sheet.mergeCells('P1:V1');
  sheet.getCell('P1').value = period;
  sheet.getCell('P1').style = {
    ...sheet.getCell('P1').style,
    font: { name: 'Arial', size: 9, bold: true },
    alignment: { wrapText: true, horizontal: 'center', vertical: 'middle' },
  };
  sheet.getRow(1).height = Math.max(sheet.getRow(1).height ?? 0, 28);
  sheet.getCell('J3').value = 'CENTRO DE IDIOMAS EXCEL · REPORTE ACADÉMICO';
  sheet.getCell('A8').value = 'CENTRO';
  sheet.getCell('R7').value = 'CRITERIOS DEL GRUPO';
  sheet.getCell('S7').value =
    'Las columnas corresponden a componentes de evaluación aprobados. Su equivalencia con unidades oficiales está pendiente de aprobación.';
  for (const reference of [
    'D4',
    'D6',
    'W6',
    'D9',
    'H9',
    'C10',
    'F10',
    'H10',
    'D11',
    'D12',
    'D13',
  ]) {
    sheet.getCell(reference).value = 'Pendiente';
  }
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
  for (const [reference, label] of [
    ['R16', 'Promedio exacto'],
    ['S16', 'Nota calculada'],
  ] as const) {
    const cell = sheet.getCell(reference);
    cell.value = label;
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
  dateLabel.value = 'Fecha de generación';
  dateLabel.style = {
    ...dateLabel.style,
    font: { name: 'Arial', size: 10, bold: true },
    alignment: { wrapText: true, horizontal: 'right', vertical: 'middle' },
  };
  sheet.getCell(`B${60 + extra}`).value = 'Administración';
  sheet.getCell(`L${60 + extra}`).value = 'Docente asignado';
  sheet.getCell(`S${60 + extra}`).value = 'Coordinación';
  sheet.getCell(`B${55 + extra}`).value =
    `Grupo ${grupo.codigo}. ${resumen.resultadosPendientes} resultados pendientes de confirmación. Fechas del periodo académico.`;
  sheet.mergeCells(`B${55 + extra}:AC${55 + extra}`);
  sheet.getRow(55 + extra).height = 28;
  sheet.getCell(`B${55 + extra}`).alignment = {
    wrapText: true,
    vertical: 'middle',
  };
  for (let index = 0; index < layout.components; index++) {
    const component = visibleComponents[index];
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
  const styles = Array.from({ length: layout.columns }, (_, index) =>
    structuredClone(sheet.getCell(rosterStart, index + 1).style),
  );
  const rowCount = Math.max(layout.rosterRows, snapshot.items.length);
  for (let index = 0; index < rowCount; index++) {
    const number = rosterStart + index;
    const row = sheet.getRow(number);
    for (let column = 1; column <= layout.columns; column++) {
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
    const item = snapshot.items[index];
    if (!item) continue;
    row.getCell(1).value = offset + index + 1;
    row.getCell(2).value = item.documento;
    row.getCell(2).numFmt = '@';
    row.getCell(3).value = item.estudiante;
    visibleComponents.forEach((component, componentIndex) => {
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
    {
      state: 'frozen',
      xSplit: 2,
      ySplit: layout.headerRows,
      showGridLines: false,
    },
  ];
  sheet.pageSetup = {
    ...sheet.pageSetup,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `1:${layout.headerRows}`,
    printArea: `A1:AC${footerStart + layout.footerRows - 1 + extra}`,
  };
}
