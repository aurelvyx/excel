import { ListPanel } from "../../shared/ui/ListPanel";
import { InputField, SelectField } from "../../shared/ui/Field";
import { Feedback } from "../../shared/ui/Feedback";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { Button } from "../../shared/ui/Button";
import {
  PageHeader,
  StatCard,
  StatCardGrid,
  StatusBadge,
} from "../../components/shared";
import { useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Globe,
  KeyRound,
  Layers,
  Pencil,
  Plus,
  School,
  Search,
  ShieldCheck,
  Tag,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  allRows,
  api,
  errorText,
  text,
  type Page,
  type Row,
} from "../../shared/api";
import { useAuth } from "../auth/session";
import { navigate } from "../../shared/navigation";
import { Dialog } from "../../shared/Dialog";
import { RecordForm } from "./RecordForm";
import { Assignments } from "./assignments";
import { GroupActions } from "./GroupActions";
import {
  fieldValue,
  labels,
  optionLabel,
  resources,
  rolesResource,
  roleNames,
  type Resource,
} from "./model";
import "./catalog.css";

/** Columnas con códigos, fechas u horas: tipografía monoespaciada tabular. */
const monoColumns = new Set([
  "codigo",
  "codigoDocente",
  "nombreUsuario",
  "fechaInicio",
  "fechaFin",
  "horaInicio",
  "horaFin",
  "orden",
  "creditos",
]);
const strongColumns = new Set(["nombre", "nombres", "nombreUsuario"]);
const iconProps = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

function resourceIcon(key: string) {
  switch (key) {
    case "docentes":
      return <Users size={22} strokeWidth={1.75} />;
    case "usuarios":
      return <ShieldCheck size={22} strokeWidth={1.75} />;
    case "periodos":
      return <Calendar size={22} strokeWidth={1.75} />;
    case "turnos":
      return <Clock size={22} strokeWidth={1.75} />;
    case "idiomas":
      return <Globe size={22} strokeWidth={1.75} />;
    case "niveles":
      return <Layers size={22} strokeWidth={1.75} />;
    case "unidades":
      return <BookOpen size={22} strokeWidth={1.75} />;
    case "secciones":
      return <Tag size={22} strokeWidth={1.75} />;
    default:
      return <School size={22} strokeWidth={1.75} />;
  }
}

function rowInitials(a: string, b = ""): string {
  const first = a.trim().charAt(0).toUpperCase();
  const second = b.trim().charAt(0).toUpperCase();
  return `${first}${second}` || a.slice(0, 2).toUpperCase() || "EX";
}

