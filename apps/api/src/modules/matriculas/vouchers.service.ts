import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { authorize } from '../auth/authorization.js';
import type { Identity } from '../auth/access.js';
import { AuditService } from '../control/audit.service.js';
import { page, validId } from '../../common/validation.js';
import { containsPattern, queryText } from '../../common/query-text.js';
import type { VoucherDto, VoucherDecisionDto } from './vouchers.dto.js';
import { voucherAmount, voucherDecision } from './voucher.policy.js';
export const voucherRoles = ['ADMIN', 'SECRETARIA'] as const;
type Voucher = Record<string, unknown> & {
  id: string;
  estado: string;
  matricula_id: string | null;
};
const selection = `SELECT v.id,v.estudiante_id,v.numero,v.fecha_pago::text AS fecha_pago,v.importe::text AS importe,v.estado,
 v.observacion,v.validado_por,v.validado_at,u.nombre_usuario AS responsable,
 e.codigo_estudiante,concat_ws(' ',p.nombres,p.apellido_paterno,p.apellido_materno) AS estudiante,
 p.tipo_documento,p.numero_documento,m.id AS matricula_id,m.codigo AS matricula_codigo
 FROM vouchers v JOIN estudiantes e ON e.id=v.estudiante_id JOIN personas p ON p.id=e.persona_id
 LEFT JOIN usuarios u ON u.id=v.validado_por LEFT JOIN matriculas m ON m.voucher_id=v.id`;
