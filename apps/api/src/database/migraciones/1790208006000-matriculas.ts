import type { MigrationInterface, QueryRunner } from 'typeorm';
export class Matriculas1790208006000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE matriculas ALTER COLUMN codigo TYPE varchar(50);
      CREATE FUNCTION conservar_codigo_matricula() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.codigo IS DISTINCT FROM OLD.codigo OR NEW.registrado_por IS DISTINCT FROM OLD.registrado_por
          OR NEW.fecha_matricula IS DISTINCT FROM OLD.fecha_matricula
          OR (OLD.estado<>'PENDIENTE' AND NEW.voucher_id IS DISTINCT FROM OLD.voucher_id) THEN
          RAISE EXCEPTION 'Se conserva el código y origen de la matrícula' USING ERRCODE='23001';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER matriculas_codigo_inmutable BEFORE UPDATE ON matriculas FOR EACH ROW EXECUTE FUNCTION conservar_codigo_matricula();`);
  }
  async down(r: QueryRunner): Promise<void> {
    const [row] = await r.query(
      'SELECT EXISTS(SELECT 1 FROM matriculas) AS occupied',
    );
    if (row.occupied)
      throw new Error('No se revierte B08 con historial persistido');
    await r.query(
      'DROP TRIGGER matriculas_codigo_inmutable ON matriculas; DROP FUNCTION conservar_codigo_matricula(); ALTER TABLE matriculas ALTER COLUMN codigo TYPE varchar(40)',
    );
  }
}
