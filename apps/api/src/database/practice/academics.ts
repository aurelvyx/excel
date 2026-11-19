import type { DataSource } from 'typeorm';
import { AuditService } from '../../modules/control/audit.service.js';
import { EnrollmentsService } from '../../modules/matriculas/enrollments.service.js';
import { VouchersService } from '../../modules/matriculas/vouchers.service.js';
import { SessionsService } from '../../modules/asistencia/sessions.service.js';
import { AttendanceService } from '../../modules/asistencia/attendance.service.js';
import { AttendanceCalculationService } from '../../modules/asistencia/attendance-calculation.service.js';
import { JustificationsService } from '../../modules/asistencia/justifications.service.js';
import type { AttendanceEntryDto } from '../../modules/asistencia/attendance.dto.js';
import type { AttendanceCode } from '../../modules/asistencia/attendance.policy.js';
import { EvaluationRepository } from '../../modules/evaluacion/evaluation.repository.js';
import { EvaluationService } from '../../modules/evaluacion/evaluation.service.js';
import { GradesRepository } from '../../modules/evaluacion/grades.repository.js';
import { GradesService } from '../../modules/evaluacion/grades.service.js';
import { GradeCalculationService } from '../../modules/evaluacion/grade-calculation.service.js';
import type { GradeEntryDto } from '../../modules/evaluacion/grades.dto.js';
import type { PracticeContext, PracticeGroup } from './model.js';

type ActiveEnrollment = { id: string; position: number };
type JustifiedAbsence = { id: string; version: number; position: number };

