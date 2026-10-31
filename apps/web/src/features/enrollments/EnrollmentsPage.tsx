import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  UserCheck,
  School,
  Receipt,
  CheckCircle2,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { api, errorText, text, type Row } from "../../shared/api";
import { navigate, routeChangeEvent } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Feedback, Loading } from "../../shared/ui/Feedback";
import { Button } from "../../shared/ui/Button";
import { Facts } from "../../shared/ui/Facts";
import { StudentSearch } from "../persons/StudentPicker";
import { studentName, studentRow } from "../persons/student";
import { RegisterStudent, type StudentDraft } from "../students/RegisterStudent";
import { voucherStates } from "../vouchers/model";
import { InputField } from "../../shared/ui/Field";
import { VoucherChoice } from "./VoucherChoice";
import { GroupChoice, type GroupFilters } from "./GroupChoice";
import "../academic/academic.css";

type Initial = { student?: Row; group?: Row; enrollment?: Row };
type VoucherDraft = { numero: string; fechaPago: string; importe: string };

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
    <EnrollmentWizard
      initial={{ student: studentRow(data) }}
    />
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
  const [studentDraft, setStudentDraft] = useState<StudentDraft | null>(null);
  const [voucherDraft, setVoucherDraft] = useState<VoucherDraft | null>(null);
  const [flowModal, setFlowModal] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [exitNotice, setExitNotice] = useState(false);
  const [modalSubmitted, setModalSubmitted] = useState(false);
  const [confirmed, confirm] = useState(false);
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const submitting = useRef(false);
  const modal = useRef<HTMLDialogElement>(null);
  const launchRegistration = useRef(false);
  const key = useRef(crypto.randomUUID());
  const title = useRef<HTMLHeadingElement>(null);

  // Si viene ?grupoId= en el hash, precargar el salón automáticamente
  useEffect(() => {
    if (initial?.group) return;
    const hashQuery = window.location.hash.split("?")[1] ?? "";
    const gId = new URLSearchParams(hashQuery).get("grupoId");
    if (gId && /^[1-9]\d*$/.test(gId)) {
      void api<Row>(`oferta/grupos/${gId}`)
        .then((grp) => {
          selectGroup(grp);
          setFilters((prev) => ({
            ...prev,
            periodoId: String(grp.periodo_id ?? ""),
            nivelId: String(grp.nivel_id ?? ""),
          }));
        })
        .catch(() => {});
    }
  }, [initial?.group]);

  const finished = !!enrollment && enrollment.estado !== "PENDIENTE";
  const validated = voucher?.estado === "VALIDADO" && !voucher.matricula_id;
  const isDraftStudent = !!studentDraft;
  const groupStep = 1;
  const voucherStep = 2;
  const draftAmount = voucherDraft?.importe.trim() ?? "";
  const hasVoucherDraft = !!(
    voucherDraft?.numero.trim() &&
    voucherDraft.fechaPago &&
    /^\d{1,8}(\.\d{1,2})?$/.test(draftAmount) &&
    Number(draftAmount) > 0
  );

  useEffect(() => {
    const dialog = modal.current;
    if (!dialog) return;
    if (flowModal && !dialog.open) {
      dialog.showModal();
      if (launchRegistration.current) {
        launchRegistration.current = false;
        createStudent(true);
      }
    } else if (!flowModal && dialog.open) {
      dialog.close();
    }
  }, [flowModal]);

  useEffect(() => {
    if (!flowModal) return;
    function guardRoute(event: Event) {
      const change = (event as CustomEvent<HashChangeEvent>).detail;
      event.preventDefault();
      if (change?.oldURL) history.replaceState(history.state, "", change.oldURL);
      setExitNotice(true);
    }
    function guardUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener(routeChangeEvent, guardRoute);
    window.addEventListener("beforeunload", guardUnload);
    return () => {
      window.removeEventListener(routeChangeEvent, guardRoute);
      window.removeEventListener("beforeunload", guardUnload);
    };
  }, [flowModal]);

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
    setStudentDraft(null);
    setVoucherDraft(null);
    selectVoucher(null);
    key.current = crypto.randomUUID();
  }

  const chooseVoucher = (row: Row) => {
    selectVoucher(row);
    confirm(false);
  };

  const groupContext = (label: string) =>
    group ? text(group, `contexto.${label}`) : "";

  async function save() {
    if (
      submitting.current ||
      (!student && !studentDraft) ||
      !group ||
      (!voucher && !hasVoucherDraft) ||
      (validated && !confirmed)
    )
      return;
    submitting.current = true;
    pending(true);
    fail("");
    let request = enrollment;
    try {
      let currentStudent = student;
      if (!currentStudent && studentDraft) {
        const studentBody = {
          ...(studentDraft.personaId
            ? { personaId: studentDraft.personaId }
            : {}),
          ...(studentDraft.persona ? { persona: studentDraft.persona } : {}),
          codigoEstudiante: studentDraft.codigoEstudiante,
          fechaRegistro: studentDraft.fechaRegistro,
        };
        currentStudent = studentRow(
          await api<Row>("estudiantes", {
            method: "POST",
            body: studentBody,
          }),
        );
        selectStudent(currentStudent);
      }
      let currentVoucher = voucher;
      if (!currentVoucher && voucherDraft && currentStudent) {
        currentVoucher = await api<Row>("vouchers", {
          method: "POST",
          body: {
            numero: voucherDraft.numero.trim(),
            fechaPago: voucherDraft.fechaPago,
            importe: voucherDraft.importe.trim(),
            estudianteId: String(currentStudent.id),
          },
        });
        selectVoucher(currentVoucher);
      }
      if (!request) {
        request = await api<Row>("matriculas", {
          method: "POST",
          body: {
            estudianteId: String(currentStudent!.id),
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
      if (validated && currentVoucher) {
        try {
          const active = await api<Row>(`matriculas/${request.id}/activar`, {
            method: "PATCH",
            body: { voucherId: String(currentVoucher.id), confirmado: true },
          });
          setEnrollment(active);
        } catch (e) {
          const current = await api<Row>(`matriculas/${request.id}`).catch(
            () => null,
          );
          if (
            current?.estado === "ACTIVA" &&
            String(current.voucher_id) === String(currentVoucher.id)
          )
            setEnrollment(current);
          else throw e;
        }
      } else if (flowModal) {
        setEnrollment(request);
        setModalSubmitted(true);
      } else {
        navigate(`/matriculas/${request.id}`);
      }
    } catch (e) {
      fail(errorText(e));
    } finally {
      submitting.current = false;
      pending(false);
    }
  }

  const hasStudent = Boolean(student || studentDraft);
  const hasGroup = Boolean(group);
  const hasVoucher = Boolean(voucher || hasVoucherDraft);

  const content = (
    <div className="academic-container">
      {/* Encabezado Ejecutivo del Asistente de Matrícula */}
      <div
        className="academic-card"
        style={{
          padding: "1.35rem 1.65rem",
          background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
          borderLeft: "5px solid #007a3d",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <span className="academic-badge badge-green">
                <Sparkles size={11} style={{ marginRight: "0.25rem" }} />
                PROCESO DE MATRÍCULA OFICIAL
              </span>
              {group && (
                <span className="academic-badge badge-blue">
                  Salón: {text(group, "codigo")}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.25rem 0" }}>
              {finished || modalSubmitted ? "Constancia de Matrícula Registrada" : "Asistente Guiado de Matrícula"}
            </h1>
            <p style={{ fontSize: "0.82rem", color: "#475569", margin: 0 }}>
              Una matrícula corresponde al nivel completo. Vincula al estudiante, su salón asignado y su comprobante de pago presencial.
            </p>
          </div>

          <div>
            {flowModal ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setCancelConfirm(true)}
                className="academic-btn-action btn-action-secondary"
              >
                Cancelar matrícula
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/matriculas")}
                className="academic-btn-action btn-action-secondary"
                style={{ backgroundColor: "#ffffff" }}
              >
                <ArrowLeft size={14} /> Volver a Gestión de Matrículas
              </button>
            )}
          </div>
        </div>
      </div>

      {exitNotice && flowModal && !cancelConfirm && (
        <Feedback tone="notice">
          El formulario sigue abierto. Para salir, elige Cancelar matrícula.
        </Feedback>
      )}

      {cancelConfirm ? (
        <section
          className="academic-card enrollment-cancel-confirm"
          role="alertdialog"
          aria-modal="true"
          style={{ padding: "2rem", textAlign: "center", maxWidth: "520px", margin: "1rem auto" }}
        >
          <h2 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>¿Cancelar esta matrícula?</h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
            {enrollment || modalSubmitted
              ? "La solicitud ya está guardada y permanecerá pendiente. Solo se cerrará el formulario."
              : "Los datos que todavía no se guardaron se descartarán."}
          </p>
          <div className="actions" style={{ justifyContent: "center" }}>
            <Button disabled={busy} onClick={() => setCancelConfirm(false)}>
              Continuar matrícula
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                createStudent(false);
                selectStudent(initial?.student ?? null);
                selectVoucher(null);
                selectGroup(initial?.group ?? null);
                setStudentDraft(null);
                setVoucherDraft(null);
                setEnrollment(initial?.enrollment ?? null);
                setModalSubmitted(false);
                setStep(initial?.enrollment ? 1 : 0);
                setFilters({ periodoId: "", idiomaId: "", nivelId: "", after: "" });
                key.current = crypto.randomUUID();
                fail("");
                confirm(false);
                setCancelConfirm(false);
                setExitNotice(false);
                setFlowModal(false);
              }}
            >
              Confirmar cancelación
            </Button>
          </div>
        </section>
      ) : finished || modalSubmitted ? (
        <section className="academic-card enrollment-step" style={{ padding: "1.75rem" }}>
          <h2 ref={title} tabIndex={-1} style={{ marginTop: 0 }}>
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
              [
                "Estudiante",
                student
                  ? studentName(student)
                  : studentDraft?.resumen.nombre ?? "",
              ],
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
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            {flowModal ? (
              <Button
                variant="primary"
                onClick={() => {
                  selectStudent(initial?.student ?? null);
                  selectVoucher(null);
                  selectGroup(initial?.group ?? null);
                  setStudentDraft(null);
                  setVoucherDraft(null);
                  setEnrollment(initial?.enrollment ?? null);
                  setModalSubmitted(false);
                  setStep(initial?.enrollment ? 1 : 0);
                  setFilters({ periodoId: "", idiomaId: "", nivelId: "", after: "" });
                  key.current = crypto.randomUUID();
                  fail("");
                  confirm(false);
                  setFlowModal(false);
                }}
              >
                Finalizar y volver
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  onClick={() => {
                    selectStudent(null);
                    selectVoucher(null);
                    selectGroup(null);
                    setStudentDraft(null);
                    setVoucherDraft(null);
                    setEnrollment(null);
                    setFilters({ periodoId: "", idiomaId: "", nivelId: "", after: "" });
                    key.current = crypto.randomUUID();
                    move(0);
                    navigate("/matriculas/nueva");
                  }}
                >
                  + Registrar otra matrícula
                </Button>
                {group && (
                  <Button onClick={() => navigate(`/matriculas/grupo/${group.id}`)}>
                    Ver nómina del salón {text(group, "codigo")}
                  </Button>
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* Stepper Interactivo de 4 Pasos */}
          <ol className="modern-stepper" aria-label="Pasos de matrícula" style={{ margin: 0 }}>
            {[
              "1. Estudiante",
              "2. Salón / Grupo",
              "3. Comprobante (Voucher)",
              "4. Confirmación",
            ].map((name, index) => (
              <li
                key={name}
                className={`modern-step-item ${step === index ? "active" : step > index ? "completed" : ""}`}
                aria-current={step === index ? "step" : undefined}
                onClick={() => {
                  if (index < step && !busy) move(index);
                }}
                style={{ cursor: index < step && !busy ? "pointer" : "default" }}
              >
                <span className="modern-step-number">
                  {step > index ? "✓" : index + 1}
                </span>
                {name}
              </li>
            ))}
          </ol>

          {/* Tarjetas de Contexto en Vivo (Resumen de Progreso) */}
          <section
            aria-label="Contexto de matrícula"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {/* Card 1: Estudiante */}
            <div
              className="academic-card"
              style={{
                padding: "0.85rem 1rem",
                borderLeft: `4px solid ${hasStudent ? "#007a3d" : "#cbd5e1"}`,
                backgroundColor: step === 0 ? "#f0fdf4" : "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                <UserCheck size={14} color={hasStudent ? "#007a3d" : "#94a3b8"} />
                <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                  1. Estudiante
                </span>
              </div>
              <strong style={{ fontSize: "0.82rem", color: hasStudent ? "#0f172a" : "#94a3b8", display: "block" }}>
                {student
                  ? studentName(student)
                  : studentDraft
                    ? studentDraft.resumen.nombre
                    : "Pendiente de elegir"}
              </strong>
              <span style={{ fontSize: "0.7rem", color: "#64748b", fontFamily: "monospace" }}>
                {student
                  ? `${text(student, "tipo_documento")} ${text(student, "numero_documento")}`
                  : studentDraft
                    ? studentDraft.resumen.documento
                    : "—"}
              </span>
            </div>

            {/* Card 2: Salón / Grupo */}
            <div
              className="academic-card"
              style={{
                padding: "0.85rem 1rem",
                borderLeft: `4px solid ${hasGroup ? "#2563eb" : "#cbd5e1"}`,
                backgroundColor: step === 1 ? "#eff6ff" : "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                <School size={14} color={hasGroup ? "#2563eb" : "#94a3b8"} />
                <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                  2. Salón / Horario
                </span>
              </div>
              <strong style={{ fontSize: "0.82rem", color: hasGroup ? "#0f172a" : "#94a3b8", display: "block" }}>
                {group ? `${text(group, "codigo")} · ${groupContext("nivel")}` : "Pendiente de elegir"}
              </strong>
              <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                {group ? `${groupContext("turno")} · Sec. ${groupContext("seccion")}` : "—"}
              </span>
            </div>

            {/* Card 3: Voucher */}
            <div
              className="academic-card"
              style={{
                padding: "0.85rem 1rem",
                borderLeft: `4px solid ${hasVoucher ? "#059669" : "#cbd5e1"}`,
                backgroundColor: step === 2 ? "#f0fdf4" : "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                <Receipt size={14} color={hasVoucher ? "#059669" : "#94a3b8"} />
                <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                  3. Comprobante (Voucher)
                </span>
              </div>
              <strong style={{ fontSize: "0.82rem", color: hasVoucher ? "#0f172a" : "#94a3b8", display: "block" }}>
                {voucher
                  ? `🧾 ${text(voucher, "numero")}`
                  : voucherDraft?.numero
                    ? `🧾 ${voucherDraft.numero}`
                    : "Pendiente de pago"}
              </strong>
              <span style={{ fontSize: "0.7rem", color: "#007a3d", fontWeight: 700 }}>
                {voucher
                  ? `S/ ${text(voucher, "importe")} · ${voucherStates[text(voucher, "estado")]}`
                  : voucherDraft?.importe
                    ? `S/ ${voucherDraft.importe} (Nuevo)`
                    : "—"}
              </span>
            </div>

            {/* Card 4: Estado */}
            <div
              className="academic-card"
              style={{
                padding: "0.85rem 1rem",
                borderLeft: `4px solid ${validated ? "#007a3d" : "#d97706"}`,
                backgroundColor: step === 3 ? "#f0fdf4" : "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                <CheckCircle2 size={14} color={validated ? "#007a3d" : "#d97706"} />
                <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                  4. Estado de Solicitud
                </span>
              </div>
              <strong style={{ fontSize: "0.82rem", color: "#0f172a", display: "block" }}>
                {enrollment
                  ? `${text(enrollment, "codigo")} · Pendiente`
                  : validated
                    ? "Lista para Activar"
                    : "En preparación"}
              </strong>
              <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                {validated ? "Voucher validado" : "Se guardará para revisión"}
              </span>
            </div>
          </section>

          {/* Contenido del Paso Actual */}
          <section className="academic-card enrollment-step" aria-busy={busy} style={{ padding: "1.5rem 1.75rem" }}>
            <h2
              ref={title}
              tabIndex={-1}
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "#0f172a",
                margin: "0 0 1rem 0",
                paddingBottom: "0.75rem",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              {(isDraftStudent
                ? [
                    "Paso 1 · Datos del Estudiante",
                    "Paso 2 · Seleccionar Idioma, Nivel y Salón",
                    "Paso 3 · Registrar Comprobante de Pago (Voucher)",
                    "Paso 4 · Revisar Ficha y Confirmar Matrícula",
                  ]
                : [
                    "Paso 1 · Seleccionar o Registrar Estudiante",
                    "Paso 2 · Seleccionar Salón / Grupo de Clase",
                    "Paso 3 · Seleccionar o Registrar Comprobante (Voucher)",
                    "Paso 4 · Revisar Ficha y Confirmar Matrícula",
                  ])[step]}
            </h2>

            {step === 0 && !(creating && flowModal) && (
              <>
                {enrollment ? (
                  <Feedback tone="notice">
                    La identidad de esta solicitud se conserva. Puedes revisar
                    el voucher y continuar su activación.
                  </Feedback>
                ) : studentDraft ? (
                  <div className="student-selected-card">
                    <div className="student-selected-header">
                      <div className="student-avatar" style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)" }}>
                        {((studentDraft.resumen.nombre[0] || "") + (studentDraft.resumen.nombre[1] || "")).toUpperCase()}
                      </div>
                      <div className="student-details">
                        <span className="badge-verified" style={{ background: "#e0f2fe", borderColor: "#bae6fd", color: "#0369a1" }}>
                          Nuevo estudiante listo para matricular (Borrador)
                        </span>
                        <h3>{studentDraft.resumen.nombre}</h3>
                        <p>
                          <strong>Documento:</strong> {studentDraft.resumen.documento} · <strong>Código asignado:</strong> {studentDraft.codigoEstudiante}
                        </p>
                      </div>
                    </div>
                    <div className="student-selected-actions">
                      <Button
                        onClick={() => {
                          setStudentDraft(null);
                          setVoucherDraft(null);
                        }}
                      >
                        Descartar y elegir otro estudiante
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => move(1)}
                      >
                        Continuar al Paso 2 (Salón / Grupo) ➔
                      </Button>
                    </div>
                  </div>
                ) : student ? (
                  <div className="student-selected-card">
                    <div className="student-selected-header">
                      <div className="student-avatar">
                        {((text(student, "nombres")[0] || "") + (text(student, "apellido_paterno")[0] || "")).toUpperCase() || "E"}
                      </div>
                      <div className="student-details">
                        <span className="badge-verified">✓ Estudiante Registrado en Base de Datos</span>
                        <h3>{studentName(student)}</h3>
                        <p>
                          <strong>{text(student, "tipo_documento")}:</strong> {text(student, "numero_documento")} · <strong>Código de estudiante:</strong> {text(student, "codigo_estudiante")}
                        </p>
                        <p style={{ marginTop: "0.35rem", color: "#065f46", fontSize: "0.813rem" }}>
                          ✓ Ya existen datos registrados de este estudiante en el sistema. Puedes proceder a asignarle grupo y registrar su voucher.
                        </p>
                      </div>
                    </div>
                    <div className="student-selected-actions">
                      <Button
                        onClick={() => {
                          selectStudent(null);
                          selectVoucher(null);
                        }}
                      >
                        Cambiar estudiante
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => move(1)}
                      >
                        Continuar al Paso 2 (Salón / Grupo) ➔
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "1rem",
                        padding: "0.9rem 1.15rem",
                        backgroundColor: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: "0.75rem",
                        marginBottom: "1rem",
                      }}
                    >
                      <div>
                        <strong style={{ display: "block", fontSize: "0.875rem", color: "#064e3b" }}>
                          ¿El alumno es nuevo o ya estudió antes en el centro?
                        </strong>
                        <span style={{ fontSize: "0.78rem", color: "#166534" }}>
                          Búscalo primero en el padrón inferior por DNI o apellidos; si no aparece, regístralo con el botón de la derecha.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          launchRegistration.current = true;
                          setExitNotice(false);
                          setFlowModal(true);
                        }}
                        className="academic-btn-action btn-action-primary"
                        style={{ padding: "0.55rem 1rem" }}
                      >
                        <UserPlus size={15} /> Registrar Nuevo Estudiante
                      </button>
                    </div>
                    <StudentSearch onSelect={chooseStudent} />
                  </>
                )}
              </>
            )}

            {step === groupStep &&
              (enrollment ? (
                <Feedback tone="notice">
                  El grupo de la solicitud pendiente se conserva ({text(group ?? {}, "codigo")}). La API volverá
                  a comprobar su disponibilidad.
                </Feedback>
              ) : (
                <GroupChoice
                  filters={filters}
                  selectedGroup={group}
                  onFilter={(value) => {
                    setFilters(value);
                  }}
                  onSelect={(row) => {
                    selectGroup(row);
                    key.current = crypto.randomUUID();
                  }}
                />
              ))}

            {step === voucherStep && student && !isDraftStudent && (
              <VoucherChoice
                student={student}
                selectedVoucher={voucher}
                onSelect={chooseVoucher}
              />
            )}

            {step === voucherStep && isDraftStudent && (
              <VoucherDraftForm
                value={voucherDraft ?? { numero: "", fechaPago: "", importe: "" }}
                onChange={setVoucherDraft}
              />
            )}

            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div
                  style={{
                    backgroundColor: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "0.85rem",
                    padding: "1.25rem",
                  }}
                >
                  <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                    Resumen Oficial de la Matrícula a Registrar
                  </h3>
                  <Facts
                    items={[
                      [
                        "Estudiante",
                        student
                          ? `${studentName(student)} (${text(student, "tipo_documento")} ${text(student, "numero_documento")})`
                          : studentDraft
                            ? `${studentDraft.resumen.nombre} (${studentDraft.resumen.documento})`
                            : "—",
                      ],
                      ["Periodo Académico", groupContext("periodo")],
                      ["Programa y Nivel", groupContext("nivel")],
                      [
                        "Salón / Horario",
                        group
                          ? `${text(group, "codigo")} · ${groupContext("turno")} · Sección ${groupContext("seccion")}`
                          : "—",
                      ],
                      [
                        "Comprobante de Pago",
                        voucher
                          ? `N° ${text(voucher, "numero")} · S/ ${text(voucher, "importe")} (${voucherStates[text(voucher, "estado")]})`
                          : voucherDraft
                            ? `N° ${voucherDraft.numero} · S/ ${voucherDraft.importe} (Pendiente de validación)`
                            : "—",
                      ],
                    ]}
                  />
                </div>

                {validated ? (
                  <label
                    className="confirmation-check"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.65rem",
                      padding: "1rem 1.15rem",
                      backgroundColor: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "0.75rem",
                      fontWeight: 600,
                      color: "#064e3b",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(e) => confirm(e.target.checked)}
                    />
                    Confirmo la matrícula oficial de este estudiante en el nivel completo y salón seleccionado.
                  </label>
                ) : (
                  <Feedback tone="notice">
                    El voucher se guardará en estado <strong>Pendiente de Validación</strong> y la matrícula quedará reservada hasta que Administración valide el comprobante.
                  </Feedback>
                )}
              </div>
            )}

            <Feedback>{error}</Feedback>
            {enrollment && error && !flowModal && (
              <p>
                <Button
                  onClick={() => {
                    navigate(`/matriculas/${enrollment.id}`);
                  }}
                >
                  Retomar solicitud {text(enrollment, "codigo")}
                </Button>
              </p>
            )}

            <footer
              className="actions"
              style={{
                marginTop: "1.25rem",
                paddingTop: "1rem",
                borderTop: "1px solid #f1f5f9",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Button
                disabled={busy || step === 0}
                onClick={() => move(step - 1)}
              >
                ← Paso Anterior
              </Button>
              {step < 3 ? (
                <Button
                  variant="primary"
                  disabled={
                    busy ||
                    (step === 0 && !student && !studentDraft) ||
                    (step === voucherStep &&
                      !(isDraftStudent ? hasVoucherDraft : voucher)) ||
                    (step === groupStep && !group)
                  }
                  onClick={() => move(step + 1)}
                >
                  Siguiente Paso ➔
                </Button>
              ) : (
                <Button
                  variant="primary"
                  busy={busy}
                  busyLabel="Guardando…"
                  disabled={busy || (validated && !confirmed)}
                  onClick={() => void save()}
                >
                  {validated
                    ? "✓ Confirmar y Activar Matrícula"
                    : "💾 Guardar Solicitud de Matrícula"}
                </Button>
              )}
            </footer>
          </section>
        </>
      )}

      {creating && flowModal && !cancelConfirm && (
        <RegisterStudent
          embedded
          onClose={() => {
            createStudent(false);
            setCancelConfirm(true);
          }}
          onDraft={(draft) => {
            setStudentDraft(draft);
            selectStudent(null);
            selectVoucher(null);
            setVoucherDraft(null);
            key.current = crypto.randomUUID();
            confirm(false);
            createStudent(false);
          }}
          onExisting={async (row) => {
            chooseStudent(row);
            createStudent(false);
          }}
        />
      )}
    </div>
  );

  return (
    <>
      {!flowModal && content}
      <dialog
        ref={modal}
        className="enrollment-flow-dialog"
        aria-label="Proceso de matrícula"
        onCancel={(event) => {
          event.preventDefault();
          setExitNotice(true);
        }}
      >
        {flowModal && content}
      </dialog>
    </>
  );
}

function VoucherDraftForm({
  value,
  onChange,
}: {
  value: VoucherDraft;
  onChange: (value: VoucherDraft) => void;
}) {
  return (
    <div
      style={{
        backgroundColor: "#f8fafc",
        border: "1px solid #cbd5e1",
        borderRadius: "0.85rem",
        padding: "1.25rem",
      }}
    >
      <p style={{ margin: "0 0 1rem 0", fontWeight: 600, color: "#1e293b" }}>
        Registra los datos del comprobante de pago presencial (obligatorio para guardar la matrícula):
      </p>
      <div className="form-grid">
        <InputField
          label="Número de voucher / recibo"
          id="enrollment-voucher-number"
          required
          maxLength={60}
          placeholder="Ej. BOL-001245"
          value={value.numero}
          onChange={(event) =>
            onChange({ ...value, numero: event.target.value })
          }
        />
        <InputField
          label="Fecha de pago"
          id="enrollment-voucher-date"
          type="date"
          required
          value={value.fechaPago}
          onChange={(event) =>
            onChange({ ...value, fechaPago: event.target.value })
          }
        />
        <InputField
          label="Importe pagado (S/)"
          id="enrollment-voucher-amount"
          required
          maxLength={11}
          pattern={"[0-9]{1,8}(\\.[0-9]{1,2})?"}
          inputMode="decimal"
          placeholder="Ej. 150.00"
          hint="Importe positivo, hasta dos decimales con punto. Ejemplo: 100.50."
          value={value.importe}
          onChange={(event) =>
            onChange({ ...value, importe: event.target.value })
          }
        />
      </div>
    </div>
  );
}
