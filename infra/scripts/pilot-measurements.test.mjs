import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzePilot } from "./pilot-measurements.mjs";

const template = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../docs/evidencias/B20/mediciones.plantilla.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const simulation = () => {
  const document = template();
  document.tipoEvidencia = "SIMULACION";
  document.contexto = {
    entorno: "DEMO local sintético",
    versionSistema: "revision-sintetica",
    condiciones: "SIMULACION: condiciones equivalentes",
    evidencia: "E-CONTEXTO-SINTETICO",
  };
  for (const row of document.matriculas.observaciones) {
    Object.assign(row, {
      fecha: "2026-10-17",
      participante: "P01",
      resultado: "COMPLETADA",
      evidencia: `SIMULACION ${row.caso}/${row.procedimiento}`,
      correcciones: 0,
      incidencias: 0,
    });
    const seconds = row.procedimiento === "ACTUAL" ? 10 : 5;
    row.tiemposSegundos = {
      busqueda: seconds,
      voucher: seconds,
      grupo: seconds,
      confirmacion: seconds,
    };
  }
  for (const row of document.actividades) {
    Object.assign(row, {
      fecha: "2026-10-17",
      participante: row.actividad === "XLSX" ? "P03" : "P02",
      resultado: "COMPLETADA",
      obtenido: "SIMULACION: coincide con el resultado esperado",
      evidencia: `SIMULACION ${row.caso}/${row.procedimiento}`,
      segundos: row.procedimiento === "ACTUAL" ? 100 : 50,
      correcciones: 0,
      erroresAntesDelCierre: 0,
      incidencias: 0,
    });
  }
  return document;
};
const issue = (row, changes = {}) => ({
  codigo: "I01",
  caso: row.caso,
  procedimiento: row.procedimiento,
  fecha: "2026-10-17",
  participante: row.participante,
  impacto: "ALTA",
  descripcion: "SIMULACION: captura no completada",
  estado: "ABIERTA",
  evidencia: "E-INCIDENCIA-SINTETICA",
  resolucion: null,
  ...changes,
});

test("instrumento B20 vacío conserva diez pares previstos, tiempos pendientes y ninguna aceptación", () => {
  const report = analyzePilot(template());
  assert.equal(report.estado, "INSTRUMENTO_PENDIENTE");
  assert.equal(report.matriculas.incompletas.length, 20);
  assert.equal(report.matriculas.paresCompletos, 0);
  assert.equal(report.incompletas.length, 12);
  assert.equal(report.actividades.ASISTENCIA.comparacionDescriptiva, null);
  assert.equal(
    report.actividades.NOTAS.procedimientos.SISTEMA.promedioSegundos,
    null,
  );
  assert.equal(report.control.correcciones, null);
  assert.equal(report.control.erroresAntesDelCierre, null);
  assert.equal(report.control.incidencias, null);
  assert.equal(report.matriculas.resumen.ACTUAL.correcciones, null);
  assert.equal(report.matriculas.resumen.SISTEMA.incidencias, null);
  assert.deepEqual(report.rolesConTareasSistemaCompletadas, []);
  assert.equal(report.aceptacionInstitucional, "PENDIENTE_REVISION_DEL_CENTRO");
});

test("compara diez pares y actividades EN/PT sin convertir una simulación en piloto observado", () => {
  const report = analyzePilot(simulation());
  assert.equal(report.estado, "SIMULACION_REGISTRADA");
  assert.equal(report.tipoEvidencia, "SIMULACION");
  assert.equal(report.matriculas.comparacion.muestra, 10);
  assert.equal(report.matriculas.comparacion.reduccionPorcentaje, 50);
  assert.equal(report.actividades.ASISTENCIA.comparacionDescriptiva.muestra, 2);
  assert.equal(
    report.actividades.ASISTENCIA.comparacionDescriptiva.diferenciaSegundos,
    50,
  );
  assert.equal(report.actividades.XLSX.porIdioma.PT.muestra, 1);
  assert.deepEqual(report.rolesConTareasSistemaCompletadas, [
    "COORDINADOR",
    "DOCENTE",
    "SECRETARIA",
  ]);
  assert.deepEqual(report.pendientes, []);
  assert.equal(report.aceptacionInstitucional, "PENDIENTE_REVISION_DEL_CENTRO");
});

test("observaciones declaradas conservan su etiqueta y necesitan revisión institucional", () => {
  const document = simulation();
  document.tipoEvidencia = "OBSERVACION";
  const report = analyzePilot(document);
  assert.equal(report.estado, "OBSERVACIONES_REGISTRADAS");
  assert.equal(report.matriculas.tipoEvidencia, "OBSERVACION");
  assert.equal(report.aceptacionInstitucional, "PENDIENTE_REVISION_DEL_CENTRO");
});

