import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type {
  ReportLanguage,
  ReportRow,
  ReportSnapshot,
  ReportType,
} from './report.model.js';
import {
  ReportWorkbookService,
  reportLimits,
} from './report-workbook.service.js';

const service = new ReportWorkbookService();
const variants: [ReportType, ReportLanguage, string][] = [
  ['MATRIZ_NOTAS', 'EN', 'Matriz'],
  ['MATRIZ_NOTAS', 'PT', 'Matriz'],
  ['RESUMEN_PARTICIPANTES', 'EN', 'ANEXO N° 05'],
  ['RESUMEN_PARTICIPANTES', 'PT', 'ANEXO N° 05'],
];

/** Todas las identidades, criterios y resultados de esta prueba son sintéticos. */
function student(index = 1): ReportRow {
  return {
    matriculaId: String(index),
    codigo: `MAT-SINTETICO-${index}`,
    intento: index === 1 ? 2 : 1,
    estudiante: `Estudiante sintético ${index}`,
    tipoDocumento: 'DNI',
    documento: String(index).padStart(8, '0'),
    notas: { '101': '12.49', '102': '12.50' },
    resumenNotas: {
      configuracionAprobada: true,
      promedio: '12.495',
      notaOficial: 12,
      calificacionesEsperadas: 2,
      calificacionesRegistradas: 2,
      calificacionesPendientes: 0,
      motivoPendiente: null,
    },
    resumenAsistencia: {
      estado: 'CALCULADO',
      sesionesComputables: 10,
      presentes: 7,
      faltas: 3,
      tardanzas: 0,
      justificadas: 0,
      marcasPendientes: 0,
      faltasPorTardanzas: 0,
      tardanzasRestantes: 0,
      justificadasPendientes: 0,
      justificadasRecuperadas: 0,
      justificadasComputables: 0,
      faltasConfirmadas: 3,
      faltasComputables: 3,
      inasistenciaPct: '30.00',
      excedeLimite: false,
      condicion: 'DENTRO_LIMITE',
      reglas: {
        parametroId: '1',
        version: 1,
        inasistenciaMaxPct: '30.00',
        tardanzasPorFalta: 3,
      },
      cierreConfirmado: true,
      criterioSesiones: 'REALIZADAS_DEL_GRUPO_HASTA_EL_CIERRE',
    },
    resultado: null,
  };
}

async function snapshot(
  tipo: ReportType = 'MATRIZ_NOTAS',
  idioma: ReportLanguage = 'EN',
): Promise<ReportSnapshot> {
  return {
    grupo: {
      id: '1',
      codigo: 'GRUPO-SINTETICO',
      estado: 'ACTIVO',
      periodo_id: '1',
      periodo: 'Periodo sintético',
      fecha_inicio: '2026-10-01',
      fecha_fin: '2026-12-31',
      periodo_estado: 'ABIERTO',
      asistencia_cerrada: true,
      cierre_asistencia: null,
    },
    tipo,
    plantilla: await service.template(tipo, idioma),
    revision: 'a'.repeat(64),
    puedeExportar: true,
    pendientes: [],
    advertencias: [
      'Datos y criterios sintéticos; no corresponden a política institucional.',
    ],
    resumen: {
      matriculas: 1,
      aprobados: null,
      desaprobados: null,
      retirados: null,
      resultadosPendientes: 1,
    },
    indicadores: [
      {
        id: '101',
        evaluacion: 'Evaluación sintética',
        codigo: 'SYN-1',
        descripcion: 'Indicador A',
        pesoEvaluacion: '100.00',
        pesoIndicador: '50.00',
      },
      {
        id: '102',
        evaluacion: 'Evaluación sintética',
        codigo: 'SYN-2',
        descripcion: 'Indicador B',
        pesoEvaluacion: '100.00',
        pesoIndicador: '50.00',
      },
    ],
    items: [student()],
    anexo: {
      idioma: idioma === 'EN' ? 'Inglés sintético' : 'Portugués sintético',
      nivel: 'Nivel sintético',
      creditos: '4.5',
      horas: 80,
      fechaInicio: '2026-10-01',
      fechaFin: '2026-12-31',
      matriculados: 1,
      aprobados: null,
    },
  };
}

