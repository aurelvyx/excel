import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const json = (path) =>
  JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const cell = /^[A-Z]{1,3}[1-9]\d{0,6}$/;
const column = /^[A-Z]{1,3}$/;
const columnNumber = (letters) =>
  [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
const validColumn = (value) =>
  typeof value === "string" &&
  column.test(value) &&
  columnNumber(value) <= 16384;
const validCell = (value) =>
  typeof value === "string" &&
  cell.test(value) &&
  validColumn(value.match(/^[A-Z]+/)[0]) &&
  Number(value.match(/\d+$/)[0]) <= 1048576;

/** Registro común de diseños; leer un archivo no aprueba sus reglas ni ejecuta sus macros. */
export function verifyTemplates(registry, maps, readSource) {
  if (
    registry?.version !== 1 ||
    !Array.isArray(registry.plantillas) ||
    maps?.version !== 1 ||
    !maps.familias
  ) {
    throw new Error(
      "Registro y mapas requieren version: 1 y su estructura declarada",
    );
  }
  for (const [name, map] of Object.entries(maps.familias)) {
    const occupied = new Set();
    for (const field of map.campos ?? []) {
      if (
        !validCell(field.celda) ||
        !field.fuente ||
        occupied.has(field.celda)
      ) {
        throw new Error(`Celda inválida, duplicada o sin fuente en ${name}`);
      }
      occupied.add(field.celda);
    }
    for (const table of map.tablas ?? []) {
      if (
        !Number.isSafeInteger(table.primeraFila) ||
        table.primeraFila < 1 ||
        table.primeraFila > 1048576 ||
        (table.ultimaFila !== undefined &&
          (!Number.isSafeInteger(table.ultimaFila) ||
            table.ultimaFila < table.primeraFila ||
            table.ultimaFila > 1048576))
      )
        throw new Error(`Fila inválida en ${name}`);
      const columns = new Set();
      for (const field of table.columnas) {
        if (
          !validColumn(field.columna) ||
          !field.fuente ||
          columns.has(field.columna)
        ) {
          throw new Error(
            `Columna inválida, duplicada o sin fuente en ${name}`,
          );
        }
        columns.add(field.columna);
      }
    }
  }
  const ids = new Set();
  return registry.plantillas.map((template) => {
    if (!template.id || ids.has(template.id))
      throw new Error("Identificador de plantilla inválido o duplicado");
    ids.add(template.id);
    if (
      typeof template.archivo !== "string" ||
      /[\\/:]/.test(template.archivo) ||
      !/^[^.].*\.xls[mx]$/.test(template.archivo) ||
      !/^[a-f0-9]{64}$/.test(template.sha256)
    ) {
      throw new Error(`Archivo o huella inválida: ${template.id}`);
    }
    if (
      !Array.isArray(template.hojas) ||
      new Set(template.hojas).size !== template.hojas.length
    ) {
      throw new Error(`Hojas inválidas: ${template.id}`);
    }
    if (template.macros !== template.archivo.endsWith(".xlsm"))
      throw new Error(`Tipo de archivo incoherente: ${template.id}`);
    for (const variant of Object.values(template.variantes ?? {})) {
      if (
        !template.hojas.includes(variant.hoja) ||
        (variant.familiaMapa && !maps.familias[variant.familiaMapa])
      ) {
        throw new Error(`Hoja o mapa desconocido: ${template.id}`);
      }
    }
    let match = false;
    let source = "DISPONIBLE";
    try {
      match =
        createHash("sha256")
          .update(readSource(template.archivo))
          .digest("hex") === template.sha256;
      if (!match) source = "VERSION_DIFERENTE";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      source = "ARCHIVO_PENDIENTE";
    }
    return {
      id: template.id,
      archivo: template.archivo,
      fuente: source,
      huellaCoincide: match,
      aprobacion: template.aprobacion,
      uso: "REFERENCIA",
      hojas: template.hojas.length,
      variantes: Object.keys(template.variantes ?? {}),
    };
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length > 3)
      throw new Error("Usar pnpm b10:plantillas [carpeta-fuentes]");
    const root = new URL("../../docs/plantillas/", import.meta.url);
    const directory = resolve(process.argv[2] ?? ".tmp/b10");
    const report = verifyTemplates(
      json(new URL("registro.json", root)),
      json(new URL("mapas.json", root)),
      (file) => readFileSync(join(directory, file)),
    );
    console.log(
      JSON.stringify(
        { estado: "MAPEO_PROPUESTO", plantillas: report },
        null,
        2,
      ),
    );
    if (report.some((template) => !template.huellaCoincide))
      process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
