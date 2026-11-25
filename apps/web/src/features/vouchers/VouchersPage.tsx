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
  ArrowUpDown,
  X,
  LayoutGrid,
  List,
  Wallet,
  Building2,
  Calendar,
} from "lucide-react";
import {
  DataTableContainer,
  FilterToolbar,
  PageHeader,
  SegmentedFilter,
  StatCard,
  StatCardGrid,
  StatusBadge as SharedStatusBadge,
} from "../../components/shared";
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
type VoucherSectionTab = "LIST" | "REVENUE";

interface RevenueSummaryRow {
  periodo_id: string;
  periodo_codigo: string;
  periodo_nombre: string;
  periodo_estado: string;
  grupo_id: string;
  grupo_codigo: string;
  grupo_estado: string;
  idioma: string;
  nivel: string;
  turno: string;
  seccion: string;
  cantidad_vouchers: number;
  total_recaudado: string;
}

interface RevenueSummaryResponse {
  items: RevenueSummaryRow[];
  resumen: {
    totalVouchers: number;
    totalRecaudado: string;
    totalSalones: number;
  };
  periodos: Array<{
    id: string;
    codigo: string;
    nombre: string;
    estado: string;
  }>;
  grupos: Array<{
    id: string;
    codigo: string;
    periodo_id: string;
    idioma: string;
    nivel: string;
    turno: string;
    seccion: string;
  }>;
}

