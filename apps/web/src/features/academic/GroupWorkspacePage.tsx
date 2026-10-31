import { useState, useEffect, useCallback, Fragment } from "react";
import {
  ArrowLeft,
  Users,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Save,
  FileCheck,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Lock,
  Plus,
} from "lucide-react";
import { api, errorText, type Row } from "../../shared/api";
import { useAuth } from "../auth/session";
import type { SessionsPageData, ClassSession, AttendancePageData, AttendanceCode } from "../attendance/model";
import { SessionForm } from "../attendance/SessionForm";
import type { GradesPageData, GradeRow } from "../evaluation/grades-model";
import { captureGradeError, gradeCaptureValue } from "../evaluation/grade-capture";
import { JustificationsDrawer } from "./components/JustificationsDrawer";
import { AttendanceClosureModal } from "./components/AttendanceClosureModal";
import "./academic.css";

interface GroupIndicator {
  id: string;
  codigo: string;
  descripcion: string;
  peso_pct: string;
  orden: number;
}

interface GroupWorkspaceProps {
  groupId: string;
  initialTab?: "nomina" | "asistencia" | "calificaciones";
}

const ATTENDANCE_CYCLE: Record<AttendanceCode, AttendanceCode> = {
  P: "F",
  F: "T",
  T: "J",
  J: "P",
};

const ATTENDANCE_BADGE_STYLE: Record<AttendanceCode, { bg: string; text: string; label: string }> = {
  P: { bg: "#dcfce7", text: "#15803d", label: "P" },
  F: { bg: "#fee2e2", text: "#b91c1c", label: "F" },
  T: { bg: "#fef3c7", text: "#b45309", label: "T" },
  J: { bg: "#dbeafe", text: "#1d4ed8", label: "J" },
};

function gradeColor(val: number | null): string {
  if (val === null || isNaN(val)) return "#94a3b8";
  if (val >= 14) return "#059669";
  if (val >= 11) return "#d97706";
  return "#dc2626";
}

function calculateUnitAverage(
  row: GradeRow,
  ev: GradesPageData["evaluaciones"][number],
  drafts: Record<string, string>,
): number | null {
  const notes: { nota: number; peso: number }[] = [];
  for (const ind of ev.indicadores) {
    const key = `${row.matricula_id}_${ind.id}`;
    const raw = drafts[key];
    if (raw !== undefined && raw.trim() !== "") {
      const n = Number(raw);
      if (!isNaN(n) && n >= 0 && n <= 20) {
        const peso = Number(ind.peso_pct) || 1;
        notes.push({ nota: n, peso });
      }
    }
  }
  if (notes.length === 0) return null;
  const sumWeight = notes.reduce((acc, curr) => acc + curr.peso, 0);
  const sumScore = notes.reduce((acc, curr) => acc + curr.nota * curr.peso, 0);
  return sumWeight > 0 ? Math.round((sumScore / sumWeight) * 10) / 10 : null;
}

function calculateFinalAverage(
  row: GradeRow,
  evaluaciones: GradesPageData["evaluaciones"],
  drafts: Record<string, string>,
  defaultOfficial: number | null,
): number | null {
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
    return sumWeight > 0 ? Math.round((sumScore / sumWeight) * 10) / 10 : null;
  }
  return defaultOfficial !== null ? defaultOfficial : null;
}

