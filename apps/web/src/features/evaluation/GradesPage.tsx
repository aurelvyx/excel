import { Fragment, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Search,
  X,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Clock,
  SlidersHorizontal,
  FileSpreadsheet,
  Filter,
} from "lucide-react";
import { ApiError, api, errorText } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { useAuth } from "../auth/session";
import { academicTime } from "../attendance/model";
import { GradeHistoryDialog } from "./GradeHistoryDialog";
import {
  captureGradeError,
  displayedGrade,
  gradeCaptureValue,
} from "./grade-capture";
import type {
  Grade,
  GradeRow,
  GradesPageData,
  SavedGrades,
} from "./grades-model";
import type { ActView } from "./acts-model";
import "../academic/academic.css";

type GradeFilter = "TODOS" | "PENDIENTES" | "APROBADO" | "RIESGO";

function gradeColor(val: number | null): string {
  if (val === null || isNaN(val)) return "#94a3b8";
  if (val >= 14) return "#059669";
  if (val >= 11) return "#d97706";
  return "#dc2626";
}

function parseNumericGrade(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const normalized = raw.trim().replace(",", ".");
  const num = Number(normalized);
  if (isNaN(num) || num < 0 || num > 20) return null;
  return num;
}

function calculateUnitAverage(
  row: GradeRow,
  ev: GradesPageData["evaluaciones"][number],
  drafts: Record<string, string>,
): number | null {
  const notes: { nota: number; peso: number }[] = [];
  for (const ind of ev.indicadores) {
    const fieldKey = `${row.matricula_id}:${ind.id}`;
    const saved = row.calificaciones.find((c) => c.indicador_id === ind.id);
    const raw =
      drafts[fieldKey] !== undefined
        ? drafts[fieldKey]
        : (saved?.nota ?? "");
    const num = parseNumericGrade(raw);
    if (num !== null) {
      const peso = Number(ind.peso_pct) || 1;
      notes.push({ nota: num, peso });
    }
  }
  if (notes.length === 0) return null;
  const sumWeight = notes.reduce((acc, curr) => acc + curr.peso, 0);
  const sumScore = notes.reduce((acc, curr) => acc + curr.nota * curr.peso, 0);
  return sumWeight > 0 ? Math.round((sumScore / sumWeight) * 10) / 10 : null;
}

function calculateLiveFinalAverage(
  row: GradeRow,
  evaluaciones: GradesPageData["evaluaciones"],
  drafts: Record<string, string>,
): { exact: number | null; official: number | null } {
  const unitResults: { avg: number; peso: number }[] = [];
  for (const ev of evaluaciones) {
    const unitAvg = calculateUnitAverage(row, ev, drafts);
    if (unitAvg !== null) {
      const peso = Number(ev.peso_pct) || 1;
      unitResults.push({ avg: unitAvg, peso });
    }
  }
  if (unitResults.length > 0) {
    const sumWeight = unitResults.reduce((acc, curr) => acc + curr.peso, 0);
    const sumScore = unitResults.reduce((acc, curr) => acc + curr.avg * curr.peso, 0);
    if (sumWeight > 0) {
      const exact = Math.round((sumScore / sumWeight) * 100) / 100;
      return { exact, official: Math.round(exact) };
    }
  }
  const fallbackExact = row.resumenNotas?.promedio
    ? Number(row.resumenNotas.promedio)
    : null;
  return {
    exact: fallbackExact,
    official: row.resumenNotas?.notaOficial ?? (fallbackExact !== null ? Math.round(fallbackExact) : null),
  };
}

