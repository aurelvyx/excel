import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyTemplates } from "./template-registry.mjs";

const json = (file) =>
  JSON.parse(
    readFileSync(
      new URL(`../../docs/plantillas/${file}`, import.meta.url),
      "utf8",
    ),
  );
const fixture = () => {
  const content = Buffer.from("archivo exclusivamente sintético");
  const registry = json("registro.json");
  registry.plantillas.forEach((template) => {
    template.sha256 = createHash("sha256").update(content).digest("hex");
  });
  return { registry, maps: json("mapas.json"), read: () => content };
};
test("registro reutiliza mapas comunes, distingue ambos idiomas y conserva aprobación pendiente", () => {
  const { registry, maps, read } = fixture();
  const report = verifyTemplates(registry, maps, read);
  assert.equal(report.length, 4);
  assert.ok(
    report.every(
      (template) =>
        template.huellaCoincide &&
        template.aprobacion === null &&
        template.uso === "REFERENCIA",
    ),
  );
  assert.equal(registry.plantillas[0].variantes.matriz.primeraFila, 10);
  assert.equal(registry.plantillas[1].variantes.matriz.primeraFila, 9);
});
test("fuente modificada o ausente no se acepta como la versión registrada", () => {
  const { registry, maps } = fixture();
  assert.ok(
    verifyTemplates(registry, maps, () => Buffer.from("otra versión")).every(
      (t) => t.fuente === "VERSION_DIFERENTE",
    ),
  );
  assert.ok(
    verifyTemplates(registry, maps, () => {
      throw Object.assign(new Error("ausente"), { code: "ENOENT" });
    }).every((t) => t.fuente === "ARCHIVO_PENDIENTE" && !t.huellaCoincide),
  );
});
test("rechaza referencias fuera de la carpeta de fuentes y variantes desconocidas", () => {
  for (const file of [
    "../privado.xlsx",
    "..\\privado.xlsx",
    "C:/privado.xlsx",
  ]) {
    const { registry, maps, read } = fixture();
    registry.plantillas[0].archivo = file;
    assert.throws(
      () => verifyTemplates(registry, maps, read),
      /Archivo o huella inválida/,
    );
  }
  const { registry, maps, read } = fixture();
  registry.plantillas[2].variantes.ficha.familiaMapa = "DESCONOCIDO";
  assert.throws(
    () => verifyTemplates(registry, maps, read),
    /Hoja o mapa desconocido/,
  );
});
test("rechaza celdas y columnas repetidas antes de reutilizar un mapeo", () => {
  for (const cell of ["XFE1", "XFD1048577", "A0"]) {
    const { registry, maps, read } = fixture();
    maps.familias.FICHA_MATRICULA.campos[0].celda = cell;
    assert.throws(
      () => verifyTemplates(registry, maps, read),
      /Celda inválida/,
    );
  }
  const { registry, maps, read } = fixture();
  maps.familias.FICHA_MATRICULA.campos.push(
    maps.familias.FICHA_MATRICULA.campos[0],
  );
  assert.throws(
    () => verifyTemplates(registry, maps, read),
    /Celda inválida, duplicada/,
  );
  const fresh = fixture();
  fresh.maps.familias.FICHA_MATRICULA.tablas[0].columnas.push(
    fresh.maps.familias.FICHA_MATRICULA.tablas[0].columnas[0],
  );
  assert.throws(
    () => verifyTemplates(fresh.registry, fresh.maps, fresh.read),
    /Columna inválida, duplicada/,
  );
});
