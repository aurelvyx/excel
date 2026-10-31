import { useRef, useState } from "react";
import { FileSpreadsheet, Download, RefreshCw, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { ApiError, apiFile } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Pagination } from "../../shared/ui/Pagination";
import { useAuth } from "../auth/session";
import { GroupContext } from "../attendance/GroupContext";
import { ReportHistory } from "./ReportHistory";
import { ReportPreviewTable } from "./ReportPreviewTable";
import { reportNames, type ReportPreview, type ReportType } from "./model";
import "../academic/academic.css";

function Totals({ data }: { data: ReportPreview }) {
  return (
    <section
      className="panel panel-content"
      aria-label="Resumen del grupo completo"
    >
      <h2>Resumen del grupo completo</h2>
      <Facts
        emptyLabel="En revisión"
        items={[
          ["Intentos matriculados", data.resumen.matriculas],
          ["Aprobados confirmados", data.resumen.aprobados],
          ["Desaprobados confirmados", data.resumen.desaprobados],
          ["Retirados confirmados", data.resumen.retirados],
          ["Resultados pendientes", data.resumen.resultadosPendientes],
        ]}
      />
      <p className="muted">
        Incluye las matrículas activas y cerradas del grupo. Cada repetición
        conserva su intento. Los totales no dependen de la página visible.
      </p>
    </section>
  );
}