export function ResourcePage({
  resource,
  query,
  path,
}: {
  resource: Resource;
  query: URLSearchParams;
  path: string;
}) {
  const { session } = useAuth();
  const admin = session.user.roles.includes("ADMIN");
  const teacherOnly = session.user.roles.every((role) => role === "DOCENTE");
  const [data, setData] = useState<Page>({ items: [], nextCursor: null });
  const [lookups, setLookups] = useState<Record<string, Row[]>>({});
  const [completed, finish] = useState("");
  const [error, fail] = useState("");
  const [success, notify] = useState("");
  const [version, reload] = useState(0);
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [roleUser, setRoleUser] = useState<Row | null>(null);
  const [assigned, setAssigned] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [opening, setOpening] = useState(false);
  const serialized = query.toString();
  const returnTo = `${path}${serialized ? `?${serialized}` : ""}`;
  const requestKey = `${resource.key}:${serialized}:${version}:${admin}:${teacherOnly}`;
  const loading = completed !== requestKey;
  useEffect(() => {
    const abort = new AbortController();
    const references = new Set(
      [...resource.fields, ...(resource.filters ?? [])]
        .map((field) => field.reference)
        .filter((key): key is string => !!key),
    );
    if (references.has("niveles")) references.add("idiomas");
    if (resource.key === "grupos" && admin) references.add("docentes");
    if (teacherOnly) references.clear();
    const lookupRequests = [...references].map(async (key) => {
      const rows = await allRows(
        key === "personas-docentes" ? "docentes" : resources[key].path,
        abort.signal,
      );
      return [
        key,
        key === "personas-docentes"
          ? rows.map((row) => ({ ...row, id: String(row.persona_id) }))
          : rows,
      ] as const;
    });
    void Promise.all([
      api<Page>(`${resource.path}?limit=20&${serialized}`, {
        signal: abort.signal,
      }),
      Promise.all(lookupRequests),
    ])
      .then(([page, options]) => {
        if (!abort.signal.aborted) {
          fail("");
          setData(page);
          setLookups(Object.fromEntries(options));
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) fail(errorText(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) finish(requestKey);
      });
    return () => abort.abort();
  }, [resource, serialized, version, admin, teacherOnly, requestKey]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(serialized);
    next.delete("after");
    if (value) next.set(key, value);
    else next.delete(key);
    navigate(`${path}?${next}`);
  }
  async function open(row: Row) {
    setOpening(true);
    fail("");
    try {
      setEditing(
        resource.key === "usuarios"
          ? row
          : await api<Row>(`${resource.path}/${row.id}`),
      );
    } catch (e) {
      fail(errorText(e));
    } finally {
      setOpening(false);
    }
  }
  const saved = () => {
    setEditing(undefined);
    setRoleUser(null);
    notify("Cambios guardados.");
    reload((value) => value + 1);
  };
  function cell(row: Row, key: string) {
    if (key === "roles")
      return (row.roles as string[]).map((role) => roleNames[role]).join(", ");
    if (resource.key === "grupos") {
      const context = (row.contexto ?? {}) as Record<string, unknown>;
      if (key === "nivelId")
        return text(context, "nivel") || text(row, "nivel_id");
      if (key === "seccionId")
        return text(context, "seccion") || text(row, "seccion_id");
      if (key === "matriculados") {
        const count = Number(row.matriculados) || 0;
        const capacity = Number(row.capacidad) || 0;
        return (
          <span className="group-student-count">
            <strong>{count}</strong>
            {capacity > 0 && <small>/ {capacity}</small>}
          </span>
        );
      }
    }
    const field = resource.fields.find((field) => field.key === key);
    const value = field ? fieldValue(field, row) : text(row, key);
    if (field?.reference) {
      const option = lookups[field.reference]?.find(
        (item) => String(item.id) === value,
      );
      if (option) return optionLabel(option, field.reference, lookups);
      const context = (row.contexto ?? {}) as Record<string, unknown>;
      return text(context, key.replace("Id", "")) || `#${value}`;
    }
    return labels[value] ?? (value || "—");
  }
  const category =
    resource.key === "grupos"
      ? "Gestión de clases"
      : ["periodos", "turnos"].includes(resource.key)
        ? "Preparación de ciclo"
        : resource.key === "secciones"
          ? "Gestión de clases"
          : ["idiomas", "niveles", "unidades"].includes(resource.key)
          ? "Oferta académica"
          : "Administración";
  const eyebrow = teacherOnly
    ? "Mi espacio docente"
    : admin
      ? category
      : `${category} · Consulta`;
  const catalogBase = path.startsWith("/configuracion/")
    ? "/configuracion"
    : "/consulta";

  const familyTabs = teacherOnly
    ? []
    : ["idiomas", "niveles", "unidades"].includes(resource.key)
      ? [
          { key: "idiomas", label: "Idiomas", href: `#${catalogBase}/idiomas` },
          { key: "niveles", label: "Niveles", href: `#${catalogBase}/niveles` },
          {
            key: "unidades",
            label: "Unidades didácticas",
            href: `#${catalogBase}/unidades`,
          },
        ]
      : ["periodos", "turnos", "secciones"].includes(resource.key)
        ? [
            {
              key: "periodos",
              label: "Periodos académicos",
              href: `#${catalogBase}/periodos`,
            },
            {
              key: "turnos",
              label: "Turnos y horarios",
              href: `#${catalogBase}/turnos`,
            },
            {
              key: "secciones",
              label: "Etiquetas de sección",
              href: `#${catalogBase}/secciones`,
            },
          ]
        : admin && ["docentes", "usuarios"].includes(resource.key)
          ? [
              {
                key: "docentes",
                label: "Plana docente",
                href: `#${catalogBase}/docentes`,
              },
              {
                key: "usuarios",
                label: "Usuarios y roles",
                href: `#${catalogBase}/usuarios`,
              },
            ]
          : [];

  const activeCount = data.items.filter(
    (row) =>
      row.activo === true ||
      row.estado === "ACTIVO" ||
      row.estado === "ABIERTO",
  ).length;
  const inactiveCount = data.items.length - activeCount;

  return (
    <section className="ds-page catalog-page">
      <PageHeader
        variant="hero"
        icon={resourceIcon(resource.key)}
        eyebrow={eyebrow}
        statusPill={admin ? "Configuración Institucional" : "Consulta Autorizada"}
        title={teacherOnly ? "Mis grupos" : resource.title}
        description={
          teacherOnly
            ? "Consulta los grupos que tienes asignados."
            : resource.description
        }
        subnavTabs={familyTabs.map((tab) => ({
          ...tab,
          active: resource.key === tab.key,
        }))}
        subnavMeta={
          !loading && (
            <span>
              Registros en vista: <strong>{data.items.length}</strong>
            </span>
          )
        }
        actions={
          admin && (
            <Button
              variant="primary"
              disabled={loading || opening || !!error}
              onClick={() => {
                notify("");
                setEditing(null);
              }}
            >
              <Plus {...iconProps} />
              Crear {resource.singular}
            </Button>
          )
        }
      />

      {!teacherOnly && (
        <StatCardGrid label={`Resumen de ${resource.title.toLowerCase()}`}>
          <StatCard
            label="Registros en Vista"
            value={loading ? "…" : data.items.length}
            sublabel={`Catálogo de ${resource.title.toLowerCase()}`}
            icon={<Layers size={18} strokeWidth={1.75} />}
            tone="emerald"
          />
          <StatCard
            label="Activos / Vigentes"
            value={loading ? "…" : activeCount}
            sublabel="Disponibles para operación"
            icon={<CheckCircle2 size={18} strokeWidth={1.75} />}
            tone="blue"
          />
          <StatCard
            label="Inactivos / Otros"
            value={loading ? "…" : inactiveCount}
            sublabel="Históricos o planificados"
            icon={<Archive size={18} strokeWidth={1.75} />}
            tone="slate"
          />
        </StatCardGrid>
      )}
      {admin && resource.key === "grupos" && (
        <section className="group-setup-guide" aria-labelledby="group-setup-title">
          <div className="group-setup-intro">
            <p className="eyebrow">Preparación de una clase</p>
            <h2 id="group-setup-title">Configura lo necesario y luego crea el grupo</h2>
            <p>
              No tienes que repetir la configuración en cada periodo. Abre solo
              los catálogos que todavía necesites completar.
            </p>
          </div>
          <div className="group-setup-steps">
            <article className="group-setup-step">
              <span className="group-setup-number">1</span>
              <div>
                <h3>Oferta académica</h3>
                <p>Idioma → nivel → unidades didácticas.</p>
                <div className="group-setup-links">
                  <a href={`#${catalogBase}/idiomas`}>Idiomas</a>
                  <a href={`#${catalogBase}/niveles`}>Niveles</a>
                  <a href={`#${catalogBase}/unidades`}>Unidades</a>
                </div>
              </div>
            </article>
            <article className="group-setup-step">
              <span className="group-setup-number">2</span>
              <div>
                <h3>Periodo y horario</h3>
                <p>Elige el ciclo académico y sus turnos disponibles.</p>
                <div className="group-setup-links">
                  <a href={`#${catalogBase}/periodos`}>Periodos</a>
                  <a href={`#${catalogBase}/turnos`}>Turnos</a>
                </div>
              </div>
            </article>
            <article className="group-setup-step">
              <span className="group-setup-number">3</span>
              <div>
                <h3>Sección solo para paralelos</h3>
                <p>
                  A/B distingue dos clases del mismo nivel y turno. Si solo hay
                  una clase, usa la etiqueta de grupo único.
                </p>
                <div className="group-setup-links">
                  <a href={`#${catalogBase}/secciones`}>Administrar etiquetas A/B</a>
                </div>
              </div>
            </article>
          </div>
          <p className="group-setup-next">
            <span aria-hidden="true">↳</span> Cuando esté listo, usa <strong>Crear grupo</strong> arriba para combinar esta información.
          </p>
        </section>
      )}
      {!admin && (
        <p className="readonly">
          Solo lectura ·{" "}
          {teacherOnly
            ? "Grupos asignados a tu cuenta"
            : "Consulta autorizada para tu rol"}
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      <ListPanel
        filters={
          !teacherOnly &&
          !!resource.filters?.length && (
            <form
              className="filters"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const next = new URLSearchParams();
                for (const [key, value] of data)
                  if (value) next.set(key, String(value));
                navigate(`${path}?${next}`);
              }}
            >
              {resource.filters.map((field) =>
                field.reference || field.options ? (
                  <SelectField
                    key={field.key}
                    label={field.label}
                    id={`filter-${field.key}`}
                    name={field.key}
                    value={query.get(field.key) ?? ""}
                    onChange={(event) => filter(field.key, event.target.value)}
                    disabled={loading}
                  >
                    <option value="">Todos</option>
                    {field.reference
                      ? (lookups[field.reference] ?? []).map((row) => (
                          <option key={row.id} value={row.id}>
                            {optionLabel(row, field.reference!, lookups)}
                          </option>
                        ))
                      : field.options?.map((value) => (
                          <option key={value} value={value}>
                            {labels[value] ?? value}
                          </option>
                        ))}
                  </SelectField>
                ) : (
                  <InputField
                    label={field.label}
                    key={`${field.key}:${serialized}`}
                    id={`filter-${field.key}`}
                    name={field.key}
                    defaultValue={query.get(field.key) ?? ""}
                    maxLength={field.max}
                  />
                ),
              )}
              {resource.filters.some(
                (field) => !field.reference && !field.options,
              ) && (
                <Button type="submit" disabled={loading}>
                  <Search {...iconProps} />
                  Buscar
                </Button>
              )}
              <Button
                type="button"
                onClick={() => navigate(path)}
                disabled={loading || !serialized}
              >
                <X {...iconProps} />
                Limpiar filtros
              </Button>
            </form>
          )
        }
        loading={loading}
        loadingLabel={`Cargando ${resource.title.toLowerCase()}…`}
        error={error}
        onRetry={() => reload((value) => value + 1)}
        empty={!data.items.length}
        emptyDescription={
          serialized
            ? "Prueba con otros filtros."
            : admin
              ? `Crea el primer registro de ${resource.title.toLowerCase()} para comenzar.`
              : "Todavía no hay registros disponibles para tu cuenta."
        }
        pagination={
          <Pagination
            count={data.items.length}
            after={query.get("after")}
            nextCursor={data.nextCursor}
            onChange={(cursor) => filter("after", cursor)}
          />
        }
      >
        <div className="catalog-table-statusbar">
          <div className="catalog-status-counts">
            <span>Total página: {data.items.length}</span>
            <span className="catalog-status-dot active">
              Activos / Abiertos: {activeCount}
            </span>
            {inactiveCount > 0 && (
              <span className="catalog-status-dot">
                Otros / Inactivos: {inactiveCount}
              </span>
            )}
          </div>
          <span>Catálogo institucional · {resource.title}</span>
        </div>
        <div className={resource.key === "grupos" ? "group-catalog-table" : undefined}>
        <DataTable
          caption={resource.title}
          rows={data.items}
          rowKey={(row) => row.id}
          columns={[
            ...resource.columns.map((key) => ({
              key,
              className: monoColumns.has(key)
                ? "cell-mono"
                : strongColumns.has(key)
                  ? "cell-strong"
                  : undefined,
              header:
                (resource.key === "grupos"
                  ? ({
                      nivelId: "Programa académico",
                      seccionId: "Sección",
                      matriculados: "Alumnos",
                    } as Record<string, string>)[key]
                  : undefined) ??
                resource.fields.find((field) => field.key === key)?.label ??
                (
                  {
                    nombres: "Nombres",
                    apellido_paterno: "Apellido paterno",
                    roles: "Roles",
                  } as Record<string, string>
                )[key] ??
                key,
              cell: (row: Row) => {
                if (key === "activo" || key === "estado") {
                  return (
                    <StatusBadge
                      inactive={
                        row.activo === false ||
                        row.estado === "CERRADO" ||
                        (resource.key === "grupos" && row.estado !== "ACTIVO")
                      }
                    >
                      {cell(row, key)}
                    </StatusBadge>
                  );
                }
                if (key === "codigo" || key === "codigoDocente") {
                  return <span className="ds-code-pill">{cell(row, key)}</span>;
                }
                if (resource.key === "docentes" && key === "nombres") {
                  return (
                    <div className="ds-avatar-cell">
                      <div className="ds-avatar" aria-hidden="true">
                        {rowInitials(
                          text(row, "nombres"),
                          text(row, "apellido_paterno"),
                        )}
                      </div>
                      <span>{cell(row, key)}</span>
                    </div>
                  );
                }
                if (resource.key === "usuarios" && key === "nombreUsuario") {
                  return (
                    <div className="ds-avatar-cell">
                      <div className="ds-avatar" aria-hidden="true">
                        {rowInitials(text(row, "nombre_usuario"))}
                      </div>
                      <span style={{ fontFamily: "var(--ds-mono)" }}>
                        {cell(row, key)}
                      </span>
                    </div>
                  );
                }
                if (resource.key === "usuarios" && key === "roles") {
                  const userRoles = (row.roles as string[]) ?? [];
                  return (
                    <div className="catalog-role-chips">
                      {userRoles.map((r) => (
                        <span key={r} className={`catalog-role-chip ${r}`}>
                          {roleNames[r] ?? r}
                        </span>
                      ))}
                    </div>
                  );
                }
                return cell(row, key);
              },
            })),
            {
              key: "actions",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <>
                  {resource.key === "grupos" && (
                    <GroupActions id={row.id} returnTo={returnTo} />
                  )}
                  {admin && resource.key === "grupos" ? (
                    <details className="group-admin-actions">
                      <summary>Administrar</summary>
                      <div>
                        <Button
                          variant="link"
                          disabled={opening}
                          onClick={() => void open(row)}
                        >
                          <Pencil {...iconProps} />
                          Editar grupo
                        </Button>
                        <Button
                          variant="link"
                          onClick={() => setAssigned(row)}
                        >
                          <UserPlus {...iconProps} />
                          Asignar docentes
                        </Button>
                      </div>
                    </details>
                  ) : admin ? (
                    <>
                      <Button
                        variant="link"
                        disabled={opening}
                        onClick={() => void open(row)}
                      >
                        <Pencil {...iconProps} />
                        Editar
                      </Button>
                      {resource.key === "usuarios" && (
                        <Button variant="link" onClick={() => setRoleUser(row)}>
                          <KeyRound {...iconProps} />
                          Roles
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button variant="link" onClick={() => setDetail(row)}>
                      <Eye {...iconProps} />
                      Ver detalle
                    </Button>
                  )}
                </>
              ),
            },
          ]}
        />
        </div>
      </ListPanel>
      {editing !== undefined && (
        <RecordForm
          resource={resource}
          row={editing ?? undefined}
          lookups={lookups}
          onClose={() => setEditing(undefined)}
          onSave={async (body) => {
            const docenteId = body.docenteId as string | undefined;
            const payload = { ...body };
            delete payload.docenteId;
            delete payload.idiomaId;
            const res = await api<Row>(
              resource.path + (editing ? `/${editing.id}` : ""),
              {
                method: editing ? "PATCH" : "POST",
                body: payload,
              },
            );
            if (resource.key === "grupos" && !editing && docenteId && res?.id) {
              const today = new Date().toISOString().slice(0, 10);
              await api(`oferta/grupos/${res.id}/docentes/${docenteId}`, {
                method: "PUT",
                body: {
                  esTitular: true,
                  fechaAsignacion: today,
                  activo: true,
                  motivo:
                    "Asignación inicial de docente titular al crear el grupo",
                },
              });
            }
            saved();
          }}
        />
      )}
      {roleUser && (
        <RecordForm
          resource={rolesResource}
          row={roleUser}
          lookups={{}}
          onClose={() => setRoleUser(null)}
          onSave={async (body) => {
            await api(`usuarios/${roleUser.id}/roles`, { method: "PUT", body });
            saved();
          }}
        />
      )}
      {assigned && (
        <Assignments
          group={assigned}
          teachers={lookups.docentes ?? []}
          onClose={() => setAssigned(null)}
        />
      )}
      {detail && (
        <Dialog
          title={text(detail, "codigo") || resource.title}
          onClose={() => setDetail(null)}
        >
          <p className="readonly">Solo lectura</p>
          <dl className="detail">
            {resource.fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{cell(detail, field.key)}</dd>
              </div>
            ))}
          </dl>
        </Dialog>
      )}
    </section>
  );
}
