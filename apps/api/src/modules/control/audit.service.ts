import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

export type AuditEvent = {
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId: string;
  anterior?: Record<string, unknown>;
  nuevo?: Record<string, unknown>;
  motivo?: string;
  ip?: string;
};

@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  async record(
    event: AuditEvent,
    manager: EntityManager = this.source.manager,
  ): Promise<void> {
    // Los llamadores construyen snapshots permitidos, nunca cuerpos HTTP o credenciales.
    await manager.query(
      `INSERT INTO auditoria_eventos
      (usuario_id,accion,entidad,entidad_id,valor_anterior,valor_nuevo,motivo,ip_origen)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.usuarioId,
        event.accion,
        event.entidad,
        event.entidadId,
        event.anterior ?? null,
        event.nuevo ?? null,
        event.motivo ?? null,
        event.ip ?? null,
      ],
    );
  }
}
