import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
import { AttendanceCalculationService } from '../asistencia/attendance-calculation.service.js';
import { GradeCalculationService } from '../evaluacion/grade-calculation.service.js';
import { AuditService } from '../control/audit.service.js';
import { page, validId } from '../../common/validation.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportWorkbookService } from './report-workbook.service.js';
import {
  reportTypes,
  type ReportLanguage,
  type ReportRow,
  type ReportSnapshot,
  type ReportType,
} from './report.model.js';
import type { ExportReportDto } from './reports.dto.js';

export const reportReaders: readonly Role[] = [
  'ADMIN',
  'COORDINADOR',
  'DOCENTE',
];
const summaryReaders: readonly Role[] = ['ADMIN', 'COORDINADOR'];
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(ReportsRepository) private readonly repo: ReportsRepository,
    @Inject(ReportWorkbookService)
    private readonly workbook: ReportWorkbookService,
    @Inject(GradeCalculationService)
    private readonly grades: GradeCalculationService,
    @Inject(AttendanceCalculationService)
    private readonly attendance: AttendanceCalculationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private type(value: unknown): ReportType {
    if (typeof value !== 'string' || !reportTypes.includes(value as ReportType))
      throw new BadRequestException('Tipo de reporte inválido');
    return value as ReportType;
  }

  private async scope(
    manager: EntityManager,
    actor: Identity,
    groupId: string,
    tipo?: ReportType,
  ) {
    const roles = await authorize(
      manager,
      actor,
      tipo === 'RESUMEN_PARTICIPANTES' ? summaryReaders : reportReaders,
    );
    // Un segundo rol sin permisos B19 (por ejemplo Secretaría) no amplía el alcance docente.
    await requireGroupRead(
      manager,
      actor,
      roles.filter((role) => reportReaders.includes(role)),
      groupId,
    );
    // Todas las escrituras académicas comparten el bloqueo del grupo. Conserva el snapshot
    // hasta terminar generación y registro; una corrección concurrente se observa después.
    const group = await loadAcademicGroup(manager, groupId, true);
    return { roles, group };
  }

  private async snapshot(
    manager: EntityManager,
    group: AcademicGroup,
    tipo: ReportType,
  ): Promise<ReportSnapshot> {
    const context = await this.repo.context(manager, group.id);
    const languageByCode: Record<string, ReportLanguage | undefined> = {
      EN: 'EN',
      PT: 'PT',
      'DEMO-EN': 'EN',
      'DEMO-PT': 'PT',
    };
    const language = languageByCode[context.idiomaCodigo];
    if (!language)
      throw new ConflictException(
        'No existe una plantilla de demostración para el código de idioma del grupo',
      );
    const template = await this.workbook.template(tipo, language);
    const units = await this.repo.units(manager, context.nivelId);
    const configuration = await this.repo.configuration(manager, group.id);
    const plan = configuration
      ? await this.repo.plan(manager, configuration.plan_id)
      : null;
    const indicators = configuration
      ? await this.repo.indicators(manager, configuration.id)
      : [];
    const closure = await this.repo.closure(manager, group.id);
    const roster = await this.repo.roster(manager, group.id);
    const ids = roster.map((row) => row.matricula_id);
    const notes = await this.repo.grades(manager, ids);
    const notesByKey = new Map(
      notes.map((note) => [
        `${note.matricula_id}:${note.indicador_id}`,
        note.nota,
      ]),
    );
    const gradeSummaries = await this.grades.summaries(manager, ids);
    const attendanceSummaries = await this.attendance.summaries(manager, ids);
    const results = await this.repo.results(manager, ids);
    const byEnrollment = new Map(results.map((row) => [row.matricula_id, row]));
    const items: ReportRow[] = roster.map((row) => ({
      matriculaId: row.matricula_id,
      codigo: row.codigo_matricula,
      intento: row.numero_intento,
      estudiante: row.estudiante,
      tipoDocumento: row.tipo_documento,
      documento: row.numero_documento,
      notas: Object.fromEntries(
        indicators.map((indicator) => [
          indicator.id,
          notesByKey.get(`${row.matricula_id}:${indicator.id}`) ?? null,
        ]),
      ),
      resumenNotas: gradeSummaries.get(row.matricula_id)!,
      resumenAsistencia: attendanceSummaries.get(row.matricula_id)!,
      resultado: byEnrollment.get(row.matricula_id) ?? null,
    }));
    const confirmed = items.filter((row) => {
      const result = row.resultado;
      return (
        closure &&
        configuration &&
        plan?.estado === 'APROBADO' &&
        group.asistencia_cerrada &&
        result?.cierre_id === closure.id &&
        result.configuracion_id === configuration.id &&
        result.confirmado_at &&
        result.condicion &&
        result.nota_oficial !== null &&
        result.promedio !== null &&
        result.calculo?.configuracionId === configuration.id &&
        result.calculo?.planId === plan.id &&
        result.calculo?.planVersion === plan.version
      );
    });
    const confirmedIds = new Set(confirmed.map((row) => row.matriculaId));
    // La misma procedencia rige los conteos y las filas que consumen web y XLSX.
    // Los resultados legacy solo generan advertencias y siguen incluidos en la revisión.
    for (const row of items)
      if (!confirmedIds.has(row.matriculaId)) row.resultado = null;
    const completeResults = !!items.length && confirmed.length === items.length;
    const resumen = {
      matriculas: items.length,
      aprobados: completeResults
        ? confirmed.filter((row) => row.resultado!.condicion === 'APROBADO')
            .length
        : null,
      desaprobados: completeResults
        ? confirmed.filter((row) => row.resultado!.condicion === 'DESAPROBADO')
            .length
        : null,
      retirados: completeResults
        ? confirmed.filter(
            (row) => row.resultado!.condicion === 'RETIRADO_INASISTENCIA',
          ).length
        : null,
      resultadosPendientes: items.length - confirmed.length,
    };
    const activeUnits = units.filter((unit) => unit.activo);
    const creditsComplete =
      !!activeUnits.length &&
      activeUnits.every((unit) => unit.creditos !== null);
    const tenths = creditsComplete
      ? activeUnits.reduce(
          (sum, unit) => sum + BigInt(unit.creditos!.replace('.', '')),
          0n,
        )
      : null;
    const anexo = {
      idioma: context.idioma,
      nivel: context.nivel,
      creditos: tenths === null ? null : `${tenths / 10n}.${tenths % 10n}`,
      horas: activeUnits.length
        ? activeUnits.reduce(
            (sum, unit) => sum + unit.horas_teoricas + unit.horas_practicas,
            0,
          )
        : null,
      fechaInicio: group.fecha_inicio,
      fechaFin: group.fecha_fin,
      matriculados: items.length,
      aprobados: resumen.aprobados,
    };
    const pendientes: string[] = [];
    if (!items.length)
      pendientes.push('No hay matrículas activas o cerradas para exportar');
    if (items.length > 5000)
      pendientes.push(
        'El grupo supera el límite de 5000 matrículas por exportación',
      );
    if (indicators.length > 100)
      pendientes.push(
        'El grupo supera el límite de 100 indicadores por exportación',
      );
    if (
      tipo === 'MATRIZ_NOTAS' &&
      (!configuration || plan?.estado !== 'APROBADO' || !indicators.length)
    )
      pendientes.push(
        'Aplica criterios de evaluación aprobados al grupo; los criterios históricos no se consideran aprobados',
      );
    if (!/^[a-f0-9]{64}$/.test(template.sha256))
      pendientes.push('La plantilla no tiene un hash válido');
    const advertencias = [
      'BORRADOR de demostración: plantilla propuesta, sin emisión ni aprobación institucional.',
      'Datos institucionales, familia CNOF, tipo de programa, modalidad y destinatario externo pendientes de confirmación.',
      'Idioma y nivel son equivalencias propuestas para programa y módulo; las fechas corresponden al periodo, no acreditan fechas reales de clases.',
      'El conteo de matriculados incluye los intentos de matrículas activas o cerradas del grupo, también los retirados; no cuenta personas únicas.',
    ];
    if (!completeResults)
      advertencias.push(
        'Conteos de aprobados, desaprobados y retirados pendientes hasta contar con todos los resultados confirmados en el acta vigente.',
      );
    if (
      results.some(
        (result) =>
          !result.cierre_id || !result.configuracion_id || !result.calculo,
      )
    )
      advertencias.push(
        'Existen resultados históricos sin procedencia verificable del acta; no se presentan como condición confirmada.',
      );
    if (items.some((row) => row.resumenNotas.calificacionesPendientes))
      advertencias.push(
        'Las calificaciones pendientes se exportan vacías; una nota cero conserva su valor numérico.',
      );
    if (
      items.some(
        (row) =>
          row.resumenAsistencia.estado !== 'CALCULADO' ||
          !row.resumenAsistencia.cierreConfirmado,
      )
    )
      advertencias.push(
        'La asistencia incompleta o todavía sin cierre puede mostrar un porcentaje parcial o provisional; no determina una condición confirmada.',
      );
    if (anexo.creditos === null || anexo.horas === null)
      advertencias.push(
        'Créditos u horas del nivel pendientes de completar; el borrador conserva esos campos vacíos.',
      );
    const inputs = await this.repo.inputs(manager, group.id);
    const revision = hash(
      JSON.stringify({
        grupo: group,
        hoy: await academicDate(manager),
        contexto: context,
        unidades: units,
        configuracion: configuration,
        plan,
        cierre: closure,
        plantilla: template,
        indicadores: indicators,
        items,
        notas: notes,
        resultados: results,
        entradas: inputs,
        resumen,
        anexo,
      }),
    );
    return {
      grupo: group,
      tipo,
      plantilla: template,
      revision,
      puedeExportar: pendientes.length === 0,
      pendientes,
      advertencias,
      resumen,
      indicadores: indicators,
      items,
      anexo,
    };
  }

  async preview(
    actor: Identity,
    groupId: string,
    query: Record<string, unknown>,
  ) {
    validId(groupId);
    const { after, limit } = page(query, ['tipo']);
    const tipo = this.type(query.tipo);
    return this.source.transaction(async (manager) => {
      const { group } = await this.scope(manager, actor, groupId, tipo);
      const snapshot = await this.snapshot(manager, group, tipo);
      const rows = snapshot.items
        .filter((row) => BigInt(row.matriculaId) > BigInt(after))
        .slice(0, limit + 1);
      return {
        ...snapshot,
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1]!.matriculaId : null,
      };
    });
  }

  async export(
    actor: Identity,
    groupId: string,
    dto: ExportReportDto,
    ip?: string,
  ) {
    validId(groupId);
    const tipo = this.type(dto.tipo);
    return this.source.transaction(async (manager) => {
      const { group } = await this.scope(manager, actor, groupId, tipo);
      const snapshot = await this.snapshot(manager, group, tipo);
      if (snapshot.revision !== dto.revision)
        throw new ConflictException(
          'Los datos o la plantilla cambiaron. Recarga y revisa antes de exportar',
        );
      if (!snapshot.puedeExportar)
        throw new ConflictException(snapshot.pendientes.join('. '));
      const buffer = await this.workbook.render(snapshot);
      const context = await this.repo.context(manager, groupId);
      const filename = `BORRADOR-${tipo}-${snapshot.plantilla.idioma}-grupo-${groupId}.xlsx`;
      const metadata = await this.repo.insert(manager, {
        usuarioId: actor.id,
        tipo,
        grupoId: groupId,
        filtros: {
          grupoId: groupId,
          periodoId: group.periodo_id,
          idiomaId: context.idiomaId,
          nivelId: context.nivelId,
          tipo,
        },
        plantillaId: snapshot.plantilla.id,
        plantillaVersion: snapshot.plantilla.version,
        plantillaSha256: snapshot.plantilla.sha256,
        revision: snapshot.revision,
        archivoNombre: filename,
        archivoSha256: hash(buffer),
        filas: snapshot.items.length,
      });
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'EXPORT_XLSX',
          entidad: 'exportaciones',
          entidadId: metadata.id,
          nuevo: metadata,
          ip,
        },
        manager,
      );
      return { buffer, filename, id: metadata.id };
    });
  }

  async history(
    actor: Identity,
    groupId: string,
    query: Record<string, unknown>,
  ) {
    validId(groupId);
    const { after, limit } = page(query);
    return this.source.transaction(async (manager) => {
      const { roles } = await this.scope(manager, actor, groupId);
      const rows = await this.repo.history(
        manager,
        groupId,
        after,
        limit,
        !roles.some((role) => summaryReaders.includes(role)),
      );
      return {
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
      };
    });
  }
}
