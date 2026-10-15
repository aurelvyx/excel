import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AttendanceCalculationService } from '../asistencia/attendance-calculation.service.js';
import { GradeCalculationService } from './grade-calculation.service.js';
import { determineAcademicResult } from './result.policy.js';

/** Combina las proyecciones de B13/B17 con las reglas conservadas del intento. */
@Injectable()
export class ResultCalculationService {
  constructor(
    @Inject(AttendanceCalculationService)
    private readonly attendance: AttendanceCalculationService,
    @Inject(GradeCalculationService)
    private readonly grades: GradeCalculationService,
  ) {}
  async summaries(manager: EntityManager, ids: readonly string[]) {
    const attendance = await this.attendance.summaries(manager, ids);
    const grades = await this.grades.summaries(manager, ids);
    const rules = ids.length
      ? ((await manager.query(
          `SELECT m.id,m.parametro_id,p.nota_minima::text AS nota_minima
      FROM matriculas m LEFT JOIN parametros_academicos p ON p.id=m.parametro_id WHERE m.id=ANY($1::bigint[])`,
          [ids],
        )) as {
          id: string;
          parametro_id: string;
          nota_minima: string | null;
        }[])
      : [];
    return new Map(
      rules.map((row) => {
        const resumenAsistencia = attendance.get(row.id)!;
        const resumenNotas = grades.get(row.id)!;
        return [
          row.id,
          {
            parametroId: row.parametro_id,
            notaMinima: row.nota_minima,
            resumenAsistencia,
            resumenNotas,
            calculo: determineAcademicResult({
              resumenAsistencia,
              resumenNotas,
              notaMinima: row.nota_minima,
            }),
          },
        ];
      }),
    );
  }
}
