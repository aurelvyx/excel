import { ListPanel } from "../../shared/ui/ListPanel";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Pagination } from "../../shared/ui/Pagination";
import { DataTable } from "../../shared/ui/DataTable";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import {
  PageHeader,
  StatCard,
  StatCardGrid,
  StatusBadge,
} from "../../components/shared";
import { useState, type FormEvent } from "react";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Eye,
  GraduationCap,
  Pencil,
  Receipt,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  api,
  errorText,
  text,
  type Page,
  type Row,
} from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useAuth } from "../auth/session";
import { RecordForm } from "../configuration/RecordForm";
import { studentResource } from "./model";
import { StudentHistory } from "./StudentHistory";
import "./students.css";

const iconProps = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

function studentInitials(nombres: string, paterno: string): string {
  const a = nombres.trim().charAt(0).toUpperCase();
  const b = paterno.trim().charAt(0).toUpperCase();
  return `${a}${b}` || "ES";
}

export function StudentsPage({
  id,
  query,
  academicProfileMode = false,
}: {
  id?: string;
  query: URLSearchParams;
  academicProfileMode?: boolean;
}) {
  const { session } = useAuth();
  const canEdit = session.user.roles.some(
    (r) => r === "ADMIN" || r === "SECRETARIA",
  );
  const [success, notify] = useState("");
  const [actionError, failAction] = useState("");
  const [editing, edit] = useState(false);
  const [listEditingRow, setListEditingRow] = useState<Row | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [after, setAfter] = useState(query.get("after") ?? "");
  const serialized = query.toString();
  const pageQuery = new URLSearchParams(serialized);
  pageQuery.set("limit", "15");
  if (after) pageQuery.set("after", after);
  else pageQuery.delete("after");

  const {
    data: loaded,
    loading,
    error: queryError,
    reload,
  } = useApiQuery<Row | Page>(
    id ? `estudiantes/${id}` : `estudiantes?${pageQuery}`,
  );
  const error = queryError || actionError;
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

  function filterByStatus(nextStatus: string) {
    const next = new URLSearchParams(serialized);
    next.delete("after");
    if (nextStatus) next.set("activo", nextStatus);
    else next.delete("activo");
    setAfter("");
    navigate(`/estudiantes?${next}`);
  }

  async function openEditFromList(rowId: string | number) {
    const key = String(rowId);
    setOpeningId(key);
    failAction("");
    notify("");
    try {
      const fullStudent = await api<Row>(`estudiantes/${key}`);
      setListEditingRow(fullStudent);
    } catch (e) {
      failAction(errorText(e));
    } finally {
      setOpeningId(null);
    }
  }

  const activeCount = data.items.filter((row) => row.activo !== false).length;
  const inactiveCount = data.items.length - activeCount;
  const rawReturn = query.get("retorno");
  const safeReturn =
    rawReturn &&
    rawReturn.startsWith("/") &&
    !rawReturn.startsWith("//") &&
    !/[\\\s]/.test(rawReturn)
      ? rawReturn
      : null;
  const back = `/estudiantes${serialized ? `?${serialized}` : ""}`;
  const backHref = safeReturn ? `#${safeReturn}` : `#${back}`;
  const backLabel = safeReturn
    ? safeReturn.startsWith("/salones/")
      ? "Volver al Salón"
      : "Volver a Gestión Académica"
    : "Volver a estudiantes";
  const statusParam = query.get("activo") ?? "";

  return (
    <section className="ds-page catalog-page student-page">
      <PageHeader
        variant="hero"
        icon={<GraduationCap size={22} strokeWidth={1.75} />}
        eyebrow={
          academicProfileMode
            ? "Gestión Académica · Solo Lectura"
            : canEdit
              ? "Gestión Académica · Padrón"
              : "Consulta Académica"
        }
        statusPill={
          academicProfileMode
            ? "Ficha Académica Consolidada"
            : "Identidad Única · Historial por Intento"
        }
        title={
          academicProfileMode
            ? "Ficha Académica del Estudiante"
            : id
              ? "Ficha del estudiante"
              : "Estudiantes"
        }
        description={
          academicProfileMode
            ? "Resumen integral de solo lectura: datos personales, historial de matrículas, promedios por unidad didáctica y asistencias acumuladas."
            : id
              ? "Consulta o actualiza los datos personales del estudiante y revisa el detalle de cada intento académico."
              : "Identidad única e historial separado por cada intento."
        }
        subnavTabs={
          academicProfileMode
            ? undefined
            : [
                {
                  key: "estudiantes",
                  label: "Padrón de estudiantes",
                  href: "#/estudiantes",
                  active: true,
                },
                {
                  key: "matriculas",
                  label: "Gestión de matrículas",
                  href: "#/matriculas",
                },
                ...(canEdit
                  ? [
                      {
                        key: "vouchers",
                        label: "Comprobantes de pago (Vouchers)",
                        href: "#/vouchers",
                      },
                    ]
                  : []),
              ]
        }
        subnavMeta={
          !id && !loading ? (
            <span>
              En esta página: <strong>{data.items.length}</strong>
            </span>
          ) : undefined
        }
        actions={
          !id &&
          canEdit && (
            <a className="button primary" href="#/matriculas/nueva">
              <GraduationCap {...iconProps} />
              Nueva matrícula
            </a>
          )
        }
      />

      {!id && (
        <StatCardGrid label="Indicadores del padrón de estudiantes">
          <StatCard
            label="Estudiantes en Página"
            value={loading ? "…" : data.items.length}
            sublabel="Registros visibles en el padrón"
            icon={<Users size={18} strokeWidth={1.75} />}
            tone="emerald"
            active={statusParam === ""}
            onClick={() => filterByStatus("")}
          />
          <StatCard
            label="Perfiles Activos"
            value={loading ? "…" : activeCount}
            sublabel="Habilitados para matrícula"
            icon={<CheckCircle2 size={18} strokeWidth={1.75} />}
            tone="blue"
            active={statusParam === "true"}
            onClick={() =>
              filterByStatus(statusParam === "true" ? "" : "true")
            }
          />
          <StatCard
            label="Inactivos / Histórico"
            value={loading ? "…" : inactiveCount}
            sublabel="Registros suspendidos"
            icon={<Archive size={18} strokeWidth={1.75} />}
            tone="slate"
            active={statusParam === "false"}
            onClick={() =>
              filterByStatus(statusParam === "false" ? "" : "false")
            }
          />
        </StatCardGrid>
      )}

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
                placeholder="Ej. 70150000, EST-2025 o apellido…"
                maxLength={120}
                defaultValue={query.get("q") ?? ""}
              />
              <SelectField
                label="Estado"
                id="student-active"
                name="activo"
                value={query.get("activo") ?? ""}
                onChange={(event) => filterByStatus(event.target.value)}
              >
                <option value="">Todos</option>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </SelectField>
              <Button type="submit" disabled={loading}>
                <Search {...iconProps} />
                Buscar
              </Button>
              <Button
                disabled={loading || !serialized}
                onClick={() => {
                  setAfter("");
                  navigate("/estudiantes");
                }}
              >
                <X {...iconProps} />
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
          <div className="catalog-table-statusbar">
            <div className="catalog-status-counts">
              <span>Registros en página: {data.items.length}</span>
              <span className="catalog-status-dot active">
                Activos: {activeCount}
              </span>
              {inactiveCount > 0 && (
                <span className="catalog-status-dot">
                  Inactivos: {inactiveCount}
                </span>
              )}
            </div>
            <span>
              {canEdit
                ? "Usa «Editar datos» para actualizar nombre, teléfono, correo o dirección"
                : "Padrón general de estudiantes"}
            </span>
          </div>

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
                  className: "cell-mono",
                  cell: (row) => (
                    <span className="ds-code-pill">
                      {text(row, "codigo_estudiante")}
                    </span>
                  ),
                },
                {
                  key: "estudiante",
                  header: "Estudiante",
                  className: "cell-strong",
                  cell: (row) => {
                    const nombres = text(row, "nombres");
                    const paterno = text(row, "apellido_paterno");
                    const materno = text(row, "apellido_materno");
                    return (
                      <div className="ds-avatar-cell">
                        <div className="ds-avatar" aria-hidden="true">
                          {studentInitials(nombres, paterno)}
                        </div>
                        <span>
                          {`${nombres} ${paterno} ${materno}`.trim()}
                        </span>
                      </div>
                    );
                  },
                },
                {
                  key: "documento",
                  header: "Documento",
                  className: "cell-mono",
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
                    <>
                      {canEdit && (
                        <Button
                          variant="link"
                          disabled={openingId === String(row.id)}
                          onClick={() => void openEditFromList(row.id)}
                        >
                          <Pencil {...iconProps} />
                          {openingId === String(row.id)
                            ? "Abriendo…"
                            : "Editar datos"}
                        </Button>
                      )}
                      <a
                        className="link-button"
                        href={`#/estudiantes/${row.id}${serialized ? `?${serialized}` : ""}`}
                      >
                        <Eye {...iconProps} />
                        Ver ficha e historial
                      </a>
                    </>
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
          <div className="student-back-bar">
            <a className="student-back-btn" href={backHref}>
              <ArrowLeft {...iconProps} />
              {backLabel}
            </a>
          </div>
          {loading ? (
            <Loading>Cargando estudiantes…</Loading>
          ) : error ? (
            <Feedback onRetry={reload}>{error}</Feedback>
          ) : id && student ? (
            <>
              <section className="panel student-profile">
                <header className="page-heading student-profile-heading">
                  <div className="student-identity-main">
                    <div className="student-monogram" aria-hidden="true">
                      {studentInitials(
                        text(student, "persona.nombres"),
                        text(student, "persona.apellidoPaterno"),
                      )}
                    </div>
                    <div className="student-identity-text">
                      <h2>
                        {text(student, "persona.nombres")}{" "}
                        {text(student, "persona.apellidoPaterno")}{" "}
                        {text(student, "persona.apellidoMaterno")}
                      </h2>
                      <div className="student-identity-meta">
                        <span className="student-code-pill">
                          {text(student, "codigo_estudiante")}
                        </span>
                        <StatusBadge inactive={!student.activo}>
                          {student.activo ? "Activo" : "Inactivo"}
                        </StatusBadge>
                        <span>
                          · {text(student, "persona.tipoDocumento")}{" "}
                          {text(student, "persona.numeroDocumento")}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="actions">
                      <Button
                        className="student-edit-trigger"
                        onClick={() => {
                          notify("");
                          edit(true);
                        }}
                      >
                        <Pencil {...iconProps} />
                        Editar estudiante
                      </Button>
                      <a
                        className="button"
                        href={`#/vouchers?estudianteId=${id}`}
                      >
                        <Receipt {...iconProps} />
                        Vouchers
                      </a>
                      {!academicProfileMode && student.activo === true && (
                        <a
                          className="button primary"
                          href={`#/matriculas?estudianteId=${id}`}
                        >
                          <GraduationCap {...iconProps} />
                          Matricular estudiante
                        </a>
                      )}
                    </div>
                  )}
                </header>
                <div className="student-profile-facts">
                  <div className="student-facts-bar">
                    <span>
                      Datos personales y de contacto registrados en el centro
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        className="student-inline-edit-link"
                        onClick={() => {
                          notify("");
                          edit(true);
                        }}
                      >
                        Modificar nombres, teléfono, correo o dirección →
                      </button>
                    )}
                  </div>
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
              <StudentHistory
                id={id}
                canResume={canEdit && !academicProfileMode}
                autoExpandFirst={academicProfileMode}
              />
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

      {listEditingRow && (
        <RecordForm
          resource={studentResource}
          row={listEditingRow}
          lookups={{}}
          onClose={() => setListEditingRow(null)}
          onSave={async (body) => {
            await api(`estudiantes/${listEditingRow.id}`, {
              method: "PATCH",
              body,
            });
            setListEditingRow(null);
            notify("Datos del estudiante actualizados correctamente.");
            reload();
          }}
        />
      )}
    </section>
  );
}
