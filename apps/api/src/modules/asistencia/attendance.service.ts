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
import {
  academicDate,
  loadAcademicGroup,
  loadClassSession,
  sessionColumns,
  type AcademicGroup,
  type ClassSession,
} from './academic-context.js';
import { sessionReaders } from './sessions.service.js';
import {
  attendanceChange,
  AttendanceConflict,
  attendanceReadOnlyReason,
  type AttendanceCode,
} from './attendance.policy.js';
import type { SaveAttendanceDto } from './attendance.dto.js';
import { AttendanceCalculationService } from './attendance-calculation.service.js';
import type { CorrectAttendanceDto } from './attendance-closure.dto.js';

type Attendance = Record<string, unknown> & {
  id: string;
  grupo_id: string;
  sesion_id: string;
  matricula_id: string;
  codigo: AttendanceCode;
  observacion: string | null;
  version: number;
};
type RosterRow = { matricula_id: string; asistencia: Attendance | null };
const attendanceColumns =
  'id,grupo_id,sesion_id,matricula_id,codigo,observacion,version,registrado_por,registrado_at,actualizado_at';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AttendanceCalculationService)
    private readonly calculation: AttendanceCalculationService,
  ) {}

  private async canWrite(
    manager: EntityManager,
    actor: Identity,
    roles: readonly Role[],
    groupId: string,
  ): Promise<boolean> {
    return (
      roles.includes('DOCENTE') &&
      (await assignedToGroup(manager, actor, groupId))
    );
  }
  private async readOnly(
    manager: EntityManager,
    canWrite: boolean,
    group: AcademicGroup,
    session: ClassSession,
  ) {
    if (group.asistencia_cerrada)
      return 'La asistencia está cerrada. Solo el administrador puede corregir con motivo e historial';
    return attendanceReadOnlyReason({
      canWrite,
      groupState: group.estado,
      periodState: group.periodo_estado,
      sessionState: session.estado,
      sessionDate: session.fecha,
      today: await academicDate(manager),
    });
  }

  async list(
    actor: Identity,
    groupId: string,
    sessionId: string,
    query: Record<string, unknown>,
  ) {
    validId(groupId);
    validId(sessionId);
    const { after, limit } = page(query);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, sessionReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      const group = await loadAcademicGroup(manager, groupId);
      const session = await loadClassSession(manager, groupId, sessionId);
      const [act] = await manager.query(
        "SELECT id FROM cierres_academicos WHERE grupo_id=$1::bigint AND tipo='ACTA' AND estado='CERRADO'",
        [groupId],
      );
      const canCorrect =
        roles.includes('ADMIN') && !act && this.correctable(group, session);
      const reason = await this.readOnly(
        manager,
        await this.canWrite(manager, actor, roles, groupId),
        group,
        session,
      );
      const rows = (await manager.query(
        `SELECT m.id AS matricula_id,m.codigo AS codigo_matricula,m.estudiante_id,m.numero_intento,m.estado AS estado_matricula,
        concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) AS estudiante,p.tipo_documento,p.numero_documento,
        ($5::boolean AND m.estado='ACTIVA') AS editable,
        ($6::boolean AND m.estado IN ('ACTIVA','CERRADA')) AS corregible,
        j.id AS "justificacionId",j.estado AS "justificacionEstado",
        CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id::text,'codigo',a.codigo,'observacion',a.observacion,
          'version',a.version,'registrado_por',a.registrado_por::text,'registrado_at',a.registrado_at,'actualizado_at',a.actualizado_at) END AS asistencia
        FROM matriculas m JOIN estudiantes e ON e.id=m.estudiante_id JOIN personas p ON p.id=e.persona_id
        LEFT JOIN asistencias a ON a.matricula_id=m.id AND a.sesion_id=$3::bigint
        LEFT JOIN justificaciones j ON j.asistencia_id=a.id
        WHERE m.grupo_id=$1::bigint AND m.id>$2::bigint AND (m.estado='ACTIVA' OR a.id IS NOT NULL OR ($7::boolean AND m.estado='CERRADA'))
        ORDER BY m.id LIMIT $4`,
        [
          groupId,
          after,
          sessionId,
          limit + 1,
          reason === null,
          canCorrect,
          group.asistencia_cerrada,
        ],
      )) as RosterRow[];
      const items = rows.slice(0, limit);
      const summaries = await this.calculation.summaries(
        manager,
        items.map((row) => row.matricula_id),
      );
      return {
        items: items.map((row) => ({
          ...row,
          resumenAsistencia: summaries.get(row.matricula_id)!,
        })),
        nextCursor: rows.length > limit ? items.at(-1)!.matricula_id : null,
        grupo: group,
        sesion: session,
        puedeEditar: reason === null,
        puedeCorregir: canCorrect,
        motivoSoloLectura: reason,
      };
    });
  }

  async save(
    actor: Identity,
    groupId: string,
    sessionId: string,
    dto: SaveAttendanceDto,
    ip?: string,
  ) {
    validId(groupId);
    validId(sessionId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['DOCENTE']);
      if (!(await this.canWrite(manager, actor, roles, groupId)))
        throw new ForbiddenException('Grupo no asignado');
      const group = await loadAcademicGroup(manager, groupId);
      const session = await loadClassSession(manager, groupId, sessionId, true);
      const reason = await this.readOnly(manager, true, group, session);
      if (reason) throw new ConflictException(reason);
      return this.persist(manager, actor, groupId, session, dto, ip);
    });
  }

  private correctable(group: AcademicGroup, session: ClassSession): boolean {
    return (
      !!group.cierre_asistencia &&
      session.estado === 'REALIZADA' &&
      session.fecha <= group.cierre_asistencia.fecha_corte
    );
  }

  async correct(
    actor: Identity,
    groupId: string,
    sessionId: string,
    dto: CorrectAttendanceDto,
    ip?: string,
  ) {
    validId(groupId);
    validId(sessionId);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      await loadAcademicGroup(manager, groupId, true);
      const [act] = await manager.query(
        "SELECT id FROM cierres_academicos WHERE grupo_id=$1::bigint AND tipo='ACTA' AND estado='CERRADO'",
        [groupId],
      );
      if (act)
        throw new ConflictException(
          'El acta está cerrada. Corrige desde el acta para recalcular el resultado académico',
        );
      return this.correctWithinTransaction(
        manager,
        actor,
        groupId,
        sessionId,
        dto,
        ip,
      );
    });
  }

  /** Uso interno por B15/B18: el llamador conserva autorización y transacción. */
  async correctWithinTransaction(
    manager: EntityManager,
    actor: Identity,
    groupId: string,
    sessionId: string,
    dto: CorrectAttendanceDto,
    ip?: string,
  ) {
    const group = await loadAcademicGroup(manager, groupId);
    const session = await loadClassSession(manager, groupId, sessionId, true);
    if (!group.cierre_asistencia || group.cierre_asistencia.id !== dto.cierreId)
      throw new ConflictException(
        'El cierre de asistencia no corresponde al registro vigente. Recarga antes de corregir',
      );
    if (!this.correctable(group, session))
      throw new ConflictException(
        'Solo se corrigen sesiones realizadas incluidas en el cierre de asistencia',
      );
    return this.persist(
      manager,
      actor,
      groupId,
      session,
      { registros: [dto] },
      ip,
      { motivo: dto.motivo.trim(), cierreId: dto.cierreId },
    );
  }

  async history(
    actor: Identity,
    groupId: string,
    sessionId: string,
    enrollmentId: string,
  ) {
    validId(groupId);
    validId(sessionId);
    validId(enrollmentId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, sessionReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      const group = await loadAcademicGroup(manager, groupId);
      await loadClassSession(manager, groupId, sessionId);
      const [enrollment] = await manager.query(
        'SELECT id FROM matriculas WHERE id=$1::bigint AND grupo_id=$2::bigint',
        [enrollmentId, groupId],
      );
      if (!enrollment)
        throw new NotFoundException('Matrícula no encontrada para este grupo');
      const [attendance] = await manager.query(
        `SELECT ${attendanceColumns} FROM asistencias WHERE sesion_id=$1::bigint AND matricula_id=$2::bigint`,
        [sessionId, enrollmentId],
      );
      const items = attendance
        ? await manager.query(
            `SELECT e.id,e.accion,e.usuario_id,u.nombre_usuario,e.ocurrido_at,e.motivo,
        CASE WHEN e.valor_anterior IS NULL THEN NULL ELSE jsonb_build_object('codigo',e.valor_anterior->>'codigo','observacion',e.valor_anterior->>'observacion','version',e.valor_anterior->'version') END AS valor_anterior,
        jsonb_build_object('codigo',e.valor_nuevo->>'codigo','observacion',e.valor_nuevo->>'observacion','version',e.valor_nuevo->'version') AS valor_nuevo
        FROM auditoria_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id
        WHERE e.entidad='asistencias' AND e.entidad_id=$1 ORDER BY e.id`,
            [attendance.id],
          )
        : [];
      return {
        asistencia: attendance ?? null,
        cierre: group.cierre_asistencia,
        items,
      };
    });
  }

  private async persist(
    manager: EntityManager,
    actor: Identity,
    groupId: string,
    session: ClassSession,
    dto: SaveAttendanceDto,
    ip?: string,
    correction?: { motivo: string; cierreId: string },
  ) {
    const sessionId = session.id;
    const ids = dto.registros.map((row) => row.matriculaId);
    const enrollments = (await manager.query(
      'SELECT id,estado FROM matriculas WHERE grupo_id=$1::bigint AND id=ANY($2::bigint[]) ORDER BY id FOR SHARE',
      [groupId, ids],
    )) as { id: string; estado: string }[];
    if (enrollments.length !== ids.length)
      throw new BadRequestException('La matrícula no pertenece al grupo');
    if (
      enrollments.some(
        (row) =>
          !(correction ? ['ACTIVA', 'CERRADA'] : ['ACTIVA']).includes(
            row.estado,
          ),
      )
    )
      throw new ConflictException(
        'Solo se gestiona asistencia de matrículas activas o, para corrección posterior al cierre, históricas cerradas',
      );
    const previous = (await manager.query(
      `SELECT ${attendanceColumns} FROM asistencias WHERE sesion_id=$1::bigint AND matricula_id=ANY($2::bigint[]) ORDER BY matricula_id FOR UPDATE`,
      [sessionId, ids],
    )) as Attendance[];
    const previousById = new Map(
      previous.map((row) => [row.matricula_id, row]),
    );
    const changes = dto.registros.map((input) => {
      const before = previousById.get(input.matriculaId) ?? null;
      try {
        return {
          matriculaId: input.matriculaId,
          before,
          ...attendanceChange(before, input),
        };
      } catch (error) {
        if (error instanceof AttendanceConflict)
          throw new ConflictException(error.message);
        throw error;
      }
    });
    const protectedMarks = (await manager.query(
      'SELECT asistencia_id FROM justificaciones WHERE asistencia_id=ANY($1::bigint[])',
      [
        changes
          .filter((row) => row.before && row.codigo !== 'J')
          .map((row) => row.before!.id),
      ],
    )) as { asistencia_id: string }[];
    if (protectedMarks.length)
      throw new ConflictException(
        'Una asistencia con expediente de justificación conserva la marca J. No se puede sustituir su historial',
      );
    if (correction)
      await manager.query(
        "SELECT set_config('excel.attendance_correction',$1,true)",
        [correction.cierreId],
      );
    // La transición de sesión y cada marca comparten la transacción y su evidencia.
    if (session.estado === 'PROGRAMADA' && changes.some((row) => row.changed)) {
      const [realized] = (await manager.query(
        `WITH updated AS (UPDATE sesiones_clase SET estado='REALIZADA' WHERE id=$1::bigint RETURNING *)
          SELECT ${sessionColumns} FROM updated`,
        [sessionId],
      )) as ClassSession[];
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'REALIZE',
          entidad: 'sesiones_clase',
          entidadId: session.id,
          anterior: session,
          nuevo: realized!,
          ip,
        },
        manager,
      );
      session = realized!;
    }
    const items: Attendance[] = [];
    for (const change of changes) {
      if (!change.changed) {
        items.push(change.before!);
        continue;
      }
      const [saved] = (
        change.before
          ? await manager.query(
              `WITH updated AS (UPDATE asistencias SET codigo=$2,observacion=$3,version=version+1,actualizado_at=CURRENT_TIMESTAMP
              WHERE id=$1::bigint RETURNING *) SELECT ${attendanceColumns} FROM updated`,
              [change.before.id, change.codigo, change.observacion],
            )
          : await manager.query(
              `INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,observacion,registrado_por)
              VALUES($1,$2,$3,$4,$5,$6) RETURNING ${attendanceColumns}`,
              [
                groupId,
                sessionId,
                change.matriculaId,
                change.codigo,
                change.observacion,
                actor.id,
              ],
            )
      ) as Attendance[];
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: correction
            ? 'CORRECT_AFTER_CLOSE'
            : change.before
              ? 'UPDATE'
              : 'CREATE',
          entidad: 'asistencias',
          entidadId: saved!.id,
          anterior: change.before ?? undefined,
          nuevo: saved!,
          motivo: correction?.motivo,
          ip,
        },
        manager,
      );
      items.push(saved!);
    }
    const summaries = await this.calculation.summaries(manager, ids);
    return {
      items,
      sesion: session,
      resumenes: ids.map((id) => ({
        matriculaId: id,
        resumenAsistencia: summaries.get(id)!,
      })),
    };
  }
}