async function reopen(
  data: ReportSnapshot,
  evidenceName?: string,
): Promise<ExcelJS.Worksheet> {
  const bytes = await service.render(data);
  if (process.env.WRITE_B19_EVIDENCE === 'true' && evidenceName) {
    const evidenceDirectory = new URL(
      '../../../../../.tmp/b19/',
      import.meta.url,
    );
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(new URL(evidenceName, evidenceDirectory), bytes);
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(new Uint8Array(bytes).buffer);
  expect(book.worksheets).toHaveLength(1);
  return book.worksheets[0]!;
}

function effectiveValue(cell: ExcelJS.Cell): ExcelJS.CellValue {
  const value = cell.value;
  if (
    value &&
    typeof value === 'object' &&
    ('formula' in value || 'sharedFormula' in value)
  )
    return value.result ?? null;
  return value;
}

describe('B19 adaptador XLSX — RF49/RF51–53 / CU19', () => {
  it.each(variants)(
    'abre %s %s como un único XLSX de demostración',
    async (tipo, idioma, sheetName) => {
      const data = await snapshot(tipo, idioma);
      const sheet = await reopen(
        data,
        `borrador-${tipo.toLowerCase()}-${idioma.toLowerCase()}.xlsx`,
      );
      expect(sheet.name).toBe(sheetName);
      expect(sheet.getCell('A2').text).toContain('BORRADOR');
      expect(sheet.getCell('A2').text).toContain('pendiente de aprobación');
      expect(data.plantilla).toMatchObject({
        tipo,
        idioma,
        version: 1,
        estado: 'PROPUESTA',
      });
      expect(data.plantilla.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(sheet.pageSetup.orientation).toBe('landscape');
      expect(sheet.getCell('A1').text.length).toBeGreaterThan(0);
    },
  );

  it.each([
    ['EN', 9, 10],
    ['PT', 8, 9],
  ] as const)(
    'conserva cabecera, identidad y navegación para %s',
    async (idioma, header, first) => {
      const data = await snapshot('MATRIZ_NOTAS', idioma);
      const sheet = await reopen(data);
      expect(sheet.getCell(header, 1).value).toBe('N°');
      expect(sheet.getCell(header, 2).value).toBe('Documento');
      expect(sheet.getCell(header, 3).value).toBe('Estudiante');
      expect(sheet.getCell(first, 1).value).toBe(1);
      expect(sheet.getCell(first, 2).value).toBe('DNI 00000001');
      expect(sheet.getCell(first, 3).value).toBe('Estudiante sintético 1');
      expect(sheet.getCell(header, 4).text).toContain('SYN-1');
      expect(sheet.getCell(header, 4).text).toContain('100.00% / 50.00%');
      expect(sheet.views[0]).toMatchObject({
        state: 'frozen',
        xSplit: 3,
        ySplit: header,
      });
      expect(sheet.pageSetup.printTitlesRow).toBe(`${header}:${header}`);
      expect(sheet.autoFilter).toBeDefined();
    },
  );

  it('conserva cero numérico y deja vacías las notas y promedios pendientes', async () => {
    const data = await snapshot();
    data.items[0]!.notas = { '101': '0.00', '102': null };
    data.items[0]!.resumenNotas = {
      ...data.items[0]!.resumenNotas,
      promedio: null,
      notaOficial: null,
      calificacionesRegistradas: 1,
      calificacionesPendientes: 1,
    };
    data.items[0]!.resumenAsistencia.inasistenciaPct = null;
    const sheet = await reopen(data);
    expect(sheet.getCell('D10').value).toBe(0);
    for (const ref of ['E10', 'F10', 'G10', 'H10'])
      expect(sheet.getCell(ref).value).toBeNull();
  });

  it('presenta 12.495 y la nota oficial de la instantánea sin redondear dos veces', async () => {
    const data = await snapshot();
    const sheet = await reopen(data);
    expect(sheet.getCell('F10').value).toBe(12.495);
    expect(sheet.getCell('G10').value).toBe(12);
    expect(sheet.getCell('H10').value).toBe(0.3);
    expect(sheet.getCell('H10').numFmt).toBe('0.00%');
    for (const column of ['D', 'E', 'F', 'G', 'H'])
      expect(sheet.getCell(`${column}10`).formula).toBeUndefined();
  });

  it('trata cadenas con prefijos de fórmula como texto y conserva ceros del documento', async () => {
    const data = await snapshot();
    data.items[0]!.estudiante = '=1+1';
    data.items[0]!.codigo = '+SUM(A1:A2)';
    data.items[0]!.documento = '00000007';
    data.indicadores[0]!.descripcion = '@SUM(A1:A2)';
    const sheet = await reopen(data);
    expect(sheet.getCell('B10').value).toBe('DNI 00000007');
    expect(sheet.getCell('B10').numFmt).toBe('@');
    expect(sheet.getCell('C10').value).toBe('=1+1');
    expect(sheet.getCell('C10').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('J10').value).toBe('+SUM(A1:A2)');
    expect(sheet.getCell('J10').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('D9').text).toContain('@SUM(A1:A2)');
  });

  it('distingue resultado confirmado, histórico y sin confirmar sin fabricar condición', async () => {
    const data = await snapshot();
    data.items = [student(1), student(2), student(3)];
    data.items[0]!.resultado = {
      id: '1',
      matricula_id: '1',
      promedio: '12.495',
      nota_oficial: 12,
      tardanzas_total: 0,
      faltas_equivalentes: '4',
      inasistencia_pct: '40.00',
      calculado_at: '2026-12-31T15:00:00.000Z',
      cierre_id: '1',
      confirmado_at: '2026-12-31T15:00:00.000Z',
      configuracion_id: '1',
      version: 1,
      calculo: {
        parametroId: '1',
        configuracionId: '1',
        planId: '1',
        planVersion: 1,
        reglasVersion: 1,
        resumenNotas: data.items[0]!.resumenNotas,
        resumenAsistencia: {
          ...data.items[0]!.resumenAsistencia,
          faltas: 4,
          faltasConfirmadas: 4,
          faltasComputables: 4,
          inasistenciaPct: '40.00',
          excedeLimite: true,
          condicion: 'RETIRADO_INASISTENCIA',
        },
      },
      condicion: 'RETIRADO_INASISTENCIA',
    };
    data.items[1]!.resultado = {
      cierre_id: null,
      confirmado_at: null,
      condicion: 'APROBADO',
    } as ReportRow['resultado'];
    const sheet = await reopen(data);
    expect(sheet.getCell('I10').value).toBe('Retirado por inasistencia');
    expect(sheet.getCell('L10').value).toBe('Confirmado en acta');
    expect(sheet.getCell('I11').value).toBeNull();
    expect(sheet.getCell('L11').value).toContain('Histórico');
    expect(sheet.getCell('I12').value).toBeNull();
    expect(sheet.getCell('L12').value).toBe('Sin confirmar');
  });

  it('exporta el padrón completo más allá de las 30 filas de referencia y totaliza todas', async () => {
    const data = await snapshot();
    data.items = Array.from({ length: 41 }, (_, i) => student(i + 1));
    data.resumen = {
      matriculas: 41,
      aprobados: 20,
      desaprobados: 18,
      retirados: 3,
      resultadosPendientes: 0,
    };
    const before = structuredClone(data);
    const sheet = await reopen(data);
    expect(sheet.getCell('A50').value).toBe(41);
    expect(sheet.getCell('C50').value).toBe('Estudiante sintético 41');
    expect(effectiveValue(sheet.getCell('C52'))).toBe(41);
    expect(sheet.getCell('E53').value).toBe('20 / 18 / 3');
    expect(sheet.pageSetup.printArea).toContain('55');
    expect(data).toEqual(before);
  });

  it('admite el límite de 100 indicadores sin truncarlos ni cambiar los promedios recibidos', async () => {
    const data = await snapshot();
    data.indicadores = Array.from(
      { length: reportLimits.indicadores },
      (_, i) => ({
        ...data.indicadores[0]!,
        id: String(i + 1),
        codigo: `SYN-${i + 1}`,
      }),
    );
    data.items[0]!.notas = Object.fromEntries(
      data.indicadores.map((i) => [i.id, '0.00']),
    );
    const sheet = await reopen(data);
    expect(sheet.getCell(9, 103).text).toContain('SYN-100');
    expect(sheet.getCell(10, 103).value).toBe(0);
    expect(sheet.getCell(9, 104).value).toBe('Promedio exacto');
    expect(sheet.getCell(10, 104).value).toBe(12.495);
    expect(sheet.getCell(9, 110).value).toBe('Estado del resultado');
  });

  it('deja pendientes del resumen como celdas vacías y no añade una segunda fila de datos', async () => {
    const data = await snapshot('RESUMEN_PARTICIPANTES');
    data.anexo.creditos = null;
    data.anexo.horas = null;
    data.anexo.aprobados = null;
    const sheet = await reopen(data);
    for (const ref of ['G11', 'H11', 'L11'])
      expect(effectiveValue(sheet.getCell(ref))).toBeNull();
    for (let column = 1; column <= 12; column++)
      expect(sheet.getCell(12, column).value).toBeNull();
    expect(sheet.getCell('A16').text).toContain('Aprobados pendientes');
    expect(sheet.getCell('A17').text).toContain('datos incompletos');
    expect(sheet.getCell('I11').value).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
  });

  it('conserva cero real de aprobados y créditos como números en la única fila del resumen', async () => {
    const data = await snapshot('RESUMEN_PARTICIPANTES', 'PT');
    data.anexo.creditos = '0.0';
    data.anexo.horas = 0;
    data.anexo.aprobados = 0;
    const sheet = await reopen(data);
    for (const ref of ['G11', 'H11', 'L11'])
      expect(effectiveValue(sheet.getCell(ref))).toBe(0);
    for (let column = 1; column <= 12; column++)
      expect(sheet.getCell(12, column).value).toBeNull();
    expect(sheet.getCell('A16').text).toContain('0 aprobados de 1 intentos');
  });

  it('resume conteos del grupo completo y fechas del periodo sin contar solo la vista de filas', async () => {
    const data = await snapshot('RESUMEN_PARTICIPANTES');
    data.anexo.matriculados = 41;
    data.anexo.aprobados = 27;
    const sheet = await reopen(data);
    expect(sheet.getCell('K11').value).toBe(41);
    expect(sheet.getCell('L11').value).toBe(27);
    for (let column = 1; column <= 12; column++)
      expect(sheet.getCell(12, column).value).toBeNull();
    expect(sheet.getCell('G11').value).toBe(4.5);
    expect(sheet.getCell('H11').value).toBe(80);
    expect(sheet.getCell('A13').text).toContain('No cuenta personas únicas');
    expect(sheet.getCell('A14').text).toContain(
      'fechas corresponden al periodo',
    );
    expect(sheet.getCell('A15').text).toContain(
      'pendientes de configurar y aprobar',
    );
    for (const ref of ['B11', 'E11', 'F11'])
      expect(sheet.getCell(ref).value).toBeNull();
  });

  it('rechaza una huella alterada de la instantánea sin tocar el archivo fuente', async () => {
    const data = await snapshot();
    const original = { ...data.plantilla };
    data.plantilla.sha256 = '0'.repeat(64);
    await expect(service.render(data)).rejects.toThrow(
      'versión de plantilla cambió',
    );
    expect(await service.template('MATRIZ_NOTAS', 'EN')).toEqual(original);
  });

  it('rechaza metadatos de plantilla ajenos aunque la huella coincida', async () => {
    const data = await snapshot();
    const original = { ...data.plantilla };
    const changes: Partial<ReportSnapshot['plantilla']>[] = [
      { id: 'PLANTILLA-AJENA' },
      { version: 2 },
      { tipo: 'RESUMEN_PARTICIPANTES' },
      { idioma: 'PT' },
      { estado: 'APROBADA' as ReportSnapshot['plantilla']['estado'] },
    ];
    for (const change of changes) {
      data.plantilla = { ...original, ...change };
      await expect(service.render(data)).rejects.toThrow(
        'versión de plantilla cambió',
      );
    }
  });

  it('rechaza el reporte sin matrículas', async () => {
    const data = await snapshot();
    data.items = [];
    await expect(service.render(data)).rejects.toThrow(
      'no contiene matrículas',
    );
  });

  it('rechaza más de 5000 matrículas antes de generar un archivo parcial', async () => {
    const data = await snapshot();
    data.items = Array.from({ length: reportLimits.filas + 1 }, (_, i) =>
      student(i + 1),
    );
    await expect(service.render(data)).rejects.toThrow(
      'límite de filas o indicadores',
    );
  });

  it('rechaza más de 100 indicadores antes de truncar columnas', async () => {
    const data = await snapshot();
    data.indicadores = Array.from(
      { length: reportLimits.indicadores + 1 },
      (_, i) => ({ ...data.indicadores[0]!, id: String(i + 1) }),
    );
    await expect(service.render(data)).rejects.toThrow(
      'límite de filas o indicadores',
    );
  });
});
