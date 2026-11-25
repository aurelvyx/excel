import { ExternalLink, GraduationCap, Receipt, UserRound } from "lucide-react";
import { Dialog } from "../../shared/Dialog";
import { Button } from "../../shared/ui/Button";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { StatusBadge, type BadgeTone } from "../../components/shared";
import { text, type Row } from "../../shared/api";
import { useApiQuery } from "../../shared/useApiQuery";
import { enrollmentStateLabels } from "./state-labels";
import "./roster-dialogs.css";

function studentInitials(enrollment: Row): string {
  const a = text(enrollment, "nombres").trim().charAt(0).toUpperCase();
  const b = text(enrollment, "apellido_paterno").trim().charAt(0).toUpperCase();
  return `${a}${b}` || "ES";
}

function enrollmentTone(estado: string): BadgeTone {
  if (estado === "ACTIVA") return "emerald";
  if (estado === "PENDIENTE") return "amber";
  if (estado === "ANULADA") return "rose";
  return "slate";
}

function SummaryField({
  label,
  value,
  emptyLabel,
  fullWidth = false,
  mono = false,
}: {
  label: string;
  value: string;
  emptyLabel: string;
  fullWidth?: boolean;
  mono?: boolean;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div
      className={`student-summary-field${fullWidth ? " student-summary-field--full" : ""}`}
    >
      <dt className="student-summary-label">{label}</dt>
      <dd
        className={`student-summary-value${hasValue ? "" : " is-muted"}${mono && hasValue ? " student-summary-mono" : ""}`}
      >
        {hasValue ? value : emptyLabel}
      </dd>
    </div>
  );
}

