import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
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
        CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id::text,'codigo',a.codigo,'observacion',a.observacion,
          'version',a.version,'registrado_por',a.registrado_por::text,'registrado_at',a.registrado_at,'actualizado_at',a.actualizado_at) END AS asistencia
        FROM matriculas m JOIN estudiantes e ON e.id=m.estudiante_id JOIN personas p ON p.id=e.persona_id
        LEFT JOIN asistencias a ON a.matricula_id=m.id AND a.sesion_id=$3::bigint
        WHERE m.grupo_id=$1::bigint AND m.id>$2::bigint AND (m.estado='ACTIVA' OR a.id IS NOT NULL)
        ORDER BY m.id LIMIT $4`,
        [groupId, after, sessionId, limit + 1, reason === null],
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
      let session = await loadClassSession(manager, groupId, sessionId, true);
      const reason = await this.readOnly(manager, true, group, session);
      if (reason) throw new ConflictException(reason);
      const ids = dto.registros.map((row) => row.matriculaId);
      const enrollments = (await manager.query(
        'SELECT id,estado FROM matriculas WHERE grupo_id=$1::bigint AND id=ANY($2::bigint[]) ORDER BY id FOR SHARE',
        [groupId, ids],
      )) as { id: string; estado: string }[];
      if (enrollments.length !== ids.length)
        throw new BadRequestException('La matrícula no pertenece al grupo');
      if (enrollments.some((row) => row.estado !== 'ACTIVA'))
        throw new ConflictException(
          'Solo se puede registrar asistencia de matrículas activas',
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
      // La transición de sesión y cada marca comparten la transacción y su evidencia.
      if (
        session.estado === 'PROGRAMADA' &&
        changes.some((row) => row.changed)
      ) {
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
            accion: change.before ? 'UPDATE' : 'CREATE',
            entidad: 'asistencias',
            entidadId: saved!.id,
            anterior: change.before ?? undefined,
            nuevo: saved!,
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
    });
  }
}
