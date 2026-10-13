import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { Identity, Role } from '../auth/access.js';
import { authorize } from '../auth/authorization.js';
import { AuditService } from '../control/audit.service.js';
import {
  assignedToGroup,
  requireGroupRead,
} from '../oferta-academica/group-scope.js';
import { page, validId } from '../../common/validation.js';
import { containsPattern, queryText } from '../../common/query-text.js';
import {
  academicDate,
  loadAcademicGroup,
  loadClassSession,
  type AcademicGroup,
} from './academic-context.js';
import { AttendanceCalculationService } from './attendance-calculation.service.js';
import { sessionReaders } from './sessions.service.js';
import {
  justificationReadOnlyReason,
  justificationTransition,
  validateJustificationPresentation,
  JustificationConflict,
  type JustificationState,
  justificationStates,
} from './justification.policy.js';
import type {
  CreateJustificationDto,
  RecoverJustificationDto,
  ResolveJustificationDto,
} from './justifications.dto.js';

type Justification = Record<string, unknown> & {
  id: string;
  estado: JustificationState;
  version: number;
};
type Absence = Record<string, unknown> & {
  asistencia_id: string;
  asistencia_version: number;
  codigo: string;
  sesion_id: string;
  fecha_sesion: string;
  estado_sesion: string;
  matricula_id: string;
  estado_matricula: string;
  justificacion: Justification | null;
};
type Context = {
  group: AcademicGroup;
  today: string;
  canRegister: boolean;
  canRecover: boolean;
};
const states: readonly string[] = ['SIN_SOLICITUD', ...justificationStates];
const selection = `SELECT a.id AS asistencia_id,a.version AS asistencia_version,a.codigo,a.sesion_id,
 s.fecha::text AS fecha_sesion,s.estado AS estado_sesion,m.id AS matricula_id,m.codigo AS codigo_matricula,
 m.numero_intento,m.estado AS estado_matricula,m.estudiante_id,
 concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) AS estudiante,p.tipo_documento,p.numero_documento,
 CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object(
 'id',j.id::text,'asistencia_id',j.asistencia_id::text,'motivo',j.motivo,'fecha_presentacion',j.fecha_presentacion,
 'estado',j.estado,'version',j.version,'registrado_por',j.registrado_por::text,'registrado_at',j.registrado_at,'registrado_nombre',ur.nombre_usuario,
 'resuelto_por',j.resuelto_por::text,'resuelto_at',j.resuelto_at,'resuelto_nombre',ud.nombre_usuario,'observacion_resolucion',j.observacion_resolucion,
 'recuperacion_confirmada_por',j.recuperacion_confirmada_por::text,'recuperacion_at',j.recuperacion_at,'recuperacion_nombre',uc.nombre_usuario,
 'observacion_recuperacion',j.observacion_recuperacion) END AS justificacion
 FROM asistencias a JOIN sesiones_clase s ON s.id=a.sesion_id JOIN matriculas m ON m.id=a.matricula_id
 JOIN estudiantes e ON e.id=m.estudiante_id JOIN personas p ON p.id=e.persona_id
 LEFT JOIN justificaciones j ON j.asistencia_id=a.id
 LEFT JOIN usuarios ur ON ur.id=j.registrado_por LEFT JOIN usuarios ud ON ud.id=j.resuelto_por
 LEFT JOIN usuarios uc ON uc.id=j.recuperacion_confirmada_por`;

