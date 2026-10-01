import { useState, type FormEvent } from "react";
import { api, errorText, text, type Row, type Page } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { ListPanel } from "../../shared/ui/ListPanel";
import { DataTable } from "../../shared/ui/DataTable";
import { Pagination } from "../../shared/ui/Pagination";
import { InputField } from "../../shared/ui/Field";
import { Button } from "../../shared/ui/Button";
import { Feedback } from "../../shared/ui/Feedback";
import { VoucherForm } from "../vouchers/VoucherForm";
import { VoucherDetail } from "../vouchers/VoucherDetail";
import { voucherStates } from "../vouchers/model";
export function VoucherChoice({
  student,
  onSelect,
}: {
  student: Row;
  onSelect: (row: Row) => void;
}) {
  const [q, search] = useState("");
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
    search(String(new FormData(event.currentTarget).get("q") ?? "").trim());
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
  return (
    <>
      <div className="selection-toolbar">
        <p>
          Selecciona un comprobante del estudiante o registra el pago
          presencial.
        </p>
        <Button onClick={() => create(true)} disabled={busy}>
          Registrar voucher
        </Button>
      </div>
      <Feedback>{error}</Feedback>
      <ListPanel
        loading={loading}
        loadingLabel="Cargando vouchers…"
        error={queryError}
        onRetry={reload}
        empty={!data?.items.length}
        emptyDescription="Puedes registrar un voucher o continuar con una solicitud pendiente."
        filters={
          <form className="filters" onSubmit={filter}>
            <InputField label="Buscar voucher" name="q" maxLength={120} />
            <Button type="submit" disabled={loading}>
              Buscar
            </Button>
          </form>
        }
        pagination={
          <Pagination
            after={after}
            count={data?.items.length ?? 0}
            nextCursor={data?.nextCursor ?? null}
            onChange={paginate}
          />
        }
      >
        <DataTable
          caption="Vouchers del estudiante"
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "numero",
              header: "Número",
              cell: (row) => text(row, "numero"),
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
              cell: (row) => voucherStates[text(row, "estado")],
            },
            {
              key: "acciones",
              header: "Acciones",
              className: "row-actions",
              cell: (row) => (
                <>
                  <Button
                    variant="link"
                    disabled={!!row.matricula_id || busy}
                    onClick={() => onSelect(row)}
                  >
                    Seleccionar voucher
                  </Button>
                  <Button
                    variant="link"
                    disabled={busy}
                    onClick={() => void open(row)}
                  >
                    {row.estado === "PENDIENTE" && !row.matricula_id
                      ? "Revisar voucher"
                      : "Ver detalle"}
                  </Button>
                  {!!row.matricula_id && <small>Ya vinculado</small>}
                </>
              ),
            },
          ]}
        />
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
    </>
  );
}