export function GroupWorkspacePage({ groupId, initialTab = "asistencia" }: GroupWorkspaceProps) {
  const { session } = useAuth();
  const isAdminOrCoordinator = session.user.roles.some((r) =>
    ["ADMIN", "COORDINADOR", "SECRETARIA"].includes(r),
  );
  const isTeacherOnly = !isAdminOrCoordinator;

  const [activeTab, setActiveTab] = useState<"nomina" | "asistencia" | "calificaciones">(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Group Details
  const [group, setGroup] = useState<Row | null>(null);

  // Attendance State
  const [sessionsData, setSessionsData] = useState<SessionsPageData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [attendanceSheet, setAttendanceSheet] = useState<AttendancePageData | null>(null);
  const [attendanceMarks, setAttendanceMarks] = useState<Record<string, { code: AttendanceCode; version: number | null }>>({});
  const [attendanceDirty, setAttendanceDirty] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendancePageSize, setAttendancePageSize] = useState<number>(10);
  const [isJustificationsOpen, setIsJustificationsOpen] = useState(false);
  const [isClosureOpen, setIsClosureOpen] = useState(false);
  const [justificationsPendingCount, setJustificationsPendingCount] = useState<number>(0);

  // Grades State
  const [gradesData, setGradesData] = useState<GradesPageData | null>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [gradesDirty, setGradesDirty] = useState(false);
  const [savingGrades, setSavingGrades] = useState(false);
  const [gradesSearch, setGradesSearch] = useState("");
  const [gradesPage, setGradesPage] = useState(1);
  const [gradesPageSize, setGradesPageSize] = useState<number>(10);

  // Roster (Nómina real de matriculados del salón)
  const [rosterData, setRosterData] = useState<Array<{
    id: string;
    codigo: string;
    estado: string;
    estudiante_id: string;
    codigo_estudiante?: string;
    tipo_documento: string;
    numero_documento: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string;
    fecha_matricula?: string;
  }>>([]);

  // Load Group Metadata
  async function loadGroup() {
    try {
      const res = await api<Row>(`oferta/grupos/${groupId}`);
      setGroup(res);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Load Official Roster
  async function loadRoster() {
    try {
      const res = await api<{ items: any[] }>(`matriculas?grupoId=${groupId}&limit=100`);
      setRosterData(res.items || []);
    } catch {
      // Fallback
    }
  }

  // Load Sessions for Attendance
  async function loadSessions(preferSessionId?: string) {
    try {
      const res = await api<SessionsPageData>(`asistencia/grupos/${groupId}/sesiones?limit=100`);
      setSessionsData(res);
      if (preferSessionId && res.items.some((s) => s.id === preferSessionId)) {
        setSelectedSessionId(preferSessionId);
      } else if (res.items.length > 0 && !selectedSessionId) {
        const sorted = [...res.items].sort((a, b) => a.fecha.localeCompare(b.fecha));
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayMatch = sorted.find((s) => s.fecha.slice(0, 10) === todayStr);
        setSelectedSessionId(todayMatch ? todayMatch.id : sorted[sorted.length - 1].id);
      }
    } catch {
      // Sessions may not be created yet
    }
  }

  // Load Attendance Session marks
  async function loadAttendanceForSession(sessId: string) {
    if (!sessId) return;
    try {
      const res = await api<AttendancePageData>(`asistencia/grupos/${groupId}/sesiones/${sessId}/asistencias?limit=100`);
      setAttendanceSheet(res);
      const marksMap: Record<string, { code: AttendanceCode; version: number | null }> = {};
      for (const row of res.items) {
        if (row.asistencia) {
          marksMap[row.matricula_id] = {
            code: row.asistencia.codigo as AttendanceCode,
            version: row.asistencia.version,
          };
        } else {
          marksMap[row.matricula_id] = { code: "P", version: null };
        }
      }
      setAttendanceMarks(marksMap);
      setAttendanceDirty(false);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Load Grades
  async function loadGrades() {
    try {
      const res = await api<GradesPageData>(`evaluacion/grupos/${groupId}/calificaciones?limit=100`);
      setGradesData(res);
      const drafts: Record<string, string> = {};
      const indicators: GroupIndicator[] = res.evaluaciones?.flatMap((ev) => ev.indicadores) ?? [];
      for (const row of res.items) {
        for (const ind of indicators) {
          const key = `${row.matricula_id}_${ind.id}`;
          const currentNota = row.calificaciones.find((c) => c.indicador_id === ind.id);
          drafts[key] = currentNota?.nota !== undefined ? String(currentNota.nota) : "";
        }
      }
      setGradeDrafts(drafts);
      setGradesDirty(false);
    } catch {
      // No evaluation criteria configured yet
    }
  }

  // Load Pending Justifications Count
  async function loadJustificationsPendingCount() {
    try {
      const res = await api<{ items: Array<{ justificacion?: { estado: string } | null }> }>(
        `asistencia/grupos/${groupId}/justificaciones?limit=50`
      );
      const pending = (res.items || []).filter((it) => it.justificacion?.estado === "PENDIENTE").length;
      setJustificationsPendingCount(pending);
    } catch {
      // Justifications not available or non-critical
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError("");
      await Promise.all([
        loadGroup(),
        loadRoster(),
        loadSessions(),
        loadGrades(),
        loadJustificationsPendingCount(),
      ]);
      setLoading(false);
    }
    void init();
  }, [groupId]);

  useEffect(() => {
    if (selectedSessionId) {
      void loadAttendanceForSession(selectedSessionId);
    }
  }, [selectedSessionId]);

  // Attendance toggle mark (P -> F -> T -> J -> P)
  const toggleAttendance = useCallback((matriculaId: string) => {
    setAttendanceMarks((prev) => {
      const current = prev[matriculaId] || { code: "P", version: null };
      const nextCode = ATTENDANCE_CYCLE[current.code] || "P";
      return {
        ...prev,
        [matriculaId]: { ...current, code: nextCode },
      };
    });
    setAttendanceDirty(true);
  }, []);

  // Mark all present
  const markAllPresent = useCallback(() => {
    setAttendanceMarks((prev) => {
      const next: Record<string, { code: AttendanceCode; version: number | null }> = {};
      for (const matId of Object.keys(prev)) {
        next[matId] = { ...prev[matId], code: "P" };
      }
      return next;
    });
    setAttendanceDirty(true);
  }, []);

  // Save Attendance to API
  async function handleSaveAttendance() {
    if (!selectedSessionId) return;
    setSavingAttendance(true);
    setError("");
    try {
      const registros = Object.entries(attendanceMarks).map(([matId, item]) => ({
        matriculaId: matId,
        codigo: item.code,
        version: item.version,
      }));

      await api(`asistencia/grupos/${groupId}/sesiones/${selectedSessionId}/asistencias`, {
        method: "PATCH",
        body: { registros },
      });
      setSuccess("¡Asistencias guardadas exitosamente!");
      setAttendanceDirty(false);
      await Promise.all([
        loadAttendanceForSession(selectedSessionId),
        loadSessions(selectedSessionId),
      ]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSavingAttendance(false);
    }
  }

  // Handle grade input change
  const handleGradeChange = (matriculaId: string, indicadorId: string, val: string) => {
    const key = `${matriculaId}_${indicadorId}`;
    setGradeDrafts((prev) => ({ ...prev, [key]: val }));
    setGradesDirty(true);
  };

  // Save Grades to API
  async function handleSaveGrades() {
    if (!gradesData) return;
    setSavingGrades(true);
    setError("");
    try {
      const indicators: GroupIndicator[] = gradesData.evaluaciones?.flatMap((ev) => ev.indicadores) ?? [];
      const registros: Array<{ matriculaId: string; indicadorId: string; nota: string; version: number | null }> = [];
      for (const row of gradesData.items) {
        for (const ind of indicators) {
          const key = `${row.matricula_id}_${ind.id}`;
          const val = gradeDrafts[key];
          const currentGrade = row.calificaciones.find((c) => c.indicador_id === ind.id);
          const currentVal = currentGrade?.nota !== undefined ? String(currentGrade.nota) : "";
          if (val !== undefined && val.trim() !== "" && val.trim() !== currentVal) {
            const issue = captureGradeError(val);
            if (issue) {
              setError(`Nota inválida en ${row.estudiante} (${ind.codigo}): ${issue}`);
              setSavingGrades(false);
              return;
            }
            registros.push({
              matriculaId: row.matricula_id,
              indicadorId: ind.id,
              nota: gradeCaptureValue(val),
              version: currentGrade ? currentGrade.version : null,
            });
          }
        }
      }

      if (registros.length > 0) {
        await api(`evaluacion/grupos/${groupId}/calificaciones`, {
          method: "PATCH",
          body: { registros },
        });
        setSuccess("¡Calificaciones guardadas exitosamente!");
        setGradesDirty(false);
        await loadGrades();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSavingGrades(false);
    }
  }

  const contexto = (group?.contexto as Record<string, string>) || {};
  const evaluacionesList = gradesData?.evaluaciones ?? [];
  const sortedSessions = [...(sessionsData?.items ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const canCreateSession =
    Boolean(sessionsData?.puedeProgramar) ||
    (group?.estado !== "CERRADO" && !group?.asistencia_cerrada);

  // Filtered & paged grades
  const filteredGradeRows = (gradesData?.items ?? []).filter((row) => {
    if (!gradesSearch.trim()) return true;
    const q = gradesSearch.toLowerCase().trim();
    return (
      String(row.estudiante).toLowerCase().includes(q) ||
      String(row.numero_documento).toLowerCase().includes(q) ||
      String(row.codigo_matricula).toLowerCase().includes(q)
    );
  });

  const totalGradePages = gradesPageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredGradeRows.length / gradesPageSize));
  const currentGradePage = Math.min(gradesPage, totalGradePages);
  const pagedGradeRows = gradesPageSize === 0
    ? filteredGradeRows
    : filteredGradeRows.slice((currentGradePage - 1) * gradesPageSize, currentGradePage * gradesPageSize);

  // Filtered & paged attendance
  const filteredAttendanceRows = (attendanceSheet?.items ?? []).filter((row) => {
    if (!attendanceSearch.trim()) return true;
    const q = attendanceSearch.toLowerCase().trim();
    return (
      String(row.estudiante).toLowerCase().includes(q) ||
      String(row.numero_documento).toLowerCase().includes(q)
    );
  });

  const totalAttendancePages = attendancePageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredAttendanceRows.length / attendancePageSize));
  const currentAttendancePage = Math.min(attendancePage, totalAttendancePages);
  const pagedAttendanceRows = attendancePageSize === 0
    ? filteredAttendanceRows
    : filteredAttendanceRows.slice((currentAttendancePage - 1) * attendancePageSize, currentAttendancePage * attendancePageSize);

  if (isTeacherOnly && group && String(group.estado) === "CERRADO") {
    return (
      <div className="academic-container">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <a href="#/docencia/clases" className="academic-btn-action btn-action-secondary" style={{ padding: "0.4rem 0.8rem" }}>
            <ArrowLeft size={14} /> Volver a Mis Clases Asignadas
          </a>
        </div>
        <div
          className="academic-card"
          style={{
            padding: "3rem 2rem",
            textAlign: "center",
            maxWidth: "560px",
            margin: "2rem auto",
            borderTop: "4px solid #64748b",
          }}
        >
          <Lock size={30} color="#64748b" style={{ margin: "0 auto 0.75rem" }} />
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1e293b", margin: "0 0 0.5rem" }}>
            Salón Cerrado ({String(group.codigo)})
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
            Este salón ya fue finalizado por la administración académica. El docente no tiene acceso a salones cerrados a menos que el Administrador libere temporalmente la clase.
          </p>
          <a href="#/docencia/clases" className="academic-btn-action btn-action-primary">
            Regresar a Mis Clases Habilitadas
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="academic-container">
      {/* Top back bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <a
          href={isTeacherOnly ? "#/docencia/clases" : "#/gestion-academica"}
          className="academic-btn-action btn-action-secondary"
          style={{ padding: "0.4rem 0.8rem" }}
        >
          <ArrowLeft size={14} /> {isTeacherOnly ? "Volver a Mis Clases" : "Volver a Salones"}
        </a>
      </div>

      {/* Salon Header Card */}
      <div className="academic-card" style={{ borderLeftWidth: "4px", borderLeftColor: "#007a3d" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className="academic-badge badge-green">{String(contexto.turno || "Turno asignado")}</span>
              <span className="academic-badge badge-blue">{String(group?.estado || "ACTIVO")}</span>
              <span style={{ fontFamily: "monospace", fontSize: "0.875rem", fontWeight: 700, color: "#64748b" }}>
                {String(group?.codigo || "")}
              </span>
            </div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#1e293b", margin: "0.4rem 0 0.2rem 0" }}>
              {contexto.idioma ? `${String(contexto.idioma)} — ` : ""}
              {String(contexto.nivel || "Nivel del Salón")}
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: 0 }}>
              Periodo: <strong>{String(contexto.periodo || "Vigente")}</strong> · Sección: <strong>{String(contexto.seccion || "A")}</strong> · Capacidad: <strong>{String(group?.capacidad ?? 25)} alumnos</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <a
              href={`#/asistencia/grupos/${groupId}?retorno=/salones/${groupId}`}
              className="academic-btn-action btn-action-secondary"
              style={{ fontSize: "0.75rem", padding: "0.5rem 0.85rem" }}
            >
              <Calendar size={14} /> Calendario Mensual
            </a>
            <a
              href={`#/actas?grupoId=${groupId}`}
              className="academic-btn-action btn-action-secondary"
              style={{ fontSize: "0.75rem", padding: "0.5rem 0.85rem" }}
            >
              <FileCheck size={14} /> Acta Oficial
            </a>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="feedback error" style={{ padding: "0.75rem", borderRadius: "0.5rem" }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="feedback success" style={{ padding: "0.75rem", borderRadius: "0.5rem" }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      {/* Salon Work Tabs */}
      <div className="academic-tabs">
        <button
          className={`academic-tab-btn ${activeTab === "asistencia" ? "active" : ""}`}
          onClick={() => setActiveTab("asistencia")}
        >
          <Clock size={16} /> Control de Asistencia
        </button>
        <button
          className={`academic-tab-btn ${activeTab === "calificaciones" ? "active" : ""}`}
          onClick={() => setActiveTab("calificaciones")}
        >
          <GraduationCap size={16} /> Planilla de Calificaciones
        </button>
        <button
          className={`academic-tab-btn ${activeTab === "nomina" ? "active" : ""}`}
          onClick={() => setActiveTab("nomina")}
        >
          <Users size={16} /> Alumnos Matriculados
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
          Cargando salón de clase…
        </div>
      ) : (
        <>
          {/* ── TAB 1: ASISTENCIA INTERACTIVA ─────────────────────────────────── */}
          {activeTab === "asistencia" && (
            <div className="academic-card">
              {/* Session Selector & Action Toolbar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Calendar size={18} color="#007a3d" />
                    <div>
                      <label style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "block" }}>
                        Seleccionar Fecha de Clase / Sesión ({sortedSessions.length})
                      </label>
                      {sortedSessions.length > 0 ? (
                        <select
                          value={selectedSessionId}
                          onChange={(e) => setSelectedSessionId(e.target.value)}
                          className="input-field"
                          style={{ padding: "0.4rem 0.75rem", fontSize: "0.8125rem", width: "auto", minWidth: "250px", marginTop: "0.25rem" }}
                        >
                          {sortedSessions.map((sess: ClassSession) => (
                            <option key={sess.id} value={sess.id}>
                              {sess.fecha.slice(0, 10)} ({sess.hora_inicio?.slice(0, 5) || ""}-{sess.hora_fin?.slice(0, 5) || ""}) · {sess.estado === "REALIZADA" ? "✓ Realizada" : sess.estado === "PROGRAMADA" ? "● Programada" : "Cancelada"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: "0.8125rem", color: "#94a3b8", display: "inline-block", marginTop: "0.35rem" }}>
                          No hay fechas de asistencia creadas aún
                        </span>
                      )}
                    </div>
                  </div>

                  {canCreateSession && (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setSuccess("");
                        setIsCreatingSession(true);
                      }}
                      className="academic-btn-action btn-action-secondary"
                      style={{
                        borderColor: "#007a3d",
                        color: "#007a3d",
                        backgroundColor: "#f0fdf4",
                        fontWeight: 700,
                        padding: "0.42rem 0.85rem",
                      }}
                      title="Crear una nueva sesión de asistencia en un día específico"
                    >
                      <Plus size={14} /> Nueva Fecha de Clase
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setIsJustificationsOpen(true)}
                    className="academic-btn-action btn-action-secondary"
                    title="Ver inasistencias y solicitudes de justificación"
                    style={{ position: "relative" }}
                  >
                    <FileText size={14} color="#0284c7" />
                    <span>Justificaciones</span>
                    {justificationsPendingCount > 0 && (
                      <span
                        style={{
                          backgroundColor: "#f59e0b",
                          color: "#ffffff",
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          padding: "0.1rem 0.4rem",
                          borderRadius: "999px",
                          marginLeft: "0.25rem",
                        }}
                      >
                        {justificationsPendingCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsClosureOpen(true)}
                    className="academic-btn-action btn-action-secondary"
                    title="Revisar inasistencias, DPI y cierre de asistencia"
                    style={{
                      borderColor: group?.asistencia_cerrada ? "#bbf7d0" : "#e2e8f0",
                      backgroundColor: group?.asistencia_cerrada ? "#f0fdf4" : undefined,
                      color: group?.asistencia_cerrada ? "#166534" : undefined,
                    }}
                  >
                    <Lock size={14} color={group?.asistencia_cerrada ? "#16a34a" : "#64748b"} />
                    <span>{group?.asistencia_cerrada ? "Asistencia Cerrada" : "Cierre Oficial"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={markAllPresent}
                    disabled={!selectedSessionId || !attendanceSheet?.items.length}
                    className="academic-btn-action btn-action-secondary"
                  >
                    <Check size={14} color="#15803d" /> Marcar Todos Presentes
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAttendance}
                    disabled={!attendanceDirty || savingAttendance || !selectedSessionId}
                    className="academic-btn-action btn-action-primary"
                    style={{ padding: "0.45rem 1rem" }}
                  >
                    <Save size={14} /> {savingAttendance ? "Guardando…" : "Guardar Asistencias"}
                  </button>
                </div>
              </div>

              {/* Attendance Toolbar: Search & Page Size */}
              {attendanceSheet && attendanceSheet.items.length > 0 && (
                <div className="academic-table-toolbar">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
                    <div className="academic-search-input-wrapper">
                      <Search size={15} color="#94a3b8" />
                      <input
                        type="text"
                        placeholder="Buscar por estudiante o DNI…"
                        value={attendanceSearch}
                        onChange={(e) => {
                          setAttendanceSearch(e.target.value);
                          setAttendancePage(1);
                        }}
                        className="academic-search-input"
                      />
                      {attendanceSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setAttendanceSearch("");
                            setAttendancePage(1);
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
                        value={attendancePageSize}
                        onChange={(e) => {
                          setAttendancePageSize(Number(e.target.value));
                          setAttendancePage(1);
                        }}
                        className="input-field"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", width: "auto" }}
                      >
                        <option value={10}>10 alumnos</option>
                        <option value={20}>20 alumnos</option>
                        <option value={50}>50 alumnos</option>
                        <option value={0}>Todos ({attendanceSheet.items.length})</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Attendance Table */}
              {attendanceSheet && attendanceSheet.items.length > 0 ? (
                <>
                  <div className="grade-matrix-container">
                    <table className="grade-matrix-table">
                      <thead>
                        <tr>
                          <th className="sticky-col-num">N°</th>
                          <th className="sticky-col-student">Estudiante</th>
                          <th style={{ padding: "0.75rem 1rem", width: "120px", textAlign: "left", color: "#475569", fontWeight: 700, borderBottom: "1px solid #cbd5e1", backgroundColor: "#f8fafc" }}>Documento</th>
                          <th style={{ padding: "0.75rem 1rem", textAlign: "center", width: "140px", color: "#475569", fontWeight: 700, borderBottom: "1px solid #cbd5e1", backgroundColor: "#f8fafc" }}>Marca</th>
                          <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#475569", fontWeight: 700, borderBottom: "1px solid #cbd5e1", backgroundColor: "#f8fafc" }}>Observación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedAttendanceRows.map((row, idx) => {
                          const mark = attendanceMarks[row.matricula_id]?.code || "P";
                          const badgeStyle = ATTENDANCE_BADGE_STYLE[mark];
                          const globalIdx = attendancePageSize === 0 ? idx + 1 : (currentAttendancePage - 1) * attendancePageSize + idx + 1;

                          return (
                            <tr key={row.matricula_id}>
                              <td className="sticky-col-num" style={{ color: "#94a3b8" }}>{globalIdx}</td>
                              <td className="sticky-col-student">
                                <span style={{ fontWeight: 600, color: "#1e293b" }}>{String(row.estudiante)}</span>
                              </td>
                              <td style={{ padding: "0.75rem 1rem", color: "#64748b", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" }}>
                                {String(row.numero_documento)}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "center", borderBottom: "1px solid #f1f5f9" }}>
                                <button
                                  type="button"
                                  onClick={() => toggleAttendance(row.matricula_id)}
                                  style={{
                                    backgroundColor: badgeStyle.bg,
                                    color: badgeStyle.text,
                                    border: "none",
                                    borderRadius: "0.5rem",
                                    width: "2.75rem",
                                    height: "2.25rem",
                                    fontWeight: 800,
                                    fontSize: "0.9375rem",
                                    cursor: "pointer",
                                    transition: "transform 0.1s ease, filter 0.1s ease",
                                  }}
                                  title="Clic para rotar: P (Presente) → F (Falta) → T (Tardanza) → J (Justificado)"
                                >
                                  {badgeStyle.label}
                                </button>
                              </td>
                              <td style={{ padding: "0.75rem 1rem", color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
                                {row.asistencia?.observacion || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Attendance Pagination */}
                  {filteredAttendanceRows.length > 0 && attendancePageSize > 0 && totalAttendancePages > 1 && (
                    <div className="academic-pagination">
                      <div>
                        Mostrando{" "}
                        <strong style={{ color: "#1e293b" }}>
                          {(currentAttendancePage - 1) * attendancePageSize + 1} - {Math.min(currentAttendancePage * attendancePageSize, filteredAttendanceRows.length)}
                        </strong>{" "}
                        de <strong style={{ color: "#1e293b" }}>{filteredAttendanceRows.length}</strong> estudiantes
                        {attendanceSearch && ` (filtrados de ${attendanceSheet.items.length})`}
                      </div>

                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={currentAttendancePage <= 1}
                          onClick={() => setAttendancePage((p) => Math.max(1, p - 1))}
                          className="academic-page-btn"
                        >
                          <ChevronLeft size={14} /> Anterior
                        </button>

                        {Array.from({ length: totalAttendancePages }, (_, i) => i + 1).map((pageNum) => (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setAttendancePage(pageNum)}
                            className={`academic-page-btn ${pageNum === currentAttendancePage ? "active" : ""}`}
                            style={{ width: "2rem", padding: "0.35rem 0" }}
                          >
                            {pageNum}
                          </button>
                        ))}

                        <button
                          type="button"
                          disabled={currentAttendancePage >= totalAttendancePages}
                          onClick={() => setAttendancePage((p) => Math.min(totalAttendancePages, p + 1))}
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
                  <Calendar size={32} color="#cbd5e1" style={{ margin: "0 auto 0.5rem auto" }} />
                  {sortedSessions.length === 0 ? (
                    <>
                      <p style={{ margin: "0 0 0.75rem", fontWeight: 600, color: "#334155" }}>
                        Todavía no hay fechas de asistencia programadas para este salón.
                      </p>
                      <p style={{ margin: "0 0 1.25rem", fontSize: "0.8125rem" }}>
                        Crea una fecha de clase para un día específico o genera un rango por días de la semana.
                      </p>
                      {canCreateSession && (
                        <button
                          type="button"
                          onClick={() => setIsCreatingSession(true)}
                          className="academic-btn-action btn-action-primary"
                        >
                          <Plus size={15} /> Crear Fecha de Asistencia
                        </button>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: 0 }}>No hay alumnos matriculados activos en esta sesión de asistencia.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: PLANILLA DE CALIFICACIONES (JERÁRQUICA CON PROMEDIOS POR UNIDAD) ── */}
          {activeTab === "calificaciones" && (
            <div className="academic-card">
              {/* Header Description */}
              <div style={{ marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid #f1f5f9" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                  Planilla de Calificaciones por Unidades Didácticas (0 - 20)
                </h3>
                <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0.25rem 0 0 0" }}>
                  Cada Unidad Didáctica agrupa sus indicadores con su respectivo peso. El promedio de cada unidad (PROM) y el promedio final se calculan en vivo conforme digitas.
                </p>
              </div>

              {/* Toolbar: Search, Page Size & Save Action */}
              {gradesData && gradesData.items.length > 0 && (
                <div className="academic-table-toolbar">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
                    <div className="academic-search-input-wrapper">
                      <Search size={15} color="#94a3b8" />
                      <input
                        type="text"
                        placeholder="Buscar por estudiante, DNI o código…"
                        value={gradesSearch}
                        onChange={(e) => {
                          setGradesSearch(e.target.value);
                          setGradesPage(1);
                        }}
                        className="academic-search-input"
                      />
                      {gradesSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setGradesSearch("");
                            setGradesPage(1);
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
                        value={gradesPageSize}
                        onChange={(e) => {
                          setGradesPageSize(Number(e.target.value));
                          setGradesPage(1);
                        }}
                        className="input-field"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", width: "auto" }}
                      >
                        <option value={10}>10 alumnos</option>
                        <option value={20}>20 alumnos</option>
                        <option value={50}>50 alumnos</option>
                        <option value={0}>Todos ({gradesData.items.length})</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveGrades}
                    disabled={!gradesDirty || savingGrades}
                    className="academic-btn-action btn-action-primary"
                    style={{ padding: "0.45rem 1.25rem" }}
                  >
                    <Save size={14} /> {savingGrades ? "Guardando…" : "Guardar Calificaciones"}
                  </button>
                </div>
              )}

              {/* Grades Hierarchical Matrix Grid */}
              {gradesData && gradesData.items.length > 0 && evaluacionesList.length > 0 ? (
                <>
                  <div className="grade-matrix-container">
                    <table className="grade-matrix-table">
                      <thead>
                        {/* Level 1: Unit & Main Headings */}
                        <tr>
                          <th rowSpan={2} className="sticky-col-num">N°</th>
                          <th rowSpan={2} className="sticky-col-student">Estudiante y Documento</th>
                          {evaluacionesList.map((ev) => (
                            <th
                              key={ev.id}
                              colSpan={ev.indicadores.length + 1}
                              className="grade-unit-header"
                            >
                              {ev.nombre} ({ev.peso_pct}%)
                            </th>
                          ))}
                          <th rowSpan={2} className="grade-final-header">PROM. FINAL</th>
                          <th rowSpan={2} className="grade-cond-header">Condición</th>
                        </tr>

                        {/* Level 2: Indicator Codes & Unit PROM */}
                        <tr>
                          {evaluacionesList.map((ev) => (
                            <Fragment key={`${ev.id}_inds`}>
                              {ev.indicadores.map((ind) => (
                                <th key={ind.id} className="grade-ind-header">
                                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#007a3d" }}>{ind.codigo}</div>
                                  <div style={{ fontSize: "0.625rem", color: "#94a3b8" }}>{ind.peso_pct}%</div>
                                </th>
                              ))}
                              <th key={`${ev.id}_prom`} className="grade-unit-prom-header">
                                PROM
                              </th>
                            </Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedGradeRows.map((row: GradeRow, idx) => {
                          const globalIdx = gradesPageSize === 0 ? idx + 1 : (currentGradePage - 1) * gradesPageSize + idx + 1;
                          const finalAvg = calculateFinalAverage(
                            row,
                            evaluacionesList,
                            gradeDrafts,
                            row.resumenNotas?.notaOficial ?? (row.resumenNotas?.promedio ? Number(row.resumenNotas.promedio) : null),
                          );
                          const aprobado = finalAvg !== null && finalAvg >= 11;

                          return (
                            <tr key={row.matricula_id}>
                              {/* Sticky Column: Number */}
                              <td className="sticky-col-num" style={{ color: "#94a3b8" }}>{globalIdx}</td>

                              {/* Sticky Column: Student Info */}
                              <td className="sticky-col-student">
                                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={String(row.estudiante)}>
                                  {String(row.estudiante)}
                                </div>
                                <div style={{ fontSize: "0.6875rem", color: "#64748b", fontFamily: "monospace" }}>
                                  {String(row.tipo_documento)} {String(row.numero_documento)}
                                </div>
                              </td>

                              {/* Evaluations & Indicators Input Cells + Unit PROM */}
                              {evaluacionesList.map((ev) => {
                                const unitAvg = calculateUnitAverage(row, ev, gradeDrafts);
                                return (
                                  <Fragment key={`${row.matricula_id}_${ev.id}`}>
                                    {ev.indicadores.map((ind) => {
                                      const key = `${row.matricula_id}_${ind.id}`;
                                      const val = gradeDrafts[key] ?? "";
                                      const issue = val.trim() === "" ? null : captureGradeError(val);
                                      const isReadOnly = !gradesData.puedeEditar || !row.editable;
                                      return (
                                        <td key={ind.id} className="grade-input-cell">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={val}
                                            disabled={isReadOnly || savingGrades}
                                            onChange={(e) => handleGradeChange(row.matricula_id, ind.id, e.target.value)}
                                            placeholder="—"
                                            maxLength={5}
                                            title={issue ?? `${ind.codigo}: ${ind.descripcion}`}
                                            className="grade-input-box"
                                            style={{
                                              borderColor: issue ? "#dc2626" : undefined,
                                              backgroundColor: issue
                                                ? "#fef2f2"
                                                : isReadOnly
                                                  ? "#f8fafc"
                                                  : undefined,
                                            }}
                                          />
                                        </td>
                                      );
                                    })}
                                    <td key={`${ev.id}_prom_cell`} className="grade-unit-prom-cell">
                                      {unitAvg !== null ? unitAvg.toFixed(1) : "—"}
                                    </td>
                                  </Fragment>
                                );
                              })}

                              {/* Final Summary Cell */}
                              <td className="grade-final-cell" style={{ color: gradeColor(finalAvg) }}>
                                {finalAvg !== null ? finalAvg.toFixed(1) : "—"}
                              </td>

                              {/* Condición Badge */}
                              <td className="grade-cond-cell">
                                {finalAvg !== null ? (
                                  <span className={`academic-badge ${aprobado ? "badge-green" : "badge-gray"}`}>
                                    {aprobado ? "APROBADO" : "DESAPROBADO"}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>En curso</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Grades Pagination */}
                  {filteredGradeRows.length > 0 && gradesPageSize > 0 && totalGradePages > 1 && (
                    <div className="academic-pagination">
                      <div>
                        Mostrando{" "}
                        <strong style={{ color: "#1e293b" }}>
                          {(currentGradePage - 1) * gradesPageSize + 1} - {Math.min(currentGradePage * gradesPageSize, filteredGradeRows.length)}
                        </strong>{" "}
                        de <strong style={{ color: "#1e293b" }}>{filteredGradeRows.length}</strong> estudiantes
                        {gradesSearch && ` (filtrados de ${gradesData.items.length})`}
                      </div>

                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <button
                          type="button"
                          disabled={currentGradePage <= 1}
                          onClick={() => setGradesPage((p) => Math.max(1, p - 1))}
                          className="academic-page-btn"
                        >
                          <ChevronLeft size={14} /> Anterior
                        </button>

                        {Array.from({ length: totalGradePages }, (_, i) => i + 1).map((pageNum) => (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setGradesPage(pageNum)}
                            className={`academic-page-btn ${pageNum === currentGradePage ? "active" : ""}`}
                            style={{ width: "2rem", padding: "0.35rem 0" }}
                          >
                            {pageNum}
                          </button>
                        ))}

                        <button
                          type="button"
                          disabled={currentGradePage >= totalGradePages}
                          onClick={() => setGradesPage((p) => Math.min(totalGradePages, p + 1))}
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
                  <GraduationCap size={32} color="#cbd5e1" style={{ margin: "0 auto 0.5rem auto" }} />
                  <p style={{ margin: 0 }}>No hay criterios de evaluación aprobados o alumnos registrados para este salón.</p>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: NÓMINA DE ALUMNOS ──────────────────────────────────────── */}
          {activeTab === "nomina" && (
            <div className="academic-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                    Padrón de Estudiantes Matriculados
                  </h3>
                  <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0.2rem 0 0 0" }}>
                    Alumnos formalmente asignados a este salón en el periodo académico.
                  </p>
                </div>

                <a
                  href={`#/matriculas?grupoId=${groupId}`}
                  className="academic-btn-action btn-action-primary"
                >
                  <Users size={14} /> Nueva Matrícula
                </a>
              </div>

              {/* Si hay datos en la nómina oficial, o en asistencias, o en notas */}
              {rosterData.length > 0 || (attendanceSheet && attendanceSheet.items.length > 0) || (gradesData && gradesData.items.length > 0) ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569", textAlign: "left" }}>
                        <th style={{ padding: "0.75rem 1rem", width: "40px" }}>N°</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Apellidos y Nombres</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Documento</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Código Matrícula</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Estado</th>
                        <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterData.length > 0
                        ? rosterData.map((row, idx) => {
                            const nombreCompleto = `${row.apellido_paterno || ""} ${row.apellido_materno || ""} ${row.nombres || ""}`.trim();
                            return (
                              <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{idx + 1}</td>
                                <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#1e293b" }}>
                                  {nombreCompleto || "Estudiante"}
                                </td>
                                <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", color: "#64748b" }}>
                                  {row.tipo_documento} {row.numero_documento}
                                </td>
                                <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", color: "#64748b" }}>
                                  {row.codigo}
                                </td>
                                <td style={{ padding: "0.75rem 1rem" }}>
                                  <span className={`academic-badge ${row.estado === "ACTIVA" ? "badge-green" : "badge-gray"}`}>
                                    {row.estado || "MATRICULADO"}
                                  </span>
                                </td>
                                <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                                  <a
                                    href={`#/matriculas?estudianteId=${row.estudiante_id}`}
                                    className="academic-btn-action btn-action-secondary"
                                    style={{ fontSize: "0.6875rem" }}
                                  >
                                    Ficha
                                  </a>
                                </td>
                              </tr>
                            );
                          })
                        : (attendanceSheet?.items || []).map((row, idx) => (
                            <tr key={row.matricula_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{idx + 1}</td>
                              <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#1e293b" }}>
                                {String(row.estudiante)}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", color: "#64748b" }}>
                                {String(row.numero_documento)}
                              </td>
                              <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", color: "#64748b" }}>
                                —
                              </td>
                              <td style={{ padding: "0.75rem 1rem" }}>
                                <span className="academic-badge badge-green">MATRICULADO</span>
                              </td>
                              <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                                <a
                                  href={`#/matriculas?estudianteId=${row.estudiante_id}`}
                                  className="academic-btn-action btn-action-secondary"
                                  style={{ fontSize: "0.6875rem" }}
                                >
                                  Ficha
                                </a>
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
                  <Users size={32} color="#cbd5e1" style={{ margin: "0 auto 0.5rem auto" }} />
                  <p style={{ margin: 0 }}>No hay estudiantes matriculados en este salón.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal para crear Nueva Fecha de Clase directamente desde Salón 360° */}
      {isCreatingSession && sessionsData?.grupo && (
        <SessionForm
          group={sessionsData.grupo}
          endpoint={`asistencia/grupos/${groupId}/sesiones`}
          existingDates={sortedSessions.map((s) => s.fecha.slice(0, 10))}
          onClose={() => setIsCreatingSession(false)}
          onSaved={async (count, created) => {
            setIsCreatingSession(false);
            const firstNewId = created?.[0]?.id;
            await loadSessions(firstNewId);
            if (firstNewId) {
              setSelectedSessionId(firstNewId);
            }
            setSuccess(
              count === 1
                ? "Se creó la nueva fecha de clase y se seleccionó para tomar asistencia."
                : `Se crearon ${count} fechas de clase exitosamente.`,
            );
          }}
          onTakeAttendanceNow={async (createdSession) => {
            setIsCreatingSession(false);
            await loadSessions(createdSession.id);
            setSelectedSessionId(createdSession.id);
            setSuccess(
              `Fecha ${createdSession.fecha.slice(0, 10)} creada. Puedes registrar la asistencia (P / F / T / J) ahora mismo.`,
            );
          }}
        />
      )}

      {/* Justifications Drawer (Orphaned Module rescued) */}
      <JustificationsDrawer
        groupId={groupId}
        isOpen={isJustificationsOpen}
        onClose={() => setIsJustificationsOpen(false)}
        onUpdated={() => {
          void loadJustificationsPendingCount();
          if (selectedSessionId) {
            void loadAttendanceForSession(selectedSessionId);
          }
        }}
      />

      {/* Attendance Closure Modal (Orphaned Module rescued) */}
      <AttendanceClosureModal
        groupId={groupId}
        isOpen={isClosureOpen}
        onClose={() => setIsClosureOpen(false)}
        onClosedSuccessfully={() => {
          void loadGroup();
          void loadJustificationsPendingCount();
          setSuccess("Asistencia cerrada oficialmente. El salón está listo para actas.");
        }}
      />
    </div>
  );
}
