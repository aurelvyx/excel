import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { buildActPreview } from './report-act-preview.js';

describe('Proyección web del acta XLSX', () => {
  it.each(['en', 'pt'])(
    'reproduce las celdas combinadas, estilos y logos del acta limpia %s',
    async (language) => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(
        fileURLToPath(
          new URL(
            `../../../templates/reportes/acta-ugel-${language}-v1-limpia.xlsx`,
            import.meta.url,
          ),
        ),
      );
      const sheet = workbook.worksheets[0];
      sheet.getCell('A17').value = 21;
      sheet.getCell('J17').value = 0;
      sheet.getCell('J17').numFmt = '0.00########';
      sheet.getCell('R17').value = 12.495;
      sheet.getCell('R17').numFmt = '0.00########';
      sheet.getCell('T53').value = new Date('2026-11-20T00:00:00Z');
      sheet.getCell('T53').numFmt = 'dd/mm/yyyy';

      const preview = buildActPreview(workbook, sheet, 1);
      const cell = (row: number, column: number) =>
        preview.rows
          .find(({ index }) => index === row)
          ?.cells.find((item) => item.column === column);

      expect(preview.headerRows).toBe(16);
      expect(preview.columnWidths).toHaveLength(29);
      expect(preview.columnWidths[9]).toBe(language === 'en' ? 84 : 117);
      expect(cell(4, 1)).toMatchObject({
        rowSpan: 2,
        colSpan: 3,
        text: 'GEREDU',
        style: { backgroundColor: '#d9d9d9', borderTop: '2px solid #000000' },
      });
      expect(cell(4, 10)).toMatchObject({
        rowSpan: 5,
        style: { rotate: true },
      });
      expect(cell(5, 1)).toBeUndefined();
      expect(cell(14, 3)).toMatchObject({ rowSpan: 3, colSpan: 7 });
      expect(cell(17, 1)?.text).toBe('21');
      expect(cell(17, 10)?.text).toBe('0.00');
      expect(cell(17, 18)?.text).toBe('12.495');
      expect(cell(17, 19)?.text).toBe('');
      expect(preview.rows[17]?.index).toBe(52);
      expect(cell(53, 20)?.text).toBe('20/11/2026');
      expect(preview.images).toHaveLength(2);
      expect(preview.images[0]).toMatchObject({
        src: expect.stringMatching(/^data:image\/png;base64,/),
        x: expect.closeTo(20, 0),
      });
      expect(preview.images[1]!.x).toBeGreaterThan(1000);
      expect(
        preview.images.every(({ width, height }) => width > 0 && height > 0),
      ).toBe(true);
    },
  );
});
