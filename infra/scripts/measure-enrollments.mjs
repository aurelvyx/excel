import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const stages = ["busqueda", "voucher", "grupo", "confirmacion"];
const procedures = ["ACTUAL", "SISTEMA"];
const evidenceTypes = ["OBSERVACION", "SIMULACION"];
const round = (value) => Number(value.toFixed(2));
const mean = (values) =>
  values.length
    ? round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
const missing = (value) =>
  value === null || value === undefined || value === "";
const dateIsValid = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

/** Analiza observaciones declaradas; nunca usa tiempos de pruebas como línea base. */
export function analyzeMeasurements(document) {
  if (document?.version !== 1 || !Array.isArray(document.observaciones)) {
    throw new Error("Se requiere version: 1 y observaciones como lista");
  }
  if (
    !missing(document.tipoEvidencia) &&
    !evidenceTypes.includes(document.tipoEvidencia)
  ) {
    throw new Error("tipoEvidencia debe ser OBSERVACION o SIMULACION");
  }
  const seen = new Set();
  const complete = [];
  const incomplete = [];
  for (const [index, row] of document.observaciones.entries()) {
    const error = (field) => {
      throw new Error(`Fila ${index + 1}: ${field} inválido`);
    };
    if (!row || !/^M\d{2,}$/.test(row.caso)) error("caso");
    if (!procedures.includes(row.procedimiento)) error("procedimiento");
    const key = `${row.caso}/${row.procedimiento}`;
    if (seen.has(key)) throw new Error(`Observación duplicada: ${key}`);
    seen.add(key);
    const pending = [];
    for (const [field, valid] of [
      ["fecha", dateIsValid],
      [
        "participante",
        (value) => typeof value === "string" && /^P\d{2,}$/.test(value),
      ],
      ["resultado", (value) => ["COMPLETADA", "FALLIDA"].includes(value)],
      [
        "evidencia",
        (value) => typeof value === "string" && value.trim().length > 0,
      ],
      ["correcciones", (value) => Number.isSafeInteger(value) && value >= 0],
      ["incidencias", (value) => Number.isSafeInteger(value) && value >= 0],
    ]) {
      if (missing(row[field])) pending.push(field);
      else if (!valid(row[field])) error(field);
    }
    for (const stage of stages) {
      const value = row.tiemposSegundos?.[stage];
      if (missing(value)) pending.push(`tiemposSegundos.${stage}`);
      else if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      )
        error(`tiemposSegundos.${stage}`);
    }
    if (pending.length)
      incomplete.push({
        caso: row.caso,
        procedimiento: row.procedimiento,
        faltantes: pending,
      });
    else {
      const total = stages.reduce(
        (sum, stage) => sum + row.tiemposSegundos[stage],
        0,
      );
      if (!Number.isFinite(total)) error("tiempo total");
      complete.push({ ...row, total });
    }
  }
  if (complete.length && missing(document.tipoEvidencia)) {
    throw new Error(
      "Indicar tipoEvidencia antes de analizar observaciones completas",
    );
  }
  const completed = complete.filter((row) => row.resultado === "COMPLETADA");
  const summaries = Object.fromEntries(
    procedures.map((procedure) => {
      const rows = completed.filter((row) => row.procedimiento === procedure);
      return [
        procedure,
        {
          muestra: rows.length,
          participantes: [
            ...new Set(rows.map((row) => row.participante)),
          ].sort(),
          fechas: [...new Set(rows.map((row) => row.fecha))].sort(),
          promedioSegundos: mean(rows.map((row) => row.total)),
          promedioPorEtapaSegundos: Object.fromEntries(
            stages.map((stage) => [
              stage,
              mean(rows.map((row) => row.tiemposSegundos[stage])),
            ]),
          ),
          correcciones: rows.reduce((sum, row) => sum + row.correcciones, 0),
          incidencias: rows.reduce((sum, row) => sum + row.incidencias, 0),
          fallidas: complete.filter(
            (row) =>
              row.procedimiento === procedure && row.resultado === "FALLIDA",
          ).length,
        },
      ];
    }),
  );
  const pairs = completed
    .filter((row) => row.procedimiento === "ACTUAL")
    .flatMap((actual) => {
      const system = completed.find(
        (row) => row.caso === actual.caso && row.procedimiento === "SISTEMA",
      );
      return system ? [{ actual, system }] : [];
    });
  // Comparar únicamente tareas equivalentes y al menos diez pares completos.
  const comparison =
    pairs.length >= 10
      ? {
          muestra: pairs.length,
          casos: pairs.map(({ actual }) => actual.caso).sort(),
          actualSegundos: mean(pairs.map(({ actual }) => actual.total)),
          sistemaSegundos: mean(pairs.map(({ system }) => system.total)),
          diferenciaSegundos: mean(
            pairs.map(({ actual, system }) => actual.total - system.total),
          ),
          reduccionPorcentaje: (() => {
            const baseline = pairs.reduce(
              (sum, { actual }) => sum + actual.total,
              0,
            );
            return baseline > 0
              ? round(
                  (100 *
                    pairs.reduce(
                      (sum, { actual, system }) =>
                        sum + actual.total - system.total,
                      0,
                    )) /
                    baseline,
                )
              : null;
          })(),
        }
      : null;
  return {
    tipoEvidencia: document.tipoEvidencia ?? null,
    estado: comparison
      ? "COMPARACION_DISPONIBLE"
      : summaries.ACTUAL.muestra >= 10
        ? "PILOTO_PENDIENTE"
        : "LINEA_BASE_PENDIENTE",
    resumen: summaries,
    paresCompletos: pairs.length,
    comparacion: comparison,
    incompletas: incomplete,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length !== 3)
      throw new Error("Usar pnpm b10:mediciones <archivo.json>");
    const document = JSON.parse(
      readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, ""),
    );
    console.log(JSON.stringify(analyzeMeasurements(document), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