test("faltantes y menos de diez pares impiden declarar las mediciones completas", () => {
  const document = simulation();
  document.matriculas.observaciones.pop();
  document.actividades.find(
    (row) =>
      row.actividad === "XLSX" &&
      row.idioma === "PT" &&
      row.procedimiento === "SISTEMA",
  ).obtenido = null;
  const report = analyzePilot(document);
  assert.equal(report.estado, "SIMULACION_PARCIAL");
  assert.equal(report.matriculas.comparacion, null);
  assert.equal(report.matriculas.paresCompletos, 9);
  assert.equal(report.actividades.XLSX.porIdioma.PT, null);
  assert.ok(report.pendientes.includes("matriculas.diezParesCompletos"));
  assert.ok(report.pendientes.includes("actividades.XLSX.PT.parCompleto"));
  assert.deepEqual(report.incompletas[0].faltantes, ["obtenido"]);
});

test("los fallos conservan errores, correcciones e incidencias y no mejoran los promedios", () => {
  const document = simulation();
  const row = document.actividades.find(
    (entry) => entry.actividad === "NOTAS" && entry.procedimiento === "SISTEMA",
  );
  Object.assign(row, {
    resultado: "FALLIDA",
    segundos: 1,
    correcciones: 3,
    erroresAntesDelCierre: 2,
    incidencias: 1,
  });
  document.incidencias.push(issue(row));
  const report = analyzePilot(document);
  assert.equal(
    report.actividades.NOTAS.procedimientos.SISTEMA.promedioSegundos,
    50,
  );
  assert.equal(report.actividades.NOTAS.procedimientos.SISTEMA.fallidas, 1);
  assert.equal(report.actividades.NOTAS.comparacionDescriptiva.muestra, 1);
  assert.equal(report.control.correcciones, 3);
  assert.equal(report.control.erroresAntesDelCierre, 2);
  assert.equal(report.control.incidencias, 1);
  assert.equal(report.control.incidenciasAbiertas, 1);
  assert.ok(report.pendientes.includes("incidencias.sinResolver"));
  assert.ok(
    report.pendientes.includes("observaciones.fallidasRequierenRevision"),
  );
});

test("conserva correcciones e incidencias de matrículas fallidas excluidas de comparación B10", () => {
  const document = simulation();
  const row = document.matriculas.observaciones[0];
  Object.assign(row, { resultado: "FALLIDA", correcciones: 2, incidencias: 1 });
  document.incidencias.push(issue(row));
  const report = analyzePilot(document);
  assert.equal(report.matriculas.paresCompletos, 9);
  assert.equal(report.control.correcciones, 2);
  assert.equal(report.control.incidencias, 1);
});

test("conserva conteos de tareas y matrículas fallidas con tiempos incompletos y explicita totales parciales", () => {
  const document = simulation();
  const task = document.actividades[1];
  Object.assign(task, {
    resultado: "FALLIDA",
    segundos: null,
    correcciones: 3,
    erroresAntesDelCierre: 2,
    incidencias: 1,
  });
  const enrollment = document.matriculas.observaciones[1];
  Object.assign(enrollment, {
    resultado: "FALLIDA",
    correcciones: 4,
    incidencias: 1,
  });
  enrollment.tiemposSegundos.voucher = null;
  document.incidencias.push(issue(task), issue(enrollment, { codigo: "I02" }));
  document.actividades[3].correcciones = null;
  const report = analyzePilot(document);
  assert.equal(report.control.correcciones, 7);
  assert.equal(report.control.erroresAntesDelCierre, 2);
  assert.equal(report.control.incidencias, 2);
  assert.equal(report.control.parcial, true);
  assert.equal(report.control.conteosPendientes.correcciones, 1);
  assert.equal(
    report.actividades.ASISTENCIA.procedimientos.SISTEMA.correcciones,
    3,
  );
  assert.equal(
    report.actividades.ASISTENCIA.procedimientos.SISTEMA.erroresAntesDelCierre,
    2,
  );
  assert.equal(
    report.actividades.ASISTENCIA.procedimientos.SISTEMA.fallidas,
    1,
  );
  assert.equal(
    report.actividades.ASISTENCIA.procedimientos.SISTEMA
      .observacionesIncompletas,
    1,
  );
  assert.equal(
    report.actividades.ASISTENCIA.procedimientos.SISTEMA.promedioSegundos,
    50,
  );
  assert.equal(
    report.matriculas.controlPorProcedimiento.SISTEMA.correcciones,
    4,
  );
  assert.equal(report.matriculas.controlPorProcedimiento.SISTEMA.fallidas, 1);
  assert.equal(
    report.matriculas.controlPorProcedimiento.SISTEMA.observacionesIncompletas,
    1,
  );
  assert.equal(report.matriculas.paresCompletos, 9);
  assert.ok(
    report.pendientes.includes("observaciones.fallidasRequierenRevision"),
  );
});

