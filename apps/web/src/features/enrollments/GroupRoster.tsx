import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Plus,
  Search,
  X,
  Receipt,
} from "lucide-react";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { useApiQuery } from "../../shared/useApiQuery";
import { api, errorText, text, type Row } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { RecordForm } from "../configuration/RecordForm";
import { studentResource } from "../students/model";
import { StudentSummaryDialog } from "./RosterDialogs";
import { enrollmentStateLabels } from "./state-labels";
import "../academic/academic.css";

type RosterItem = Row & {
  _orden: string;
  edad?: number | null;
  estado?: string;
};

type RosterData = {
  grupo: Row;
  items: Row[];
  nextCursor: string | null;
};

const icon = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

type StateFilter = "ALL" | "ACTIVA" | "PENDIENTE" | "OTHER";
const emptyRoster: Row[] = [];

/** Nómina de un grupo: datos del alumno y de su matrícula, con clasificación rápida por estado. */
export function GroupRoster({
  groupId,
  query,
  canEdit,
  embedded = false,
}: {
  groupId: string;
  query: URLSearchParams;
  canEdit: boolean;
  embedded?: boolean;
}) {
  const [after, setAfter] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");
  const [searchInput, setSearchInput] = useState(query.get("q") ?? "");
  const [success, notify] = useState("");
  const [actionError, fail] = useState("");
  const [summary, setSummary] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const search = query.get("q") ?? "";
  const params = new URLSearchParams({ grupoId: groupId, limit: "50" });
  if (search) params.set("q", search);
  if (after) params.set("after", after);
  const roster = useApiQuery<RosterData>(`matriculas?${params}`);
  const group = roster.data?.grupo;
  const back = `#/matriculas/padron${query.get("periodo") ? `?periodo=${encodeURIComponent(query.get("periodo")!)}` : ""}`;
  const path = embedded ? `/salones/${groupId}` : `/matriculas/grupo/${groupId}`;

  function rosterPath(q = "") {
    const params = new URLSearchParams();
    if (embedded) params.set("tab", "nomina");
    if (query.get("periodo")) params.set("periodo", query.get("periodo")!);
    if (q) params.set("q", q);
    return params.size ? `${path}?${params}` : path;
  }

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchInput.trim();
    setAfter("");
    navigate(rosterPath(q));
  }

  async function editStudent(row: Row) {
    setOpening(String(row.id));
    fail("");
    try {
      setEditing(await api<Row>(`estudiantes/${row.estudiante_id}`));
    } catch (e) {
      fail(errorText(e));
    } finally {
      setOpening(null);
    }
  }

  const sectionName = text(group ?? { id: 0 }, "seccion");
  const sectionLabel = /^secci[oó]n/i.test(sectionName)
    ? sectionName
    : `Sección ${sectionName}`;
  const items = roster.data?.items ?? emptyRoster;
  const activeCount = items.filter((it) => text(it, "estado") === "ACTIVA").length;
  const pendingCount = items.filter((it) => text(it, "estado") === "PENDIENTE").length;
  const otherCount = items.length - activeCount - pendingCount;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const st = text(item, "estado");
      if (stateFilter === "ACTIVA") return st === "ACTIVA";
      if (stateFilter === "PENDIENTE") return st === "PENDIENTE";
      if (stateFilter === "OTHER") return st !== "ACTIVA" && st !== "PENDIENTE";
      return true;
    });
  }, [items, stateFilter]);

  return (
    <div className="academic-container">
      {/* Barra superior de navegación */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <a href={back} className="academic-btn-action btn-action-secondary" style={{ padding: "0.4rem 0.85rem" }}>
          <ArrowLeft size={14} /> Volver a Periodos y Salones
        </a>
        {group && (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {!embedded && <a
              href={`#/salones/${groupId}`}
              className="academic-btn-action btn-action-secondary"
              style={{ padding: "0.4rem 0.85rem" }}
            >
              🏫 Abrir Salón 360°
            </a>}
            {canEdit && group.estado === "ACTIVO" && group.periodo_estado === "ABIERTO" && (
              <a
                href={`#/matriculas/nueva?grupoId=${groupId}`}
                className="academic-btn-action btn-action-primary"
                style={{ padding: "0.4rem 0.95rem" }}
              >
                <Plus size={14} /> Matricular en este Salón
              </a>
            )}
          </div>
        )}
      </div>

      {/* Encabezado del Salón */}
      <div
        className="academic-card"
        style={{
          padding: "1.35rem 1.5rem",
          borderLeft: "5px solid #007a3d",
          background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
              <span className="academic-badge badge-green">
                {group ? text(group, "periodo") : "Periodo"}
              </span>
              <span className="academic-badge badge-blue">
                {group ? text(group, "turno") : "Turno"} · {sectionLabel}
              </span>
              {group && (
                <span style={{ fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 800, color: "#475569" }}>
                  {text(group, "codigo")}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              {group
                ? `${text(group, "idioma")} — ${text(group, "nivel")}`
                : "Cargando nómina del salón…"}
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.25rem 0 0 0" }}>
              Consulta las matrículas del grupo y el estado de cada solicitud.
            </p>
          </div>
        </div>
      </div>

      {!canEdit && (
        <p className="readonly">
          Solo lectura · Consulta autorizada para tu rol
        </p>
      )}

      {/* 4 Tarjetas KPI Clasificadoras */}
      {group && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: "0.85rem" }}>
          <div
            onClick={() => setStateFilter("ALL")}
            className="academic-card"
            style={{
              padding: "0.9rem 1.1rem",
              borderLeft: "4px solid #007a3d",
              cursor: "pointer",
              backgroundColor: stateFilter === "ALL" ? "#f0fdf4" : "#ffffff",
            }}
          >
            <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block" }}>
              Matrículas en esta página
            </span>
            <strong style={{ fontSize: "1.4rem", color: "#007a3d", fontWeight: 800 }}>{items.length}</strong>
          </div>

          <div
            onClick={() => setStateFilter("ACTIVA")}
            className="academic-card"
            style={{
              padding: "0.9rem 1.1rem",
              borderLeft: "4px solid #16a34a",
              cursor: "pointer",
              backgroundColor: stateFilter === "ACTIVA" ? "#ecfdf5" : "#ffffff",
            }}
          >
            <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block" }}>
              Activas en esta página
            </span>
            <strong style={{ fontSize: "1.4rem", color: "#16a34a", fontWeight: 800 }}>{activeCount}</strong>
          </div>

          <div
            onClick={() => setStateFilter("PENDIENTE")}
            className="academic-card"
            style={{
              padding: "0.9rem 1.1rem",
              borderLeft: "4px solid #d97706",
              cursor: "pointer",
              backgroundColor: stateFilter === "PENDIENTE" ? "#fffbeb" : "#ffffff",
            }}
          >
            <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block" }}>
              Solicitudes pendientes en esta página
            </span>
            <strong style={{ fontSize: "1.4rem", color: "#d97706", fontWeight: 800 }}>{pendingCount}</strong>
          </div>

          <div className="academic-card" style={{ padding: "0.9rem 1.1rem", borderLeft: "4px solid #64748b" }}>
            <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block" }}>
              Capacidad del Salón
            </span>
            <strong style={{ fontSize: "1.4rem", color: "#334155", fontWeight: 800 }}>
              {text(group, "capacidad") || "—"}
            </strong>
          </div>
        </div>
      )}

      <Feedback tone="success">{success}</Feedback>
      {actionError && <Feedback>{actionError}</Feedback>}

      <div className="academic-card" style={{ padding: "1.25rem" }}>
        {/* Barra de Búsqueda y Pestañas de Clasificación */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
            paddingBottom: "0.85rem",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <form
            onSubmit={runSearch}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: "1 1 320px" }}
          >
            <div className="academic-search-input-wrapper" style={{ flex: 1 }}>
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                name="q"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por apellidos, nombres, DNI o código de matrícula…"
                className="academic-search-input"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setAfter("");
                    navigate(
                      rosterPath(),
                    );
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                >
                  <X size={14} color="#94a3b8" />
                </button>
              )}
            </div>
            <button type="submit" className="academic-btn-action btn-action-primary" disabled={roster.loading}>
              Buscar
            </button>
          </form>

          {/* Píldoras de clasificación por estado */}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {[
              { id: "ALL" as const, label: `Todos (${items.length})` },
              { id: "ACTIVA" as const, label: `✓ Activas (${activeCount})` },
              { id: "PENDIENTE" as const, label: `⏳ Pendientes (${pendingCount})` },
              ...(otherCount > 0 ? [{ id: "OTHER" as const, label: `Otras (${otherCount})` }] : []),
            ].map((tab) => {
              const active = stateFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStateFilter(tab.id)}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    border: active ? "1px solid #007a3d" : "1px solid #cbd5e1",
                    backgroundColor: active ? "#007a3d" : "#f8fafc",
                    color: active ? "#ffffff" : "#475569",
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {roster.loading ? (
          <Loading>Cargando matriculados…</Loading>
        ) : roster.error ? (
          <Feedback onRetry={roster.reload}>{roster.error}</Feedback>
        ) : (
          <>
            <div className="enrollment-roster-table">
              <DataTable<RosterItem>
                caption="Alumnos matriculados del grupo"
                rows={filteredItems.map((item, idx) => ({
                  ...item,
                  _orden: String(idx + 1).padStart(2, "0"),
                  edad: item.edad as number | null | undefined,
                  estado: text(item, "estado"),
                }))}
                rowKey={(row) => row.id}
                emptyMessage={
                  search || stateFilter !== "ALL"
                    ? "Ningún alumno coincide con el filtro actual."
                    : "Este grupo todavía no tiene matrículas."
                }
                columns={[
                  {
                    key: "orden",
                    header: "N°",
                    className: "row-order",
                    cell: (row) => (
                      <span style={{ color: "#94a3b8", fontWeight: 700 }}>{row._orden}</span>
                    ),
                  },
                  {
                    key: "alumno",
                    header: "Estudiante",
                    cell: (row) => {
                      const apPat = text(row, "apellido_paterno");
                      const apMat = text(row, "apellido_materno");
                      const nom = text(row, "nombres");
                      const initials = ((apPat[0] || "") + (nom[0] || "")).toUpperCase() || "AL";
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                          <div
                            style={{
                              width: "2rem",
                              height: "2rem",
                              borderRadius: "999px",
                              backgroundColor: "#f0fdf4",
                              border: "1px solid #bbf7d0",
                              color: "#007a3d",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <strong style={{ display: "block", color: "#0f172a", fontSize: "0.84rem" }}>
                              {apPat} {apMat}, {nom}
                            </strong>
                            <span style={{ fontSize: "0.7rem", color: "#64748b", fontFamily: "monospace" }}>
                              Matrícula: {text(row, "codigo")}
                            </span>
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    key: "documento",
                    header: "Documento",
                    cell: (row) => (
                      <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#334155", fontSize: "0.8125rem" }}>
                        {text(row, "tipo_documento")} {text(row, "numero_documento")}
                      </span>
                    ),
                  },
                  {
                    key: "edad",
                    header: "Edad",
                    cell: (row) =>
                      row.edad == null ? "—" : `${text(row, "edad")} años`,
                  },
                  ...(canEdit ? [{
                    key: "boleta",
                    header: "Comprobante (Voucher)",
                    cell: (row: RosterItem) => {
                      const vNum = text(row, "voucher_numero");
                      return vNum ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            backgroundColor: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            color: "#0f172a",
                            padding: "0.18rem 0.5rem",
                            borderRadius: "0.375rem",
                          }}
                        >
                          <Receipt size={12} color="#007a3d" />
                          {vNum}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "#d97706",
                            backgroundColor: "#fffbeb",
                            border: "1px solid #fde68a",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "999px",
                          }}
                        >
                          ⏳ Sin voucher
                        </span>
                      );
                    },
                  }] : []),
                  {
                    key: "fecha",
                    header: "F. matrícula",
                    cell: (row) => (
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        {text(row, "fecha_matricula")}
                      </span>
                    ),
                  },
                  {
                    key: "estado",
                    header: "Estado",
                    cell: (row) => (
                      <StatusBadge inactive={row.estado !== "ACTIVA"}>
                        {enrollmentStateLabels[text(row, "estado")] ??
                          text(row, "estado")}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "acciones",
                    header: "Acciones",
                    className: "row-actions",
                    cell: (row) => {
                      const name = `${text(row, "nombres")} ${text(row, "apellido_paterno")}`;
                      return (
                        <div className="roster-action-group">
                          <button
                            type="button"
                            className="roster-btn"
                            title="Ver ficha y resumen del estudiante"
                            aria-label={`Ver resumen de ${name}`}
                            onClick={() => setSummary(row)}
                          >
                            <svg {...icon}>
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span>Ficha</span>
                          </button>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                className="roster-btn"
                                title="Editar datos del estudiante"
                                aria-label={`Editar datos del estudiante ${name}`}
                                disabled={opening === String(row.id)}
                                onClick={() => void editStudent(row)}
                              >
                                <svg {...icon}>
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                <span>Editar</span>
                              </button>
                              {row.estado === "PENDIENTE" && (
                                <a
                                  className="roster-btn roster-btn-primary"
                                  href={`#/matriculas/${row.id}`}
                                  title="Completar pago y voucher"
                                >
                                  <span>Completar pago</span>
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      );
                    },
                  },
                ]}
              />
            </div>
            <Pagination
              after={after}
              nextCursor={roster.data?.nextCursor ?? null}
              count={roster.data?.items.length ?? 0}
              onChange={setAfter}
            />
          </>
        )}
      </div>

      {summary && group && (
        <StudentSummaryDialog
          enrollment={summary}
          group={group}
          canViewVoucher={canEdit}
          onClose={() => setSummary(null)}
        />
      )}
      {editing && (
        <RecordForm
          resource={studentResource}
          row={editing}
          lookups={{}}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await api(`estudiantes/${editing.id}`, {
              method: "PATCH",
              body,
            });
            setEditing(null);
            notify("Datos del estudiante guardados; su historial se conserva.");
            roster.reload();
          }}
        />
      )}
    </div>
  );
}
