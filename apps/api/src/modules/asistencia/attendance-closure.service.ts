import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { Identity, Role } from '../auth/access.js';
import { authorize } from '../auth/authorization.js';
import { AuditService } from '../control/audit.service.js';
import { requireGroupRead } from '../oferta-academica/group-scope.js';
import { validId } from '../../common/validation.js';
import {
  academicDate,
  loadAcademicGroup,
  type AcademicGroup,
} from './academic-context.js';
import { sessionReaders } from './sessions.service.js';
import { AttendanceCalculationService } from './attendance-calculation.service.js';
import type { CloseAttendanceDto } from './attendance-closure.dto.js';
import {
  AttendanceClosureConflict,
  validateAttendanceClosureRevision,
  requireAttendanceClosureConfirmation,
  attendanceClosureReadOnlyReason,
  attendanceClosureWarnings,
} from './attendance-closure.policy.js';

type ReviewRow = Record<string, unknown> & { matricula_id: string };

@Injectable()
export class AttendanceClosureService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AttendanceCalculationService)
    private readonly calculation: AttendanceCalculationService,
  ) {}

  private async review(
    manager: EntityManager,
    roles: readonly Role[],
    group: AcademicGroup,
  ) {
    const today = await academicDate(manager);
    const closure = group.cierre_asistencia;
    const cutoff = closure?.fecha_corte ?? today;
    const sessions = (await manager.query(
      'SELECT id,fecha::text,estado,hora_inicio::text,hora_fin::text FROM sesiones_clase WHERE grupo_id=$1::bigint ORDER BY id',
      [group.id],
    )) as { id: string; fecha: string; estado: string }[];
    const rows = (await manager.query(
      `SELECT m.id AS matricula_id,m.codigo AS codigo_matricula,m.numero_intento,m.estado AS estado_matricula,m.estudiante_id,m.parametro_id,
      concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) AS estudiante,p.tipo_documento,p.numero_documento
      FROM matriculas m JOIN estudiantes e ON e.id=m.estudiante_id JOIN personas p ON p.id=e.persona_id
      WHERE m.grupo_id=$1::bigint AND m.estado IN ('ACTIVA','CERRADA') ORDER BY m.id`,
      [group.id],
    )) as ReviewRow[];
    const summaries = await this.calculation.summaries(
      manager,
      rows.map((row) => row.matricula_id),
    );
    const items = rows.map((row) => ({
      ...row,
      resumenAsistencia: summaries.get(row.matricula_id)!,
    }));
    const marks = await manager.query(
      'SELECT id,sesion_id,matricula_id,codigo,observacion,version FROM asistencias WHERE grupo_id=$1::bigint ORDER BY id',
      [group.id],
    );
    const requests = await manager.query(
      `SELECT j.id,j.asistencia_id,j.estado,j.version FROM justificaciones j JOIN asistencias a ON a.id=j.asistencia_id WHERE a.grupo_id=$1::bigint ORDER BY j.id`,
      [group.id],
    );
    const advertencias = {
      sesionesComputables: sessions.filter(
        (s) => s.estado === 'REALIZADA' && s.fecha <= cutoff,
      ).length,
      sesionesProgramadas: sessions.filter((s) => s.estado === 'PROGRAMADA')
        .length,
      sesionesFuturas: sessions.filter(
        (s) => s.estado !== 'CANCELADA' && s.fecha > cutoff,
      ).length,
      sesionesCanceladas: sessions.filter((s) => s.estado === 'CANCELADA')
        .length,
      matriculasRevisables: items.length,
      marcasPendientes: items.reduce(
        (n, row) => n + row.resumenAsistencia.marcasPendientes,
        0,
      ),
      justificacionesPendientes: items.reduce(
        (n, row) => n + row.resumenAsistencia.justificadasPendientes,
        0,
      ),
    };
    const revision = createHash('sha256')
      .update(
        JSON.stringify({
          group,
          today,
          sessions,
          rows,
          marks,
          requests,
          advertencias,
        }),
      )
      .digest('hex');
    return {
      grupo: group,
      hoy: today,
      cierre: closure,
      revision,
      puedeCerrar: roles.includes('ADMIN') && !closure,
      motivoSoloLectura:
        attendanceClosureReadOnlyReason(closure?.id ?? null) ??
        (roles.includes('ADMIN')
          ? null
          : 'El cierre de asistencia corresponde al administrador'),
      advertencias,
      items,
      historial: closure ? [closure] : [],
    };
  }

  async get(actor: Identity, groupId: string) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, sessionReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      return this.review(
        manager,
        roles,
        await loadAcademicGroup(manager, groupId),
      );
    });
  }

  async close(
    actor: Identity,
    groupId: string,
    dto: CloseAttendanceDto,
    ip?: string,
  ) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN']);
      const group = await loadAcademicGroup(manager, groupId, true);
      if (group.cierre_asistencia)
        throw new ConflictException(
          'La asistencia ya está cerrada; no se vuelve a cerrar ni se reabre',
        );
      const before = await this.review(manager, roles, group);
      try {
        validateAttendanceClosureRevision(dto.revision, before.revision);
        requireAttendanceClosureConfirmation(
          attendanceClosureWarnings(before.advertencias),
          dto.confirmarPendientes,
        );
      } catch (error) {
        if (error instanceof AttendanceClosureConflict)
          throw new ConflictException(error.message);
        throw error;
      }
      const snapshot = {
        advertencias: before.advertencias,
        fechaCorte: before.hoy,
        intentos: before.items.map((row) => ({
          matriculaId: row.matricula_id,
          resumenAsistencia: row.resumenAsistencia,
        })),
      };
      await manager.query(
        `INSERT INTO cierres_academicos(grupo_id,tipo,estado,motivo,realizado_por,revision,resumen)
        VALUES($1,'ASISTENCIA','CERRADO',$2,$3,$4,$5::jsonb)`,
        [
          groupId,
          dto.motivo?.trim() || null,
          actor.id,
          before.revision,
          JSON.stringify(snapshot),
        ],
      );
      const after = await this.review(
        manager,
        roles,
        await loadAcademicGroup(manager, groupId),
      );
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CLOSE_ATTENDANCE',
          entidad: 'cierres_academicos',
          entidadId: after.cierre!.id,
          nuevo: {
            ...after.cierre!,
            resumenesCerrados: after.items.map((row) => ({
              matriculaId: row.matricula_id,
              resumenAsistencia: row.resumenAsistencia,
            })),
          },
          motivo: dto.motivo?.trim() || undefined,
          ip,
        },
        manager,
      );
      return after;
    });
  }
}
