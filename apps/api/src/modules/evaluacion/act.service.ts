import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { Identity, Role } from '../auth/access.js';
import { authorize } from '../auth/authorization.js';
import { requireGroupRead } from '../oferta-academica/group-scope.js';
import {
  academicDate,
  loadAcademicGroup,
  type AcademicGroup,
} from '../asistencia/academic-context.js';
import { AttendanceService } from '../asistencia/attendance.service.js';
import { AuditService } from '../control/audit.service.js';
import { page, validId } from '../../common/validation.js';
import { EvaluationRepository } from './evaluation.repository.js';
import { evaluationReaders } from './evaluation.service.js';
import { GradesRepository } from './grades.repository.js';
import { GradePolicyError, normalizeGrade } from './grade.policy.js';
import { ResultCalculationService } from './result-calculation.service.js';
import { ActRepository, type StoredResult } from './act.repository.js';
import type {
  CloseActDto,
  CorrectActAttendanceDto,
  CorrectActGradeDto,
} from './act.dto.js';

@Injectable()
export class ActService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(ActRepository) private readonly repo: ActRepository,
    @Inject(EvaluationRepository)
    private readonly evaluations: EvaluationRepository,
    @Inject(GradesRepository) private readonly grades: GradesRepository,
    @Inject(ResultCalculationService)
    private readonly calculation: ResultCalculationService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async review(
    manager: EntityManager,
    roles: readonly Role[],
    group: AcademicGroup,
  ) {
    const configuration = await this.evaluations.configuration(
      manager,
      group.id,
    );
    const plan = configuration
      ? await this.evaluations.plan(manager, configuration.plan_id)
      : null;
    const closure = await this.repo.closure(manager, group.id);
    const roster = await this.repo.roster(manager, group.id);
    const ids = roster.map((row) => row.matricula_id);
    const summaries = await this.calculation.summaries(manager, ids);
    const results = new Map(
      (await this.repo.groupResults(manager, group.id)).map((row) => [
        row.matricula_id,
        row,
      ]),
    );
    const items = roster.map((row) => {
      const summary = summaries.get(row.matricula_id)!;
      return {
        ...row,
        resumenAsistencia: summary.resumenAsistencia,
        resumenNotas: summary.resumenNotas,
        calculo: summary.calculo,
        resultado: results.get(row.matricula_id) ?? null,
      };
    });
    const pendientes: string[] = [];
    if (closure) pendientes.push('El acta ya está cerrada');
    if (!['ACTIVO', 'CERRADO'].includes(group.estado))
      pendientes.push(
        'El grupo debe estar activo o cerrado para cerrar su acta',
      );
    if (!['ABIERTO', 'CERRADO'].includes(group.periodo_estado))
      pendientes.push(
        'El periodo debe estar abierto o cerrado para cerrar el acta',
      );
    if (!group.asistencia_cerrada)
      pendientes.push('Cierra primero la asistencia del grupo');
    if (!configuration || plan?.estado !== 'APROBADO')
      pendientes.push('Aplica criterios de evaluación aprobados al grupo');
    if (!items.length)
      pendientes.push(
        'No hay matrículas activas o cerradas para emitir resultados',
      );
    const incomplete = items.filter((row) => !row.calculo.listo);
    if (incomplete.length)
      pendientes.push(
        `${incomplete.length} matrícula(s) con datos pendientes para determinar el resultado`,
      );
    if (!closure && results.size)
      pendientes.push(
        'Existen resultados históricos previos. Deben revisarse antes de emitir un acta nueva',
      );
    const resumen = {
      matriculas: items.length,
      listos: items.filter((row) => row.calculo.listo).length,
      aprobados: items.filter((row) => row.calculo.condicion === 'APROBADO')
        .length,
      desaprobados: items.filter(
        (row) => row.calculo.condicion === 'DESAPROBADO',
      ).length,
      retirados: items.filter(
        (row) => row.calculo.condicion === 'RETIRADO_INASISTENCIA',
      ).length,
      pendientes: incomplete.length,
    };
    const revision = createHash('sha256')
      .update(
        JSON.stringify({
          grupo: group,
          hoy: await academicDate(manager),
          configuracion: configuration,
          plan,
          cierre: closure,
          items,
          resultados: [...results.values()],
          entradas: await this.repo.inputs(manager, group.id),
        }),
      )
      .digest('hex');
    return {
      grupo: group,
      configuracion: configuration,
      plan,
      cierre: closure,
      revision,
      puedeCerrar: roles.includes('ADMIN') && pendientes.length === 0,
      puedeCorregir: roles.includes('ADMIN') && !!closure,
      pendientes,
      resumen,
      items,
    };
  }

  async list(actor: Identity, groupId: string, query: Record<string, unknown>) {
    validId(groupId);
    const { after, limit } = page(query);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      const group = await loadAcademicGroup(manager, groupId);
      const review = await this.review(manager, roles, group);
      const pageItems = review.items
        .filter((row) => BigInt(row.matricula_id) > BigInt(after))
        .slice(0, limit + 1);
      return {
        ...review,
        items: pageItems.slice(0, limit),
        nextCursor:
          pageItems.length > limit ? pageItems[limit - 1]!.matricula_id : null,
        historial: await this.repo.history(manager, groupId),
      };
    });
  }

  async detail(actor: Identity, groupId: string, enrollmentId: string) {
    validId(groupId);
    validId(enrollmentId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      await requireGroupRead(manager, actor, roles, groupId);
      const group = await loadAcademicGroup(manager, groupId);
      const review = await this.review(manager, roles, group);
      const item = review.items.find(
        (row) => row.matricula_id === enrollmentId,
      );
      if (!item)
        throw new NotFoundException(
          'Matrícula no encontrada en el acta de este grupo',
        );
      return {
        grupo: group,
        cierre: review.cierre,
        revision: review.revision,
        puedeCorregir:
          review.puedeCorregir &&
          item.resultado?.cierre_id === review.cierre?.id,
        item,
        calificaciones: await this.repo.gradeDetails(
          manager,
          groupId,
          enrollmentId,
        ),
        sesiones: await this.repo.sessions(
          manager,
          groupId,
          enrollmentId,
          group.cierre_asistencia?.fecha_corte ?? (await academicDate(manager)),
        ),
        historial: await this.repo.history(manager, groupId, enrollmentId),
      };
    });
  }

  async close(actor: Identity, groupId: string, dto: CloseActDto, ip?: string) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN']);
      const group = await loadAcademicGroup(manager, groupId, true);
      const review = await this.review(manager, roles, group);
      if (review.cierre) throw new ConflictException('El acta ya está cerrada');
      if (review.revision !== dto.revision)
        throw new ConflictException(
          'Los datos del grupo cambiaron. Recarga y revisa antes de cerrar el acta',
        );
      if (!review.puedeCerrar || !review.configuracion || !review.plan)
        throw new ConflictException(review.pendientes.join('. '));
      await manager.query("SELECT set_config('excel.act_command',$1,true)", [
        `close:${groupId}`,
      ]);
      const motivo = dto.motivo?.trim() || null;
      const [inserted] = await manager.query(
        `INSERT INTO cierres_academicos(grupo_id,tipo,estado,motivo,realizado_por,revision,resumen)
        VALUES($1,'ACTA','CERRADO',$2,$3,$4,$5) RETURNING id`,
        [
          groupId,
          motivo,
          actor.id,
          dto.revision,
          { resumen: review.resumen, items: review.items },
        ],
      );
      const closure = (await this.repo.closure(manager, groupId))!;
      const summaries = await this.calculation.summaries(
        manager,
        review.items.map((row) => row.matricula_id),
      );
      for (const item of review.items) {
        const summary = summaries.get(item.matricula_id)!;
        const snapshot = this.snapshot(
          summary,
          review.configuracion.id,
          review.plan.id,
          review.plan.version,
        );
        const values = this.resultValues(summary);
        const [result] = await manager.query(
          `INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion,confirmado_at,cierre_id,configuracion_id,calculo)
          VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,$8,$9,$10) RETURNING *`,
          [
            item.matricula_id,
            ...values,
            inserted.id,
            review.configuracion.id,
            snapshot,
          ],
        );
        await this.audit.record(
          {
            usuarioId: actor.id,
            accion: 'CONFIRM_ACT_RESULT',
            entidad: 'resultados_academicos',
            entidadId: result.id,
            nuevo: result,
            motivo: motivo ?? undefined,
            ip,
          },
          manager,
        );
      }
      await manager.query(
        "UPDATE matriculas SET estado='CERRADA' WHERE grupo_id=$1::bigint AND estado='ACTIVA'",
        [groupId],
      );
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CLOSE_ACT',
          entidad: 'cierres_academicos',
          entidadId: closure.id,
          nuevo: closure,
          motivo: motivo ?? undefined,
          ip,
        },
        manager,
      );
      return { cierre: closure, cantidadResultados: review.items.length };
    });
  }

  private snapshot(
    summary: ResultSummary,
    configurationId: string,
    planId: string,
    planVersion: number,
  ) {
    return {
      parametroId: summary.parametroId,
      notaMinima: summary.notaMinima,
      configuracionId: configurationId,
      planId,
      planVersion,
      resumenAsistencia: summary.resumenAsistencia,
      resumenNotas: summary.resumenNotas,
    };
  }
  private resultValues(summary: ResultSummary) {
    return [
      summary.resumenNotas.promedio,
      summary.resumenNotas.notaOficial,
      summary.resumenAsistencia.tardanzas,
      summary.resumenAsistencia.faltasComputables,
      summary.resumenAsistencia.inasistenciaPct,
      summary.calculo.condicion,
    ];
  }

  private async correctionContext(
    manager: EntityManager,
    groupId: string,
    enrollmentId: string,
    closureId: string,
    resultVersion: number,
  ) {
    const group = await loadAcademicGroup(manager, groupId, true);
    const closure = await this.repo.closure(manager, groupId);
    if (!closure || closure.id !== closureId)
      throw new ConflictException(
        'El acta cerrada cambió o no corresponde al grupo. Recarga antes de corregir',
      );
    const [enrollment] = await manager.query(
      'SELECT id,estado FROM matriculas WHERE id=$1::bigint AND grupo_id=$2::bigint FOR SHARE',
      [enrollmentId, groupId],
    );
    if (!enrollment)
      throw new NotFoundException('La matrícula no pertenece al grupo');
    const [before] = await this.repo.results(manager, [enrollmentId], true);
    if (
      !before ||
      before.cierre_id !== closureId ||
      !before.configuracion_id ||
      !before.calculo ||
      enrollment.estado !== 'CERRADA'
    )
      throw new ConflictException(
        'Solo se corrigen resultados confirmados por esta acta; los registros históricos conservan su procedencia',
      );
    if (before.version !== resultVersion)
      throw new ConflictException(
        'El resultado cambió desde la consulta. Recarga antes de corregir',
      );
    await manager.query("SELECT set_config('excel.act_command',$1,true)", [
      `correct:${closureId}`,
    ]);
    return { group, closure, before };
  }

  private async recalculate(
    manager: EntityManager,
    actor: Identity,
    groupId: string,
    before: StoredResult,
    action: string,
    motivo: string,
    ip?: string,
  ) {
    const summary = (
      await this.calculation.summaries(manager, [before.matricula_id])
    ).get(before.matricula_id)!;
    if (!summary.calculo.listo || !summary.resumenAsistencia.cierreConfirmado)
      throw new ConflictException(
        'La corrección deja datos insuficientes para determinar el resultado',
      );
    const cfg = await this.evaluations.configuration(manager, groupId);
    const plan = cfg ? await this.evaluations.plan(manager, cfg.plan_id) : null;
    if (!cfg || !plan || cfg.id !== before.configuracion_id)
      throw new ConflictException(
        'Los criterios aplicados no corresponden al resultado confirmado',
      );
    await manager.query(
      `UPDATE resultados_academicos SET promedio=$2,nota_oficial=$3,tardanzas_total=$4,faltas_equivalentes=$5,inasistencia_pct=$6,condicion=$7,
      calculo=$8,version=version+1,calculado_at=GREATEST(clock_timestamp(),calculado_at) WHERE id=$1::bigint`,
      [
        before.id,
        ...this.resultValues(summary),
        this.snapshot(summary, cfg.id, plan.id, plan.version),
      ],
    );
    const after = await this.repo.result(manager, before.id);
    await this.audit.record(
      {
        usuarioId: actor.id,
        accion: action,
        entidad: 'resultados_academicos',
        entidadId: before.id,
        anterior: before,
        nuevo: after,
        motivo,
        ip,
      },
      manager,
    );
    return after;
  }

  async correctGrade(
    actor: Identity,
    groupId: string,
    dto: CorrectActGradeDto,
    ip?: string,
  ) {
    validId(groupId);
    let note: string;
    try {
      note = normalizeGrade(dto.nota);
    } catch (error) {
      if (error instanceof GradePolicyError)
        throw new BadRequestException(error.message);
      throw error;
    }
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      const { closure, before } = await this.correctionContext(
        manager,
        groupId,
        dto.matriculaId,
        dto.cierreId,
        dto.resultadoVersion,
      );
      const grade = (
        await this.grades.grades(manager, groupId, [dto.matriculaId], true)
      ).find((row) => row.id === dto.calificacionId);
      if (!grade)
        throw new NotFoundException(
          'La calificación no pertenece al intento de este grupo',
        );
      if (grade.version !== dto.version)
        throw new ConflictException(
          'La calificación cambió desde la consulta. Recarga antes de corregir',
        );
      if (grade.nota === note)
        return { cambio: false, resultado: before, cierre: closure };
      await this.grades.updateGrade(manager, grade.id, note);
      const after = await this.grades.grade(manager, grade.id);
      const motivo = dto.motivo.trim();
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CORRECT_CLOSED_GRADE',
          entidad: 'calificaciones',
          entidadId: grade.id,
          anterior: grade,
          nuevo: after,
          motivo,
          ip,
        },
        manager,
      );
      return {
        cambio: true,
        resultado: await this.recalculate(
          manager,
          actor,
          groupId,
          before,
          'CORRECT_ACT_GRADE',
          motivo,
          ip,
        ),
        cierre: closure,
      };
    });
  }

  async correctAttendance(
    actor: Identity,
    groupId: string,
    dto: CorrectActAttendanceDto,
    ip?: string,
  ) {
    validId(groupId);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      const { group, closure, before } = await this.correctionContext(
        manager,
        groupId,
        dto.matriculaId,
        dto.cierreId,
        dto.resultadoVersion,
      );
      if (!group.cierre_asistencia)
        throw new ConflictException(
          'No existe cierre de asistencia para corregir',
        );
      const saved = await this.attendance.correctWithinTransaction(
        manager,
        actor,
        groupId,
        dto.sesionId,
        {
          matriculaId: dto.matriculaId,
          cierreId: group.cierre_asistencia.id,
          codigo: dto.codigo,
          observacion: dto.observacion,
          version: dto.version,
          motivo: dto.motivo,
        },
        ip,
      );
      const changed = saved.items[0]!.version !== dto.version;
      return {
        cambio: changed,
        resultado: changed
          ? await this.recalculate(
              manager,
              actor,
              groupId,
              before,
              'CORRECT_ACT_ATTENDANCE',
              dto.motivo.trim(),
              ip,
            )
          : before,
        cierre: closure,
      };
    });
  }
}

type ResultSummary =
  Awaited<ReturnType<ResultCalculationService['summaries']>> extends Map<
    string,
    infer T
  >
    ? T
    : never;