/** Datos generales del estudiante, matrícula y comprobante de pago en el grupo. */
export function StudentSummaryDialog({
  enrollment,
  group,
  canViewVoucher,
  onClose,
}: {
  enrollment: Row;
  group: Row;
  canViewVoucher: boolean;
  onClose: () => void;
}) {
  const student = useApiQuery<Row>(`estudiantes/${enrollment.estudiante_id}`);
  const s = student.data;
  const fullName = `${text(enrollment, "apellido_paterno")} ${text(enrollment, "apellido_materno")}, ${text(enrollment, "nombres")}`.trim();
  const state = text(enrollment, "estado");
  const voucherNumber = text(enrollment, "voucher_numero");
  const rawImporte = text(enrollment, "voucher_importe");
  const parsedImporte = rawImporte ? Number(rawImporte) : NaN;
  const formattedImporte = Number.isFinite(parsedImporte)
    ? `S/ ${parsedImporte.toFixed(2)}`
    : rawImporte
      ? `S/ ${rawImporte}`
      : "";
  const hasVoucher = Boolean(voucherNumber || formattedImporte);

  return (
    <Dialog
      title={fullName}
      onClose={onClose}
      className="student-summary-dialog"
    >
      {student.loading ? (
        <Loading>Cargando datos del estudiante…</Loading>
      ) : student.error ? (
        <Feedback onRetry={student.reload}>{student.error}</Feedback>
      ) : (
        <div className="student-summary">
          {/* Cabecera resumen */}
          <div className="student-summary-hero">
            <div className="student-summary-hero-left">
              <div className="student-summary-avatar" aria-hidden="true">
                {studentInitials(enrollment)}
              </div>
              <div>
                <div className="student-summary-hero-name">{fullName}</div>
                <div className="student-summary-hero-sub">
                  {text(enrollment, "codigo_estudiante")} ·{" "}
                  {text(enrollment, "tipo_documento")}{" "}
                  {text(enrollment, "numero_documento")}
                  {enrollment.edad != null ? ` · ${text(enrollment, "edad")} años` : ""}
                </div>
              </div>
            </div>

            <div className="student-summary-hero-badges">
              <span className="student-summary-attempt-pill">
                Intento {text(enrollment, "numero_intento") || "1"}
              </span>
              <StatusBadge tone={enrollmentTone(state)}>
                {enrollmentStateLabels[state] ?? state}
              </StatusBadge>
            </div>
          </div>

          {/* Tarjeta 1: Datos del estudiante */}
          <section className="student-summary-card" aria-label="Datos del estudiante">
            <div className="student-summary-card-head">
              <UserRound size={14} aria-hidden="true" />
              <span>Datos del estudiante</span>
            </div>
            <dl className="student-summary-grid">
              <SummaryField
                label="Código"
                value={text(enrollment, "codigo_estudiante")}
                emptyLabel="Sin registrar"
                mono
              />
              <SummaryField
                label="Documento"
                value={`${text(enrollment, "tipo_documento")} ${text(enrollment, "numero_documento")}`.trim()}
                emptyLabel="Sin registrar"
                mono
              />
              <SummaryField
                label="Edad"
                value={
                  enrollment.edad == null ? "" : `${text(enrollment, "edad")} años`
                }
                emptyLabel="Sin registrar"
              />
              <SummaryField
                label="Fecha de registro"
                value={s ? text(s, "fecha_registro") : ""}
                emptyLabel="Sin registrar"
              />
              {canViewVoucher && (
                <>
                  <SummaryField
                    label="Nacimiento"
                    value={s ? text(s, "persona.fechaNacimiento") : ""}
                    emptyLabel="Sin registrar"
                  />
                  <SummaryField
                    label="Teléfono"
                    value={s ? text(s, "persona.telefono") : ""}
                    emptyLabel="Sin registrar"
                    mono
                  />
                  <SummaryField
                    label="Correo electrónico"
                    value={s ? text(s, "persona.correo") : ""}
                    emptyLabel="Sin registrar"
                    fullWidth
                  />
                  <SummaryField
                    label="Dirección"
                    value={s ? text(s, "persona.direccion") : ""}
                    emptyLabel="Sin registrar"
                    fullWidth
                  />
                </>
              )}
            </dl>
          </section>

          {/* Tarjeta 2: Matrícula en este grupo */}
          <section className="student-summary-card" aria-label="Matrícula en este grupo">
            <div className="student-summary-card-head">
              <GraduationCap size={14} aria-hidden="true" />
              <span>Matrícula en este grupo</span>
            </div>
            <dl className="student-summary-grid">
              <SummaryField
                label="Código de matrícula"
                value={text(enrollment, "codigo")}
                emptyLabel="Pendiente"
                mono
              />
              <SummaryField
                label="Fecha de matrícula"
                value={text(enrollment, "fecha_matricula")}
                emptyLabel="Pendiente"
              />
              <SummaryField
                label="Salón / Grupo"
                value={text(group, "codigo")}
                emptyLabel="Pendiente"
                mono
              />
              <div className="student-summary-field">
                <dt className="student-summary-label">Estado e intento</dt>
                <dd className="student-summary-value">
                  <StatusBadge tone={enrollmentTone(state)}>
                    {enrollmentStateLabels[state] ?? state}
                  </StatusBadge>
                </dd>
              </div>
              <SummaryField
                label="Turno y sección"
                value={`${text(group, "turno")} · ${text(group, "seccion")}`.trim()}
                emptyLabel="Pendiente"
                fullWidth
              />
            </dl>
          </section>

          {/* Tarjeta 3: Comprobante de pago (Voucher) */}
          {canViewVoucher && (
            <section
              className={`student-summary-voucher${hasVoucher ? "" : " is-pending"}`}
              aria-label="Comprobante de pago"
            >
              <div className="student-summary-voucher-left">
                <div className="student-summary-voucher-icon" aria-hidden="true">
                  <Receipt size={18} />
                </div>
                <div>
                  <span className="student-summary-label">
                    Boleta / Comprobante de pago
                  </span>
                  <div className="student-summary-voucher-number">
                    {voucherNumber || "Pendiente de vincular"}
                  </div>
                </div>
              </div>

              <div className="student-summary-voucher-amount">
                <span className="student-summary-label">Importe pagado</span>
                <strong>{formattedImporte || "Pendiente"}</strong>
              </div>
            </section>
          )}

          {/* Pie de acciones */}
          <footer className="student-summary-footer">
            <a
              className="student-summary-link"
              href={`#/estudiantes/${enrollment.estudiante_id}`}
              onClick={onClose}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Ver ficha completa del estudiante
            </a>
            <Button type="button" onClick={onClose}>
              Cerrar
            </Button>
          </footer>
        </div>
      )}
    </Dialog>
  );
}