export function GradesPage({
  groupId,
  query,
}: {
  groupId: string;
  query: URLSearchParams;
}) {
  const after = query.get("after") ?? "";
  const path = `/evaluacion/grupos/${groupId}/calificaciones`;
  const endpoint = `evaluacion/grupos/${groupId}/calificaciones`;
  // Solicitamos hasta 100 estudiantes para paginar y filtrar instantáneamente en la matriz administrativa
  const search = new URLSearchParams({ limit: "100" });
  if (after) search.set("after", after);
  const queryPath = `${endpoint}?${search}`;
  const { data, loading, error, reload } =
    useApiQuery<GradesPageData>(queryPath);

  if (!loading && !error && data)
    return (
      <GradesMatrix
        key={after}
        initial={data}
        endpoint={endpoint}
        path={path}
        after={after}
        queryPath={queryPath}
        reload={reload}
      />
    );

  return (
    <div className="academic-container">
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <a
          className="academic-btn-action btn-action-secondary"
          href="#/docencia/clases"
        >
          <ArrowLeft size={14} /> Volver
        </a>
      </div>
      <div className="academic-card" style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
        {loading ? (
          <div>
            <RefreshCw size={26} className="spin" style={{ margin: "0 auto 0.5rem", color: "#007a3d" }} />
            <p style={{ margin: 0 }}>Cargando planilla de calificaciones…</p>
          </div>
        ) : (
          <div style={{ color: "#dc2626" }}>
            <AlertCircle size={26} style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ margin: 0 }}>{error}</p>
            <button
              type="button"
              onClick={reload}
              className="academic-btn-action btn-action-secondary"
              style={{ margin: "1rem auto 0" }}
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GradesMatrix({
  initial,
  endpoint,
  queryPath,
  reload,
}: {
  initial: GradesPageData;
  endpoint: string;
  path: string;
  after: string;
  queryPath: string;
  reload: () => void;
}) {
  const { session } = useAuth();
  const roles = session.user.roles;
  const isAdminOrCoordinator = roles.some((r) => ["ADMIN", "COORDINADOR", "SECRETARIA"].includes(r));
  const isTeacherOnly = !isAdminOrCoordinator;

  const [snapshot, setSnapshot] = useState(initial);
  const {
    data: actData,
    reload: reloadAct,
  } = useApiQuery<ActView>(
    `evaluacion/grupos/${initial.grupo.id}/acta?limit=100`,
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  const [conflict, block] = useState(false);
  const [busy, pending] = useState(false);
  const [history, showHistory] = useState<{
    row: GradeRow;
    indicatorId: string;
    code: string;
  } | null>(null);

  // Filtros y paginación estilo administrativo
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<GradeFilter>("TODOS");
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const saving = useRef(false);
  const changes = Object.keys(drafts).length;
  const dirty = changes > 0;
  const guard = useUnsavedChanges(dirty, busy);

  const key = (rowId: string, indicatorId: string) => `${rowId}:${indicatorId}`;
  const recorded = (row: GradeRow, indicatorId: string): Grade | undefined =>
    row.calificaciones.find((item) => item.indicador_id === indicatorId);

  // Ordenar evaluaciones según el orden de las unidades didácticas
  const orderedEvaluations = useMemo(() => {
    const evaluationOrder = new Map(
      [...snapshot.unidades]
        .sort((a, b) => a.orden - b.orden)
        .map((unit, index) => [unit.id, index]),
    );
    return [...snapshot.evaluaciones]
      .filter((item) => item.indicadores.length > 0)
      .sort(
        (a, b) =>
          (evaluationOrder.get(a.unidad_id ?? "") ?? Number.MAX_SAFE_INTEGER) -
            (evaluationOrder.get(b.unidad_id ?? "") ?? Number.MAX_SAFE_INTEGER) ||
          a.orden - b.orden,
      );
  }, [snapshot.evaluaciones, snapshot.unidades]);

  function change(row: GradeRow, indicatorId: string, value: string) {
    const field = key(row.matricula_id, indicatorId);
    notify("");
    // Validación en vivo de reglas de negocio (0 a 20, máximo 2 decimales)
    const liveIssue = value.trim() === "" ? "" : (captureGradeError(value) ?? "");
    setIssues((old) => ({ ...old, [field]: liveIssue }));
    setDrafts((old) => {
      const next = { ...old };
      const currentSaved = recorded(row, indicatorId)?.nota ?? "";
      if (
        value === currentSaved ||
        value === currentSaved.replace(".", ",")
      ) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  }

  async function applySaved(response: SavedGrades) {
    const saved = new Map(
      response.items.map((item) => [
        key(item.matricula_id, item.indicador_id),
        item,
      ]),
    );
    const summaries = new Map(
      response.resumenes.map((item) => [item.matriculaId, item.resumenNotas]),
    );
    setSnapshot((old) => ({
      ...old,
      preparacionActa: response.preparacionActa,
      items: old.items.map((row) => {
        const grades = new Map(
          row.calificaciones.map((item) => [item.indicador_id, item]),
        );
        for (const grade of saved.values())
          if (grade.matricula_id === row.matricula_id)
            grades.set(grade.indicador_id, grade);
        return {
          ...row,
          calificaciones: [...grades.values()],
          resumenNotas: summaries.get(row.matricula_id) ?? row.resumenNotas,
        };
      }),
    }));
    setDrafts({});
    setIssues({});
    notify("¡Calificaciones guardadas y promedios actualizados correctamente!");
    try {
      setSnapshot(await api<GradesPageData>(queryPath));
      reloadAct();
    } catch {
      // Mantiene el snapshot actualizado en memoria
    }
  }

  async function save() {
    if (saving.current || !dirty || !snapshot.puedeEditar || conflict) return;
    const next: Record<string, string> = {};
    for (const [field, value] of Object.entries(drafts)) {
      if (value.trim() === "") {
        next[field] = "Ingresa una nota de 0 a 20 o recarga para descartar.";
        continue;
      }
      const issue = captureGradeError(value);
      if (issue) next[field] = issue;
    }
    setIssues(next);
    if (Object.keys(next).length) {
      fail("Revisa las casillas marcadas en rojo: las notas deben estar entre 0 y 20 con hasta 2 decimales.");
      return;
    }
    const registros = Object.entries(drafts).map(([field, value]) => {
      const [matriculaId, indicadorId] = field.split(":");
      const row = snapshot.items.find(
        (item) => item.matricula_id === matriculaId,
      )!;
      return {
        matriculaId,
        indicadorId,
        nota: gradeCaptureValue(value),
        version: recorded(row, indicadorId)?.version ?? null,
      };
    });
    saving.current = true;
    pending(true);
    fail("");
    notify("");
    try {
      await applySaved(
        await api<SavedGrades>(endpoint, {
          method: "PATCH",
          body: { registros },
        }),
      );
    } catch (e) {
      fail(errorText(e));
      if (e instanceof ApiError && (e.status === 409 || e.status === 403)) {
        block(true);
      }
    } finally {
      saving.current = false;
      pending(false);
    }
  }

  // Condición académica combinada (notas + asistencia DPI)
  function getStudentStatus(row: GradeRow) {
    const actRow = actData?.items.find(
      (item) => item.matricula_id === row.matricula_id,
    );
    const isDpi =
      actRow?.resumenAsistencia?.excedeLimite ||
      actRow?.calculo.condicion === "RETIRADO_INASISTENCIA" ||
      actRow?.resultado?.condicion === "RETIRADO_INASISTENCIA";

    const inasistenciaPct = actRow?.resumenAsistencia?.inasistenciaPct ?? null;
    const live = calculateLiveFinalAverage(row, orderedEvaluations, drafts);

    const hasPending =
      row.resumenNotas.calificacionesPendientes > 0 &&
      orderedEvaluations.some((ev) =>
        ev.indicadores.some((ind) => {
          const f = key(row.matricula_id, ind.id);
          const val = drafts[f] ?? recorded(row, ind.id)?.nota ?? "";
          return val.trim() === "";
        }),
      );

    return {
      isDpi: !!isDpi,
      inasistenciaPct,
      exactAvg: live.exact,
      officialGrade: live.official,
      hasPending,
      aprobado: !isDpi && live.official !== null && live.official >= 11,
      desaprobado: !isDpi && live.official !== null && live.official < 11,
    };
  }

  // Bloqueo de acceso si el usuario es únicamente DOCENTE y la clase está CERRADA
  if (isTeacherOnly && snapshot.grupo.estado === "CERRADO") {
    return (
      <div className="academic-container">
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <a
            href="#/docencia/clases"
            className="academic-btn-action btn-action-secondary"
          >
            <ArrowLeft size={14} /> Volver a Mis Clases Asignadas
          </a>
        </div>

        <div
          className="academic-card"
          style={{
            padding: "3rem 2rem",
            textAlign: "center",
            maxWidth: "580px",
            margin: "2rem auto",
            borderTop: "4px solid #64748b",
          }}
        >
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              borderRadius: "999px",
              backgroundColor: "#f1f5f9",
              color: "#475569",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
            }}
          >
            <Lock size={26} />
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1e293b", margin: "0 0 0.5rem" }}>
            Salón Cerrado ({snapshot.grupo.codigo})
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
            Esta clase ya fue marcada como <strong>CERRADA</strong> por la administración académica y no admite acceso ni modificaciones por parte del docente. Si necesitas registrar o rectificar alguna calificación pendiente, solicita al <strong>Administrador</strong> la liberación temporal del salón.
          </p>
          <a
            href="#/docencia/clases"
            className="academic-btn-action btn-action-primary"
            style={{ display: "inline-flex" }}
          >
            <ArrowLeft size={14} /> Regresar a Mis Clases Habilitadas
          </a>
        </div>
      </div>
    );
  }

  // Estadísticas KPI en vivo
  const kpiStats = useMemo(() => {
    let aprobados = 0;
    let enRiesgo = 0;
    let conPendientes = 0;
    for (const row of snapshot.items) {
      const st = getStudentStatus(row);
      if (st.hasPending) conPendientes += 1;
      if (st.aprobado) aprobados += 1;
      if (st.desaprobado || st.isDpi) enRiesgo += 1;
    }
    return {
      total: snapshot.items.length,
      conPendientes,
      aprobados,
      enRiesgo,
    };
  }, [snapshot.items, orderedEvaluations, drafts, actData]);

  // Filtrado de estudiantes
  const filteredRows = useMemo(() => {
    return snapshot.items.filter((row) => {
      const st = getStudentStatus(row);
      if (filterType === "PENDIENTES" && !st.hasPending) return false;
      if (filterType === "APROBADO" && !st.aprobado) return false;
      if (filterType === "RIESGO" && !st.desaprobado && !st.isDpi) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const nom = (row.estudiante || "").toLowerCase();
        const doc = (row.numero_documento || "").toLowerCase();
        const cod = (row.codigo_matricula || "").toLowerCase();
        if (!nom.includes(q) && !doc.includes(q) && !cod.includes(q)) return false;
      }
      return true;
    });
  }, [snapshot.items, filterType, searchTerm, orderedEvaluations, drafts, actData]);

  const totalPages =
    pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentSafePage = Math.min(currentPage, totalPages);
  const pagedRows =
    pageSize === 0
      ? filteredRows
      : filteredRows.slice(
          (currentSafePage - 1) * pageSize,
          currentSafePage * pageSize,
        );

  return (
    <div className="academic-container">
      {/* Barra de Navegación Superior Adaptable (Docente vs Administrador) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <a
            href={isTeacherOnly ? "#/docencia/clases" : `#/salones/${snapshot.grupo.id}?tab=calificaciones`}
            className="academic-btn-action btn-action-secondary"
          >
            <ArrowLeft size={14} /> {isTeacherOnly ? "Mis Clases Asignadas" : "Volver a Salón 360°"}
          </a>

          <a
            href={`#/asistencia/grupos/${snapshot.grupo.id}`}
            className="academic-btn-action btn-action-secondary"
          >
            <Clock size={14} /> Calendario de Asistencia
          </a>

          <a
            href={`#/evaluacion/grupos/${snapshot.grupo.id}`}
            className="academic-btn-action btn-action-secondary"
          >
            <SlidersHorizontal size={14} /> Criterios de Evaluación
          </a>

          {isAdminOrCoordinator && (
            <>
              <a
                href={`#/evaluacion/grupos/${snapshot.grupo.id}/acta`}
                className="academic-btn-action btn-action-secondary"
              >
                Cierre de Acta
              </a>
              <a
                href={`#/reportes/grupos/${snapshot.grupo.id}?tipo=ACTA_UGEL`}
                className="academic-btn-action btn-action-secondary"
              >
                <FileSpreadsheet size={14} /> Acta Oficial UGEL (.xlsx)
              </a>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => guard.request(reload)}
            className="academic-btn-action btn-action-secondary"
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} /> Recargar
          </button>

          {snapshot.puedeEditar && (
            <button
              type="button"
              disabled={!dirty || busy || conflict}
              onClick={() => void save()}
              className="academic-btn-action btn-action-primary"
              style={{ padding: "0.45rem 1.15rem" }}
            >
              <Save size={14} />{" "}
              {busy
                ? "Guardando…"
                : dirty
                  ? `Guardar Calificaciones (${changes})`
                  : "Guardar Calificaciones"}
            </button>
          )}
        </div>
      </div>

      {/* Tarjeta de Cabecera del Salón */}
      <div className="academic-card" style={{ borderLeft: "4px solid #007a3d", padding: "1.35rem 1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
              <span className="academic-badge badge-green">Salón {snapshot.grupo.codigo}</span>
              <span
                className={`academic-badge ${snapshot.acta.cerrada ? "badge-gray" : "badge-blue"}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              >
                {snapshot.acta.cerrada ? <Lock size={11} /> : <Unlock size={11} />}
                {snapshot.acta.cerrada ? "ACTA CERRADA (SOLO LECTURA)" : "REGISTRO ABIERTO"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Periodo: <strong>{snapshot.grupo.contexto.periodo}</strong>
              </span>
            </div>

            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
              {snapshot.grupo.contexto.idioma} — {snapshot.grupo.contexto.nivel}
            </h1>

            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.25rem 0 0" }}>
              Turno: <strong>{snapshot.grupo.contexto.turno || "Sin turno"}</strong> · Sección:{" "}
              <strong>{snapshot.grupo.contexto.seccion || "Única"}</strong> · Plan aplicado:{" "}
              <strong>
                {snapshot.plan
                  ? `Versión ${snapshot.plan.version} (${snapshot.plan.nombre})`
                  : "Sin plan aprobado"}
              </strong>
            </p>
          </div>

          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "0.625rem",
              padding: "0.65rem 1rem",
              fontSize: "0.75rem",
              color: "#475569",
            }}
          >
            <div>
              Avance global del salón:{" "}
              <strong style={{ color: "#007a3d" }}>
                {snapshot.preparacionActa.calificacionesRegistradas} /{" "}
                {snapshot.preparacionActa.calificacionesEsperadas}
              </strong>{" "}
              notas guardadas
            </div>
            <div style={{ color: "#64748b", marginTop: "0.15rem" }}>
              Escala vigesimal: <strong>0 a 20</strong> (mínimo aprobatorio: 11)
            </div>
          </div>
        </div>

        {snapshot.acta.cerrada && snapshot.acta.cierre && (
          <div
            style={{
              marginTop: "0.85rem",
              padding: "0.65rem 1rem",
              backgroundColor: "#f1f5f9",
              borderRadius: "0.5rem",
              fontSize: "0.75rem",
              color: "#334155",
            }}
          >
            🔒 Acta cerrada oficialmente por <strong>{snapshot.acta.cierre.realizado_nombre}</strong> el{" "}
            {snapshot.acta.cierre.realizado_at ? academicTime(snapshot.acta.cierre.realizado_at) : "—"}.
          </div>
        )}
      </div>

      {/* Aviso de Solo Lectura o Falta de Criterios */}
      {!snapshot.puedeEditar && (
        <div
          style={{
            padding: "0.85rem 1.1rem",
            backgroundColor: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "0.625rem",
            fontSize: "0.8125rem",
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <AlertTriangle size={17} color="#d97706" style={{ flexShrink: 0 }} />
          <div>
            <strong>Modo de Solo Consulta:</strong>{" "}
            {snapshot.motivoSoloLectura ??
              "Tu cuenta puede consultar las calificaciones de este salón."}
            {!snapshot.configuracion && isAdminOrCoordinator && (
              <>
                {" — "}
                <a
                  href={`#/evaluacion/grupos/${snapshot.grupo.id}`}
                  style={{ fontWeight: 700, color: "#b45309", textDecoration: "underline" }}
                >
                  Haz clic aquí para aplicar una versión aprobada de criterios al salón
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* Alertas de Éxito / Error / Conflicto */}
      {success && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#dcfce7",
            color: "#15803d",
            borderRadius: "0.5rem",
            border: "1px solid #bbf7d0",
            fontSize: "0.8125rem",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            borderRadius: "0.5rem",
            border: "1px solid #fecaca",
            fontSize: "0.8125rem",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {conflict && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#fef3c7",
            color: "#92400e",
            borderRadius: "0.5rem",
            border: "1px solid #fde68a",
            fontSize: "0.8125rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            ⚠️ Otra sesión modificó las calificaciones o el estado del grupo. Recarga la planilla para actualizar las versiones.
          </span>
          <button
            type="button"
            onClick={reload}
            className="academic-btn-action btn-action-secondary"
          >
            Recargar ahora
          </button>
        </div>
      )}

      {/* Tarjetas Interactivas KPI (Clic para filtrar) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <div
          onClick={() => {
            setFilterType("TODOS");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: "#ffffff",
            padding: "0.9rem 1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "TODOS" ? "#007a3d" : "#e2e8f0"}`,
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Total Estudiantes</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1e293b", marginTop: "0.15rem" }}>
            {kpiStats.total}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>Clic para mostrar todos</div>
        </div>

        <div
          onClick={() => {
            setFilterType("PENDIENTES");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: filterType === "PENDIENTES" ? "#fffbeb" : "#ffffff",
            padding: "0.9rem 1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "PENDIENTES" ? "#d97706" : "#e2e8f0"}`,
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: 600 }}>Con Notas Pendientes</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#d97706", marginTop: "0.15rem" }}>
            {kpiStats.conPendientes}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#b45309" }}>
            { snapshot.preparacionActa.calificacionesPendientes } casillas por completar
          </div>
        </div>

        <div
          onClick={() => {
            setFilterType("APROBADO");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: filterType === "APROBADO" ? "#f0fdf4" : "#ffffff",
            padding: "0.9rem 1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "APROBADO" ? "#16a34a" : "#e2e8f0"}`,
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 600 }}>Aprobados (Prom ≥ 11)</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#15803d", marginTop: "0.15rem" }}>
            {kpiStats.aprobados}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#166534" }}>Sin exceso de faltas</div>
        </div>

        <div
          onClick={() => {
            setFilterType("RIESGO");
            setCurrentPage(1);
          }}
          style={{
            backgroundColor: filterType === "RIESGO" ? "#fef2f2" : "#ffffff",
            padding: "0.9rem 1rem",
            borderRadius: "0.75rem",
            border: `2px solid ${filterType === "RIESGO" ? "#dc2626" : "#e2e8f0"}`,
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#991b1b", fontWeight: 600 }}>Desaprobados / DPI</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#dc2626", marginTop: "0.15rem" }}>
            {kpiStats.enRiesgo}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#991b1b" }}>Promedio &lt; 11 o &gt; 30% faltas</div>
        </div>
      </div>

      {/* Card Principal con el Formato de Tabla Administrativo Unificado */}
      <div className="academic-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid #f1f5f9" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>
              Planilla Matriz de Calificaciones por Unidades Didácticas (0 - 20)
            </h3>
            <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0.2rem 0 0 0" }}>
              Cada Unidad Didáctica agrupa sus indicadores con su peso porcentual. El promedio de unidad (<strong>PROM</strong>) y el <strong>PROM. FINAL</strong> se calculan en vivo. Una celda vacía significa <em>pendiente</em>; la nota <code>0</code> conserva su valor numérico.
            </p>
          </div>
        </div>

        {/* Barra de Búsqueda, Paginación y Guardado */}
        <div className="academic-table-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
            <div className="academic-search-input-wrapper">
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                placeholder="Buscar por apellidos, nombres, DNI o código…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="academic-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                >
                  <X size={14} color="#94a3b8" />
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#64748b" }}>
              <span>Mostrar:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="input-field"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", width: "auto" }}
              >
                <option value={10}>10 alumnos</option>
                <option value={20}>20 alumnos</option>
                <option value={50}>50 alumnos</option>
                <option value={0}>Todos ({snapshot.items.length})</option>
              </select>
            </div>

            {filterType !== "TODOS" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", backgroundColor: "#f1f5f9", padding: "0.25rem 0.6rem", borderRadius: "999px", color: "#334155" }}>
                <Filter size={12} color="#007a3d" />
                <span>Filtro: <strong>{filterType}</strong></span>
                <button
                  type="button"
                  onClick={() => setFilterType("TODOS")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "0.25rem" }}
                >
                  <X size={13} color="#64748b" />
                </button>
              </div>
            )}
          </div>

          {dirty && (
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#b45309", backgroundColor: "#fef3c7", padding: "0.3rem 0.65rem", borderRadius: "999px" }}>
              ● {changes} {changes === 1 ? "nota modificada sin guardar" : "notas modificadas sin guardar"}
            </span>
          )}
        </div>

        {/* Tabla Matriz Jerárquica estilo Administrativo */}
        {snapshot.items.length > 0 && orderedEvaluations.length > 0 ? (
          <>
            <div className="grade-matrix-container">
              <table className="grade-matrix-table">
                <thead>
                  {/* Nivel 1: Unidades Didácticas / Evaluaciones */}
                  <tr>
                    <th rowSpan={2} className="sticky-col-num">N°</th>
                    <th rowSpan={2} className="sticky-col-student">Estudiante y Documento</th>
                    {orderedEvaluations.map((ev) => {
                      const unitName = snapshot.unidades.find((u) => u.id === ev.unidad_id)?.nombre;
                      return (
                        <th
                          key={ev.id}
                          colSpan={ev.indicadores.length + 1}
                          className="grade-unit-header"
                          title={unitName ? `${unitName} · ${ev.nombre}` : ev.nombre}
                        >
                          {ev.nombre} ({ev.peso_pct}%)
                        </th>
                      );
                    })}
                    <th rowSpan={2} className="grade-final-header">PROM. FINAL</th>
                    <th rowSpan={2} className="grade-cond-header">Condición</th>
                  </tr>

                  {/* Nivel 2: Códigos de Indicadores + Columna PROM por Unidad */}
                  <tr>
                    {orderedEvaluations.map((ev) => (
                      <Fragment key={`${ev.id}_inds`}>
                        {ev.indicadores.map((ind) => (
                          <th
                            key={ind.id}
                            className="grade-ind-header"
                            title={`${ind.codigo}: ${ind.descripcion} (Peso: ${ind.peso_pct}%)`}
                          >
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#007a3d" }}>
                              {ind.codigo}
                            </div>
                            <div style={{ fontSize: "0.625rem", color: "#94a3b8" }}>
                              {ind.peso_pct}%
                            </div>
                          </th>
                        ))}
                        <th key={`${ev.id}_prom`} className="grade-unit-prom-header" title={`Promedio ponderado de ${ev.nombre}`}>
                          PROM
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          4 +
                          orderedEvaluations.reduce(
                            (acc, ev) => acc + ev.indicadores.length + 1,
                            0,
                          )
                        }
                        style={{ padding: "2.5rem", textAlign: "center", color: "#94a3b8" }}
                      >
                        Ningún estudiante coincide con la búsqueda o filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((row, idx) => {
                      const globalIdx =
                        pageSize === 0
                          ? idx + 1
                          : (currentSafePage - 1) * pageSize + idx + 1;
                      const status = getStudentStatus(row);
                      const rowEditable = snapshot.puedeEditar && row.editable;

                      return (
                        <tr key={row.matricula_id}>
                          {/* N° */}
                          <td className="sticky-col-num" style={{ color: "#94a3b8" }}>
                            {globalIdx}
                          </td>

                          {/* Estudiante y Documento */}
                          <td className="sticky-col-student">
                            <div
                              style={{
                                fontWeight: 600,
                                color: "#1e293b",
                                fontSize: "0.8125rem",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={row.estudiante}
                            >
                              {row.estudiante}
                            </div>
                            <div
                              style={{
                                fontSize: "0.6875rem",
                                color: "#64748b",
                                fontFamily: "monospace",
                              }}
                            >
                              {row.tipo_documento} {row.numero_documento} · {row.codigo_matricula}
                            </div>
                          </td>

                          {/* Celdas de Indicadores + PROM por Unidad */}
                          {orderedEvaluations.map((ev) => {
                            const unitAvg = calculateUnitAverage(row, ev, drafts);
                            return (
                              <Fragment key={`${row.matricula_id}_${ev.id}`}>
                                {ev.indicadores.map((ind) => {
                                  const fieldKey = key(row.matricula_id, ind.id);
                                  const savedGrade = recorded(row, ind.id);
                                  const val =
                                    drafts[fieldKey] !== undefined
                                      ? drafts[fieldKey]
                                      : (savedGrade?.nota ?? "");
                                  const cellIssue = issues[fieldKey];
                                  const isModified = drafts[fieldKey] !== undefined;

                                  return (
                                    <td key={ind.id} className="grade-input-cell">
                                      <div style={{ display: "inline-flex", alignItems: "center", gap: "2px", position: "relative" }}>
                                        {rowEditable ? (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={val}
                                            disabled={busy || conflict}
                                            onChange={(e) =>
                                              change(row, ind.id, e.target.value)
                                            }
                                            placeholder="—"
                                            maxLength={5}
                                            title={
                                              cellIssue
                                                ? cellIssue
                                                : `${ind.codigo}: ${ind.descripcion}`
                                            }
                                            className="grade-input-box"
                                            style={{
                                              borderColor: cellIssue
                                                ? "#dc2626"
                                                : isModified
                                                  ? "#0284c7"
                                                  : undefined,
                                              backgroundColor: cellIssue
                                                ? "#fef2f2"
                                                : isModified
                                                  ? "#f0f9ff"
                                                  : undefined,
                                              color: gradeColor(parseNumericGrade(val)),
                                            }}
                                          />
                                        ) : (
                                          <span
                                            style={{
                                              display: "inline-block",
                                              width: "3.25rem",
                                              textAlign: "center",
                                              fontWeight: 700,
                                              fontSize: "0.875rem",
                                              color: gradeColor(
                                                parseNumericGrade(savedGrade?.nota),
                                              ),
                                            }}
                                          >
                                            {displayedGrade(savedGrade?.nota ?? null)}
                                          </span>
                                        )}

                                        {savedGrade && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              showHistory({
                                                row,
                                                indicatorId: ind.id,
                                                code: ind.codigo,
                                              })
                                            }
                                            title={`Ver historial de auditoría de ${ind.codigo} (${row.estudiante})`}
                                            style={{
                                              background: "none",
                                              border: "none",
                                              color: "#94a3b8",
                                              cursor: "pointer",
                                              fontSize: "0.7rem",
                                              padding: "0 2px",
                                              lineHeight: 1,
                                            }}
                                          >
                                            ↶
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}

                                <td
                                  key={`${ev.id}_prom_cell`}
                                  className="grade-unit-prom-cell"
                                  style={{ color: gradeColor(unitAvg) }}
                                >
                                  {unitAvg !== null ? unitAvg.toFixed(1) : "—"}
                                </td>
                              </Fragment>
                            );
                          })}

                          {/* PROM. FINAL */}
                          <td
                            className="grade-final-cell"
                            style={{ color: gradeColor(status.officialGrade) }}
                          >
                            <div>
                              {status.officialGrade !== null
                                ? status.officialGrade
                                : "—"}
                            </div>
                            {status.exactAvg !== null && (
                              <div
                                style={{
                                  fontSize: "0.625rem",
                                  fontWeight: 500,
                                  color: "#64748b",
                                }}
                              >
                                Exacto: {status.exactAvg.toFixed(2)}
                              </div>
                            )}
                          </td>

                          {/* Condición Académica (Respeta DPI por inasistencia y nota mínima 11) */}
                          <td className="grade-cond-cell">
                            {status.isDpi ? (
                              <span
                                className="academic-badge"
                                style={{
                                  backgroundColor: "#fee2e2",
                                  color: "#991b1b",
                                  border: "1px solid #fecaca",
                                }}
                                title={`Inhabilitado por exceso de inasistencias (${status.inasistenciaPct ?? ">30"}%)`}
                              >
                                DPI (FALTAS)
                              </span>
                            ) : status.officialGrade !== null ? (
                              <span
                                className={`academic-badge ${
                                  status.aprobado ? "badge-green" : "badge-gray"
                                }`}
                                style={
                                  !status.aprobado
                                    ? {
                                        backgroundColor: "#fef2f2",
                                        color: "#dc2626",
                                      }
                                    : undefined
                                }
                              >
                                {status.aprobado ? "APROBADO" : "DESAPROBADO"}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
                                En curso
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {filteredRows.length > 0 && pageSize > 0 && totalPages > 1 && (
              <div className="academic-pagination">
                <div>
                  Mostrando{" "}
                  <strong style={{ color: "#1e293b" }}>
                    {(currentSafePage - 1) * pageSize + 1} -{" "}
                    {Math.min(currentSafePage * pageSize, filteredRows.length)}
                  </strong>{" "}
                  de <strong style={{ color: "#1e293b" }}>{filteredRows.length}</strong>{" "}
                  estudiantes
                </div>

                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                  <button
                    type="button"
                    disabled={currentSafePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="academic-page-btn"
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`academic-page-btn ${
                          pageNum === currentSafePage ? "active" : ""
                        }`}
                        style={{ width: "2rem", padding: "0.35rem 0" }}
                      >
                        {pageNum}
                      </button>
                    ),
                  )}

                  <button
                    type="button"
                    disabled={currentSafePage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="academic-page-btn"
                  >
                    Siguiente <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
            <GraduationCap
              size={34}
              color="#cbd5e1"
              style={{ margin: "0 auto 0.5rem auto" }}
            />
            <p style={{ margin: 0 }}>
              {!snapshot.configuracion
                ? "Este salón aún no tiene una versión de criterios de evaluación aplicada."
                : "No hay estudiantes matriculados disponibles para calificar en este salón."}
            </p>
          </div>
        )}
      </div>

      {guard.confirmation}

      {history && (
        <GradeHistoryDialog
          name={history.row.estudiante}
          indicator={history.code}
          endpoint={`${endpoint}/${history.row.matricula_id}/indicadores/${history.indicatorId}/historial`}
          onClose={() => showHistory(null)}
        />
      )}
    </div>
  );
}
