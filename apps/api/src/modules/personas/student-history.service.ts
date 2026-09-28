import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { authorize } from '../auth/authorization.js';
import type { Identity } from '../auth/access.js';
import { page, validId } from '../../common/validation.js';
import { StudentsService, studentReaders } from './students.service.js';

const context = `SELECT m.id,m.codigo,m.numero_intento,m.fecha_matricula::text AS fecha_matricula,m.estado,m.parametro_id,
  g.codigo AS grupo,g.id AS grupo_id,n.id AS nivel_id,n.nombre AS nivel,i.nombre AS idioma,
  p.id AS periodo_id,p.nombre AS periodo,t.nombre AS turno,s.codigo AS seccion,
  CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('promedio',r.promedio::text,'notaOficial',r.nota_oficial,
  'tardanzas',r.tardanzas_total,'faltasEquivalentes',r.faltas_equivalentes::text,'inasistenciaPct',r.inasistencia_pct::text,
  'condicion',r.condicion,'calculadoAt',r.calculado_at,'confirmadoAt',r.confirmado_at) END AS resultado
  FROM matriculas m JOIN grupos g ON g.id=m.grupo_id JOIN niveles n ON n.id=m.nivel_id
  JOIN idiomas i ON i.id=n.idioma_id JOIN periodos_academicos p ON p.id=g.periodo_id
  JOIN turnos t ON t.id=g.turno_id JOIN secciones s ON s.id=g.seccion_id
  LEFT JOIN resultados_academicos r ON r.matricula_id=m.id`;
@Injectable()
export class StudentHistoryService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(StudentsService) private readonly students: StudentsService,
  ) {}
  async list(actor: Identity, id: string, query: Record<string, unknown>) {
    validId(id);
    const { after, limit } = page(query, ['nivelId', 'periodoId']);
    for (const key of ['nivelId', 'periodoId'])
      if (query[key] !== undefined) validId(query[key] as string);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      await authorize(manager, actor, studentReaders);
      await this.students.view(manager, id, false);
      const values: unknown[] = [id, after];
      const filters = ['m.estudiante_id=$1', 'm.id>$2::bigint'];
      for (const [key, column] of [
        ['nivelId', 'm.nivel_id'],
        ['periodoId', 'g.periodo_id'],
      ])
        if (query[key] !== undefined) {
          values.push(query[key]);
          filters.push(`${column}=$${values.length}`);
        }
      values.push(limit + 1);
      const rows = (await manager.query(
        `${context} WHERE ${filters.join(' AND ')} ORDER BY m.id LIMIT $${values.length}`,
        values,
      )) as { id: string }[];
      const options = await manager.query(
        `SELECT DISTINCT n.id AS nivel_id,n.nombre AS nivel,i.nombre AS idioma,p.id AS periodo_id,p.nombre AS periodo FROM matriculas m JOIN grupos g ON g.id=m.grupo_id JOIN niveles n ON n.id=m.nivel_id JOIN idiomas i ON i.id=n.idioma_id JOIN periodos_academicos p ON p.id=g.periodo_id WHERE m.estudiante_id=$1 ORDER BY n.id,p.id`,
        [id],
      );
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? items.at(-1)!.id : null,
        opciones: options,
      };
    });
  }
  async attempt(actor: Identity, id: string, attemptId: string) {
    validId(id);
    validId(attemptId);
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      await authorize(manager, actor, studentReaders);
      const [attempt] = await manager.query(
        `${context} WHERE m.estudiante_id=$1 AND m.id=$2`,
        [id, attemptId],
      );
      if (!attempt)
        throw new NotFoundException(
          'Intento no encontrado para este estudiante',
        );
      const asistencias = await manager.query(
        `SELECT s.id,s.fecha::text AS fecha,s.estado,a.codigo FROM sesiones_clase s LEFT JOIN asistencias a ON a.sesion_id=s.id AND a.matricula_id=$1 WHERE s.grupo_id=$2 ORDER BY s.fecha,s.id`,
        [attemptId, attempt.grupo_id],
      );
      const notas = await manager.query(
        `SELECT i.id,e.nombre AS evaluacion,i.codigo,i.descripcion,i.activo,c.nota::text AS nota FROM indicadores_evaluacion i JOIN evaluaciones e ON e.id=i.evaluacion_id LEFT JOIN calificaciones c ON c.indicador_id=i.id AND c.matricula_id=$1 WHERE i.grupo_id=$2 ORDER BY e.orden,e.id,i.orden,i.id`,
        [attemptId, attempt.grupo_id],
      );
      return { ...attempt, asistencias, notas };
    });
  }
}
