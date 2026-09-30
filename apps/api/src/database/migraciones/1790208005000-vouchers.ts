import type { MigrationInterface, QueryRunner } from 'typeorm';
/** B07: identidad del comprobante, decisión única y número ordinario sin reutilización. */
export class Vouchers1790208005000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`
  CREATE INDEX vouchers_numero_busqueda ON vouchers(btrim(numero));
  CREATE INDEX vouchers_estado_id ON vouchers(estado,id);
  CREATE FUNCTION proteger_voucher() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
   IF TG_OP='INSERT' THEN
    PERFORM pg_advisory_xact_lock(20260924,7);
    IF NEW.duplicado_autorizado_por IS NULL AND EXISTS(SELECT 1 FROM vouchers WHERE btrim(numero)=btrim(NEW.numero)) THEN
     RAISE EXCEPTION 'Número de voucher registrado' USING ERRCODE='23505';
    END IF;
   ELSE
    IF ROW(OLD.estudiante_id,OLD.numero,OLD.fecha_pago,OLD.importe,OLD.duplicado_autorizado_por,OLD.duplicado_motivo) IS DISTINCT FROM ROW(NEW.estudiante_id,NEW.numero,NEW.fecha_pago,NEW.importe,NEW.duplicado_autorizado_por,NEW.duplicado_motivo) THEN
     RAISE EXCEPTION 'Se conserva la identidad del voucher' USING ERRCODE='23001';
    END IF;
    IF OLD.estado<>'PENDIENTE' OR NEW.estado NOT IN ('VALIDADO','RECHAZADO') OR EXISTS(SELECT 1 FROM matriculas WHERE voucher_id=OLD.id) THEN
     RAISE EXCEPTION 'Voucher resuelto o utilizado' USING ERRCODE='23001';
    END IF;
    IF NEW.estado='RECHAZADO' AND (NEW.observacion IS NULL OR btrim(NEW.observacion)='') THEN
     RAISE EXCEPTION 'Rechazo sin motivo' USING ERRCODE='23514';
    END IF;
   END IF;
   RETURN NEW;
  END $$;
  CREATE TRIGGER vouchers_integridad BEFORE INSERT OR UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION proteger_voucher();
 `);
  }
  async down(r: QueryRunner): Promise<void> {
    const [row] = await r.query(
      'SELECT EXISTS(SELECT 1 FROM vouchers) AS occupied',
    );
    if (row.occupied)
      throw new Error('No se revierte B07 con historial persistido');
    await r.query(
      'DROP TRIGGER vouchers_integridad ON vouchers; DROP FUNCTION proteger_voucher(); DROP INDEX vouchers_estado_id; DROP INDEX vouchers_numero_busqueda',
    );
  }
}
