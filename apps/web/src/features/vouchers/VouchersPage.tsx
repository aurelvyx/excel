import { useMemo, useState, type FormEvent } from "react";
import {
  Receipt,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Link2,
  Unlock,
  Eye,
  GraduationCap,
  Sparkles,
  ArrowUpDown,
  X,
  LayoutGrid,
  List,
} from "lucide-react";
import { api, errorText, text, type Row, type Page } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { ListPanel } from "../../shared/ui/ListPanel";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { Feedback } from "../../shared/ui/Feedback";
import { VoucherForm } from "./VoucherForm";
import { studentRow } from "../persons/student";
import { StudentPicker } from "../persons/StudentPicker";
import { VoucherDetail } from "./VoucherDetail";
import { voucherStates } from "./model";
import "../academic/academic.css";

type VoucherCategory =
  | "ALL"
  | "PENDING_REVIEW"
  | "UNLINKED"
  | "LINKED"
  | "VALIDATED"
  | "REJECTED";

type SortMode = "DATE_DESC" | "AMOUNT_DESC" | "AMOUNT_ASC" | "STUDENT_ASC";

export function VouchersPage({ query }: { query: URLSearchParams }) {
  const serialized = query.toString();
  const { data, loading, error, reload } = useApiQuery<Page>(
    `vouchers?limit=50&${serialized}`,
  );
  const [creating, create] = useState(false);
  const [student, select] = useState<Row | null>(null);
  const [detail, show] = useState<Row | null>(null);
  const [opening, pending] = useState(false);
  const [actionError, fail] = useState("");
  const [success, notify] = useState("");

  // Controles de clasificación local y búsqueda
  const [searchInput, setSearchInput] = useState(query.get("q") ?? "");
  const [category, setCategory] = useState<VoucherCategory>(
    (query.get("estado") === "PENDIENTE"
      ? "PENDING_REVIEW"
      : query.get("estado") === "VALIDADO"
        ? "VALIDATED"
        : query.get("estado") === "RECHAZADO"
          ? "REJECTED"
          : "ALL") as VoucherCategory,
  );
  const [sortMode, setSortMode] = useState<SortMode>("DATE_DESC");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  async function start() {
    notify("");
    fail("");
    pending(true);
    try {
      const id = query.get("estudianteId");
      if (id) {
        const row = await api<Row>(`estudiantes/${id}`);
        select(studentRow(row));
      }
      create(true);
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }

  async function open(row: Row) {
    pending(true);
    fail("");
    try {
      show(await api<Row>(`vouchers/${row.id}`));
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.has("estudianteId"))
      next.set("estudianteId", query.get("estudianteId")!);
    if (searchInput.trim()) next.set("q", searchInput.trim());
    navigate(`/vouchers?${next}`);
  }

  const rawItems = data?.items ?? [];

  // Métricas y contadores por clasificación
  const stats = useMemo(() => {
    let pendingCount = 0;
    let validatedCount = 0;
    let rejectedCount = 0;
    let linkedCount = 0;
    let unlinkedCount = 0;
    let totalAmount = 0;
    let validatedAmount = 0;

    for (const r of rawItems) {
      const st = text(r, "estado");
      const amt = Number(text(r, "importe")) || 0;
      const isLinked = Boolean(r.matricula_id);
      totalAmount += amt;
      if (st === "PENDIENTE") pendingCount++;
      else if (st === "VALIDADO") {
        validatedCount++;
        validatedAmount += amt;
      } else if (st === "RECHAZADO") rejectedCount++;

      if (isLinked) linkedCount++;
      else if (st !== "RECHAZADO") unlinkedCount++;
    }

    return {
      total: rawItems.length,
      pendingCount,
      validatedCount,
      rejectedCount,
      linkedCount,
      unlinkedCount,
      totalAmount,
      validatedAmount,
    };
  }, [rawItems]);

  // Elementos clasificados y ordenados
  const classifiedItems = useMemo(() => {
    const filtered = rawItems.filter((row) => {
      const st = text(row, "estado");
      const isLinked = Boolean(row.matricula_id);
      if (category === "PENDING_REVIEW") return st === "PENDIENTE";
      if (category === "UNLINKED") return !isLinked && st !== "RECHAZADO";
      if (category === "LINKED") return isLinked;
      if (category === "VALIDATED") return st === "VALIDADO";
      if (category === "REJECTED") return st === "RECHAZADO";
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "AMOUNT_DESC") {
        return (Number(b.importe) || 0) - (Number(a.importe) || 0);
      }
      if (sortMode === "AMOUNT_ASC") {
        return (Number(a.importe) || 0) - (Number(b.importe) || 0);
      }
      if (sortMode === "STUDENT_ASC") {
        return text(a, "estudiante").localeCompare(text(b, "estudiante"));
      }
      // DATE_DESC: Pendientes primero si tienen la misma fecha, luego fecha descendente
      return (
        text(b, "fecha_pago").localeCompare(text(a, "fecha_pago")) ||
        String(b.id).localeCompare(String(a.id))
      );
    });
  }, [rawItems, category, sortMode]);

  return (
    <div className="academic-container">
      {/* Encabezado Ejecutivo de Vouchers */}
      <div
        className="academic-card"
        style={{
          padding: "1.5rem 1.75rem",
          background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
          borderLeft: "5px solid #007a3d",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ maxWidth: "660px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span className="academic-badge badge-green">
                <Sparkles size={11} style={{ marginRight: "0.25rem" }} />
                TESORERÍA Y VALIDACIÓN DE PAGOS
              </span>
              <span className="academic-badge badge-blue">Control de Recibos Presenciales</span>
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.3rem 0" }}>
              Comprobantes de Pago (Vouchers)
            </h1>
            <p style={{ fontSize: "0.84rem", color: "#475569", margin: 0, lineHeight: 1.5 }}>
              Registra, clasifica y valida los comprobantes de pago presencial. Clasifica rápidamente entre vouchers
              <strong> pendientes de revisión</strong>, <strong>disponibles para matricular</strong> o{" "}
              <strong>ya vinculados</strong>.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <a
              href="#/matriculas"
              className="academic-btn-action btn-action-secondary"
              style={{ backgroundColor: "#ffffff", padding: "0.55rem 0.95rem" }}
            >
              <GraduationCap size={15} color="#007a3d" /> Ir a Matrículas
            </a>
            <button
              type="button"
              disabled={loading || opening || !!error}
              onClick={() => void start()}
              className="academic-btn-action btn-action-primary"
              style={{ padding: "0.55rem 1.15rem", fontSize: "0.84rem" }}
            >
              <Plus size={16} /> Registrar Nuevo Voucher
            </button>
          </div>
        </div>
      </div>

      {query.has("estudianteId") && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.75rem 1rem",
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "0.75rem",
            fontSize: "0.82rem",
            color: "#1e40af",
          }}
        >
          <span>📌 Mostrando únicamente los vouchers del estudiante seleccionado.</span>
          <a href="#/vouchers" style={{ fontWeight: 700, color: "#1d4ed8" }}>
            Ver todos los vouchers →
          </a>
        </div>
      )}

      {/* 5 Tarjetas KPI Interactivas de Clasificación */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <div
          onClick={() => setCategory("ALL")}
          className="academic-card"
          style={{
            padding: "0.95rem 1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.8rem",
            cursor: "pointer",
            border: category === "ALL" ? "2px solid #007a3d" : undefined,
          }}
        >
          <div
            style={{
              width: "2.6rem",
              height: "2.6rem",
              borderRadius: "0.7rem",
              backgroundColor: "#f0fdf4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Receipt size={19} color="#007a3d" />
          </div>
          <div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Total en Vista
            </span>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {loading ? "…" : stats.total}
            </div>
            <span style={{ fontSize: "0.7rem", color: "#007a3d", fontWeight: 700 }}>
              S/ {stats.totalAmount.toFixed(2)} acumulados
            </span>
          </div>
        </div>

        <div
          onClick={() => setCategory(category === "PENDING_REVIEW" ? "ALL" : "PENDING_REVIEW")}
          className="academic-card"
          style={{
            padding: "0.95rem 1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.8rem",
            cursor: "pointer",
            border: category === "PENDING_REVIEW" ? "2px solid #d97706" : undefined,
          }}
        >
          <div
            style={{
              width: "2.6rem",
              height: "2.6rem",
              borderRadius: "0.7rem",
              backgroundColor: "#fffbeb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Clock size={19} color="#d97706" />
          </div>
          <div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Por Revisar
            </span>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#d97706", lineHeight: 1.2 }}>
              {loading ? "…" : stats.pendingCount}
            </div>
            <span style={{ fontSize: "0.7rem", color: "#b45309", fontWeight: 600 }}>
              Pendientes de validar
            </span>
          </div>
        </div>

        <div
          onClick={() => setCategory(category === "UNLINKED" ? "ALL" : "UNLINKED")}
          className="academic-card"
          style={{
            padding: "0.95rem 1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.8rem",
            cursor: "pointer",
            border: category === "UNLINKED" ? "2px solid #2563eb" : undefined,
          }}
        >
          <div
            style={{
              width: "2.6rem",
              height: "2.6rem",
              borderRadius: "0.7rem",
              backgroundColor: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Unlock size={19} color="#2563eb" />
          </div>
          <div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Libres (Sin Vincular)
            </span>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#2563eb", lineHeight: 1.2 }}>
              {loading ? "…" : stats.unlinkedCount}
            </div>
            <span style={{ fontSize: "0.7rem", color: "#1d4ed8", fontWeight: 600 }}>
              Listos para matrícula
            </span>
          </div>
        </div>

        <div
          onClick={() => setCategory(category === "LINKED" ? "ALL" : "LINKED")}
          className="academic-card"
          style={{
            padding: "0.95rem 1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.8rem",
            cursor: "pointer",
            border: category === "LINKED" ? "2px solid #7c3aed" : undefined,
          }}
        >
          <div
            style={{
              width: "2.6rem",
              height: "2.6rem",
              borderRadius: "0.7rem",
              backgroundColor: "#fdf4ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Link2 size={19} color="#7c3aed" />
          </div>
          <div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Vinculados
            </span>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#7c3aed", lineHeight: 1.2 }}>
              {loading ? "…" : stats.linkedCount}
            </div>
            <span style={{ fontSize: "0.7rem", color: "#6d28d9", fontWeight: 600 }}>
              Asociados a matrícula
            </span>
          </div>
        </div>

        <div
          onClick={() => setCategory(category === "VALIDATED" ? "ALL" : "VALIDATED")}
          className="academic-card"
          style={{
            padding: "0.95rem 1.1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.8rem",
            cursor: "pointer",
            border: category === "VALIDATED" ? "2px solid #059669" : undefined,
          }}
        >
          <div
            style={{
              width: "2.6rem",
              height: "2.6rem",
              borderRadius: "0.7rem",
              backgroundColor: "#ecfdf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={19} color="#059669" />
          </div>
          <div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Validados
            </span>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#059669", lineHeight: 1.2 }}>
              {loading ? "…" : stats.validatedCount}
            </div>
            <span style={{ fontSize: "0.7rem", color: "#065f46", fontWeight: 700 }}>
              S/ {stats.validatedAmount.toFixed(2)} verificados
            </span>
          </div>
        </div>
      </div>

      <Feedback tone="success">{success}</Feedback>
      <Feedback>{actionError}</Feedback>

      {/* Panel Principal con Pestañas Clasificadoras, Búsqueda, Ordenamiento y Vistas */}
      <div className="academic-card" style={{ padding: "1.35rem 1.5rem" }}>
        {/* Pestañas de Clasificación Rápida */}
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
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {[
              { id: "ALL" as const, label: `Todos (${stats.total})` },
              { id: "PENDING_REVIEW" as const, label: `⏳ Por Revisar (${stats.pendingCount})` },
              { id: "UNLINKED" as const, label: `🔓 Disponibles sin Vincular (${stats.unlinkedCount})` },
              { id: "LINKED" as const, label: `🔗 Vinculados a Matrícula (${stats.linkedCount})` },
              { id: "VALIDATED" as const, label: `✅ Validados (${stats.validatedCount})` },
              ...(stats.rejectedCount > 0
                ? [{ id: "REJECTED" as const, label: `❌ Rechazados (${stats.rejectedCount})` }]
                : []),
            ].map((tab) => {
              const active = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  style={{
                    padding: "0.38rem 0.8rem",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    border: active ? "1px solid #007a3d" : "1px solid #cbd5e1",
                    backgroundColor: active ? "#007a3d" : "#f8fafc",
                    color: active ? "#ffffff" : "#475569",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Alternador Tabla / Tarjetas */}
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`academic-btn-action ${viewMode === "table" ? "btn-action-primary" : "btn-action-secondary"}`}
              style={{ padding: "0.35rem 0.7rem", fontSize: "0.73rem" }}
            >
              <List size={13} /> Tabla
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`academic-btn-action ${viewMode === "cards" ? "btn-action-primary" : "btn-action-secondary"}`}
              style={{ padding: "0.35rem 0.7rem", fontSize: "0.73rem" }}
            >
              <LayoutGrid size={13} /> Tarjetas
            </button>
          </div>
        </div>

        {/* Barra de Búsqueda + Selector de Ordenamiento */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <form
            onSubmit={search}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: "1 1 320px" }}
          >
            <div className="academic-search-input-wrapper" style={{ flex: 1 }}>
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por número de voucher, nombre del estudiante, código o DNI…"
                className="academic-search-input"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    navigate("/vouchers");
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                >
                  <X size={14} color="#94a3b8" />
                </button>
              )}
            </div>
            <button type="submit" className="academic-btn-action btn-action-primary" disabled={loading}>
              Buscar
            </button>
            {serialized && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setCategory("ALL");
                  navigate("/vouchers");
                }}
                className="academic-btn-action btn-action-secondary"
              >
                Limpiar
              </button>
            )}
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.75rem", color: "#475569" }}>
            <ArrowUpDown size={14} color="#64748b" />
            <span style={{ fontWeight: 700 }}>Ordenar por:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="input-field"
              style={{ padding: "0.32rem 0.65rem", fontSize: "0.75rem", width: "auto" }}
            >
              <option value="DATE_DESC">Fecha de pago (Más recientes)</option>
              <option value="AMOUNT_DESC">Mayor importe (S/)</option>
              <option value="AMOUNT_ASC">Menor importe (S/)</option>
              <option value="STUDENT_ASC">Estudiante (A – Z)</option>
            </select>
          </div>
        </div>

        <ListPanel
          loading={loading}
          loadingLabel="Cargando comprobantes de pago…"
          error={error}
          onRetry={reload}
          empty={!classifiedItems.length}
          emptyDescription={
            category !== "ALL" || serialized
              ? "No hay vouchers en esta categoría o filtro. Prueba seleccionando 'Todos'."
              : "Registra el primer voucher presencial para comenzar."
          }
          pagination={
            <Pagination
              count={rawItems.length}
              after={query.get("after")}
              nextCursor={data?.nextCursor ?? null}
              onChange={(cursor) => {
                const next = new URLSearchParams(serialized);
                if (cursor) next.set("after", cursor);
                else next.delete("after");
                navigate(`/vouchers?${next}`);
              }}
            />
          }
        >
          {viewMode === "table" ? (
            <DataTable
              caption="Vouchers registrados"
              rows={classifiedItems}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "numero",
                  header: "Comprobante",
                  cell: (row) => (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        fontFamily: "monospace",
                        fontWeight: 800,
                        fontSize: "0.8rem",
                        color: "#0f172a",
                        backgroundColor: "#f8fafc",
                        border: "1px solid #cbd5e1",
                        padding: "0.22rem 0.55rem",
                        borderRadius: "0.4rem",
                      }}
                    >
                      <Receipt size={13} color="#007a3d" />
                      {text(row, "numero")}
                    </span>
                  ),
                },
                {
                  key: "estudiante",
                  header: "Estudiante",
                  cell: (row) => {
                    const name = text(row, "estudiante");
                    const parts = name.split(" ");
                    const initials = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "E";
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
                            {name}
                          </strong>
                          <span style={{ fontSize: "0.72rem", color: "#64748b", fontFamily: "monospace" }}>
                            Cód: {text(row, "codigo_estudiante")}
                          </span>
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "fecha",
                  header: "Fecha de pago",
                  cell: (row) => (
                    <span style={{ fontSize: "0.8125rem", color: "#334155", fontWeight: 500 }}>
                      {text(row, "fecha_pago")}
                    </span>
                  ),
                },
                {
                  key: "importe",
                  header: "Importe",
                  cell: (row) => (
                    <strong style={{ fontSize: "0.9rem", fontWeight: 800, color: "#007a3d", fontFamily: "monospace" }}>
                      S/ {Number(text(row, "importe") || 0).toFixed(2)}
                    </strong>
                  ),
                },
                {
                  key: "estado",
                  header: "Estado de Validación",
                  cell: (row) => {
                    const st = text(row, "estado");
                    return (
                      <span
                        className={`academic-badge ${
                          st === "VALIDADO"
                            ? "badge-green"
                            : st === "PENDIENTE"
                              ? "badge-amber"
                              : "badge-gray"
                        }`}
                      >
                        {st === "VALIDADO"
                          ? "✓ Validado"
                          : st === "PENDIENTE"
                            ? "⏳ Pendiente"
                            : "✕ Rechazado"}
                      </span>
                    );
                  },
                },
                {
                  key: "uso",
                  header: "Clasificación de Uso",
                  cell: (row) =>
                    row.matricula_id ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          color: "#6d28d9",
                          backgroundColor: "#fdf4ff",
                          border: "1px solid #e9d5ff",
                          padding: "0.18rem 0.55rem",
                          borderRadius: "999px",
                        }}
                      >
                        <Link2 size={12} /> {text(row, "matricula_codigo")}
                      </span>
                    ) : row.estado === "RECHAZADO" ? (
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>No utilizable</span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          color: "#1d4ed8",
                          backgroundColor: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          padding: "0.18rem 0.55rem",
                          borderRadius: "999px",
                        }}
                      >
                        <Unlock size={12} /> Libre para matrícula
                      </span>
                    ),
                },
                {
                  key: "acciones",
                  header: "Acciones",
                  className: "row-actions",
                  cell: (row) => {
                    const isPendingReview = row.estado === "PENDIENTE" && !row.matricula_id;
                    const canEnrollWithVoucher = Boolean(!row.matricula_id && row.estado !== "RECHAZADO" && row.estudiante_id);

                    return (
                      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {canEnrollWithVoucher && (
                          <a
                            href={`#/matriculas?estudianteId=${String(row.estudiante_id)}`}
                            className="academic-btn-action btn-action-secondary"
                            style={{
                              padding: "0.3rem 0.65rem",
                              fontSize: "0.72rem",
                              borderColor: "#bbf7d0",
                              backgroundColor: "#f0fdf4",
                              color: "#007a3d",
                            }}
                            title="Matricular a este estudiante usando su voucher disponible"
                          >
                            <GraduationCap size={12} /> Matricular
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={opening}
                          onClick={() => void open(row)}
                          className={`academic-btn-action ${
                            isPendingReview ? "btn-action-primary" : "btn-action-secondary"
                          }`}
                          style={{ padding: "0.3rem 0.7rem", fontSize: "0.73rem" }}
                        >
                          <Eye size={12} />{" "}
                          {isPendingReview ? "Revisar y Validar" : "Ver Detalle"}
                        </button>
                      </div>
                    );
                  },
                },
              ]}
            />
          ) : (
            /* Vista en Tarjetas de Recibo */
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(295px, 1fr))",
                gap: "0.85rem",
              }}
            >
              {classifiedItems.map((row) => {
                const st = text(row, "estado");
                const isLinked = Boolean(row.matricula_id);
                const isPendingReview = st === "PENDIENTE" && !isLinked;
                const borderAccent =
                  st === "VALIDADO"
                    ? "#007a3d"
                    : st === "PENDIENTE"
                      ? "#d97706"
                      : "#dc2626";

                return (
                  <div
                    key={row.id}
                    style={{
                      padding: "1.1rem 1.25rem",
                      borderRadius: "0.85rem",
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderTop: `4px solid ${borderAccent}`,
                      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.65rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          fontWeight: 800,
                          backgroundColor: "#f1f5f9",
                          color: "#0f172a",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "0.375rem",
                        }}
                      >
                        🧾 {text(row, "numero")}
                      </span>
                      <span
                        className={`academic-badge ${
                          st === "VALIDADO"
                            ? "badge-green"
                            : st === "PENDIENTE"
                              ? "badge-amber"
                              : "badge-gray"
                        }`}
                      >
                        {voucherStates[st] ?? st}
                      </span>
                    </div>

                    <div>
                      <strong style={{ display: "block", fontSize: "0.9rem", color: "#0f172a" }}>
                        {text(row, "estudiante")}
                      </strong>
                      <span style={{ fontSize: "0.73rem", color: "#64748b", fontFamily: "monospace" }}>
                        Cód: {text(row, "codigo_estudiante")} · Fecha: {text(row, "fecha_pago")}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.55rem 0.75rem",
                        backgroundColor: "#f8fafc",
                        borderRadius: "0.5rem",
                      }}
                    >
                      <span style={{ fontSize: "0.73rem", color: "#475569", fontWeight: 600 }}>
                        {isLinked ? `🔗 ${text(row, "matricula_codigo")}` : "🔓 Libre para matrícula"}
                      </span>
                      <strong style={{ fontSize: "1.05rem", fontWeight: 800, color: "#007a3d", fontFamily: "monospace" }}>
                        S/ {Number(text(row, "importe") || 0).toFixed(2)}
                      </strong>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.45rem" }}>
                      {Boolean(!isLinked && st !== "RECHAZADO" && row.estudiante_id) && (
                        <a
                          href={`#/matriculas?estudianteId=${String(row.estudiante_id)}`}
                          className="academic-btn-action btn-action-secondary"
                          style={{ padding: "0.35rem 0.7rem", fontSize: "0.73rem" }}
                        >
                          <GraduationCap size={13} /> Matricular
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={opening}
                        onClick={() => void open(row)}
                        className={`academic-btn-action ${
                          isPendingReview ? "btn-action-primary" : "btn-action-secondary"
                        }`}
                        style={{ padding: "0.35rem 0.75rem", fontSize: "0.73rem" }}
                      >
                        {isPendingReview ? "⚖️ Revisar y Validar" : "👁️ Ver Detalle"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ListPanel>
      </div>

      {creating && !student && (
        <StudentPicker onClose={() => create(false)} onSelect={select} />
      )}
      {creating && student && (
        <VoucherForm
          student={student}
          onClose={() => {
            create(false);
            select(null);
          }}
          onSaved={() => {
            create(false);
            select(null);
            notify("Voucher registrado exitosamente, pendiente de revisión.");
            reload();
          }}
        />
      )}
      {detail && (
        <VoucherDetail
          voucher={detail}
          onClose={() => show(null)}
          onSaved={() => {
            show(null);
            notify("Decisión de revisión del comprobante registrada.");
            reload();
          }}
        />
      )}
    </div>
  );
}