export function VouchersPage({ query }: { query: URLSearchParams }) {
  const serialized = query.toString();
  const { data, loading, error, reload } = useApiQuery<Page>(
    `vouchers?limit=50&${serialized}`,
  );
  const [sectionTab, setSectionTab] = useState<VoucherSectionTab>(
    query.get("vista") === "recaudacion" ? "REVENUE" : "LIST",
  );
  const [revenuePeriodoId, setRevenuePeriodoId] = useState<string>(
    query.get("periodoId") ?? "",
  );
  const [revenueGrupoId, setRevenueGrupoId] = useState<string>(
    query.get("grupoId") ?? "",
  );

  const revenueParams = new URLSearchParams();
  if (revenuePeriodoId) revenueParams.set("periodoId", revenuePeriodoId);
  if (revenueGrupoId) revenueParams.set("grupoId", revenueGrupoId);
  const revenueQueryPath = revenueParams.toString()
    ? `vouchers/resumen-recaudacion?${revenueParams}`
    : "vouchers/resumen-recaudacion";
  const revenueQuery = useApiQuery<RevenueSummaryResponse>(revenueQueryPath);

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
    <div className="ds-page academic-container">
      <PageHeader
        variant="hero"
        icon={<Receipt size={22} strokeWidth={1.75} />}
        eyebrow="Tesorería y Validación de Pagos"
        statusPill="Control de Recibos Presenciales"
        title="Comprobantes de Pago (Vouchers)"
        description={
          <>
            Registra, clasifica y valida los comprobantes de pago presencial.
            Identifica rápidamente entre vouchers{" "}
            <strong>pendientes de revisión</strong>,{" "}
            <strong>disponibles para matricular</strong> o{" "}
            <strong>ya vinculados</strong>.
          </>
        }
        actions={
          <>
            <a href="#/matriculas" className="button">
              <GraduationCap size={15} strokeWidth={1.75} />
              Ir a Matrículas
            </a>
            <button
              type="button"
              className="primary"
              disabled={loading || opening || !!error}
              onClick={() => void start()}
            >
              <Plus size={15} strokeWidth={1.75} />
              Registrar Nuevo Voucher
            </button>
          </>
        }
      />

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
          <span>Mostrando únicamente los vouchers del estudiante seleccionado.</span>
          <a href="#/vouchers" style={{ fontWeight: 700, color: "#1d4ed8" }}>
            Ver todos los vouchers →
          </a>
        </div>
      )}

      {/* Selector de Módulo dentro de Vouchers */}
      <div className="academic-tabs">
        <button
          type="button"
          className={`academic-tab-btn ${sectionTab === "LIST" ? "active" : ""}`}
          onClick={() => setSectionTab("LIST")}
        >
          <Receipt size={16} /> Comprobantes de Pago ({stats.total})
        </button>
        <button
          type="button"
          className={`academic-tab-btn ${sectionTab === "REVENUE" ? "active" : ""}`}
          onClick={() => setSectionTab("REVENUE")}
        >
          <Wallet size={16} /> Recaudación por Salón y Periodo
        </button>
      </div>

      {sectionTab === "REVENUE" ? (
        <>
          <FilterToolbar label="Filtros de recaudación por periodo y salón">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Calendar size={16} color="#059669" />
              <select
                aria-label="Periodo Académico"
                className="ds-select"
                value={revenuePeriodoId}
                onChange={(e) => {
                  setRevenuePeriodoId(e.target.value);
                  setRevenueGrupoId("");
                }}
              >
                <option value="">Todos los periodos académicos</option>
                {(revenueQuery.data?.periodos ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nombre} ({p.estado})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Building2 size={16} color="#059669" />
              <select
                aria-label="Salón / Grupo"
                className="ds-select"
                value={revenueGrupoId}
                onChange={(e) => setRevenueGrupoId(e.target.value)}
              >
                <option value="">Todos los salones / grupos</option>
                {(revenueQuery.data?.grupos ?? [])
                  .filter(
                    (g) =>
                      !revenuePeriodoId || g.periodo_id === revenuePeriodoId,
                  )
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.codigo} · {g.idioma} {g.nivel} ({g.turno} · Sec. {g.seccion})
                    </option>
                  ))}
              </select>
            </div>

            {(revenuePeriodoId || revenueGrupoId) && (
              <button
                type="button"
                className="academic-btn-action btn-action-secondary"
                onClick={() => {
                  setRevenuePeriodoId("");
                  setRevenueGrupoId("");
                }}
              >
                <X size={14} /> Limpiar filtros
              </button>
            )}
          </FilterToolbar>

          <StatCardGrid label="Totales de recaudación">
            <StatCard
              label="Total Recaudado"
              value={
                revenueQuery.loading
                  ? "…"
                  : `S/ ${Number(revenueQuery.data?.resumen.totalRecaudado ?? 0).toFixed(2)}`
              }
              sublabel={
                revenuePeriodoId
                  ? "Total consolidado del filtro seleccionado"
                  : "Histórico consolidado de vouchers validados"
              }
              icon={<Wallet size={19} strokeWidth={1.75} />}
              tone="emerald"
            />
            <StatCard
              label="Comprobantes Pagados"
              value={
                revenueQuery.loading
                  ? "…"
                  : revenueQuery.data?.resumen.totalVouchers ?? 0
              }
              sublabel="Vouchers validados vinculados (sin anulados)"
              icon={<CheckCircle2 size={19} strokeWidth={1.75} />}
              tone="blue"
            />
            <StatCard
              label="Salones con Recaudación"
              value={
                revenueQuery.loading
                  ? "…"
                  : revenueQuery.data?.resumen.totalSalones ?? 0
              }
              sublabel="Grupos con al menos un pago validado"
              icon={<Building2 size={19} strokeWidth={1.75} />}
              tone="slate"
            />
          </StatCardGrid>

          <DataTableContainer
            loading={revenueQuery.loading}
            loadingLabel="Calculando recaudación por salón y periodo…"
            error={revenueQuery.error}
            onRetry={revenueQuery.reload}
            empty={!revenueQuery.data?.items.length}
            emptyTitle="Sin ingresos validados para el filtro actual"
            emptyDescription="Solo se contabilizan comprobantes en estado VALIDADO asociados a matrículas no anuladas."
            statusLeft={
              <span>
                Desglose financiero por <strong>Periodo Académico</strong> y{" "}
                <strong>Salón / Grupo</strong>
              </span>
            }
            statusRight={
              <span>
                Total consolidado:{" "}
                <strong>
                  S/{" "}
                  {Number(
                    revenueQuery.data?.resumen.totalRecaudado ?? 0,
                  ).toFixed(2)}
                </strong>
              </span>
            }
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.84rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      color: "#475569",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "0.8rem 1rem" }}>Periodo Académico</th>
                    <th style={{ padding: "0.8rem 1rem" }}>Salón / Grupo</th>
                    <th style={{ padding: "0.8rem 1rem" }}>Programa / Nivel</th>
                    <th style={{ padding: "0.8rem 1rem" }}>Turno y Sección</th>
                    <th style={{ padding: "0.8rem 1rem", textAlign: "center" }}>
                      Vouchers Pagados
                    </th>
                    <th style={{ padding: "0.8rem 1rem", textAlign: "right" }}>
                      Subtotal Recaudado
                    </th>
                    <th style={{ padding: "0.8rem 1rem", textAlign: "right" }}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(revenueQuery.data?.items ?? []).map((row) => (
                    <tr
                      key={`${row.periodo_id}-${row.grupo_id}`}
                      style={{ borderBottom: "1px solid #f1f5f9" }}
                    >
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {row.periodo_nombre}
                        </div>
                        <span className="ds-code-pill" style={{ marginTop: "0.2rem" }}>
                          {row.periodo_codigo}
                        </span>
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span className="ds-code-pill">{row.grupo_codigo}</span>
                        <div style={{ marginTop: "0.3rem" }}>
                          <SharedStatusBadge
                            inactive={row.grupo_estado === "CERRADO"}
                          >
                            {row.grupo_estado}
                          </SharedStatusBadge>
                        </div>
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <strong style={{ color: "#1e293b" }}>{row.idioma}</strong>
                        <div style={{ fontSize: "0.78rem", color: "#475569" }}>
                          {row.nivel}
                        </div>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", color: "#475569" }}>
                        {row.turno} · Sección {row.seccion}
                      </td>
                      <td
                        style={{
                          padding: "0.85rem 1rem",
                          textAlign: "center",
                          fontFamily: "var(--ds-mono)",
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {row.cantidad_vouchers}
                      </td>
                      <td
                        style={{
                          padding: "0.85rem 1rem",
                          textAlign: "right",
                          fontFamily: "var(--ds-mono)",
                          fontWeight: 800,
                          color: "#059669",
                        }}
                      >
                        S/ {Number(row.total_recaudado).toFixed(2)}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                        <a
                          href={`#/matriculas/grupo/${row.grupo_id}`}
                          className="academic-btn-action btn-action-secondary"
                          style={{ padding: "0.35rem 0.7rem", fontSize: "0.74rem" }}
                        >
                          Ver nómina
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    style={{
                      backgroundColor: "#f8fafc",
                      borderTop: "2px solid #cbd5e1",
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    <td colSpan={4} style={{ padding: "0.9rem 1rem", textAlign: "right" }}>
                      TOTAL GENERAL CONSOLIDADO
                    </td>
                    <td
                      style={{
                        padding: "0.9rem 1rem",
                        textAlign: "center",
                        fontFamily: "var(--ds-mono)",
                      }}
                    >
                      {revenueQuery.data?.resumen.totalVouchers ?? 0}
                    </td>
                    <td
                      style={{
                        padding: "0.9rem 1rem",
                        textAlign: "right",
                        fontFamily: "var(--ds-mono)",
                        fontSize: "1rem",
                        color: "#064e3b",
                      }}
                    >
                      S/{" "}
                      {Number(
                        revenueQuery.data?.resumen.totalRecaudado ?? 0,
                      ).toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </DataTableContainer>
        </>
      ) : (
        <>
      {/* 5 Tarjetas KPI Interactivas Sobrias */}
      <StatCardGrid label="Resumen de comprobantes de pago">
        <StatCard
          label="Total en Vista"
          value={loading ? "…" : stats.total}
          sublabel={`S/ ${stats.totalAmount.toFixed(2)} acumulados`}
          icon={<Receipt size={18} strokeWidth={1.75} />}
          tone="emerald"
          active={category === "ALL"}
          onClick={() => setCategory("ALL")}
        />
        <StatCard
          label="Por Revisar"
          value={loading ? "…" : stats.pendingCount}
          sublabel="Pendientes de validar"
          icon={<Clock size={18} strokeWidth={1.75} />}
          tone="amber"
          active={category === "PENDING_REVIEW"}
          onClick={() =>
            setCategory(category === "PENDING_REVIEW" ? "ALL" : "PENDING_REVIEW")
          }
        />
        <StatCard
          label="Libres (Sin Vincular)"
          value={loading ? "…" : stats.unlinkedCount}
          sublabel="Listos para matrícula"
          icon={<Unlock size={18} strokeWidth={1.75} />}
          tone="blue"
          active={category === "UNLINKED"}
          onClick={() =>
            setCategory(category === "UNLINKED" ? "ALL" : "UNLINKED")
          }
        />
        <StatCard
          label="Vinculados"
          value={loading ? "…" : stats.linkedCount}
          sublabel="Asociados a matrícula"
          icon={<Link2 size={18} strokeWidth={1.75} />}
          tone="slate"
          active={category === "LINKED"}
          onClick={() => setCategory(category === "LINKED" ? "ALL" : "LINKED")}
        />
        <StatCard
          label="Validados"
          value={loading ? "…" : stats.validatedCount}
          sublabel={`S/ ${stats.validatedAmount.toFixed(2)} verificados`}
          icon={<CheckCircle2 size={18} strokeWidth={1.75} />}
          tone="emerald"
          active={category === "VALIDATED"}
          onClick={() =>
            setCategory(category === "VALIDATED" ? "ALL" : "VALIDATED")
          }
        />
      </StatCardGrid>

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
          <SegmentedFilter
            label="Clasificación de vouchers"
            value={category}
            onChange={(val) => setCategory(val)}
            options={[
              { value: "ALL", label: `Todos (${stats.total})` },
              {
                value: "PENDING_REVIEW",
                label: `Por Revisar (${stats.pendingCount})`,
              },
              {
                value: "UNLINKED",
                label: `Disponibles sin Vincular (${stats.unlinkedCount})`,
              },
              {
                value: "LINKED",
                label: `Vinculados (${stats.linkedCount})`,
              },
              {
                value: "VALIDATED",
                label: `Validados (${stats.validatedCount})`,
              },
              ...(stats.rejectedCount > 0
                ? [
                    {
                      value: "REJECTED" as const,
                      label: `Rechazados (${stats.rejectedCount})`,
                    },
                  ]
                : []),
            ]}
          />

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
        </>
      )}

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
            revenueQuery.reload();
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
            revenueQuery.reload();
          }}
        />
      )}
    </div>
  );
}
