import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Pagination } from "../../shared/ui/Pagination";
import { DataTable } from "../../shared/ui/DataTable";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { useState, type FormEvent } from "react";
import { api, text, type Page, type Row } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useAuth } from "../auth/session";
import { RecordForm } from "../configuration/RecordForm";
import { studentResource } from "./model";
import { StudentHistory } from "./StudentHistory";

export function StudentsPage({
  id,
  query,
}: {
  id?: string;
  query: URLSearchParams;
}) {
  const { session } = useAuth();
  const canEdit = session.user.roles.some(
    (r) => r === "ADMIN" || r === "SECRETARIA",
  );
  const [success, notify] = useState("");
  const [editing, edit] = useState(false);
  const [after, setAfter] = useState(query.get("after") ?? "");
  const serialized = query.toString();
  const pageQuery = new URLSearchParams(serialized);
  pageQuery.set("limit", "10");
  if (after) pageQuery.set("after", after);
  else pageQuery.delete("after");
  const {
    data: loaded,
    loading,
    error,
    reload,
  } = useApiQuery<Row | Page>(
    id ? `estudiantes/${id}` : `estudiantes?${pageQuery}`,
  );
  const student = id ? (loaded as Row | undefined) : undefined;
  const data =
    !id && loaded ? (loaded as Page) : { items: [], nextCursor: null };
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const k of ["q", "activo"]) {
      const v = String(form.get(k) ?? "").trim();
      if (v) next.set(k, v);
    }
    setAfter("");
    navigate(`/estudiantes?${next}`);
  }
  const back = `/estudiantes?${serialized}`;
  return (
    <section className="student-page">
      <PageHeading
        eyebrow={canEdit ? "Gestión académica" : "Consulta académica"}
        title={id ? "Ficha del estudiante" : "Estudiantes"}
        description="Identidad única e historial separado por cada intento."
      />
      {!canEdit && (
        <p className="readonly">
          Solo lectura · Consulta autorizada para tu rol
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      {!id ? (
        <ListPanel
          filters={
            <form className="filters" key={serialized} onSubmit={search}>
              <InputField
                label="Documento, código o nombre"
                id="student-search"
                name="q"
                maxLength={120}
                defaultValue={query.get("q") ?? ""}
              />
              <SelectField
                label="Estado"
                id="student-active"
                name="activo"
                defaultValue={query.get("activo") ?? ""}
              >
                <option value="">Todos</option>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </SelectField>
              <Button type="submit" disabled={loading}>
                Buscar
              </Button>
              <Button
                disabled={loading || !serialized}
                onClick={() => {
                  setAfter("");
                  navigate("/estudiantes");
                }}
              >
                Limpiar filtros
              </Button>
            </form>
          }
          loading={false}
          loadingLabel="Cargando estudiantes…"
          error=""
          onRetry={reload}
          empty={!loading && !error && !data.items.length}
          emptyDescription={
            serialized
              ? "Prueba con otros filtros."
              : canEdit
                ? "Los estudiantes se registran durante el proceso de matrícula."
                : "Todavía no hay registros disponibles para tu cuenta."
          }
          pagination={null}
        >
          <div className="student-results" aria-busy={loading}>
            {loading && (
              <p className="student-results-status" role="status">
                Cargando esta página…
              </p>
            )}
            {error && <Feedback onRetry={reload}>{error}</Feedback>}
            <DataTable
              caption="Estudiantes registrados"
              rows={data.items}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "codigo",
                  header: "Código",
                  cell: (row) => text(row, "codigo_estudiante"),
                },
                {
                  key: "estudiante",
                  header: "Estudiante",
                  cell: (row) =>
                    `${text(row, "nombres")} ${text(row, "apellido_paterno")} ${text(row, "apellido_materno")}`,
                },
                {
                  key: "documento",
                  header: "Documento",
                  cell: (row) =>
                    `${text(row, "tipo_documento")} ${text(row, "numero_documento")}`,
                },
                {
                  key: "estado",
                  header: "Estado",
                  cell: (row) => (
                    <StatusBadge inactive={!row.activo}>
                      {row.activo ? "Activo" : "Inactivo"}
                    </StatusBadge>
                  ),
                },
                {
                  key: "consulta",
                  header: "Acciones",
                  className: "row-actions",
                  cell: (row) => (
                    <a
                      className="link-button"
                      href={`#/estudiantes/${row.id}?${serialized}`}
                    >
                      Ver ficha e historial
                    </a>
                  ),
                },
              ]}
            />
            <Pagination
              after={after}
              nextCursor={data.nextCursor}
              count={data.items.length}
              disabled={loading}
              onChange={(cursor) => {
                if (!loading) setAfter(cursor);
              }}
            />
          </div>
        </ListPanel>
      ) : (
        <>
          <a className="button" href={`#${back}`}>
            Volver a estudiantes
          </a>
          {loading ? (
            <Loading>Cargando estudiantes…</Loading>
          ) : error ? (
            <Feedback onRetry={reload}>{error}</Feedback>
          ) : id && student ? (
            <>
              <section className="panel student-profile">
                <header className="page-heading student-profile-heading">
                  <div>
                    <h2>
                      {text(student, "persona.nombres")}{" "}
                      {text(student, "persona.apellidoPaterno")}{" "}
                      {text(student, "persona.apellidoMaterno")}
                    </h2>
                    <p>
                      {text(student, "codigo_estudiante")} ·{" "}
                      {student.activo ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="actions">
                      {student.activo === true && (
                        <a
                          className="button primary"
                          href={`#/matriculas?estudianteId=${id}`}
                        >
                          Matricular estudiante
                        </a>
                      )}
                      <a
                        className="button"
                        href={`#/vouchers?estudianteId=${id}`}
                      >
                        Vouchers
                      </a>
                      <Button onClick={() => edit(true)}>
                        Editar estudiante
                      </Button>
                    </div>
                  )}
                </header>
                <div className="student-profile-facts">
                  <Facts
                    emptyLabel="Sin registrar"
                    items={[
                      [
                        "Documento",
                        `${text(student, "persona.tipoDocumento")} ${text(student, "persona.numeroDocumento")}`,
                      ],
                      ["Registro", text(student, "fecha_registro")],
                      ...(canEdit
                        ? ([
                            ["Teléfono", text(student, "persona.telefono")],
                            ["Correo", text(student, "persona.correo")],
                            ["Dirección", text(student, "persona.direccion")],
                            [
                              "Nacimiento",
                              text(student, "persona.fechaNacimiento"),
                            ],
                          ] as const)
                        : []),
                    ]}
                  />
                </div>
              </section>
              <StudentHistory id={id} canResume={canEdit} />
            </>
          ) : null}
        </>
      )}

      {editing && student && (
        <RecordForm
          resource={studentResource}
          row={student}
          lookups={{}}
          onClose={() => edit(false)}
          onSave={async (body) => {
            await api(`estudiantes/${id}`, { method: "PATCH", body });
            edit(false);
            notify("Cambios guardados; el historial se conserva.");
            reload();
          }}
        />
      )}
    </section>
  );
}