export function ReportsPage({
  groupId,
  query,
}: {
  groupId: string;
  query: URLSearchParams;
}) {
  const { session } = useAuth();
  const canSummary = session.user.roles.some((role) =>
    ["ADMIN", "COORDINADOR"].includes(role),
  );
  const type = (query.get("tipo") ?? "ACTA_UGEL") as ReportType;
  const after = query.get("after") ?? "";
  const endpoint = `reportes/grupos/${groupId}`;
  const search = new URLSearchParams({
    tipo: type,
    after: after || "0",
    limit: type === "ACTA_UGEL" ? "100" : "20",
  });
  const { data, loading, error, reload } = useApiQuery<ReportPreview>(
    `${endpoint}?${search}`,
  );
  return (
    <div className="academic-container">
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <a className="academic-btn-action btn-action-secondary" href="#/reportes">
          <ArrowLeft size={14} /> Volver a Reportes
        </a>
        <a className="academic-btn-action btn-action-secondary" href={`#/evaluacion/grupos/${groupId}/acta`}>
          Ir al Cierre de Acta del Salón
        </a>
      </div>

      <div className="academic-card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span className="academic-badge badge-green" style={{ marginBottom: "0.4rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
              <FileSpreadsheet size={13} /> Formatos Oficiales Excel (.xlsx)
            </span>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
              Emisión de Acta Oficial UGEL y Matrices del Salón
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.35rem 0 0", maxWidth: "740px" }}>
              Selecciona el formato oficial a previsualizar y exportar. El <strong>Acta Oficial de Evaluación UGEL (MINEDU / CETPRO)</strong> autollena los datos del salón, nómina alfabética, notas por unidad, puntaje, promedio y resumen estadístico en la plantilla oficial de Inglés o Portugués.
            </p>
          </div>
        </div>

        {/* Selector rápido por pestañas de formato */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f1f5f9" }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => navigate(`/reportes/grupos/${groupId}?tipo=ACTA_UGEL`)}
            className={`academic-btn-action ${type === "ACTA_UGEL" ? "btn-action-primary" : "btn-action-secondary"}`}
          >
            <FileSpreadsheet size={14} /> Acta Oficial de Evaluación UGEL (MINEDU)
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => navigate(`/reportes/grupos/${groupId}?tipo=MATRIZ_NOTAS`)}
            className={`academic-btn-action ${type === "MATRIZ_NOTAS" ? "btn-action-primary" : "btn-action-secondary"}`}
          >
            Matriz Detallada de Notas
          </button>
          {canSummary && (
            <button
              type="button"
              disabled={loading}
              onClick={() => navigate(`/reportes/grupos/${groupId}?tipo=RESUMEN_PARTICIPANTES`)}
              className={`academic-btn-action ${type === "RESUMEN_PARTICIPANTES" ? "btn-action-primary" : "btn-action-secondary"}`}
            >
              Resumen de Participantes (Anexo 05)
            </button>
          )}
        </div>

        <div style={{ marginTop: "0.75rem", display: "none" }}>
          <SelectField
            label="Tipo de reporte"
            id="report-type"
            value={type}
            disabled={loading}
            onChange={(event) =>
              navigate(`/reportes/grupos/${groupId}?tipo=${event.target.value}`)
            }
          >
            <option value="ACTA_UGEL">Acta Oficial de Evaluación UGEL (MINEDU / CETPRO)</option>
            <option value="MATRIZ_NOTAS">Matriz de notas</option>
            {canSummary && (
              <option value="RESUMEN_PARTICIPANTES">
                Resumen de participantes
              </option>
            )}
          </SelectField>
        </div>
      </div>

      {loading ? (
        <Loading>Cargando vista previa del formato oficial…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : (
        data && (
          <ReportsLoaded
            key={`${type}:${after}:${data.revision}`}
            data={data}
            after={after}
            endpoint={endpoint}
            reload={reload}
          />
        )
      )}
    </div>
  );
}

function ReportsLoaded({
  data,
  after,
  endpoint,
  reload,
}: {
  data: ReportPreview;
  after: string;
  endpoint: string;
  reload: () => void;
}) {
  const [dialog, setDialog] = useState(false);
  const [review, setReview] = useState(false);
  const [checked, setChecked] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const submitting = useRef(false);

  function refresh() {
    setDialog(false);
    reload();
  }

  async function downloadDirect() {
    if (submitting.current || stale || !data.puedeExportar) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const file = await apiFile(`${endpoint}/exportaciones`, {
        method: "POST",
        body: { tipo: data.tipo, revision: data.revision },
      });
      const url = URL.createObjectURL(file.blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.filename;
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setSuccess(
        `Archivo Excel generado exitosamente: ${file.filename} (Registro #${file.exportId}).`,
      );
      setDialog(false);
      setHistoryVersion((value) => value + 1);
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      setStale(error instanceof ApiError && [403, 409].includes(error.status));
      setError(
        conflict
          ? "Los datos o la plantilla cambiaron desde la revisión. Recarga la vista previa y vuelve a exportar."
          : error instanceof ApiError && error.status === 403
            ? "Tu acceso a esta exportación cambió. Recarga la vista previa para comprobar los permisos."
            : "No se pudo preparar el archivo. Consulta el historial y vuelve a intentarlo.",
      );
      setHistoryVersion((value) => value + 1);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || stale) return;
    if (!checked) {
      setCheckError(
        "Confirma la revisión del contexto antes de exportar.",
      );
      const form = event.currentTarget;
      window.setTimeout(
        () => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    if (!review) {
      setError("");
      setReview(true);
      return;
    }
    await downloadDirect();
  }

  return (
    <>
      <GroupContext group={data.grupo} />

      {/* Barra de Acción Principal con Descarga Directa */}
      <div
        className="academic-card"
        style={{
          padding: "1rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: "#14532d", fontSize: "0.9375rem" }}>
            {reportNames[data.tipo]} · Plantilla{" "}
            {data.plantilla.idioma === "EN" ? "Inglés (EN)" : "Portugués (PT)"} ({data.plantilla.id})
          </div>
          <div style={{ fontSize: "0.75rem", color: "#166534", marginTop: "0.15rem" }}>
            Salón {data.grupo.codigo} · {data.resumen.matriculas} estudiantes matriculados · Listo para autollenado en Excel (.xlsx)
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={refresh}
            className="academic-btn-action btn-action-secondary"
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} /> Recargar vista previa
          </button>

          <button
            type="button"
            disabled={busy || stale || !data.puedeExportar}
            onClick={() => void downloadDirect()}
            className="academic-btn-action btn-action-primary"
            style={{ padding: "0.5rem 1rem" }}
          >
            <Download size={15} />{" "}
            {busy
              ? "Generando Excel…"
              : data.tipo === "ACTA_UGEL"
                ? "Descargar Acta Oficial UGEL (.xlsx)"
                : "Descargar Excel (.xlsx)"}
          </button>

          <Button
            disabled={busy || stale || !data.puedeExportar}
            onClick={() => {
              setDialog(true);
              setReview(false);
              setChecked(false);
              setCheckError("");
              setError("");
            }}
          >
            Revisar exportación
          </Button>
        </div>
      </div>

      {success && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#dcfce7", color: "#15803d", borderRadius: "0.5rem", border: "1px solid #bbf7d0", fontSize: "0.8125rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}
      {!dialog && <Feedback>{error}</Feedback>}
      {stale && (
        <Feedback tone="notice">
          La vista previa requiere actualización. La selección del reporte se
          conserva.
        </Feedback>
      )}

      {data.tipo !== "ACTA_UGEL" && <Totals data={data} />}

      {(data.pendientes.length > 0 || data.advertencias.length > 0) && (
        <div
          style={{
            padding: "0.85rem 1.1rem",
            backgroundColor: "#fffbeb",
            border: "1px solid #fef3c7",
            borderRadius: "0.625rem",
            fontSize: "0.8125rem",
            color: "#92400e",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, marginBottom: "0.3rem" }}>
            <AlertTriangle size={15} color="#d97706" />
            <span>Notas y consideraciones del formato:</span>
          </div>
          <ul style={{ margin: "0 0 0 1.25rem", padding: 0 }}>
            {[...data.pendientes, ...data.advertencias].map(
              (message, index) => (
                <li key={index} style={{ marginBottom: "0.15rem" }}>{message}</li>
              ),
            )}
          </ul>
        </div>
      )}

      {!data.puedeExportar && (
        <p className="notice">
          La exportación no está disponible. Revisa los pendientes del reporte.
        </p>
      )}

      <section className="academic-card" style={{ padding: 0 }} aria-label="Vista previa del reporte">
        <ReportPreviewTable data={data} />
        {data.tipo === "MATRIZ_NOTAS" && (
          <Pagination
            after={after}
            count={data.items.length}
            nextCursor={data.nextCursor}
            onChange={(cursor) => {
              const search = new URLSearchParams({ tipo: data.tipo });
              if (cursor) search.set("after", cursor);
              navigate(`/reportes/grupos/${data.grupo.id}?${search}`);
            }}
          />
        )}
      </section>

      <ReportHistory key={historyVersion} groupId={data.grupo.id} />

      {dialog && (
        <FormDialog
          title="Generar archivo XLSX"
          context={
            <p>
              {data.grupo.codigo} · {data.grupo.contexto.periodo} ·{" "}
              {reportNames[data.tipo]}
            </p>
          }
          review={review}
          reviewLabel="Revisar exportación"
          confirmLabel="Generar XLSX"
          busy={busy}
          dirty={false}
          blocked={stale}
          error={error}
          onClose={() => setDialog(false)}
          onBack={() => setReview(false)}
          onSubmit={(event) => void generate(event)}
          onReload={stale ? refresh : undefined}
          reloadLabel="Recargar vista previa"
          reviewContent={
            <>
              <p>
                Se generará el archivo Excel del grupo completo con{" "}
                {data.resumen.matriculas} intentos matriculados.
              </p>
              <p>
                La generación registra tu usuario, fecha, filtros y versión de
                plantilla en la auditoría.
              </p>
            </>
          }
        >
          <p>
            La descarga incluye el grupo completo autollenado en la plantilla seleccionada.
          </p>
          <InputField
            label="Revisé el contexto y los datos de la vista previa"
            type="checkbox"
            required
            checked={checked}
            disabled={busy || stale}
            error={checkError}
            onChange={(event) => {
              setChecked(event.target.checked);
              setCheckError("");
            }}
          />
        </FormDialog>
      )}
    </>
  );
}
