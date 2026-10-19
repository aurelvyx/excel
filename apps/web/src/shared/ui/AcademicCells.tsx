/** Celdas compartidas de las matrices académicas, sin permisos ni cálculos. */
export function StudentIdentity({
  name,
  documentType,
  documentNumber,
}: {
  name: string;
  documentType: string;
  documentNumber: string;
}) {
  return (
    <span className="academic-identity">
      {name}
      <small className="attendance-document">
        {documentType} {documentNumber}
      </small>
    </span>
  );
}

export function EnrollmentAttempt({
  code,
  attempt,
  state,
}: {
  code: string;
  attempt: number;
  state: string;
}) {
  return (
    <>
      {code}
      <small className="attendance-document">
        Intento {attempt} · {state === "ACTIVA" ? "Activa" : state}
      </small>
    </>
  );
}
