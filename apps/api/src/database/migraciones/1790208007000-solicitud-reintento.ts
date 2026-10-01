import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SolicitudReintento1790208007000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE matriculas ADD COLUMN clave_solicitud uuid UNIQUE;
      CREATE FUNCTION conservar_clave_solicitud() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.clave_solicitud IS DISTINCT FROM OLD.clave_solicitud THEN
          RAISE EXCEPTION 'Se conserva la clave de solicitud' USING ERRCODE='23001';
        END IF; RETURN NEW; END $$;
      CREATE TRIGGER matriculas_clave_inmutable BEFORE UPDATE ON matriculas FOR EACH ROW EXECUTE FUNCTION conservar_clave_solicitud();`);
  }
  async down(r: QueryRunner): Promise<void> {
    const [row] = await r.query(
      'SELECT EXISTS(SELECT 1 FROM matriculas) AS occupied',
    );
    if (row.occupied)
      throw new Error('No se revierte B09 con historial persistido');
    await r.query(
      'DROP TRIGGER matriculas_clave_inmutable ON matriculas; DROP FUNCTION conservar_clave_solicitud(); ALTER TABLE matriculas DROP COLUMN clave_solicitud',
    );
  }
}
