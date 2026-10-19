import type { Resource } from "../../shared/form-types";
export const voucherStates: Record<string, string> = {
  PENDIENTE: "Pendiente",
  VALIDADO: "Validado",
  RECHAZADO: "Rechazado",
};
export const voucherResource: Resource = {
  key: "vouchers",
  path: "vouchers",
  title: "Vouchers",
  singular: "voucher",
  description:
    "Registra el comprobante del pago presencial. Se guardará pendiente de revisión.",
  columns: [],
  fields: [
    { key: "numero", label: "Número de voucher", required: true, max: 60 },
    { key: "fechaPago", label: "Fecha de pago", type: "date", required: true },
    {
      key: "importe",
      label: "Importe",
      required: true,
      max: 11,
      pattern: "[0-9]{1,8}(\\.[0-9]{1,2})?",
      hint: "Importe positivo, hasta dos decimales con punto. Ejemplo: 100.50.",
    },
  ],
};
