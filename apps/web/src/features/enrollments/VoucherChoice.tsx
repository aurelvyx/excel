import { useMemo, useState, type FormEvent } from "react";
import { Receipt, Plus, CheckCircle2, Search, Eye, Lock } from "lucide-react";
import { api, errorText, text, type Row, type Page } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { ListPanel } from "../../shared/ui/ListPanel";
import { Pagination } from "../../shared/ui/Pagination";
import { Button } from "../../shared/ui/Button";
import { Feedback } from "../../shared/ui/Feedback";
import { VoucherForm } from "../vouchers/VoucherForm";
import { VoucherDetail } from "../vouchers/VoucherDetail";
import { voucherStates } from "../vouchers/model";

export function VoucherChoice({
  student,
  selectedVoucher,
  onSelect,
}: {
  student: Row;
  selectedVoucher?: Row | null;
  onSelect: (row: Row) => void;
}) {
  const [q, search] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filterMode, setFilterMode] = useState<"AVAILABLE" | "ALL">("AVAILABLE");
  const [after, paginate] = useState("");
  const [creating, create] = useState(false);
  const [detail, show] = useState<Row | null>(null);
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);

  const params = new URLSearchParams({
    estudianteId: String(student.id),
    limit: "20",
  });
  if (q) params.set("q", q);
  if (after) params.set("after", after);

  const {
    data,
    loading,
    error: queryError,
    reload,
  } = useApiQuery<Page>(`vouchers?${params}`);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(searchText.trim());
    paginate("");
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

  const allItems = data?.items ?? [];
  const availableItems = useMemo(
    () => allItems.filter((item) => !item.matricula_id && item.estado !== "RECHAZADO"),
    [allItems],
  );
  const displayedItems = filterMode === "AVAILABLE" ? availableItems : allItems;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Banner de Acción para Registrar o Elegir Voucher */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "1rem 1.25rem",
          borderRadius: "0.85rem",
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.65rem",
              backgroundColor: "#dcfce7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Receipt size={20} color="#007a3d" />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: "0.9rem", color: "#064e3b" }}>
              Comprobante de Pago del Estudiante
            </strong>
            <span style={{ fontSize: "0.78rem", color: "#166534" }}>
              Selecciona un comprobante libre de la lista o registra un nuevo voucher presencial ahora mismo.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => create(true)}
          disabled={busy}
          className="academic-btn-action btn-action-primary"
          style={{ padding: "0.55rem 1rem" }}
        >
          <Plus size={15} /> Registrar Nuevo Voucher
        </button>
      </div>

      <Feedback>{error}</Feedback>

      {/* Filtros y Clasificación de Vouchers del Estudiante */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <form onSubmit={filter} style={{ display: "flex", gap: "0.5rem", flex: "1 1 260px" }}>
          <div className="academic-search-input-wrapper" style={{ flex: 1 }}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar por número de voucher…"
              className="academic-search-input"
            />
          </div>
          <Button type="submit" disabled={loading}>
            Buscar
          </Button>
        </form>

        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            type="button"
            onClick={() => setFilterMode("AVAILABLE")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              border: filterMode === "AVAILABLE" ? "1px solid #007a3d" : "1px solid #cbd5e1",
              backgroundColor: filterMode === "AVAILABLE" ? "#007a3d" : "#f8fafc",
              color: filterMode === "AVAILABLE" ? "#ffffff" : "#475569",
              cursor: "pointer",
            }}
          >
            🔓 Disponibles para usar ({availableItems.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("ALL")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              border: filterMode === "ALL" ? "1px solid #007a3d" : "1px solid #cbd5e1",
              backgroundColor: filterMode === "ALL" ? "#007a3d" : "#f8fafc",
              color: filterMode === "ALL" ? "#ffffff" : "#475569",
              cursor: "pointer",
            }}
          >
            Todos del alumno ({allItems.length})
          </button>
        </div>
      </div>

      <ListPanel
        loading={loading}
        loadingLabel="Cargando vouchers del estudiante…"
        error={queryError}
        onRetry={reload}
        empty={!displayedItems.length}
        emptyDescription={
          filterMode === "AVAILABLE" && allItems.length > 0
            ? "Todos los vouchers anteriores de este estudiante ya están vinculados a matrículas. Haz clic en '+ Registrar Nuevo Voucher'."
            : "Este estudiante aún no tiene vouchers registrados. Haz clic en '+ Registrar Nuevo Voucher'."
        }
        pagination={
          <Pagination
            after={after}
            count={allItems.length}
            nextCursor={data?.nextCursor ?? null}
            onChange={paginate}
          />
        }
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap: "0.85rem",
          }}
        >
          {displayedItems.map((row) => {
            const isLinked = !!row.matricula_id;
            const est = text(row, "estado");
            const isSelected =
              selectedVoucher && String(selectedVoucher.id) === String(row.id);

            return (
              <div
                key={row.id}
                onClick={() => {
                  if (!isLinked && !busy) onSelect(row);
                }}
                style={{
                  padding: "1rem 1.15rem",
                  borderRadius: "0.85rem",
                  border: isSelected
                    ? "2px solid #007a3d"
                    : isLinked
                      ? "1px solid #e2e8f0"
                      : "1px solid #cbd5e1",
                  backgroundColor: isSelected
                    ? "#f0fdf4"
                    : isLinked
                      ? "#f8fafc"
                      : "#ffffff",
                  opacity: isLinked ? 0.78 : 1,
                  cursor: isLinked ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      fontWeight: 800,
                      color: "#0f172a",
                      backgroundColor: "#f1f5f9",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "0.375rem",
                    }}
                  >
                    🧾 {text(row, "numero")}
                  </span>
                  <span
                    className={`academic-badge ${
                      est === "VALIDADO"
                        ? "badge-green"
                        : est === "PENDIENTE"
                          ? "badge-amber"
                          : "badge-gray"
                    }`}
                  >
                    {voucherStates[est] ?? est}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Fecha de pago
                    </span>
                    <strong style={{ fontSize: "0.82rem", color: "#334155" }}>
                      {text(row, "fecha_pago")}
                    </strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                      Importe pagado
                    </span>
                    <strong style={{ fontSize: "1.05rem", fontWeight: 800, color: "#007a3d" }}>
                      S/ {Number(text(row, "importe") || 0).toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    paddingTop: "0.55rem",
                    borderTop: "1px dashed #e2e8f0",
                  }}
                >
                  {isLinked ? (
                    <span style={{ fontSize: "0.72rem", color: "#64748b", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                      <Lock size={12} /> Ya vinculado ({text(row, "matricula_codigo") || "Matrícula"})
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(row);
                      }}
                      className={`academic-btn-action ${isSelected ? "btn-action-primary" : "btn-action-secondary"}`}
                      style={{ padding: "0.32rem 0.7rem", fontSize: "0.73rem" }}
                    >
                      {isSelected ? (
                        <>
                          <CheckCircle2 size={13} /> Seleccionado
                        </>
                      ) : (
                        "Elegir este voucher"
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void open(row);
                    }}
                    className="academic-btn-action btn-action-secondary"
                    style={{ padding: "0.32rem 0.65rem", fontSize: "0.72rem" }}
                  >
                    <Eye size={12} />{" "}
                    {est === "PENDIENTE" && !isLinked ? "Validar / Revisar" : "Detalle"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </ListPanel>

      {creating && (
        <VoucherForm
          student={student}
          onClose={() => create(false)}
          onSaved={(row) => {
            create(false);
            onSelect(row);
            reload();
          }}
        />
      )}
      {detail && (
        <VoucherDetail
          voucher={detail}
          onClose={() => show(null)}
          onSaved={(row) => {
            show(null);
            onSelect(row);
            reload();
          }}
        />
      )}
    </div>
  );
}
