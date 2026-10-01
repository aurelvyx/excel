import {
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
import { validId } from '../../common/validation.js';
import type { EnrollmentDto, ActivationDto } from './enrollments.dto.js';
import {
  enrollmentAvailability,
  enrollmentCode,
  nextAttempt,
  type Availability,
} from './enrollment.policy.js';
export const enrollmentRoles = ['ADMIN', 'SECRETARIA'] as const;
type Enrollment = Record<string, unknown> & {
  id: string;
  estudiante_id: string;
  grupo_id: string;
  estado: string;
  nivel_id: string;
};
type Group = Availability & {
  nivel_id: string;
  prerrequisito_id: string | null;
};
@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async view(manager: EntityManager, id: string): Promise<Enrollment> {
    const [row] = (await manager.query(
      `SELECT m.*,m.fecha_matricula::text AS fecha_matricula,
      jsonb_build_object('periodo',p.nombre,'periodo_id',p.id::text,'idioma',i.nombre,'idioma_id',i.id::text,
      'nivel',n.nombre,'turno',t.nombre,'seccion',s.nombre,'grupo',g.codigo) AS contexto,
      a.version AS version_reglas FROM matriculas m JOIN grupos g ON g.id=m.grupo_id
      JOIN periodos_academicos p ON p.id=g.periodo_id JOIN niveles n ON n.id=m.nivel_id
      JOIN idiomas i ON i.id=n.idioma_id JOIN turnos t ON t.id=g.turno_id JOIN secciones s ON s.id=g.seccion_id
      JOIN parametros_academicos a ON a.id=m.parametro_id WHERE m.id=$1`,
      [id],
    )) as Enrollment[];
    if (!row) throw new NotFoundException('Matrícula no encontrada');
    return row;
  }
  private async student(manager: EntityManager, id: string) {
    // Serializa los intentos de una persona, incluso entre grupos distintos del mismo nivel.
    const [row] = await manager.query(
      'SELECT e.activo AND p.activo AS activo,p.numero_documento FROM estudiantes e JOIN personas p ON p.id=e.persona_id WHERE e.id=$1 FOR UPDATE OF e FOR SHARE OF p',
      [id],
    );
    if (!row) throw new NotFoundException('Estudiante no encontrado');
    if (!row.activo) throw new ConflictException('El estudiante está inactivo');
    return row as { numero_documento: string };
  }
  private async eligible(
    manager: EntityManager,
    studentId: string,
    groupId: string,
  ): Promise<Group> {
    const [group] = (await manager.query(
      `SELECT g.nivel_id,n.prerrequisito_id,g.capacidad,g.estado AS estado_grupo,p.estado AS estado_periodo,
      n.activo AND i.activo AND t.activo AND s.activo AS activo,
      p.matricula_inicio::text,p.matricula_fin::text,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date::text AS fecha,
      (SELECT count(*)::int FROM matriculas m WHERE m.grupo_id=g.id AND m.estado IN ('ACTIVA','CERRADA')) AS ocupados
      FROM grupos g JOIN periodos_academicos p ON p.id=g.periodo_id JOIN niveles n ON n.id=g.nivel_id
      JOIN idiomas i ON i.id=n.idioma_id JOIN turnos t ON t.id=g.turno_id JOIN secciones s ON s.id=g.seccion_id
      WHERE g.id=$1 FOR UPDATE OF g FOR SHARE OF p,n,i,t,s`,
      [groupId],
    )) as Group[];
    if (!group) throw new NotFoundException('Grupo no encontrado');
    try {
      enrollmentAvailability(group);
    } catch (error) {
      throw new ConflictException((error as Error).message);
    }
    const [duplicate] = await manager.query(
      "SELECT id FROM matriculas WHERE estudiante_id=$1 AND grupo_id=$2 AND estado='ACTIVA'",
      [studentId, groupId],
    );
    if (duplicate)
      throw new ConflictException(
        'Ya existe una matrícula activa en este grupo y periodo',
      );
    if (group.prerrequisito_id) {
      const [approved] = await manager.query(
        `SELECT r.id FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id
        WHERE m.estudiante_id=$1 AND m.nivel_id=$2 AND m.estado='CERRADA' AND r.condicion='APROBADO' AND r.confirmado_at IS NOT NULL
        ORDER BY m.id LIMIT 1 FOR SHARE OF r,m`,
        [studentId, group.prerrequisito_id],
      );
      if (!approved)
        throw new ConflictException(
          'Falta aprobar el nivel prerrequisito con resultado confirmado',
        );
    }
    return group;
  }
  async get(actor: Identity, id: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, enrollmentRoles);
      return this.view(manager, id);
    });
  }
  async create(actor: Identity, dto: EnrollmentDto, ip?: string) {
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, enrollmentRoles);
      if (dto.claveSolicitud) {
        const [existing] = await manager.query(
          'SELECT id,estudiante_id,grupo_id,registrado_por FROM matriculas WHERE clave_solicitud=$1',
          [dto.claveSolicitud],
        );
        if (existing) {
          if (
            existing.estudiante_id !== dto.estudianteId ||
            existing.grupo_id !== dto.grupoId ||
            existing.registrado_por !== actor.id
          )
            throw new ConflictException(
              'La solicitud de reintento corresponde a otros datos',
            );
          return this.view(manager, existing.id);
        }
      }
      const person = await this.student(manager, dto.estudianteId);
      const group = await this.eligible(manager, dto.estudianteId, dto.grupoId);
      // Las versiones son inmutables. Una versión posterior nunca reemplaza la del intento.
      const [parameter] =
        await manager.query(`SELECT id FROM parametros_academicos WHERE vigente_desde<=CURRENT_TIMESTAMP
        AND (vigente_hasta IS NULL OR vigente_hasta>CURRENT_TIMESTAMP) ORDER BY vigente_desde DESC,version DESC LIMIT 1 FOR SHARE`);
      if (!parameter)
        throw new ConflictException(
          'No existe una versión de reglas académicas vigente',
        );
      const [history] = await manager.query(
        'SELECT coalesce(max(numero_intento),0)::int AS ultimo FROM matriculas WHERE estudiante_id=$1 AND nivel_id=$2',
        [dto.estudianteId, group.nivel_id],
      );
      let attempt: number;
      try {
        attempt = nextAttempt(history.ultimo);
      } catch (error) {
        throw new ConflictException((error as Error).message);
      }
      const [sequence] = await manager.query(
        "SELECT nextval(pg_get_serial_sequence('matriculas','id'))::text AS id",
      );
      const code = enrollmentCode(person.numero_documento, sequence.id);
      const [inserted] = await manager.query(
        `INSERT INTO matriculas(codigo,estudiante_id,grupo_id,nivel_id,parametro_id,numero_intento,fecha_matricula,estado,registrado_por,id,clave_solicitud)
        OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5,$6,$7,'PENDIENTE',$8,$9,$10) RETURNING id`,
        [
          code,
          dto.estudianteId,
          dto.grupoId,
          group.nivel_id,
          parameter.id,
          attempt,
          group.fecha,
          actor.id,
          sequence.id,
          dto.claveSolicitud ?? null,
        ],
      );
      const row = await this.view(manager, inserted.id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CREATE',
          entidad: 'matriculas',
          entidadId: row.id,
          nuevo: row,
          ip,
        },
        manager,
      );
      return row;
    });
  }
  async activate(actor: Identity, id: string, dto: ActivationDto, ip?: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, enrollmentRoles);
      const initial = await this.view(manager, id);
      await this.student(manager, initial.estudiante_id);
      await manager.query('SELECT id FROM matriculas WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      const before = await this.view(manager, id);
      if (before.estado !== 'PENDIENTE')
        throw new ConflictException('Solo se activa una solicitud pendiente');
      const group = await this.eligible(
        manager,
        before.estudiante_id,
        before.grupo_id,
      );
      if (group.nivel_id !== before.nivel_id)
        throw new ConflictException(
          'El nivel del grupo cambió; revisar la solicitud',
        );
      const [voucher] = await manager.query(
        'SELECT estudiante_id,estado FROM vouchers WHERE id=$1 FOR UPDATE',
        [dto.voucherId],
      );
      if (!voucher) throw new NotFoundException('Voucher no encontrado');
      if (
        voucher.estudiante_id !== before.estudiante_id ||
        voucher.estado !== 'VALIDADO'
      )
        throw new ConflictException(
          'Se requiere un voucher validado del mismo estudiante',
        );
      const [used] = await manager.query(
        'SELECT id FROM matriculas WHERE voucher_id=$1 AND id<>$2',
        [dto.voucherId, id],
      );
      if (used)
        throw new ConflictException(
          'El voucher ya está vinculado a otra matrícula',
        );
      await manager.query(
        "UPDATE matriculas SET voucher_id=$1,estado='ACTIVA' WHERE id=$2",
        [dto.voucherId, id],
      );
      const after = await this.view(manager, id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'ACTIVATE',
          entidad: 'matriculas',
          entidadId: id,
          anterior: before,
          nuevo: after,
          ip,
        },
        manager,
      );
      return after;
    });
  }
}