test("rechaza pares con distinto idioma, grupo, actividad o resultado esperado", () => {
  for (const changes of [
    { idioma: "PT" },
    { contexto: "G-OTRO" },
    { actividad: "NOTAS" },
    { esperado: "Otra tarea" },
  ]) {
    const document = simulation();
    Object.assign(document.actividades[1], changes);
    assert.throws(() => analyzePilot(document), /no coincide/);
  }
});

test("rechaza duplicados, rol ajeno y campos personales imprevistos", () => {
  let document = simulation();
  document.actividades.push({ ...document.actividades[0] });
  assert.throws(() => analyzePilot(document), /duplicada/);
  document = simulation();
  document.participantes.push({ ...document.participantes[0] });
  assert.throws(() => analyzePilot(document), /duplicado/);
  for (const participant of ["P99", "Nombre real", "P01"]) {
    document = simulation();
    document.actividades[0].participante = participant;
    assert.throws(() => analyzePilot(document), /participante/);
  }
  document = simulation();
  document.participantes[0].nombre = "No se admiten nombres";
  assert.throws(() => analyzePilot(document), /campos no permitidos/);
  document = simulation();
  document.matriculas.observaciones[0].dni = "No se admite identidad personal";
  assert.throws(() => analyzePilot(document), /campos no permitidos/);
  document = simulation();
  document.matriculas.observaciones[0].tiemposSegundos.nombre =
    "No se admite identidad personal";
  assert.throws(() => analyzePilot(document), /campos no permitidos/);
});

test("rechaza tiempos, fechas y conteos inválidos y exige el tipo de evidencia", () => {
  for (const changes of [
    { segundos: -1 },
    { segundos: "1" },
    { segundos: Infinity },
    { segundos: NaN },
    { fecha: "2026-02-30" },
    { correcciones: 0.5 },
    { erroresAntesDelCierre: -1 },
    { incidencias: -1 },
  ]) {
    const document = simulation();
    Object.assign(document.actividades[0], changes);
    assert.throws(() => analyzePilot(document), /inválido/);
  }
  const document = simulation();
  document.tipoEvidencia = null;
  assert.throws(() => analyzePilot(document), /Indicar tipoEvidencia/);
});

test("bitácora exige correspondencia, conteo y resolución verificable, sin borrar incidencias", () => {
  const document = simulation();
  const row = document.actividades[0];
  row.incidencias = 1;
  assert.throws(() => analyzePilot(document), /conteo de incidencias/);
  document.incidencias.push(issue(row));
  assert.equal(analyzePilot(document).control.incidenciasAbiertas, 1);
  document.incidencias[0].estado = "RESUELTA";
  assert.throws(() => analyzePilot(document), /resolución obligatoria/);
  document.incidencias[0].resolucion =
    "SIMULACION: corregido y verificado E-REPRUEBA";
  const report = analyzePilot(document);
  assert.equal(report.control.incidencias, 1);
  assert.equal(report.control.incidenciasAbiertas, 0);
  assert.equal(report.estado, "SIMULACION_REGISTRADA");
  document.incidencias[0].caso = "NO-EXISTE";
  assert.throws(() => analyzePilot(document), /observación no encontrada/);
});

test("cero es observado; no divide por cero y conserva una reducción negativa", () => {
  const document = simulation();
  for (const row of document.actividades)
    row.segundos = row.procedimiento === "ACTUAL" ? 0 : 50;
  let report = analyzePilot(document);
  assert.equal(
    report.actividades.XLSX.comparacionDescriptiva.actualSegundos,
    0,
  );
  assert.equal(
    report.actividades.XLSX.comparacionDescriptiva.reduccionPorcentaje,
    null,
  );
  for (const row of document.actividades)
    row.segundos = row.procedimiento === "ACTUAL" ? 25 : 50;
  report = analyzePilot(document);
  assert.equal(
    report.actividades.XLSX.comparacionDescriptiva.reduccionPorcentaje,
    -100,
  );
});
