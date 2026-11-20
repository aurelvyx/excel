import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ExcelJS = requireApi('exceljs');
const folder = new URL('../../apps/api/templates/reportes/', import.meta.url);
const registry = JSON.parse(await readFile(new URL('registro.json', folder), 'utf8'));
if (registry.version !== 1 || registry.estado !== 'PROPUESTA' || registry.plantillas.length !== 6)
  throw new Error('Registro de plantillas de demostración inválido');

async function readTemplate(entry) {
  if (!/^[a-z0-9-]+\.xlsx$/.test(entry.archivo))
    throw new Error('Archivo de plantilla inválido');
  const bytes = await readFile(new URL(entry.archivo, folder));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error(`La plantilla ${entry.id} cambió sin revisar su versión`);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(bytes).buffer);
  const sheet = book.worksheets[0];
  if (book.worksheets.length !== 1 || sheet.name !== entry.hoja || sheet.state !== 'visible')
    throw new Error(`La estructura de ${entry.id} no coincide con el registro`);
  return { book, sheet };
}

for (const entry of registry.plantillas) {
  const { book, sheet } = await readTemplate(entry);
  if (entry.tipo === 'ACTA_DEMOSTRACION') {
    if (
      !entry.archivo.endsWith('-limpia.xlsx') ||
      sheet.getCell('G1').text !== 'ACTA DE EVALUACIÓN' ||
      sheet.getCell('A14').text !== 'N°' ||
      sheet.getCell('C17').value !== null ||
      sheet.getCell('B59').value !== null ||
      sheet.getImages().length !== 2 ||
      book.model.media.length !== 2 ||
      book.definedNames.model.length
    )
      throw new Error(`La plantilla limpia de ${entry.id} no coincide con su estructura registrada`);
  } else if (!sheet.getCell('A2').text.startsWith('BORRADOR.')) {
    throw new Error(`La estructura de ${entry.id} no coincide con el registro`);
  }
  console.log(`${entry.id}: estructura y huella verificadas; aprobación pendiente`);
}