@Injectable()
export class VouchersService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async view(manager: EntityManager, id: string): Promise<Voucher> {
    const [row] = (await manager.query(`${selection} WHERE v.id=$1`, [
      id,
    ])) as Voucher[];
    if (!row) throw new NotFoundException('Voucher no encontrado');
    return row;
  }
  async list(actor: Identity, query: Record<string, unknown>) {
    const { after, limit } = page(query, ['q', 'estudianteId', 'estado']);
    const q = queryText(query, 'q', 120);
    const student = queryText(query, 'estudianteId', 18);
    if (student) validId(student);
    if (
      query.estado !== undefined &&
      !['PENDIENTE', 'VALIDADO', 'RECHAZADO'].includes(query.estado as string)
    )
      throw new BadRequestException('Estado inválido');
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, voucherRoles);
      const values: unknown[] = [after];
      const filters = ['v.id>$1::bigint'];
      if (q) {
        values.push(containsPattern(q));
        filters.push(
          `(v.numero ILIKE $${values.length} OR e.codigo_estudiante ILIKE $${values.length} OR p.numero_documento ILIKE $${values.length} OR concat_ws(' ',p.nombres,p.apellido_paterno,p.apellido_materno) ILIKE $${values.length})`,
        );
      }
      if (student) {
        values.push(student);
        filters.push(`v.estudiante_id=$${values.length}`);
      }
      if (query.estado !== undefined) {
        values.push(query.estado);
        filters.push(`v.estado=$${values.length}`);
      }
      values.push(limit + 1);
      const rows = (await manager.query(
        `${selection} WHERE ${filters.join(' AND ')} ORDER BY v.id LIMIT $${values.length}`,
        values,
      )) as Voucher[];
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? items.at(-1)!.id : null,
      };
    });
  }
  async get(actor: Identity, id: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, voucherRoles);
      return this.view(manager, id);
    });
  }
  async revenueSummary(actor: Identity, query: Record<string, unknown>) {
    const periodoId = queryText(query, 'periodoId', 18);
    const grupoId = queryText(query, 'grupoId', 18);
    if (periodoId) validId(periodoId);
    if (grupoId) validId(grupoId);

    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, voucherRoles);

      const values: unknown[] = [];
      const clauses = ["v.estado = 'VALIDADO'", "m.estado <> 'ANULADA'"];

      if (periodoId) {
        values.push(periodoId);
        clauses.push(`pa.id = $${values.length}::bigint`);
      }
      if (grupoId) {
        values.push(grupoId);
        clauses.push(`g.id = $${values.length}::bigint`);
      }

      const items = (await manager.query(
        `SELECT
          pa.id::text AS periodo_id,
          pa.codigo AS periodo_codigo,
          pa.nombre AS periodo_nombre,
          pa.estado AS periodo_estado,
          g.id::text AS grupo_id,
          g.codigo AS grupo_codigo,
          g.estado AS grupo_estado,
          i.nombre AS idioma,
          n.nombre AS nivel,
          t.nombre AS turno,
          s.codigo AS seccion,
          COUNT(v.id)::int AS cantidad_vouchers,
          COALESCE(SUM(v.importe), 0)::numeric(12,2)::text AS total_recaudado
        FROM vouchers v
        JOIN matriculas m ON m.voucher_id = v.id
        JOIN grupos g ON g.id = m.grupo_id
        JOIN periodos_academicos pa ON pa.id = g.periodo_id
        JOIN niveles n ON n.id = g.nivel_id
        JOIN idiomas i ON i.id = n.idioma_id
        JOIN turnos t ON t.id = g.turno_id
        JOIN secciones s ON s.id = g.seccion_id
        WHERE ${clauses.join(' AND ')}
        GROUP BY pa.id, pa.codigo, pa.nombre, pa.estado, g.id, g.codigo, g.estado, i.nombre, n.nombre, n.orden, t.nombre, s.codigo
        ORDER BY pa.fecha_inicio DESC, pa.id DESC, i.nombre ASC, n.orden ASC, g.codigo ASC`,
        values,
      )) as Array<{
        periodo_id: string;
        periodo_codigo: string;
        periodo_nombre: string;
        periodo_estado: string;
        grupo_id: string;
        grupo_codigo: string;
        grupo_estado: string;
        idioma: string;
        nivel: string;
        turno: string;
        seccion: string;
        cantidad_vouchers: number;
        total_recaudado: string;
      }>;

      const [periodos, grupos] = await Promise.all([
        manager.query(
          `SELECT id::text AS id, codigo, nombre, estado
           FROM periodos_academicos
           ORDER BY fecha_inicio DESC, id DESC`,
        ),
        manager.query(
          `SELECT g.id::text AS id, g.codigo, g.periodo_id::text AS periodo_id,
                  i.nombre AS idioma, n.nombre AS nivel, t.nombre AS turno, s.codigo AS seccion
           FROM grupos g
           JOIN niveles n ON n.id = g.nivel_id
           JOIN idiomas i ON i.id = n.idioma_id
           JOIN turnos t ON t.id = g.turno_id
           JOIN secciones s ON s.id = g.seccion_id
           ORDER BY g.codigo ASC`,
        ),
      ]);

      let totalVouchers = 0;
      let totalRecaudadoCents = 0;
      for (const row of items) {
        totalVouchers += Number(row.cantidad_vouchers) || 0;
        totalRecaudadoCents += Math.round(Number(row.total_recaudado || 0) * 100);
      }

      return {
        items,
        resumen: {
          totalVouchers,
          totalRecaudado: (totalRecaudadoCents / 100).toFixed(2),
          totalSalones: items.length,
        },
        periodos,
        grupos,
      };
    });
  }
  async create(actor: Identity, dto: VoucherDto, ip?: string) {
    let amount: string;
    try {
      amount = voucherAmount(dto.importe);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, voucherRoles);
      const [student] = (await manager.query(
        'SELECT e.activo AND p.activo AS activo FROM estudiantes e JOIN personas p ON p.id=e.persona_id WHERE e.id=$1 FOR SHARE OF e,p',
        [dto.estudianteId],
      )) as { activo: boolean }[];
      if (!student) throw new NotFoundException('Estudiante no encontrado');
      if (!student.activo)
        throw new ConflictException('El estudiante está inactivo');
      // Incluye números existentes autorizados excepcionalmente. El índice protege las altas ordinarias simultáneas.
      const [duplicate] = await manager.query(
        'SELECT id FROM vouchers WHERE btrim(numero)=$1 LIMIT 1',
        [dto.numero],
      );
      if (duplicate)
        throw new ConflictException('El número de voucher ya está registrado');
      const [inserted] = (await manager.query(
        "INSERT INTO vouchers(estudiante_id,numero,fecha_pago,importe,estado) VALUES($1,$2,$3,$4,'PENDIENTE') RETURNING id",
        [dto.estudianteId, dto.numero, dto.fechaPago, amount],
      )) as { id: string }[];
      const row = await this.view(manager, inserted!.id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CREATE',
          entidad: 'vouchers',
          entidadId: row.id,
          nuevo: row,
          ip,
        },
        manager,
      );
      return row;
    });
  }
  async decide(
    actor: Identity,
    id: string,
    dto: VoucherDecisionDto,
    ip?: string,
  ) {
    validId(id);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, voucherRoles);
      await manager.query('SELECT id FROM vouchers WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      const before = await this.view(manager, id);
      let note: string | null;
      try {
        note = voucherDecision(
          before.estado,
          !!before.matricula_id,
          dto.estado,
          dto.observacion,
        );
      } catch (error) {
        if (dto.estado === 'RECHAZADO' && !dto.observacion?.trim())
          throw new BadRequestException((error as Error).message);
        throw new ConflictException((error as Error).message);
      }
      await manager.query(
        'UPDATE vouchers SET estado=$1,observacion=$2,validado_por=$3,validado_at=CURRENT_TIMESTAMP WHERE id=$4',
        [dto.estado, note, actor.id, id],
      );
      const after = await this.view(manager, id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: dto.estado === 'VALIDADO' ? 'VALIDATE' : 'REJECT',
          entidad: 'vouchers',
          entidadId: id,
          anterior: before,
          nuevo: after,
          motivo: note ?? undefined,
          ip,
        },
        manager,
      );
      return after;
    });
  }
}
