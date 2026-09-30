import { useState, type FormEvent } from "react";
import { api, errorText, text, type Row, type Page } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { PageHeading } from "../../shared/ui/PageHeading";
import { ListPanel } from "../../shared/ui/ListPanel";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Button } from "../../shared/ui/Button";
import { Feedback } from "../../shared/ui/Feedback";
import { InputField, SelectField } from "../../shared/ui/Field";
import { RecordForm } from "../configuration/RecordForm";
import { StudentPicker } from "../persons/StudentPicker";
import { VoucherDetail } from "./VoucherDetail";
import { voucherResource, voucherStates } from "./model";
export function VouchersPage({ query }: { query: URLSearchParams }) {
  const serialized = query.toString();
  const { data, loading, error, reload } = useApiQuery<Page>(
    `vouchers?limit=20&${serialized}`,
  );
  const [creating, create] = useState(false);
  const [student, select] = useState<Row | null>(null);
  const [detail, show] = useState<Row | null>(null);
  const [opening, pending] = useState(false);
  const [actionError, fail] = useState("");
  const [success, notify] = useState("");
  async function start() {
    notify("");
    fail("");
    pending(true);
    try {
      const id = query.get("estudianteId");
      if (id) {
        const row = await api<Row>(`estudiantes/${id}`);
        select({
          ...row,
          nombres: text(row, "persona.nombres"),
          apellido_paterno: text(row, "persona.apellido_paterno"),
        });
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
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    if (query.has("estudianteId"))
      next.set("estudianteId", query.get("estudianteId")!);
    for (const key of ["q", "estado"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    navigate(`/vouchers?${next}`);
  }
  return (
    <section>
      <PageHeading
        eyebrow="Gestión académica"
        title="Vouchers"
        description="Registra y revisa los comprobantes de pago presencial."
        action={
          <Button
            variant="primary"
            disabled={loading || opening || !!error}
            onClick={() => void start()}
          >
            Registrar voucher
          </Button>
        }
      />
      {query.has("estudianteId") && (
        <p className="notice">
          Vouchers del estudiante seleccionado.{" "}
          <a href={`#/estudiantes/${query.get("estudianteId")}`}>
            Volver a su ficha
          </a>
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      <Feedback>{actionError}</Feedback>
      <ListPanel
        loading={loading}
        loadingLabel="Cargando vouchers…"
        error={error}
        onRetry={reload}
        empty={!data?.items.length}
        emptyDescription={
          serialized
            ? "Prueba con otros filtros."
            : "Registra el primer voucher para comenzar."
        }
        filters={
          <form className="filters" key={serialized} onSubmit={search}>
            <InputField
              label="Número, estudiante o documento"
              name="q"
              maxLength={120}
              defaultValue={query.get("q") ?? ""}
            />
            <SelectField
              label="Estado"
              name="estado"
              defaultValue={query.get("estado") ?? ""}
            >
              <option value="">Todos</option>
              {Object.entries(voucherStates).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </SelectField>
            <Button type="submit" disabled={loading}>
              Buscar
            </Button>
            <Button
              disabled={loading || !serialized}
              onClick={() => navigate("/vouchers")}
            >
              Limpiar filtros
            </Button>
          </form>
        }
        pagination={
          <Pagination
            count={data?.items.length ?? 0}
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
        <DataTable
          caption="Vouchers registrados"
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "numero",
              header: "Número",
              cell: (row) => text(row, "numero"),
            },
            {
              key: "estudiante",
              header: "Estudiante",
              cell: (row) => (
                <>
                  {text(row, "estudiante")}
                  <br />
                  {text(row, "codigo_estudiante")}
                </>
              ),
            },
            {
              key: "fecha",
              header: "Fecha de pago",
              cell: (row) => text(row, "fecha_pago"),
            },
            {
              key: "importe",
              header: "Importe",
              cell: (row) => text(row, "importe"),
            },
            {
              key: "estado",
              header: "Estado",
              cell: (row) => (
                <StatusBadge inactive={row.estado !== "VALIDADO"}>
                  {voucherStates[text(row, "estado")]}
                </StatusBadge>
              ),
            },
            {
              key: "uso",
              header: "Uso",
              cell: (row) =>
                row.matricula_id
                  ? `Vinculado: ${text(row, "matricula_codigo")}`
                  : "Sin vincular",
            },
            {
              key: "acciones",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <Button
                  variant="link"
                  disabled={opening}
                  onClick={() => void open(row)}
                >
                  {row.estado === "PENDIENTE" && !row.matricula_id
                    ? "Revisar voucher"
                    : "Ver detalle"}
                </Button>
              ),
            },
          ]}
        />
      </ListPanel>
      {creating && !student && (
        <StudentPicker onClose={() => create(false)} onSelect={select} />
      )}
      {creating && student && (
        <RecordForm
          resource={{
            ...voucherResource,
            description: `${voucherResource.description} Estudiante: ${text(student, "nombres")} ${text(student, "apellido_paterno")} · ${text(student, "codigo_estudiante")}.`,
          }}
          lookups={{}}
          onClose={() => {
            create(false);
            select(null);
          }}
          onSave={async (body) => {
            await api("vouchers", {
              method: "POST",
              body: { ...body, estudianteId: String(student.id) },
            });
            create(false);
            select(null);
            notify("Voucher registrado, pendiente de revisión.");
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
            notify("Decisión registrada.");
            reload();
          }}
        />
      )}
    </section>
  );
}
