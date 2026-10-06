import { api, type Row } from "../../shared/api";
import { RecordForm } from "../configuration/RecordForm";
import { studentName } from "../persons/student";
import { voucherResource } from "./model";
export function VoucherForm({
  student,
  onClose,
  onSaved,
}: {
  student: Row;
  onClose: () => void;
  onSaved: (row: Row) => void;
}) {
  return (
    <RecordForm
      resource={{
        ...voucherResource,
        description: `${voucherResource.description} Estudiante: ${studentName(student)} · ${student.codigo_estudiante}.`,
      }}
      lookups={{}}
      onClose={onClose}
      onSave={async (body) =>
        onSaved(
          await api<Row>("vouchers", {
            method: "POST",
            body: { ...body, estudianteId: String(student.id) },
          }),
        )
      }
    />
  );
}
