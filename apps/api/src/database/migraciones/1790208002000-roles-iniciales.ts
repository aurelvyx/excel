import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RolesIniciales1790208002000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO roles (codigo, nombre, descripcion) VALUES
      ('ADMIN', 'Administrador', 'Configuración y control administrativo'),
      ('SECRETARIA', 'Secretaría', 'Registro y gestión de matrícula'),
      ('DOCENTE', 'Docente', 'Registro académico de grupos asignados'),
      ('COORDINADOR', 'Coordinación o dirección', 'Consulta y revisión académica')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Las FK impiden retirar roles que ya estén asignados.
    await queryRunner.query(`DELETE FROM roles WHERE codigo IN ('ADMIN','SECRETARIA','DOCENTE','COORDINADOR')`);
  }
}