@Injectable()
export class JustificationsService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AttendanceCalculationService)
    private readonly calculation: AttendanceCalculationService,
  ) {}

  private async context(
    manager: EntityManager,
    actor: Identity,
    roles: readonly Role[],
    groupId: string,
  ): Promise<Context> {
    await requireGroupRead(manager, actor, roles, groupId);
    const group = await loadAcademicGroup(manager, groupId);
    const assigned =
      roles.includes('DOCENTE') &&
      (await assignedToGroup(manager, actor, groupId));
    return {
      group,
      today: await academicDate(manager),
      canRegister: roles.includes('ADMIN') || roles.includes('SECRETARIA'),
      canRecover: roles.includes('ADMIN') || assigned,
    };
  }
  private reason(row: Absence, context: Context) {
    return justificationReadOnlyReason({
      groupState: context.group.estado,
      periodState: context.group.periodo_estado,
      enrollmentState: row.estado_matricula,
      sessionState: row.estado_sesion,
      sessionDate: row.fecha_sesion,
      today: context.today,
    });
  }
  private decorate(row: Absence, context: Context) {
    const reason = this.reason(row, context);
    const state = row.justificacion?.estado;
    const puedeRegistrar = !reason && !state && context.canRegister;
    const puedeResolver =
      !reason && state === 'PENDIENTE' && context.canRegister;
    const puedeConfirmarRecuperacion =
      !reason && state === 'APROBADA' && context.canRecover;
    let message = reason;
    if (
      !message &&
      !puedeRegistrar &&
      !puedeResolver &&
      !puedeConfirmarRecuperacion
    ) {
      message =
        state && ['RECUPERADA', 'NO_RECUPERADA', 'RECHAZADA'].includes(state)
          ? 'La justificación tiene una decisión final; se conserva para consulta'
          : state === 'APROBADA'
            ? 'La recuperación debe confirmarla el docente asignado o un administrador'
            : 'El registro y la resolución corresponden a Secretaría o Administración';
    }
    return {
      ...row,
      puedeRegistrar,
      puedeResolver,
      puedeConfirmarRecuperacion,
      motivoSoloLectura: message,
    };
  }
  private async enrich(
    manager: EntityManager,
    rows: Absence[],
    context: Context,
  ) {
    const summaries = await this.calculation.summaries(manager, [
      ...new Set(rows.map((row) => row.matricula_id)),
    ]);
    return rows.map((row) => ({
      ...this.decorate(row, context),
      resumenAsistencia: summaries.get(row.matricula_id)!,
    }));
  }
  private async view(
    manager: EntityManager,
    groupId: string,
    attendanceId: string,
  ): Promise<Absence> {
    const [row] = (await manager.query(
      `${selection} WHERE a.grupo_id=$1::bigint AND a.id=$2::bigint`,
      [groupId, attendanceId],
    )) as Absence[];
    if (!row)
      throw new NotFoundException('Asistencia no encontrada para este grupo');
    return row;
  }
  private async attendanceId(
    manager: EntityManager,
    groupId: string,
    justificationId: string,
  ): Promise<string> {
    const [row] = (await manager.query(
      'SELECT a.id FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE j.id=$1::bigint AND a.grupo_id=$2::bigint',
      [justificationId, groupId],
    )) as { id: string }[];
    if (!row)
      throw new NotFoundException(
        'Justificación no encontrada para este grupo',
      );
    return row.id;
  }
  private async lockAbsence(
    manager: EntityManager,
    groupId: string,
    attendanceId: string,
  ): Promise<Absence> {
    const first = await this.view(manager, groupId, attendanceId);
    await loadClassSession(manager, groupId, first.sesion_id, true);
    await manager.query(
      'SELECT id FROM matriculas WHERE id=$1::bigint FOR SHARE',
      [first.matricula_id],
    );
    await manager.query(
      'SELECT id FROM asistencias WHERE id=$1::bigint FOR UPDATE',
      [attendanceId],
    );
    return this.view(manager, groupId, attendanceId);
  }

  async list(actor: Identity, groupId: string, query: Record<string, unknown>) {
    validId(groupId);
    const { after, limit } = page(query, ['q', 'estado']);
    const q = queryText(query, 'q', 120);
    if (query.estado !== undefined && !states.includes(query.estado as string))
      throw new BadRequestException('Estado de justificación inválido');
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, sessionReaders);
      const context = await this.context(manager, actor, roles, groupId);
      const values: unknown[] = [groupId, after];
      const filters = [
        'a.grupo_id=$1::bigint',
        'a.id>$2::bigint',
        "a.codigo='J'",
      ];
      if (q) {
        values.push(containsPattern(q));
        filters.push(
          `(p.numero_documento ILIKE $${values.length} OR m.codigo ILIKE $${values.length} OR concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) ILIKE $${values.length})`,
        );
      }
      if (query.estado === 'SIN_SOLICITUD') filters.push('j.id IS NULL');
      else if (query.estado !== undefined) {
        values.push(query.estado);
        filters.push(`j.estado=$${values.length}`);
      }
      values.push(limit + 1);
      const rows = (await manager.query(
        `${selection} WHERE ${filters.join(' AND ')} ORDER BY a.id LIMIT $${values.length}`,
        values,
      )) as Absence[];
      const items = rows.slice(0, limit);
      return {
        items: await this.enrich(manager, items, context),
        nextCursor: rows.length > limit ? items.at(-1)!.asistencia_id : null,
        grupo: context.group,
        hoy: context.today,
      };
    });
  }
  async get(actor: Identity, groupId: string, id: string) {
    validId(groupId);
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, sessionReaders);
      const context = await this.context(manager, actor, roles, groupId);
      const row = await this.view(
        manager,
        groupId,
        await this.attendanceId(manager, groupId, id),
      );
      const [item] = await this.enrich(manager, [row], context);
      const historial = await manager.query(
        `SELECT e.id,e.accion,e.usuario_id,u.nombre_usuario,e.ocurrido_at,e.motivo,
        e.valor_anterior->>'estado' AS estado_anterior,e.valor_nuevo->>'estado' AS estado_nuevo
        FROM auditoria_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
        WHERE e.entidad='justificaciones' AND e.entidad_id=$1 ORDER BY e.id`,
        [id],
      );
      return { ...item!, historial };
    });
  }
  async create(
    actor: Identity,
    groupId: string,
    dto: CreateJustificationDto,
    ip?: string,
  ) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN', 'SECRETARIA']);
      const context = await this.context(manager, actor, roles, groupId);
      const before = await this.lockAbsence(manager, groupId, dto.asistenciaId);
      const reason = this.reason(before, context);
      if (reason) throw new ConflictException(reason);
      if (before.codigo !== 'J')
        throw new BadRequestException(
          'La solicitud requiere una marca J registrada por el docente',
        );
      if (before.asistencia_version !== dto.asistenciaVersion)
        throw new ConflictException(
          'La asistencia cambió desde tu consulta. Recarga antes de registrar',
        );
      if (before.justificacion)
        throw new ConflictException(
          'Esta asistencia ya tiene una solicitud de justificación',
        );
      try {
        validateJustificationPresentation(
          dto.fechaPresentacion,
          before.fecha_sesion,
          context.today,
        );
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      await manager.query(
        `INSERT INTO justificaciones(asistencia_id,motivo,fecha_presentacion,estado,registrado_por)
        VALUES($1,$2,$3,'PENDIENTE',$4)`,
        [dto.asistenciaId, dto.motivo.trim(), dto.fechaPresentacion, actor.id],
      );
      const after = await this.view(manager, groupId, dto.asistenciaId);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CREATE',
          entidad: 'justificaciones',
          entidadId: after.justificacion!.id,
          nuevo: after.justificacion!,
          motivo: dto.motivo.trim(),
          ip,
        },
        manager,
      );
      return (await this.enrich(manager, [after], context))[0]!;
    });
  }
  async resolve(
    actor: Identity,
    groupId: string,
    id: string,
    dto: ResolveJustificationDto,
    ip?: string,
  ) {
    return this.transition(actor, groupId, id, dto, false, ip);
  }
  async recover(
    actor: Identity,
    groupId: string,
    id: string,
    dto: RecoverJustificationDto,
    ip?: string,
  ) {
    return this.transition(actor, groupId, id, dto, true, ip);
  }
  private async transition(
    actor: Identity,
    groupId: string,
    id: string,
    dto: ResolveJustificationDto | RecoverJustificationDto,
    recovery: boolean,
    ip?: string,
  ) {
    validId(groupId);
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(
        manager,
        actor,
        recovery ? ['ADMIN', 'DOCENTE'] : ['ADMIN', 'SECRETARIA'],
      );
      const context = await this.context(manager, actor, roles, groupId);
      if (recovery && !context.canRecover)
        throw new ForbiddenException(
          'Solo el docente asignado o un administrador confirma la recuperación',
        );
      const attendanceId = await this.attendanceId(manager, groupId, id);
      await this.lockAbsence(manager, groupId, attendanceId);
      await manager.query(
        'SELECT id FROM justificaciones WHERE id=$1::bigint FOR UPDATE',
        [id],
      );
      const before = await this.view(manager, groupId, attendanceId);
      const reason = this.reason(before, context);
      if (reason) throw new ConflictException(reason);
      const previous = before.justificacion!;
      try {
        justificationTransition(
          previous.estado,
          dto.estado,
          dto.version,
          previous.version,
        );
      } catch (error) {
        if (error instanceof JustificationConflict)
          throw new ConflictException(error.message);
        throw error;
      }
      const note = dto.observacion?.trim() || null;
      await manager.query(
        recovery
          ? `UPDATE justificaciones SET estado=$2,version=version+1,recuperacion_confirmada_por=$3,recuperacion_at=CURRENT_TIMESTAMP,observacion_recuperacion=$4 WHERE id=$1::bigint`
          : `UPDATE justificaciones SET estado=$2,version=version+1,resuelto_por=$3,resuelto_at=CURRENT_TIMESTAMP,observacion_resolucion=$4 WHERE id=$1::bigint`,
        [id, dto.estado, actor.id, note],
      );
      const after = await this.view(manager, groupId, attendanceId);
      const actions = {
        APROBADA: 'APPROVE',
        RECHAZADA: 'REJECT',
        RECUPERADA: 'RECOVER',
        NO_RECUPERADA: 'NOT_RECOVERED',
      };
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: actions[dto.estado],
          entidad: 'justificaciones',
          entidadId: id,
          anterior: previous,
          nuevo: after.justificacion!,
          motivo: note ?? undefined,
          ip,
        },
        manager,
      );
      return (await this.enrich(manager, [after], context))[0]!;
    });
  }
}
