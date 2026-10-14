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
import { readers } from '../oferta-academica/catalogs.js';
import {
  assignedGroupSql,
  assignedToGroup,
  requireGroupRead,
} from '../oferta-academica/group-scope.js';
import {
  loadAcademicGroup,
  type AcademicGroup,
} from '../asistencia/academic-context.js';
import { validId } from '../../common/validation.js';
import type {
  ApplyEvaluationPlanDto,
  ApproveEvaluationPlanDto,
  CreateEvaluationPlanDto,
  UpdateEvaluationPlanDto,
} from './evaluation.dto.js';
import {
  EvaluationRepository,
  type EvaluationLevel,
  type EvaluationPlan,
} from './evaluation.repository.js';
import {
  EvaluationDefinitionError,
  normalizeEvaluationDefinition,
  validateEvaluationDefinition,
  gradeClosureReadiness,
  type EvaluationDefinition,
} from './evaluation.policy.js';

export const evaluationReaders: readonly Role[] = [...readers, 'DOCENTE'];
export const supportedEvaluationFormula = 'PONDERADA_JERARQUICA_V1';

@Injectable()
export class EvaluationService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(EvaluationRepository) private readonly repo: EvaluationRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async requireLevelRead(
    manager: EntityManager,
    actor: Identity,
    roles: readonly Role[],
    id: string,
  ) {
    if (readers.some((role) => roles.includes(role))) return;
    const [row] = await manager.query(
      `SELECT EXISTS(SELECT 1 FROM grupos g WHERE g.nivel_id=$1::bigint AND ${assignedGroupSql('g.id', '$2::bigint')}) AS allowed`,
      [id, actor.id],
    );
    if (!row.allowed)
      throw new ForbiddenException('Nivel sin grupos asignados');
  }
  private requireAvailable(level: EvaluationLevel) {
    if (!level.activo || !level.idioma_activo)
      throw new ConflictException(
        'El nivel o idioma está inactivo; se conserva en consulta',
      );
  }
  private normalize(input: EvaluationDefinition) {
    try {
      return normalizeEvaluationDefinition(input);
    } catch (error) {
      if (error instanceof EvaluationDefinitionError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  private async requireUnits(
    manager: EntityManager,
    levelId: string,
    definition: EvaluationDefinition,
  ) {
    const ids = [
      ...new Set(
        definition.evaluaciones.flatMap((e) =>
          e.unidadId ? [e.unidadId] : [],
        ),
      ),
    ];
    if (!ids.length) return;
    const rows = await manager.query(
      'SELECT id FROM unidades_didacticas WHERE nivel_id=$1::bigint AND id=ANY($2::bigint[]) AND activo ORDER BY id FOR UPDATE',
      [levelId, ids],
    );
    if (rows.length !== ids.length)
      throw new ConflictException(
        'Las unidades deben estar activas y pertenecer al mismo nivel',
      );
  }
  private async planView(
    manager: EntityManager,
    roles: readonly Role[],
    plan: EvaluationPlan,
  ) {
    const level = await this.repo.level(manager, plan.nivel_id);
    const available = level.activo && level.idioma_activo;
    const admin = roles.includes('ADMIN');
    const editable = admin && available && plan.estado === 'BORRADOR';
    const unidades = await this.repo.units(manager, level.id);
    const validacion = validateEvaluationDefinition(plan.estructura);
    if (plan.estado === 'BORRADOR') {
      const activeUnits = new Set(
        unidades
          .filter((unit: { activo: boolean }) => unit.activo)
          .map((unit: { id: string }) => unit.id),
      );
      for (const component of plan.estructura.evaluaciones) {
        if (component.unidadId && !activeUnits.has(component.unidadId))
          validacion.errores.push(
            `${component.nombre}: la unidad vinculada no está disponible en este nivel`,
          );
      }
      validacion.completa = validacion.errores.length === 0;
    }
    return {
      plan,
      nivel: level,
      unidades,
      puedeEditar: editable,
      puedeAprobar: editable && validacion.completa,
      motivoSoloLectura:
        plan.estado === 'APROBADO'
          ? 'La versión aprobada se conserva sin cambios. Crea una nueva versión para otros grupos'
          : !available
            ? 'Nivel o idioma inactivo'
            : !admin
              ? 'La configuración y el registro de aprobación corresponden al administrador'
              : null,
      validacion,
      historial: await this.repo.history(manager, plan.id),
    };
  }
  async levels(actor: Identity) {
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      const all = readers.some((role) => roles.includes(role));
      const items = await manager.query(
        `SELECT n.id,n.nombre,i.nombre AS idioma FROM niveles n JOIN idiomas i ON i.id=n.idioma_id
        ${all ? '' : `WHERE EXISTS(SELECT 1 FROM grupos g WHERE g.nivel_id=n.id AND ${assignedGroupSql('g.id', '$1::bigint')})`}
        ORDER BY i.nombre,n.orden,n.id`,
        all ? [] : [actor.id],
      );
      return { items, nextCursor: null };
    });
  }
  async list(actor: Identity, levelId: string) {
    validId(levelId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      await this.requireLevelRead(manager, actor, roles, levelId);
      const nivel = await this.repo.level(manager, levelId);
      return {
        nivel,
        items: await this.repo.plans(manager, levelId),
        unidades: await this.repo.units(manager, levelId),
        puedeCrear:
          roles.includes('ADMIN') && nivel.activo && nivel.idioma_activo,
        formulaSoportada: supportedEvaluationFormula,
      };
    });
  }
  async get(actor: Identity, id: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      const plan = await this.repo.plan(manager, id);
      await this.requireLevelRead(manager, actor, roles, plan.nivel_id);
      return this.planView(manager, roles, plan);
    });
  }
  async create(
    actor: Identity,
    levelId: string,
    dto: CreateEvaluationPlanDto,
    ip?: string,
  ) {
    validId(levelId);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN']);
      const level = await this.repo.level(manager, levelId, true);
      this.requireAvailable(level);
      const definition = this.normalize(dto.estructura);
      await this.requireUnits(manager, levelId, definition);
      const [row] = await manager.query(
        `INSERT INTO planes_evaluacion(nivel_id,version,nombre,formula,estructura,creado_por)
        SELECT $1::bigint,COALESCE(max(version),0)+1,$2,$3,$4::jsonb,$5 FROM planes_evaluacion WHERE nivel_id=$1::bigint RETURNING id`,
        [
          levelId,
          dto.nombre.trim(),
          dto.formula,
          JSON.stringify(definition),
          actor.id,
        ],
      );
      const plan = await this.repo.plan(manager, row.id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CREATE_EVALUATION_PLAN',
          entidad: 'planes_evaluacion',
          entidadId: plan.id,
          nuevo: plan,
          ip,
        },
        manager,
      );
      return this.planView(manager, roles, plan);
    });
  }
  private requireDraft(plan: EvaluationPlan, revision: number) {
    if (plan.estado !== 'BORRADOR')
      throw new ConflictException(
        'La versión aprobada es inmutable; crea otra versión',
      );
    if (plan.revision !== revision)
      throw new ConflictException(
        'La versión cambió desde la consulta. Recarga antes de continuar',
      );
  }
  async update(
    actor: Identity,
    id: string,
    dto: UpdateEvaluationPlanDto,
    ip?: string,
  ) {
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN']);
      const before = await this.repo.plan(manager, id, true);
      this.requireDraft(before, dto.revision);
      this.requireAvailable(await this.repo.level(manager, before.nivel_id));
      const definition = this.normalize(dto.estructura);
      await this.requireUnits(manager, before.nivel_id, definition);
      await manager.query(
        'UPDATE planes_evaluacion SET nombre=$2,formula=$3,estructura=$4::jsonb,revision=revision+1,actualizado_at=CURRENT_TIMESTAMP WHERE id=$1::bigint',
        [id, dto.nombre.trim(), dto.formula, JSON.stringify(definition)],
      );
      const after = await this.repo.plan(manager, id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'UPDATE_EVALUATION_PLAN',
          entidad: 'planes_evaluacion',
          entidadId: id,
          anterior: before,
          nuevo: after,
          ip,
        },
        manager,
      );
      return this.planView(manager, roles, after);
    });
  }
  async approve(
    actor: Identity,
    id: string,
    dto: ApproveEvaluationPlanDto,
    ip?: string,
  ) {
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN']);
      const before = await this.repo.plan(manager, id, true);
      this.requireDraft(before, dto.revision);
      this.requireAvailable(await this.repo.level(manager, before.nivel_id));
      const validacion = validateEvaluationDefinition(before.estructura);
      if (!validacion.completa) throw new ConflictException(validacion.errores);
      await this.requireUnits(manager, before.nivel_id, before.estructura);
      await manager.query(
        `UPDATE planes_evaluacion SET estado='APROBADO',aprobado_por=$2,aprobado_at=CURRENT_TIMESTAMP,
        referencia_aprobacion=$3,revision=revision+1,actualizado_at=CURRENT_TIMESTAMP WHERE id=$1::bigint`,
        [id, actor.id, dto.referenciaAprobacion.trim()],
      );
      const after = await this.repo.plan(manager, id);
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'APPROVE_EVALUATION_PLAN',
          entidad: 'planes_evaluacion',
          entidadId: id,
          anterior: before,
          nuevo: after,
          motivo: dto.referenciaAprobacion.trim(),
          ip,
        },
        manager,
      );
      return this.planView(manager, roles, after);
    });
  }
  private async groupReason(manager: EntityManager, group: AcademicGroup) {
    if (group.estado === 'CERRADO' || group.periodo_estado === 'CERRADO')
      return 'El grupo o periodo está cerrado';
    const [used] = await manager.query(
      `SELECT EXISTS(SELECT 1 FROM evaluaciones WHERE grupo_id=$1::bigint)
      OR EXISTS(SELECT 1 FROM resultados_academicos r JOIN matriculas m ON m.id=r.matricula_id WHERE m.grupo_id=$1::bigint)
      OR EXISTS(SELECT 1 FROM cierres_academicos WHERE grupo_id=$1::bigint AND tipo='ACTA' AND estado='CERRADO') AS ocupado`,
      [group.id],
    );
    return used.ocupado
      ? 'El grupo ya conserva criterios o resultados históricos; no se sustituyen por otra versión'
      : null;
  }
  /** Proyección interna; el llamador autoriza el grupo dentro de la misma transacción. */
  async gradeReadiness(manager: EntityManager, groupId: string) {
    const configuration = await this.repo.configuration(manager, groupId);
    const [counts] = await manager.query(
      `SELECT (SELECT count(*)::int FROM matriculas WHERE grupo_id=$1::bigint AND estado IN ('ACTIVA','CERRADA')) AS matriculas,
      (SELECT count(*)::int FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id WHERE e.configuracion_id=$2::bigint AND e.activo AND i.activo) AS indicadores,
      (SELECT count(*)::int FROM calificaciones c JOIN matriculas m ON m.id=c.matricula_id
      JOIN indicadores_evaluacion i ON i.id=c.indicador_id JOIN evaluaciones e ON e.id=i.evaluacion_id
      WHERE m.grupo_id=$1::bigint AND m.estado IN ('ACTIVA','CERRADA') AND e.configuracion_id=$2::bigint AND e.activo AND i.activo) AS registradas`,
      [groupId, configuration?.id ?? null],
    );
    return gradeClosureReadiness(
      !!configuration,
      counts.matriculas,
      counts.indicadores,
      counts.registradas,
    );
  }
  /** B18 reutilizará esta validación antes de escribir el cierre real de acta. */
  async requireGradeClosureReady(manager: EntityManager, groupId: string) {
    const result = await this.gradeReadiness(manager, groupId);
    if (!result.puedeCerrar) throw new ConflictException(result.motivos);
    return result;
  }
  private async groupView(
    manager: EntityManager,
    actor: Identity,
    roles: readonly Role[],
    group: AcademicGroup,
  ) {
    const [storedGroup] = await manager.query(
      'SELECT nivel_id FROM grupos WHERE id=$1::bigint',
      [group.id],
    );
    const level = await this.repo.level(manager, storedGroup.nivel_id);
    const configuration = await this.repo.configuration(manager, group.id);
    const allowed =
      roles.includes('ADMIN') ||
      (roles.includes('DOCENTE') &&
        (await assignedToGroup(manager, actor, group.id)));
    const reason = configuration
      ? 'La versión aplicada al grupo se conserva sin cambios'
      : await this.groupReason(manager, group);
    const available = level.activo && level.idioma_activo;
    return {
      grupo: group,
      nivel: level,
      unidades: await this.repo.units(manager, level.id),
      configuracion: configuration,
      plan: configuration
        ? await this.repo.plan(manager, configuration.plan_id)
        : null,
      planesDisponibles: await this.repo.plans(manager, level.id, true),
      evaluaciones: configuration
        ? await this.repo.components(manager, configuration.id)
        : [],
      puedeAplicar: allowed && !reason && available,
      motivoSoloLectura:
        reason ??
        (!available
          ? 'Nivel o idioma inactivo'
          : !allowed
            ? 'La aplicación corresponde al administrador o docente asignado'
            : null),
      preparacionActa: await this.gradeReadiness(manager, group.id),
    };
  }
  async group(actor: Identity, id: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, evaluationReaders);
      await requireGroupRead(manager, actor, roles, id);
      return this.groupView(
        manager,
        actor,
        roles,
        await loadAcademicGroup(manager, id),
      );
    });
  }
  async apply(
    actor: Identity,
    id: string,
    dto: ApplyEvaluationPlanDto,
    ip?: string,
  ) {
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, ['ADMIN', 'DOCENTE']);
      if (
        !roles.includes('ADMIN') &&
        !(await assignedToGroup(manager, actor, id))
      )
        throw new ForbiddenException('Grupo no asignado');
      const group = await loadAcademicGroup(manager, id, true);
      if (await this.repo.configuration(manager, id))
        throw new ConflictException(
          'El grupo ya tiene una versión aplicada; se conserva su historial',
        );
      const reason = await this.groupReason(manager, group);
      if (reason) throw new ConflictException(reason);
      const [storedGroup] = await manager.query(
        'SELECT nivel_id FROM grupos WHERE id=$1::bigint',
        [id],
      );
      this.requireAvailable(
        await this.repo.level(manager, storedGroup.nivel_id),
      );
      const plan = await this.repo.plan(manager, dto.planId);
      if (plan.nivel_id !== storedGroup.nivel_id || plan.estado !== 'APROBADO')
        throw new ConflictException(
          'Se requiere una versión aprobada del mismo nivel',
        );
      await this.requireUnits(manager, plan.nivel_id, plan.estructura);
      const validation = validateEvaluationDefinition(plan.estructura);
      if (!validation.completa) throw new ConflictException(validation.errores);
      const [configuration] = await manager.query(
        'INSERT INTO configuraciones_evaluacion_grupo(grupo_id,nivel_id,plan_id,aplicado_por) VALUES($1,$2,$3,$4) RETURNING id',
        [id, plan.nivel_id, plan.id, actor.id],
      );
      await manager.query(
        "SELECT set_config('excel.evaluation_configuration',$1,true)",
        [configuration.id],
      );
      for (const component of plan.estructura.evaluaciones) {
        const [evaluation] = await manager.query(
          'INSERT INTO evaluaciones(grupo_id,configuracion_id,unidad_id,nombre,peso_pct,orden) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [
            id,
            configuration.id,
            component.unidadId,
            component.nombre,
            component.pesoPct,
            component.orden,
          ],
        );
        for (const indicator of component.indicadores)
          await manager.query(
            'INSERT INTO indicadores_evaluacion(evaluacion_id,grupo_id,codigo,descripcion,peso_pct,orden) VALUES($1,$2,$3,$4,$5,$6)',
            [
              evaluation.id,
              id,
              indicator.codigo,
              indicator.descripcion,
              indicator.pesoPct,
              indicator.orden,
            ],
          );
      }
      const after = await this.groupView(
        manager,
        actor,
        roles,
        await loadAcademicGroup(manager, id),
      );
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'APPLY_EVALUATION_PLAN',
          entidad: 'configuraciones_evaluacion_grupo',
          entidadId: configuration.id,
          nuevo: {
            configuracion: after.configuracion,
            plan: after.plan,
            evaluaciones: after.evaluaciones,
          },
          ip,
        },
        manager,
      );
      return after;
    });
  }
}
