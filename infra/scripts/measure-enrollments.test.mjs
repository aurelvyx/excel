import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeMeasurements } from "./measure-enrollments.mjs";

const observation = (index, procedimiento = "ACTUAL", seconds = 10) => ({
  caso: `M${String(index).padStart(2, "0")}`,
  procedimiento,
  fecha: "2026-09-30",
  participante: "P01",
  resultado: "COMPLETADA",
  evidencia: "SIMULACION: prueba automatizada",
  tiemposSegundos: {
    busqueda: seconds,
    voucher: seconds,
    grupo: seconds,
    confirmacion: seconds,
  },
  correcciones: 0,
  incidencias: 0,
});
const document = (observaciones) => ({
  version: 1,
  tipoEvidencia: "SIMULACION",
  observaciones,
});

test("plantilla B10 vacía informa pendiente, sin inventar tiempos o comparación", () => {
  const template = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/evidencias/B10/mediciones.plantilla.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const report = analyzeMeasurements(template);
  assert.equal(report.estado, "LINEA_BASE_PENDIENTE");
  assert.equal(report.resumen.ACTUAL.muestra, 0);
  assert.equal(report.resumen.ACTUAL.promedioSegundos, null);
  assert.equal(report.incompletas.length, 10);
  assert.equal(report.comparacion, null);
});
test("menos de diez observaciones no completa la línea base y cero no significa pendiente", () => {
  const report = analyzeMeasurements(document([observation(1, "ACTUAL", 0)]));
  assert.equal(report.estado, "LINEA_BASE_PENDIENTE");
  assert.equal(report.resumen.ACTUAL.promedioSegundos, 0);
  assert.deepEqual(report.incompletas, []);
});
test("diez tareas completadas habilitan línea base sin afirmar un piloto", () => {
  const report = analyzeMeasurements(
    document(Array.from({ length: 10 }, (_, i) => observation(i + 1))),
  );
  assert.equal(report.estado, "PILOTO_PENDIENTE");
  assert.equal(report.resumen.ACTUAL.muestra, 10);
  assert.equal(report.comparacion, null);
});
test("compara diez pares equivalentes, registra fechas, participantes y correcciones", () => {
  const rows = Array.from({ length: 10 }, (_, i) => [
    observation(i + 1),
    observation(i + 1, "SISTEMA", 5),
  ]).flat();
  rows[0].correcciones = 2;
  rows[0].incidencias = 1;
  const report = analyzeMeasurements(document(rows));
  assert.equal(report.estado, "COMPARACION_DISPONIBLE");
  assert.equal(report.tipoEvidencia, "SIMULACION");
  assert.deepEqual(report.comparacion, {
    muestra: 10,
    casos: Array.from(
      { length: 10 },
      (_, i) => `M${String(i + 1).padStart(2, "0")}`,
    ),
    actualSegundos: 40,
    sistemaSegundos: 20,
    diferenciaSegundos: 20,
    reduccionPorcentaje: 50,
  });
  assert.deepEqual(report.resumen.ACTUAL.participantes, ["P01"]);
  assert.deepEqual(report.resumen.ACTUAL.fechas, ["2026-09-30"]);
  assert.equal(report.resumen.ACTUAL.correcciones, 2);
  assert.equal(report.resumen.ACTUAL.incidencias, 1);
});
test("tareas distintas o fallidas no se usan como pares para afirmar una mejora", () => {
  const rows = Array.from({ length: 10 }, (_, i) => [
    observation(i + 1),
    observation(i + 2, "SISTEMA", 1),
  ]).flat();
  rows[1].resultado = "FALLIDA";
  const report = analyzeMeasurements(document(rows));
  assert.equal(report.estado, "PILOTO_PENDIENTE");
  assert.equal(report.paresCompletos, 8);
  assert.equal(report.resumen.SISTEMA.fallidas, 1);
  assert.equal(report.comparacion, null);
});
test("rechaza tiempos inválidos, fechas imposibles, duplicados e identidad personal", () => {
  for (const value of [-1, "10", NaN, Infinity]) {
    const row = observation(1);
    row.tiemposSegundos.voucher = value;
    assert.throws(
      () => analyzeMeasurements(document([row])),
      /tiemposSegundos.voucher/,
    );
  }
  for (const changes of [
    { fecha: "2026-02-30" },
    { participante: "Nombre real" },
    { correcciones: -1 },
    { incidencias: 0.5 },
  ]) {
    assert.throws(
      () => analyzeMeasurements(document([{ ...observation(1), ...changes }])),
      /inválido/,
    );
  }
  assert.throws(
    () => analyzeMeasurements(document([observation(1), observation(1)])),
    /duplicada/,
  );
  assert.throws(
    () =>
      analyzeMeasurements({
        ...document([observation(1)]),
        tipoEvidencia: null,
      }),
    /Indicar tipoEvidencia/,
  );
});
test("baseline cero evita dividir por cero y un sistema más lento muestra reducción negativa", () => {
  for (const [baseline, expected] of [
    [0, null],
    [5, -100],
  ]) {
    const rows = Array.from({ length: 10 }, (_, i) => [
      observation(i + 1, "ACTUAL", baseline),
      observation(i + 1, "SISTEMA", 10),
    ]).flat();
    assert.equal(
      analyzeMeasurements(document(rows)).comparacion.reduccionPorcentaje,
      expected,
    );
  }
});
