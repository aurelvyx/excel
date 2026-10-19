/** Día civil único para las operaciones académicas, independiente de la zona del host. */
export const academicDateSql =
  "(CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date";
