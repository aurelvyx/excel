import { useEffect, useState, type FormEvent } from "react";
import { api, errorText, text, type Page, type Row } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { Dialog } from "../../shared/Dialog";
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
  const [data, setData] = useState<Page>({ items: [], nextCursor: null });
  const [student, setStudent] = useState<Row | null>(null);
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  const [version, reload] = useState(0);
  const [completed, finish] = useState("");
  const [editing, edit] = useState(false);
  const [creating, create] = useState(false);
  const serialized = query.toString();
  const key = `${id ?? ""}:${serialized}:${version}`;
  const loading = completed !== key;
  useEffect(() => {
    const abort = new AbortController();
    const request = id
      ? api<Row>(`estudiantes/${id}`, { signal: abort.signal }).then(setStudent)
      : api<Page>(`estudiantes?limit=20&${serialized}`, {
          signal: abort.signal,
        }).then(setData);
    void request
      .then(() => {
        if (!abort.signal.aborted) fail("");
      })
      .catch((e) => {
        if (!abort.signal.aborted) fail(errorText(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) finish(key);
      });
    return () => abort.abort();
  }, [id, serialized, version, key]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const k of ["q", "activo"]) {
      const v = String(form.get(k) ?? "").trim();
      if (v) next.set(k, v);
    }
    navigate(`/estudiantes?${next}`);
  }
  const back = `/estudiantes?${serialized}`;
  return (
    <section className="student-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            Gestión académica ·{" "}
            {canEdit ? "Registro y consulta" : "Solo lectura"}
          </p>
          <h1>{id ? "Ficha del estudiante" : "Estudiantes"}</h1>
          <p className="muted">
            Identidad única e historial separado por cada intento.
          </p>
        </div>
        {canEdit && !id && (
          <button className="primary" onClick={() => create(true)}>
            Registrar estudiante
          </button>
        )}
      </header>
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      {id ? (
        <a className="button" href={`#${back}`}>
          Volver a estudiantes
        </a>
      ) : (
        <form className="filters panel" key={serialized} onSubmit={search}>
          <div>
            <label htmlFor="student-search">Documento, código o nombre</label>
            <input
              id="student-search"
              name="q"
              maxLength={120}
              defaultValue={query.get("q") ?? ""}
            />
          </div>
          <div>
            <label htmlFor="student-active">Estado</label>
            <select
              id="student-active"
              name="activo"
              defaultValue={query.get("activo") ?? ""}
            >
              <option value="">Todos</option>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
          <button className="primary">Buscar</button>
          <a href="#/estudiantes">Limpiar</a>
        </form>
      )}
      {loading ? (
        <p role="status">Cargando estudiantes…</p>
      ) : error ? (
        <div className="error" role="alert">
          {error}{" "}
          <button onClick={() => reload((v) => v + 1)}>Reintentar</button>
        </div>
      ) : id && student ? (
        <>
          <section className="panel">
            <header className="page-heading">
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
                <button onClick={() => edit(true)}>Editar estudiante</button>
              )}
            </header>
            <dl className="student-facts">
              {[
                [
                  "Documento",
                  `${text(student, "persona.tipoDocumento")} ${text(student, "persona.numeroDocumento")}`,
                ],
                ["Registro", text(student, "fecha_registro")],
                ...(canEdit
                  ? [
                      ["Teléfono", text(student, "persona.telefono")],
                      ["Correo", text(student, "persona.correo")],
                      ["Dirección", text(student, "persona.direccion")],
                      ["Nacimiento", text(student, "persona.fechaNacimiento")],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "Sin registrar"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <StudentHistory id={id} />
        </>
      ) : (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Estudiantes registrados</caption>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Estudiante</th>
                  <th>Documento</th>
                  <th>Estado</th>
                  <th>Consulta</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    <td>{text(row, "codigo_estudiante")}</td>
                    <td>
                      {text(row, "nombres")} {text(row, "apellido_paterno")}{" "}
                      {text(row, "apellido_materno")}
                    </td>
                    <td>
                      {text(row, "tipo_documento")}{" "}
                      {text(row, "numero_documento")}
                    </td>
                    <td>{row.activo ? "Activo" : "Inactivo"}</td>
                    <td>
                      <a href={`#/estudiantes/${row.id}?${serialized}`}>
                        Ver ficha e historial
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <p className="empty">
              No hay estudiantes que coincidan con la búsqueda.
            </p>
          )}
          <div className="actions">
            {query.has("after") && (
              <button
                onClick={() => {
                  const next = new URLSearchParams(serialized);
                  next.delete("after");
                  navigate(`/estudiantes?${next}`);
                }}
              >
                Primera página
              </button>
            )}
            {data.nextCursor && (
              <button
                onClick={() => {
                  const next = new URLSearchParams(serialized);
                  next.set("after", data.nextCursor!);
                  navigate(`/estudiantes?${next}`);
                }}
              >
                Siguiente página
              </button>
            )}
          </div>
        </section>
      )}
      {creating && (
        <RegisterStudent
          onClose={() => create(false)}
          onSaved={(row) => {
            create(false);
            notify("Estudiante registrado.");
            navigate(`/estudiantes/${row.id}`);
          }}
        />
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
            reload((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}
function RegisterStudent({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (row: Row) => void;
}) {
  const [type, setType] = useState("");
  const [number, setNumber] = useState("");
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const [found, setFound] = useState<Row | null | undefined>(undefined);
  const [initial, setInitial] = useState<Row | null>(null);
  async function check(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    pending(true);
    fail("");
    setFound(undefined);
    try {
      const result = await api<{ registro: Row | null }>(
        `estudiantes/documento?${new URLSearchParams({ tipoDocumento: type.trim(), numeroDocumento: number.trim() })}`,
      );
      setFound(result.registro);
      if (!result.registro)
        setInitial({
          id: "",
          persona: {
            tipoDocumento: type.trim(),
            numeroDocumento: number.trim(),
          },
        });
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }
  if (initial) {
    const reuse = !!initial.personaId;
    const resource = reuse
      ? {
          ...studentResource,
          description: `Se vinculará a ${text(initial, "persona.nombres")} ${text(initial, "persona.apellidoPaterno")}, ${type} ${number}.`,
          fields: studentResource.fields.filter(
            (f) => !f.key.startsWith("persona."),
          ),
        }
      : studentResource;
    return (
      <RecordForm
        resource={resource}
        initial={initial}
        lookups={{}}
        onClose={onClose}
        onSave={async (body) => {
          const row = await api<Row>("estudiantes", {
            method: "POST",
            body: {
              ...body,
              ...(reuse ? { personaId: initial.personaId } : {}),
            },
          });
          onSaved(row);
        }}
      />
    );
  }
  return (
    <Dialog title="Comprobar documento" onClose={onClose} busy={busy}>
      <p>Busca primero para evitar duplicar la identidad de una persona.</p>
      <form onSubmit={check}>
        <div className="form-grid">
          <div>
            <label htmlFor="doc-type">Tipo de documento</label>
            <input
              id="doc-type"
              required
              maxLength={20}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setFound(undefined);
              }}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="doc-number">Número de documento</label>
            <input
              id="doc-number"
              required
              maxLength={25}
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setFound(undefined);
              }}
              disabled={busy}
            />
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Buscando…" : "Comprobar documento"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {found && (
        <div className="notice">
          <p>
            Persona registrada: {text(found, "persona.nombres")}{" "}
            {text(found, "persona.apellidoPaterno")}.
          </p>
          {found.estudiante_id ? (
            <>
              <p>
                Ya existe como estudiante: {text(found, "codigo_estudiante")}.
              </p>
              <button
                onClick={() => {
                  onClose();
                  navigate(`/estudiantes/${found.estudiante_id}`);
                }}
              >
                Abrir estudiante existente
              </button>
            </>
          ) : text(found, "persona.activo") === "false" ? (
            <p>
              La persona está inactiva. Solicita su revisión a administración.
            </p>
          ) : (
            <button
              onClick={() =>
                setInitial({
                  id: "",
                  personaId: text(found, "persona.id"),
                  persona: found.persona,
                })
              }
            >
              Usar esta persona
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}