/** Escenarios repetibles para prueba manual; todas las escrituras usan servicios. */
export async function seedPracticeAcademics(
  source: DataSource,
  context: PracticeContext,
): Promise<void> {
  const audit = new AuditService(source);
  const enrollments = new EnrollmentsService(source, audit);
  const vouchers = new VouchersService(source, audit);
  const sessions = new SessionsService(source, audit);
  const attendanceCalculation = new AttendanceCalculationService();
  const attendance = new AttendanceService(
    source,
    audit,
    attendanceCalculation,
  );
  const justifications = new JustificationsService(
    source,
    audit,
    attendanceCalculation,
  );
  const evaluationRepository = new EvaluationRepository();
  const evaluations = new EvaluationService(
    source,
    evaluationRepository,
    audit,
  );
  const grades = new GradesService(
    source,
    new GradesRepository(),
    evaluationRepository,
    evaluations,
    new GradeCalculationService(),
    audit,
  );
  const plans = new Map<string, string>();

  async function configureEvaluation(group: PracticeGroup): Promise<void> {
    let planId = plans.get(group.nivel_id);
    if (!planId) {
      const draft = await evaluations.create(context.admin, group.nivel_id, {
        nombre: `SINTÉTICO ${context.batch} — evaluación de práctica`,
        formula: 'PONDERADA_JERARQUICA_V1',
        estructura: {
          evaluaciones: [1, 2].map((order) => ({
            nombre: `Componente sintético ${order}`,
            unidadId: null,
            pesoPct: '50.00',
            orden: order,
            indicadores: [1, 2].map((indicator) => ({
              codigo: `SYN-${order}-${indicator}`,
              descripcion: `Indicador sintético ${indicator}`,
              pesoPct: '50.00',
              orden: indicator,
            })),
          })),
        },
      });
      const approved = await evaluations.approve(context.admin, draft.plan.id, {
        revision: draft.plan.revision,
        confirmado: true,
        referenciaAprobacion:
          `EXCLUSIVAMENTE SINTÉTICA — lote ${context.batch}. ` +
          'Configuración para pruebas manuales; sin aprobación institucional.',
      });
      planId = approved.plan.id;
      plans.set(group.nivel_id, planId);
    }
    await evaluations.apply(context.admin, group.id, {
      planId,
      confirmado: true,
    });
  }

  async function justify(
    group: PracticeGroup,
    absence: JustifiedAbsence,
  ): Promise<void> {
    const profile = absence.position % 12;
    // El perfil 4 conserva una J sin expediente para ensayar su registro.
    if (profile === 4) return;
    const created = await justifications.create(context.secretary, group.id, {
      asistenciaId: absence.id,
      asistenciaVersion: absence.version,
      motivo: `SINTÉTICO ${context.batch} — solicitud de práctica`,
      fechaPresentacion: context.today,
    });
    let request = created.justificacion!;
    if (profile === 5) return;
    const resolved = await justifications.resolve(
      context.secretary,
      group.id,
      request.id,
      {
        version: request.version,
        estado: profile === 8 ? 'RECHAZADA' : 'APROBADA',
        observacion:
          'Resolución sintética para probar el flujo de justificación',
      },
    );
    request = resolved.justificacion!;
    if (profile === 7 || profile === 10)
      await justifications.recover(group.teacher, group.id, request.id, {
        version: request.version,
        estado: profile === 7 ? 'RECUPERADA' : 'NO_RECUPERADA',
        observacion: 'Recuperación sintética de práctica',
      });
  }

  async function recordAttendance(
    group: PracticeGroup,
    roster: ActiveEnrollment[],
  ): Promise<void> {
    const absences: JustifiedAbsence[] = [];
    const positions = new Map(roster.map((row) => [row.id, row.position]));
    let sessionIndex = 0;
    for (let start = 0; start < context.sessionDates.length; start += 100) {
      const scheduled = await sessions.schedule(group.teacher, group.id, {
        fechas: context.sessionDates.slice(start, start + 100),
        horaInicio: '09:00',
        horaFin: '11:00',
      });
      for (const session of scheduled.items) {
        const records: AttendanceEntryDto[] = [];
        for (const enrollment of roster) {
          const profile = enrollment.position % 12;
          // Una marca pendiente se conserva vacía, incluso en una sesión realizada.
          if (
            profile === 11 &&
            sessionIndex === context.sessionDates.length - 1
          )
            continue;
          let code: AttendanceCode = 'P';
          if (
            (profile === 1 &&
              sessionIndex < Math.floor(context.sessionDates.length * 0.3)) ||
            (profile === 2 &&
              sessionIndex <= Math.floor(context.sessionDates.length * 0.3))
          )
            code = 'F';
          if (profile === 3 && sessionIndex < 3) code = 'T';
          if (sessionIndex === 0 && [4, 5, 6, 7, 8, 10].includes(profile))
            code = 'J';
          records.push({
            matriculaId: enrollment.id,
            codigo: code,
            version: null,
            observacion: `SINTÉTICO ${context.batch} — asistencia de práctica`,
          });
        }
        for (let offset = 0; offset < records.length; offset += 100) {
          const saved = await attendance.save(
            group.teacher,
            group.id,
            session.id,
            { registros: records.slice(offset, offset + 100) },
          );
          for (const mark of saved.items)
            if (mark.codigo === 'J')
              absences.push({
                id: mark.id,
                version: mark.version,
                position: positions.get(mark.matricula_id)!,
              });
        }
        sessionIndex++;
      }
    }
    for (const absence of absences) await justify(group, absence);
  }

  async function recordGrades(
    group: PracticeGroup,
    roster: ActiveEnrollment[],
  ): Promise<void> {
    const indicators = (await source.manager.query(
      `SELECT i.id FROM indicadores_evaluacion i
       JOIN evaluaciones e ON e.id=i.evaluacion_id
       WHERE e.grupo_id=$1 ORDER BY e.orden,i.orden`,
      [group.id],
    )) as { id: string }[];
    const values = ['12.40', '12.50', '0.00', '20.00', '15.75', '10.00'];
    const records: GradeEntryDto[] = [];
    for (const enrollment of roster) {
      const profile = enrollment.position % 7;
      if (profile === 6) continue;
      for (const [index, indicator] of indicators.entries()) {
        if (profile === 5 && index === indicators.length - 1) continue;
        records.push({
          matriculaId: enrollment.id,
          indicadorId: indicator.id,
          nota: values[profile]!,
          version: null,
        });
      }
    }
    for (let offset = 0; offset < records.length; offset += 2000)
      await grades.save(group.teacher, group.id, {
        registros: records.slice(offset, offset + 2000),
      });
  }

  for (const [groupIndex, group] of context.groups.entries()) {
    const roster: ActiveEnrollment[] = [];
    let position = 0;
    for (
      let index = groupIndex;
      index < context.students.length;
      index += context.groups.length
    ) {
      const student = context.students[index]!;
      const enrollment = await enrollments.create(context.secretary, {
        estudianteId: student.id,
        grupoId: group.id,
      });
      const voucher = await vouchers.create(context.secretary, {
        estudianteId: student.id,
        numero: `SYN-${context.batch}-V-${String(index + 1).padStart(6, '0')}`,
        fechaPago: context.today,
        importe: '100.50',
      });
      if (position % 10 === 9) {
        if ((groupIndex + Math.floor(position / 10)) % 2 === 1)
          await vouchers.decide(context.secretary, voucher.id, {
            estado: 'RECHAZADO',
            observacion:
              'Rechazo sintético para probar una solicitud pendiente',
          });
      } else {
        await vouchers.decide(context.secretary, voucher.id, {
          estado: 'VALIDADO',
        });
        const active = await enrollments.activate(
          context.secretary,
          enrollment.id,
          { voucherId: voucher.id, confirmado: true },
        );
        roster.push({ id: active.id, position });
      }
      position++;
    }
    await configureEvaluation(group);
    await recordAttendance(group, roster);
    await recordGrades(group, roster);
  }
}
