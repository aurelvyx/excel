import { useRef, useState } from "react";
import { ApiError, apiFile } from "../../shared/api";
import { FormDialog } from "../../shared/FormDialog";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { useAuth } from "../auth/session";
import { GroupContext } from "../attendance/GroupContext";
import { ReportHistory } from "./ReportHistory";
import { ReportPreviewTable } from "./ReportPreviewTable";
import { reportNames, type ReportPreview } from "./model";

function Totals({ data }: { data: ReportPreview }) {
  return (
    <section
      className="panel panel-content"
      aria-label="Resumen del grupo completo"
    >
      <h2>Resumen del grupo completo</h2>
      <Facts
        emptyLabel="Pendiente"
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
  const type = query.get("tipo") ?? "MATRIZ_NOTAS";
  const after = query.get("after") ?? "";
  const endpoint = `reportes/grupos/${groupId}`;
  const search = new URLSearchParams({
    tipo: type,
    after: after || "0",
    limit: "20",
  });
  const { data, loading, error, reload } = useApiQuery<ReportPreview>(
    `${endpoint}?${search}`,
  );
  return (
    <section>
      <a className="back-link" href="#/reportes">
        ← Volver a reportes
      </a>
      <PageHeading
        eyebrow="Reportes · Borradores de demostración"
        title="Reportes del grupo"
        description="Revisa los datos y genera una matriz de notas o un resumen de participantes en XLSX."
      />
      <div className="panel panel-content">
        <SelectField
          label="Tipo de reporte"
          id="report-type"
          value={type}
          disabled={loading}
          onChange={(event) =>
            navigate(`/reportes/grupos/${groupId}?tipo=${event.target.value}`)
          }
        >
          <option value="MATRIZ_NOTAS">Matriz de notas</option>
          {canSummary && (
            <option value="RESUMEN_PARTICIPANTES">
              Resumen de participantes
            </option>
          )}
        </SelectField>
        <p className="notice">
          BORRADOR · Formato de demostración. La aprobación institucional de las
          plantillas y los destinatarios de los anexos sigue pendiente.
        </p>
      </div>
      {loading ? (
        <Loading>Cargando vista previa…</Loading>
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
    </section>
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
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || stale) return;
    if (!checked) {
      setCheckError(
        "Confirma la revisión del contexto y del carácter de borrador.",
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
        `Borrador generado. Descarga preparada: ${file.filename}. Registro de exportación ${file.exportId}.`,
      );
      setDialog(false);
      setHistoryVersion((value) => value + 1);
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      setStale(error instanceof ApiError && [403, 409].includes(error.status));
      setError(
        conflict
          ? "Los datos o la plantilla cambiaron desde la revisión. Recarga la vista previa y revisa el borrador antes de generar otra vez."
          : error instanceof ApiError && error.status === 403
            ? "Tu acceso a esta exportación cambió. Recarga la vista previa para comprobar los permisos."
            : "No se pudo preparar el archivo. Consulta el historial y vuelve a intentarlo. La selección se conserva.",
      );
      // La generación puede haber quedado registrada aunque la descarga no llegue al navegador.
      setHistoryVersion((value) => value + 1);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <GroupContext group={data.grupo} />
      <p>
        <a href={`#/evaluacion/grupos/${data.grupo.id}/calificaciones`}>
          Calificaciones
        </a>
        {" · "}
        <a href={`#/evaluacion/grupos/${data.grupo.id}/acta`}>
          Resultados y acta
        </a>
      </p>
      <section
        className="panel panel-content"
        aria-label="Estado de la plantilla"
      >
        <Facts
          items={[
            ["Formato", reportNames[data.tipo]],
            [
              "Plantilla",
              `${data.plantilla.id} · versión ${data.plantilla.version}`,
            ],
            [
              "Idioma del formato",
              data.plantilla.idioma === "EN" ? "Inglés" : "Portugués",
            ],
            ["Estado de plantilla", "Propuesta · aprobación pendiente"],
            ["Modo", "Borrador de demostración"],
          ]}
        />
      </section>
      <Totals data={data} />
      {(data.pendientes.length > 0 || data.advertencias.length > 0) && (
        <section
          className="notice"
          aria-label="Pendientes y advertencias del reporte"
        >
          <h2>Pendientes y advertencias</h2>
          <ul>
            {[...data.pendientes, ...data.advertencias].map(
              (message, index) => (
                <li key={index}>{message}</li>
              ),
            )}
          </ul>
        </section>
      )}
      <Feedback tone="success">{success}</Feedback>
      {!dialog && <Feedback>{error}</Feedback>}
      {stale && (
        <Feedback tone="notice">
          La vista previa requiere actualización. La selección del reporte se
          conserva.
        </Feedback>
      )}
      <div className="actions">
        <Button disabled={busy} onClick={refresh}>
          Recargar vista previa
        </Button>
        <Button
          variant="primary"
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
      {!data.puedeExportar && (
        <p className="notice">
          La exportación no está disponible. Revisa los pendientes del reporte.
        </p>
      )}
      <h2>Vista previa · {reportNames[data.tipo].toLowerCase()}</h2>
      <p className="muted">
        Las notas pendientes se muestran como «Pendiente» y quedan vacías en
        XLSX. La nota calculada puede estar pendiente de confirmación; la
        condición solo aparece con un resultado confirmado.
      </p>
      <section className="panel" aria-label="Vista previa del reporte">
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
          title="Generar borrador XLSX"
          context={
            <p>
              {data.grupo.codigo} · {data.grupo.contexto.periodo} ·{" "}
              {reportNames[data.tipo]}
            </p>
          }
          review={review}
          reviewLabel="Revisar borrador"
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
                Se generará un BORRADOR del grupo completo con{" "}
                {data.resumen.matriculas} intentos matriculados, incluidos los
                que no están en esta página.
              </p>
              <p>
                Formato de demostración con aprobación de plantilla pendiente.
                Los campos institucionales no confirmados quedarán identificados
                como pendientes.
              </p>
              <p>
                La generación registra tu usuario, fecha, filtros y versión de
                plantilla.
              </p>
            </>
          }
        >
          <p>
            La descarga incluye el grupo completo. Conserva las notas pendientes
            y los datos institucionales pendientes sin completarlos por
            suposición.
          </p>
          <p>
            Revisa los pendientes y advertencias de la vista previa antes de
            continuar.
          </p>
          <InputField
            label="Revisé el contexto, los pendientes y el carácter de borrador"
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
