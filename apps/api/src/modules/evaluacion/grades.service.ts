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
import {
  assignedToGroup,
  requireGroupRead,
} from '../oferta-academica/group-scope.js';
import {
  loadAcademicGroup,
  type AcademicGroup,
} from '../asistencia/academic-context.js';
import { page, validId } from '../../common/validation.js';
import { AuditService } from '../control/audit.service.js';
import { EvaluationRepository } from './evaluation.repository.js';
import { EvaluationService, evaluationReaders } from './evaluation.service.js';
import { GradesRepository, type Grade } from './grades.repository.js';
import { GradeCalculationService } from './grade-calculation.service.js';
import { GradePolicyError, normalizeGrade } from './grade.policy.js';
import type { SaveGradesDto } from './grades.dto.js';

@Injectable()
export class GradesService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(GradesRepository) private readonly repo: GradesRepository,
    @Inject(EvaluationRepository)
    private readonly evaluations: EvaluationRepository,
    @Inject(EvaluationService) private readonly evaluation: EvaluationService,
    @Inject(GradeCalculationService)
    private readonly calculation: GradeCalculationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async context(
    manager: EntityManager,
    group: AcademicGroup,
    canWrite: boolean,
  ) {
    const configuration = await this.evaluations.configuration(
      manager,
      group.id,
    );
    const plan = configuration
      ? await this.evaluations.plan(manager, configuration.plan_id)
      : null;
    const acta = await this.repo.act(manager, group.id);
    const reason = acta.cerrada
      ? 'El acta está cerrada; las calificaciones se conservan en consulta'
      : group.estado !== 'ACTIVO' || group.periodo_estado !== 'ABIERTO'
        ? 'El grupo debe estar activo y su periodo abierto para registrar notas'
        : !configuration || plan?.estado !== 'APROBADO'
          ? 'Aplica una versión de criterios aprobados al grupo antes de registrar notas'
          : !canWrite
            ? 'El registro de notas corresponde exclusivamente al docente asignado'
            : null;
    return { configuration, plan, acta, reason };
  }
  private async canWrite(
    manager: EntityManager,
    actor: Identity,
    roles: readonly Role[],
    groupId: string,
  ) {
    return (
      roles.includes('DOCENTE') &&
      (await assignedToGroup(manager, actor, groupId))
    );
  }
  async list(actor: Identity, groupId: string, query: Record<string, unknown>) {
    validId(groupId);
    const { after, limit } = page(query);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      const group = await loadAcademicGroup(manager, groupId);
      const context = await this.context(
        manager,
        group,
        await this.canWrite(manager, actor, roles, groupId),
      );
      const rows = await this.repo.roster(
        manager,
        groupId,
        after,
        limit + 1,
        context.reason === null,
      );
      const items = rows.slice(0, limit);
      const ids = items.map((row) => row.matricula_id);
      const grades = await this.repo.grades(manager, groupId, ids);
      const summaries = await this.calculation.summaries(manager, ids);
      const byEnrollment = new Map<string, Grade[]>();
      for (const grade of grades) {
        const values = byEnrollment.get(grade.matricula_id) ?? [];
        values.push(grade);
        byEnrollment.set(grade.matricula_id, values);
      }
      return {
        items: items.map((row) => ({
          ...row,
          calificaciones: byEnrollment.get(row.matricula_id) ?? [],
          resumenNotas: summaries.get(row.matricula_id)!,
        })),
        nextCursor: rows.length > limit ? items.at(-1)!.matricula_id : null,
        grupo: group,
        acta: context.acta,
        configuracion: context.configuration,
        plan: context.plan,
        evaluaciones: context.configuration
          ? await this.evaluations.components(manager, context.configuration.id)
          : [],
        unidades: context.plan
          ? await this.evaluations.units(manager, context.plan.nivel_id)
          : [],
        puedeEditar: context.reason === null,
        motivoSoloLectura: context.reason,
        preparacionActa: await this.evaluation.gradeReadiness(manager, groupId),
      };
    });
  }
  async save(
    actor: Identity,
    groupId: string,
    dto: SaveGradesDto,
    ip?: string,
  ) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['DOCENTE']);
      if (!(await this.canWrite(manager, actor, roles, groupId)))
        throw new ForbiddenException('Grupo no asignado');
      const group = await loadAcademicGroup(manager, groupId, true);
      const context = await this.context(manager, group, true);
      if (context.reason || !context.configuration)
        throw new ConflictException(context.reason);
      const records = dto.registros.map((row) => {
        try {
          return {
            matriculaId: row.matriculaId,
            indicadorId: row.indicadorId,
            version: row.version,
            nota: normalizeGrade(row.nota),
          };
        } catch (error) {
          if (error instanceof GradePolicyError)
            throw new BadRequestException(error.message);
          throw error;
        }
      });
      const ids = [...new Set(records.map((row) => row.matriculaId))];
      const indicatorIds = [...new Set(records.map((row) => row.indicadorId))];
      const enrollments = await this.repo.enrollments(manager, groupId, ids);
      if (enrollments.length !== ids.length)
        throw new NotFoundException('La matrícula no pertenece al grupo');
      if (
        enrollments.some(
          (row) => row.estado !== 'ACTIVA' || row.tiene_resultado,
        )
      )
        throw new ConflictException(
          'Solo se editan notas de matrículas activas sin resultados académicos históricos',
        );
      const indicators = await this.repo.indicators(
        manager,
        groupId,
        context.configuration.id,
        indicatorIds,
      );
      if (indicators.length !== indicatorIds.length)
        throw new NotFoundException(
          'El indicador no pertenece a los criterios aplicados del grupo',
        );
      const previous = await this.repo.grades(manager, groupId, ids, true);
      const key = (enrollment: string, indicator: string) =>
        `${enrollment}/${indicator}`;
      const byCell = new Map(
        previous.map((row) => [key(row.matricula_id, row.indicador_id), row]),
      );
      // Validar el lote entero antes de modificar una celda.
      for (const row of records) {
        const before = byCell.get(key(row.matriculaId, row.indicadorId));
        if ((before?.version ?? null) !== row.version)
          throw new ConflictException(
            'Una calificación cambió desde la consulta. Recarga antes de continuar',
          );
      }
      const items: Grade[] = [];
      for (const row of records) {
        const before = byCell.get(key(row.matriculaId, row.indicadorId));
        if (before?.nota === row.nota) {
          items.push(before);
          continue;
        }
        let id: string;
        if (before) {
          await this.repo.updateGrade(manager, before.id, row.nota);
          id = before.id;
        } else {
          const [inserted] = await manager.query(
            'INSERT INTO calificaciones(matricula_id,indicador_id,grupo_id,nota,registrado_por) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [row.matriculaId, row.indicadorId, groupId, row.nota, actor.id],
          );
          id = inserted.id as string;
        }
        const after = await this.repo.grade(manager, id);
        await this.audit.record(
          {
            usuarioId: actor.id,
            accion: before ? 'UPDATE_GRADE' : 'CREATE_GRADE',
            entidad: 'calificaciones',
            entidadId: id,
            anterior: before,
            nuevo: after,
            ip,
          },
          manager,
        );
        items.push(after);
      }
      const summaries = await this.calculation.summaries(manager, ids);
      return {
        items,
        resumenes: ids.map((matriculaId) => ({
          matriculaId,
          resumenNotas: summaries.get(matriculaId)!,
        })),
        preparacionActa: await this.evaluation.gradeReadiness(manager, groupId),
      };
    });
  }
  async history(
    actor: Identity,
    groupId: string,
    enrollmentId: string,
    indicatorId: string,
  ) {
    for (const id of [groupId, enrollmentId, indicatorId]) validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      await loadAcademicGroup(manager, groupId);
      const [enrollment] = await this.repo.enrollments(manager, groupId, [
        enrollmentId,
      ]);
      if (!enrollment)
        throw new NotFoundException('Matrícula no encontrada para este grupo');
      const [indicator] = await manager.query(
        'SELECT id FROM indicadores_evaluacion WHERE id=$1::bigint AND grupo_id=$2::bigint',
        [indicatorId, groupId],
      );
      if (!indicator)
        throw new NotFoundException('Indicador no encontrado para este grupo');
      const grade = (
        await this.repo.grades(manager, groupId, [enrollmentId])
      ).find((row) => row.indicador_id === indicatorId);
      return {
        calificacion: grade ?? null,
        items: grade ? await this.repo.history(manager, grade.id) : [],
      };
    });
  }
}
