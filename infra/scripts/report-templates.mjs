import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ExcelJS = requireApi('exceljs');
const folder = new URL('../../apps/api/templates/reportes/', import.meta.url);
const registry = JSON.parse(await readFile(new URL('registro.json', folder), 'utf8'));
if (registry.version !== 1 || registry.estado !== 'PROPUESTA' || registry.plantillas.length !== 4)
  throw new Error('Registro de plantillas de demostración inválido');
for (const entry of registry.plantillas) {
  if (!/^[a-z0-9-]+\.xlsx$/.test(entry.archivo)) throw new Error('Archivo de plantilla inválido');
  const bytes = await readFile(new URL(entry.archivo, folder));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`La plantilla ${entry.id} cambió sin revisar su versión`);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(bytes).buffer);
  if (book.worksheets.length !== 1 || book.worksheets[0].name !== entry.hoja || !book.worksheets[0].getCell('A2').text.startsWith('BORRADOR.'))
    throw new Error(`La estructura de ${entry.id} no coincide con el registro`);
  console.log(`${entry.id}: estructura y huella verificadas; aprobación pendiente`);
}
