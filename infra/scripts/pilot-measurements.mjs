import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  analyzeMeasurements,
  compareMeasurementPairs,
  dateIsValid,
} from "./measure-enrollments.mjs";

const activities = ["ASISTENCIA", "NOTAS", "XLSX"];
const roles = ["SECRETARIA", "DOCENTE", "COORDINADOR"];
const procedures = ["ACTUAL", "SISTEMA"];
const evidenceTypes = ["OBSERVACION", "SIMULACION"];
const activityRole = {
  ASISTENCIA: "DOCENTE",
  NOTAS: "DOCENTE",
  XLSX: "COORDINADOR",
};
const missing = (value) =>
  value === null || value === undefined || value === "";
const text = (value) => typeof value === "string" && value.trim().length > 0;
const code = (value) =>
  typeof value === "string" && /^[A-Z][A-Z0-9-]{1,39}$/.test(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const mean = (values) =>
  values.length
    ? Number(
        (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
          2,
        ),
      )
    : null;
function countSummary(rows, fields) {
  const values = {};
  const remaining = {};
  for (const field of fields) {
    const declared = rows.filter((row) => !missing(row[field]));
    const total = declared.reduce((sum, row) => sum + row[field], 0);
    if (!Number.isSafeInteger(total))
      throw new Error(`Total ${field} fuera de precisión segura`);
    values[field] = declared.length ? total : null;
    remaining[field] = rows.length - declared.length;
  }
  return { ...values, conteosPendientes: remaining };
}

function checkFields(value, allowed, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} debe ser un objeto`);
  }
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length)
    throw new Error(`${name}: campos no permitidos: ${extra.join(", ")}`);
}

function participantRole(participant, expected, participants, label) {
  if (missing(participant)) return;
  if (!participants.has(participant))
    throw new Error(`${label}: participante no declarado`);
  if (participants.get(participant) !== expected) {
    throw new Error(`${label}: se requiere participante ${expected}`);
  }
}

/** Resume evidencia declarada. No ejecuta un piloto ni certifica su autenticidad. */
export function analyzePilot(document) {
  checkFields(
    document,
    [
      "version",
      "tipoEvidencia",
      "contexto",
      "participantes",
      "matriculas",
      "actividades",
      "incidencias",
    ],
    "Documento B20",
  );
  if (document.version !== 1) throw new Error("Se requiere version: 1");
  if (
    !missing(document.tipoEvidencia) &&
    !evidenceTypes.includes(document.tipoEvidencia)
  ) {
    throw new Error("tipoEvidencia debe ser OBSERVACION o SIMULACION");
  }
  for (const field of ["participantes", "actividades", "incidencias"]) {
    if (!Array.isArray(document[field]))
      throw new Error(`${field} debe ser una lista`);
  }
  const pending = [];
  checkFields(
    document.contexto,
    ["entorno", "versionSistema", "condiciones", "evidencia"],
    "contexto",
  );
  for (const field of [
    "entorno",
    "versionSistema",
    "condiciones",
    "evidencia",
  ]) {
    if (missing(document.contexto[field])) pending.push(`contexto.${field}`);
    else if (!text(document.contexto[field]))
      throw new Error(`contexto.${field} inválido`);
  }
  const participants = new Map();
  for (const participant of document.participantes) {
    checkFields(participant, ["codigo", "rol"], "Participante");
    if (
      !/^P\d{2,}$/.test(participant.codigo) ||
      !roles.includes(participant.rol)
    ) {
      throw new Error(
        "Participante inválido: usar código P01 y rol del piloto",
      );
    }
    if (participants.has(participant.codigo))
      throw new Error(`Participante duplicado: ${participant.codigo}`);
    participants.set(participant.codigo, participant.rol);
  }
  checkFields(document.matriculas, ["version", "observaciones"], "matriculas");
  const enrollments = analyzeMeasurements({
    ...document.matriculas,
    tipoEvidencia: document.tipoEvidencia,
  });
  for (const row of document.matriculas.observaciones) {
    checkFields(
      row,
      [
        "caso",
        "procedimiento",
        "fecha",
        "participante",
        "resultado",
        "evidencia",
        "tiemposSegundos",
        "correcciones",
        "incidencias",
      ],
      `Matrícula ${row.caso}`,
    );
    if (!missing(row.tiemposSegundos))
      checkFields(
        row.tiemposSegundos,
        ["busqueda", "voucher", "grupo", "confirmacion"],
        `Matrícula ${row.caso}: tiemposSegundos`,
      );
    participantRole(
      row.participante,
      "SECRETARIA",
      participants,
      `Matrícula ${row.caso}`,
    );
  }
  if (!enrollments.comparacion) pending.push("matriculas.diezParesCompletos");
  const seen = new Map();
  const complete = [];
  const incomplete = [];
  for (const [index, row] of document.actividades.entries()) {
    const label = `Actividad ${index + 1}`;
    checkFields(
      row,
      [
        "caso",
        "actividad",
        "procedimiento",
        "idioma",
        "contexto",
        "fecha",
        "participante",
        "resultado",
        "esperado",
        "obtenido",
        "evidencia",
        "segundos",
        "correcciones",
        "erroresAntesDelCierre",
        "incidencias",
      ],
      label,
    );
    if (!code(row.caso) || /^M\d+$/.test(row.caso))
      throw new Error(`${label}: caso inválido o reservado para matrícula`);
    if (
      !activities.includes(row.actividad) ||
      !procedures.includes(row.procedimiento)
    )
      throw new Error(`${label}: actividad o procedimiento inválido`);
    if (!["EN", "PT"].includes(row.idioma) || !code(row.contexto))
      throw new Error(`${label}: idioma o contexto inválido`);
    const key = `${row.caso}/${row.procedimiento}`;
    if (seen.has(key)) throw new Error(`Actividad duplicada: ${key}`);
    const other = seen.get(
      `${row.caso}/${row.procedimiento === "ACTUAL" ? "SISTEMA" : "ACTUAL"}`,
    );
    for (const field of ["actividad", "idioma", "contexto", "esperado"]) {
      if (other && row[field] !== other[field])
        throw new Error(`${label}: ${field} no coincide en el par ${row.caso}`);
    }
    seen.set(key, row);
    participantRole(
      row.participante,
      activityRole[row.actividad],
      participants,
      label,
    );
    const fields = [
      ["fecha", dateIsValid],
      ["participante", (value) => /^P\d{2,}$/.test(value)],
      ["resultado", (value) => ["COMPLETADA", "FALLIDA"].includes(value)],
      ["esperado", text],
      ["obtenido", text],
      ["evidencia", text],
      [
        "segundos",
        (value) =>
          typeof value === "number" && Number.isFinite(value) && value >= 0,
      ],
      ["correcciones", count],
      ["erroresAntesDelCierre", count],
      ["incidencias", count],
    ];
    const absent = [];
    for (const [field, valid] of fields) {
      if (missing(row[field])) absent.push(field);
      else if (!valid(row[field]))
        throw new Error(`${label}: ${field} inválido`);
    }
    if (absent.length)
      incomplete.push({
        caso: row.caso,
        procedimiento: row.procedimiento,
        faltantes: absent,
      });
    else complete.push({ ...row, total: row.segundos });
  }
  const enrollmentIncomplete = new Set(
    enrollments.incompletas.map((row) => `${row.caso}/${row.procedimiento}`),
  );
  const completeEnrollments = document.matriculas.observaciones.filter(
    (row) => !enrollmentIncomplete.has(`${row.caso}/${row.procedimiento}`),
  );
  if (
    (complete.length || completeEnrollments.length) &&
    missing(document.tipoEvidencia)
  ) {
    throw new Error(
      "Indicar tipoEvidencia antes de analizar observaciones completas",
    );
  }
  const allRows = [
    ...document.matriculas.observaciones,
    ...document.actividades,
  ];
  const issues = validateIssues(document.incidencias, allRows, participants);
  const summaries = Object.fromEntries(
    activities.map((activity) => {
      const declaredRows = document.actividades.filter(
        (row) => row.actividad === activity,
      );
      const rows = complete.filter((row) => row.actividad === activity);
      const completed = rows.filter((row) => row.resultado === "COMPLETADA");
      const pairs = completed
        .filter((row) => row.procedimiento === "ACTUAL")
        .flatMap((actual) => {
          const system = completed.find(
            (row) =>
              row.caso === actual.caso && row.procedimiento === "SISTEMA",
          );
          return system ? [{ actual, system }] : [];
        });
      for (const language of ["EN", "PT"]) {
        if (!pairs.some(({ actual }) => actual.idioma === language))
          pending.push(`actividades.${activity}.${language}.parCompleto`);
      }
      return [
        activity,
        {
          procedimientos: Object.fromEntries(
            procedures.map((procedure) => {
              const observed = rows.filter(
                (row) => row.procedimiento === procedure,
              );
              const declared = declaredRows.filter(
                (row) => row.procedimiento === procedure,
              );
              const succeeded = observed.filter(
                (row) => row.resultado === "COMPLETADA",
              );
              return [
                procedure,
                {
                  participantes: [
                    ...new Set(
                      declared
                        .map((row) => row.participante)
                        .filter((value) => !missing(value)),
                    ),
                  ].sort(),
                  fechas: [
                    ...new Set(
                      declared
                        .map((row) => row.fecha)
                        .filter((value) => !missing(value)),
                    ),
                  ].sort(),
                  completadas: succeeded.length,
                  fallidas: declared.filter(
                    (row) => row.resultado === "FALLIDA",
                  ).length,
                  observacionesIncompletas: declared.length - observed.length,
                  promedioSegundos: mean(succeeded.map((row) => row.segundos)),
                  ...countSummary(declared, [
                    "correcciones",
                    "erroresAntesDelCierre",
                    "incidencias",
                  ]),
                },
              ];
            }),
          ),
          comparacionDescriptiva: compareMeasurementPairs(pairs, 1),
          porIdioma: Object.fromEntries(
            ["EN", "PT"].map((language) => [
              language,
              compareMeasurementPairs(
                pairs.filter(({ actual }) => actual.idioma === language),
                1,
              ),
            ]),
          ),
        },
      ];
    }),
  );
  const completedSystemRows = [...completeEnrollments, ...complete].filter(
    (row) => row.procedimiento === "SISTEMA" && row.resultado === "COMPLETADA",
  );
  const observedRoles = [
    ...new Set(
      completedSystemRows.map((row) => participants.get(row.participante)),
    ),
  ].sort();
  for (const role of roles)
    if (!observedRoles.includes(role)) pending.push(`participacion.${role}`);
  if (incomplete.length) pending.push("actividades.observacionesIncompletas");
  if (enrollments.incompletas.length)
    pending.push("matriculas.observacionesIncompletas");
  if (issues.some((issue) => issue.estado !== "RESUELTA"))
    pending.push("incidencias.sinResolver");
  if (allRows.some((row) => row.resultado === "FALLIDA"))
    pending.push("observaciones.fallidasRequierenRevision");
  if (missing(document.tipoEvidencia)) pending.push("tipoEvidencia");
  const generalCounts = countSummary(allRows, ["correcciones", "incidencias"]);
  const errorCounts = countSummary(document.actividades, [
    "erroresAntesDelCierre",
  ]);
  const enrollmentControls = Object.fromEntries(
    procedures.map((procedure) => {
      const rows = document.matriculas.observaciones.filter(
        (row) => row.procedimiento === procedure,
      );
      return [
        procedure,
        {
          ...countSummary(rows, ["correcciones", "incidencias"]),
          observacionesIncompletas: rows.filter((row) =>
            enrollmentIncomplete.has(`${row.caso}/${procedure}`),
          ).length,
          fallidas: rows.filter((row) => row.resultado === "FALLIDA").length,
        },
      ];
    }),
  );
  return {
    tipoEvidencia: document.tipoEvidencia ?? null,
    estado: missing(document.tipoEvidencia)
      ? "INSTRUMENTO_PENDIENTE"
      : document.tipoEvidencia === "SIMULACION"
        ? pending.length
          ? "SIMULACION_PARCIAL"
          : "SIMULACION_REGISTRADA"
        : pending.length
          ? "OBSERVACIONES_PARCIALES"
          : "OBSERVACIONES_REGISTRADAS",
    aceptacionInstitucional: "PENDIENTE_REVISION_DEL_CENTRO",
    rolesConTareasSistemaCompletadas: observedRoles,
    matriculas: {
      ...enrollments,
      resumen: Object.fromEntries(
        procedures.map((procedure) => [
          procedure,
          {
            ...enrollments.resumen[procedure],
            ...enrollmentControls[procedure],
          },
        ]),
      ),
      controlPorProcedimiento: enrollmentControls,
    },
    actividades: summaries,
    control: {
      ...generalCounts,
      erroresAntesDelCierre: errorCounts.erroresAntesDelCierre,
      conteosPendientes: {
        ...generalCounts.conteosPendientes,
        ...errorCounts.conteosPendientes,
      },
      parcial: incomplete.length > 0 || enrollments.incompletas.length > 0,
      incidenciasAbiertas:
        allRows.some((row) => !missing(row.incidencias)) || issues.length
          ? issues.filter((issue) => issue.estado !== "RESUELTA").length
          : null,
    },
    incidencias: issues.map(
      ({ codigo, caso, procedimiento, impacto, estado }) => ({
        codigo,
        caso,
        procedimiento,
        impacto,
        estado,
      }),
    ),
    incompletas: incomplete,
    pendientes: pending,
    advertencias: [
      "Resumen de datos declarados: no certifica autenticidad, equivalencia ni aceptación institucional.",
      "Los promedios excluyen tareas fallidas o incompletas; sus conteos declarados se conservan y se explicitan los pendientes.",
      "Las comparaciones de asistencia, notas y XLSX son descriptivas; revisar su tamaño de muestra.",
      "Las duraciones de pruebas automáticas no son tiempos observados del personal.",
    ],
  };
}

function validateIssues(issues, rows, participants) {
  const seen = new Set();
  for (const [index, issue] of issues.entries()) {
    const label = `Incidencia ${index + 1}`;
    checkFields(
      issue,
      [
        "codigo",
        "caso",
        "procedimiento",
        "fecha",
        "participante",
        "impacto",
        "descripcion",
        "estado",
        "evidencia",
        "resolucion",
      ],
      label,
    );
    if (!/^I\d{2,}$/.test(issue.codigo) || seen.has(issue.codigo))
      throw new Error(`${label}: código inválido o duplicado`);
    seen.add(issue.codigo);
    const row = rows.find(
      (entry) =>
        entry.caso === issue.caso &&
        entry.procedimiento === issue.procedimiento,
    );
    if (!row) throw new Error(`${label}: observación no encontrada`);
    if (!dateIsValid(issue.fecha) || !participants.has(issue.participante))
      throw new Error(`${label}: fecha o participante inválido`);
    if (
      !["CRITICA", "ALTA", "MEDIA", "BAJA"].includes(issue.impacto) ||
      !["ABIERTA", "EN_CURSO", "RESUELTA"].includes(issue.estado)
    )
      throw new Error(`${label}: impacto o estado inválido`);
    if (!text(issue.descripcion) || !text(issue.evidencia))
      throw new Error(`${label}: descripción y evidencia obligatorias`);
    if (issue.estado === "RESUELTA" && !text(issue.resolucion))
      throw new Error(`${label}: resolución obligatoria`);
    if (!missing(issue.resolucion) && !text(issue.resolucion))
      throw new Error(`${label}: resolución inválida`);
  }
  for (const row of rows) {
    const linked = issues.filter(
      (issue) =>
        issue.caso === row.caso && issue.procedimiento === row.procedimiento,
    ).length;
    if (
      (!missing(row.incidencias) && row.incidencias !== linked) ||
      (missing(row.incidencias) && linked)
    ) {
      throw new Error(
        `${row.caso}/${row.procedimiento}: conteo de incidencias no coincide con la bitácora`,
      );
    }
  }
  return issues;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length !== 3)
      throw new Error("Usar pnpm b20:mediciones <archivo.json>");
    const document = JSON.parse(
      readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, ""),
    );
    console.log(JSON.stringify(analyzePilot(document), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
