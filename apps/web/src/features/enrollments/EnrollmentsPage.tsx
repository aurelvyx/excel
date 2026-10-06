import { useEffect, useRef, useState } from "react";
import { api, errorText, text, type Row } from "../../shared/api";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { StudentSearch } from "../persons/StudentPicker";
import { studentName, studentRow } from "../persons/student";
import { RegisterStudent } from "../students/RegisterStudent";
import { voucherStates } from "../vouchers/model";
import { VoucherChoice } from "./VoucherChoice";
import { GroupChoice, type GroupFilters } from "./GroupChoice";
type Initial = { student: Row; group?: Row; enrollment?: Row };
export function EnrollmentsPage({
  id,
  studentId,
}: {
  id?: string;
  studentId?: string;
}) {
  if (id) return <ResumeEnrollment id={id} />;
  if (studentId) return <StartForStudent id={studentId} />;
  return <EnrollmentWizard />;
}
function StartForStudent({ id }: { id: string }) {
  const { data, loading, error, reload } = useApiQuery<Row>(
    `estudiantes/${id}`,
  );
  return loading ? (
    <Loading>Cargando estudiante…</Loading>
  ) : error ? (
    <Feedback onRetry={reload}>{error}</Feedback>
  ) : data ? (
    <EnrollmentWizard initial={{ student: studentRow(data) }} />
  ) : null;
}
function ResumeEnrollment({ id }: { id: string }) {
  const [data, loaded] = useState<Initial>();
  const [error, fail] = useState("");
  const [version, retry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void api<Row>(`matriculas/${id}`, { signal: abort.signal })
      .then(async (enrollment) => {
        const [student, group] = await Promise.all([
          api<Row>(`estudiantes/${enrollment.estudiante_id}`, {
            signal: abort.signal,
          }),
          api<Row>(`oferta/grupos/${enrollment.grupo_id}`, {
            signal: abort.signal,
          }),
        ]);
        if (!abort.signal.aborted) {
          loaded({ student: studentRow(student), group, enrollment });
          fail("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) fail(errorText(e));
      });
    return () => abort.abort();
  }, [id, version]);
  return error ? (
    <Feedback onRetry={() => retry((v) => v + 1)}>{error}</Feedback>
  ) : data ? (
    <EnrollmentWizard initial={data} />
  ) : (
    <Loading>Cargando solicitud…</Loading>
  );
}
function EnrollmentWizard({ initial }: { initial?: Initial }) {
  const [student, selectStudent] = useState<Row | null>(
    initial?.student ?? null,
  );
  const [voucher, selectVoucher] = useState<Row | null>(null);
  const [group, selectGroup] = useState<Row | null>(initial?.group ?? null);
  const [filters, setFilters] = useState<GroupFilters>({
    periodoId: "",
    idiomaId: "",
    nivelId: "",
    after: "",
  });
  const [enrollment, setEnrollment] = useState<Row | null>(
    initial?.enrollment ?? null,
  );
  const [step, setStep] = useState(initial?.enrollment ? 1 : 0);
  const [creating, createStudent] = useState(false);
  const [confirmed, confirm] = useState(false);
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const submitting = useRef(false);
  const key = useRef(crypto.randomUUID());
  const title = useRef<HTMLHeadingElement>(null);
  const finished = !!enrollment && enrollment.estado !== "PENDIENTE";
  const validated = voucher?.estado === "VALIDADO" && !voucher.matricula_id;
  useEffect(() => title.current?.focus(), [step, finished]);
  const move = (next: number) => {
    fail("");
    confirm(false);
    setStep(next);
  };
  function chooseStudent(row: Row) {
    if (row.activo === false || text(row, "persona.activo") === "false")
      throw new Error("El estudiante está inactivo");
    selectStudent(studentRow(row));
    selectVoucher(null);
    selectGroup(null);
    setFilters({ periodoId: "", idiomaId: "", nivelId: "", after: "" });
    key.current = crypto.randomUUID();
  }
  const chooseVoucher = (row: Row) => {
    selectVoucher(row);
    confirm(false);
  };
  const groupContext = (label: string) =>
    group ? text(group, `contexto.${label}`) : "";
  async function save() {
    if (submitting.current || !student || !group || (validated && !confirmed))
      return;
    submitting.current = true;
    pending(true);
    fail("");
    let request = enrollment;
    try {
      if (!request) {
        request = await api<Row>("matriculas", {
          method: "POST",
          body: {
            estudianteId: String(student.id),
            grupoId: String(group.id),
            claveSolicitud: key.current,
          },
        });
        setEnrollment(request);
      }
      if (request.estado === "ACTIVA") {
        setEnrollment(request);
        return;
      }
      if (validated && voucher) {
        try {
          const active = await api<Row>(`matriculas/${request.id}/activar`, {
            method: "PATCH",
            body: { voucherId: String(voucher.id), confirmado: true },
          });
          setEnrollment(active);
        } catch (e) {
          const current = await api<Row>(`matriculas/${request.id}`).catch(
            () => null,
          );
          if (
            current?.estado === "ACTIVA" &&
            String(current.voucher_id) === String(voucher.id)
          )
            setEnrollment(current);
          else throw e;
        }
      } else navigate(`/matriculas/${request.id}`);
    } catch (e) {
      fail(errorText(e));
    } finally {
      submitting.current = false;
      pending(false);
    }
  }
  return (
    <section className="enrollment-page">
      <PageHeading
        eyebrow="Gestión académica"
        title={finished ? "Matrícula registrada" : "Asistente de matrícula"}
        description="Una matrícula corresponde al nivel completo. El pago se realiza presencialmente."
      />
      <a
        className="button"
        href={student ? `#/estudiantes/${student.id}` : "#/estudiantes"}
      >
        Ver ficha del estudiante
      </a>
      {finished ? (
        <section className="panel enrollment-step">
          <h2 ref={title} tabIndex={-1}>
            Resultado de matrícula
          </h2>
          <Feedback
            tone={enrollment!.estado === "ACTIVA" ? "success" : "notice"}
          >
            Estado: {text(enrollment!, "estado")} ·{" "}
            {text(enrollment!, "codigo")}
          </Feedback>
          <Facts
            items={[
              ["Estudiante", student && studentName(student)],
              ["Periodo", groupContext("periodo")],
              ["Idioma y nivel", groupContext("nivel")],
              ["Grupo", text(group!, "codigo")],
              [
                "Turno y sección",
                `${groupContext("turno")} · ${groupContext("seccion")}`,
              ],
              ["Intento", text(enrollment!, "numero_intento")],
            ]}
          />
          <Button
            variant="primary"
            onClick={() => {
              selectStudent(null);
              selectVoucher(null);
              selectGroup(null);
              setEnrollment(null);
              setFilters({
                periodoId: "",
                idiomaId: "",
                nivelId: "",
                after: "",
              });
              key.current = crypto.randomUUID();
              move(0);
              navigate("/matriculas");
            }}
          >
            Nueva matrícula
          </Button>
        </section>
      ) : (
        <>
          <ol className="wizard-steps" aria-label="Pasos de matrícula">
            {["Estudiante", "Voucher", "Grupo", "Confirmación"].map(
              (name, index) => (
                <li
                  key={name}
                  aria-current={step === index ? "step" : undefined}
                >
                  <span>{index + 1}</span>
                  {name}
                </li>
              ),
            )}
          </ol>
          <section
            className="panel enrollment-context"
            aria-label="Contexto de matrícula"
          >
            <Facts
              items={[
                [
                  "Estudiante",
                  student
                    ? `${studentName(student)} · ${text(student, "numero_documento")}`
                    : "",
                ],
                [
                  "Voucher",
                  voucher
                    ? `${text(voucher, "numero")} · ${voucherStates[text(voucher, "estado")]} · ${text(voucher, "importe")}`
                    : "",
                ],
                ["Periodo", groupContext("periodo")],
                ["Idioma y nivel", groupContext("nivel")],
                [
                  "Grupo, turno y sección",
                  group
                    ? `${text(group, "codigo")} · ${groupContext("turno")} · ${groupContext("seccion")}`
                    : "",
                ],
                [
                  "Estado",
                  enrollment
                    ? `${text(enrollment, "codigo")} · Pendiente`
                    : "En preparación",
                ],
              ]}
            />
          </section>
          <section className="panel enrollment-step" aria-busy={busy}>
            <h2 ref={title} tabIndex={-1}>
              {
                [
                  "Seleccionar estudiante",
                  "Registrar o seleccionar voucher",
                  "Seleccionar grupo",
                  "Revisar y confirmar",
                ][step]
              }
            </h2>
            {step === 0 && (
              <>
                {enrollment ? (
                  <Feedback tone="notice">
                    La identidad de esta solicitud se conserva. Puedes revisar
                    el voucher y continuar su activación.
                  </Feedback>
                ) : (
                  <>
                    <div className="selection-toolbar">
                      <p>Busca primero al estudiante para evitar duplicados.</p>
                      <Button onClick={() => createStudent(true)}>
                        Registrar estudiante
                      </Button>
                    </div>
                    <StudentSearch onSelect={chooseStudent} />
                  </>
                )}
              </>
            )}
            {step === 1 && student && (
              <VoucherChoice student={student} onSelect={chooseVoucher} />
            )}
            {step === 2 &&
              (enrollment ? (
                <Feedback tone="notice">
                  El grupo de la solicitud pendiente se conserva. La API volverá
                  a comprobar su disponibilidad.
                </Feedback>
              ) : (
                <GroupChoice
                  filters={filters}
                  onFilter={(value) => {
                    setFilters(value);
                    selectGroup(null);
                  }}
                  onSelect={(row) => {
                    selectGroup(row);
                    key.current = crypto.randomUUID();
                  }}
                />
              ))}
            {step === 3 && (
              <>
                <p>Revisa los datos del contexto antes de guardar.</p>
                {validated ? (
                  <label className="confirmation-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => confirm(e.target.checked)}
                    />
                    Confirmo la matrícula de este estudiante en el nivel
                    completo y el grupo seleccionado.
                  </label>
                ) : (
                  <Feedback tone="notice">
                    Sin voucher validado se guardará una solicitud pendiente.
                    Podrás retomarla desde el historial del estudiante.
                  </Feedback>
                )}
              </>
            )}
            <Feedback>{error}</Feedback>
            {enrollment && error && (
              <p>
                <a href={`#/matriculas/${enrollment.id}`}>
                  Retomar solicitud {text(enrollment, "codigo")}
                </a>
              </p>
            )}
            <footer className="actions">
              <Button
                disabled={busy || step === 0}
                onClick={() => move(step - 1)}
              >
                Anterior
              </Button>
              {step < 3 ? (
                <>
                  <Button
                    variant="primary"
                    disabled={
                      busy ||
                      !student ||
                      (step === 1 && !voucher) ||
                      (step === 2 && !group)
                    }
                    onClick={() => move(step + 1)}
                  >
                    Continuar
                  </Button>
                  {step === 1 && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        selectVoucher(null);
                        move(2);
                      }}
                    >
                      Continuar sin voucher
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  variant="primary"
                  busy={busy}
                  busyLabel="Guardando…"
                  disabled={busy || (validated && !confirmed)}
                  onClick={() => void save()}
                >
                  {validated
                    ? "Confirmar matrícula"
                    : "Guardar solicitud pendiente"}
                </Button>
              )}
            </footer>
          </section>
        </>
      )}
      {creating && (
        <RegisterStudent
          onClose={() => createStudent(false)}
          onSaved={(row) => {
            chooseStudent(row);
            createStudent(false);
          }}
          onExisting={async (row) => {
            chooseStudent(row);
            createStudent(false);
          }}
        />
      )}
    </section>
  );
}
