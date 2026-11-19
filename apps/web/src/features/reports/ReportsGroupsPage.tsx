import { useMemo } from "react";
import { FileSpreadsheet, BookOpen, FileCheck } from "lucide-react";
import { allRows, text } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { useAuth } from "../auth/session";
import { PageHeading } from "../../shared/ui/PageHeading";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import "../academic/academic.css";
import "./reports.css";

export function ReportsGroupsPage({ query }: { query: URLSearchParams }) {
  const { session } = useAuth();
  const canSummary = session.user.roles.some((role) =>
    ["ADMIN", "COORDINADOR"].includes(role),
  );
  const {
    data: groups = [],
    loading,
    error,
    reload,
  } = useApiQuery("oferta/grupos", allRows);
  const period = query.get("periodo") ?? "TODOS";
  const search = query.get("q") ?? "";
  const periods = useMemo(
    () => [
      ...new Map(
        groups.map((group) => [
          String(group.periodo_id),
          text(group, "contexto.periodo"),
        ]),
      ).entries(),
    ],
    [groups],
  );
  const filtered = groups.filter(
    (group) =>
      (period === "TODOS" || String(group.periodo_id) === period) &&
      ["codigo", "contexto.idioma", "contexto.nivel", "contexto.periodo"]
        .map((key) => text(group, key))
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es").trim()),
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value && value !== "TODOS") next.set(key, value);
    else next.delete(key);
    navigate(`/reportes?${next}`);
  }
  return (
    <section className="academic-container reports-workspace">
      <header className="academic-card report-hero">
        <span className="academic-badge badge-green">
          <FileSpreadsheet size={14} /> Formatos XLSX · Demostración
        </span>
        <PageHeading
          eyebrow="Borradores de demostración"
          title="Reportes"
          description="Selecciona un salón para previsualizar y descargar el acta de evaluación, la matriz detallada de notas o el resumen de participantes."
        />
        <p className="notice">
          Las plantillas son propuestas pendientes de aprobación institucional.
        </p>
        <a href="#/actas" className="academic-btn-action btn-action-secondary">
          <FileCheck size={14} /> Cierre de actas por salón
        </a>
      </header>
      <form
        className="academic-filter-bar"
        onSubmit={(event) => event.preventDefault()}
      >
        <SelectField
          label="Periodo"
          id="report-period"
          value={period}
          onChange={(event) => filter("periodo", event.target.value)}
        >
          <option value="TODOS">Todos los periodos</option>
          {periods.map(([id, name]) => (
            <option key={id} value={id}>
              {name || id}
            </option>
          ))}
        </SelectField>
        <InputField
          label="Buscar salón"
          id="report-group-search"
          value={search}
          onChange={(event) => filter("q", event.target.value)}
          placeholder="Código, idioma, nivel o periodo"
        />
      </form>
      {loading ? (
        <Loading>Cargando grupos…</Loading>
      ) : error ? (
        <Feedback onRetry={reload}>{error}</Feedback>
      ) : !filtered.length ? (
        <p className="academic-card report-hero">
          No hay grupos disponibles para los filtros seleccionados.
        </p>
      ) : (
        <div className="report-group-grid">
          {filtered.map((group) => (
            <article key={group.id} className="academic-card report-group-card">
              <div>
                <span className="academic-badge badge-green">
                  {text(group, "codigo")}
                </span>
                <h2>
                  {text(group, "contexto.idioma")} ·{" "}
                  {text(group, "contexto.nivel")}
                </h2>
                <p className="report-group-context">
                  {text(group, "contexto.periodo")}
                  <br />
                  {text(group, "contexto.turno")} · Sección{" "}
                  {text(group, "contexto.seccion")}
                  <br />
                  {text(group, "estado")}
                </p>
                <p className="report-group-context">
                  Matriculados · {text(group, "matriculados") || "0"} intentos
                </p>
              </div>
              <div className="report-group-actions">
                <a
                  href={`#/reportes/grupos/${group.id}?tipo=MATRIZ_NOTAS`}
                  className="academic-btn-action btn-action-primary"
                >
                  <BookOpen size={14} /> Reportes
                </a>
                <a
                  href={`#/reportes/grupos/${group.id}?tipo=ACTA_DEMOSTRACION`}
                  className="academic-btn-action btn-action-secondary"
                >
                  <FileSpreadsheet size={14} /> Acta de evaluación
                </a>
                {canSummary && (
                  <a
                    href={`#/reportes/grupos/${group.id}?tipo=RESUMEN_PARTICIPANTES`}
                    className="academic-btn-action btn-action-secondary"
                  >
                    Anexo 05
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
