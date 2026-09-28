import { personColumns } from './person.persistence.js';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { authorize } from '../auth/authorization.js';
import type { Identity } from '../auth/access.js';
import { AuditService } from '../control/audit.service.js';
import { page, validId } from '../../common/validation.js';
import type { EditStudentDto, StudentDto } from './students.dto.js';

export const studentReaders = ['ADMIN', 'SECRETARIA', 'COORDINADOR'] as const;
export const studentWriters = ['ADMIN', 'SECRETARIA'] as const;
type Student = Record<string, unknown> & {
  id: string;
  persona_id: string;
  persona: Record<string, unknown>;
};
const personSelect = `jsonb_build_object('id',p.id::text,'tipoDocumento',p.tipo_documento,'numeroDocumento',p.numero_documento,'nombres',p.nombres,'apellidoPaterno',p.apellido_paterno,'apellidoMaterno',p.apellido_materno,'activo',p.activo`;
const privateSelect = `, 'fechaNacimiento',p.fecha_nacimiento,'telefono',p.telefono,'correo',p.correo,'direccion',p.direccion`;
const escapedLike = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
function input(
  query: Record<string, unknown>,
  key: string,
  max: number,
  required = false,
) {
  const value = query[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BadRequestException(`Filtro ${key} inválido`);
  return value.trim();
}
@Injectable()
export class StudentsService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  async view(
    manager: EntityManager,
    id: string,
    personal = true,
  ): Promise<Student> {
    const [row] = (await manager.query(
      `SELECT e.*,e.fecha_registro::text AS fecha_registro,${personSelect}${personal ? privateSelect : ''}) AS persona FROM estudiantes e JOIN personas p ON p.id=e.persona_id WHERE e.id=$1::bigint`,
      [id],
    )) as Student[];
    if (!row) throw new NotFoundException('Estudiante no encontrado');
    return row;
  }
  async list(actor: Identity, query: Record<string, unknown>) {
    const { after, limit } = page(query, [
      'q',
      'activo',
      'tipoDocumento',
      'numeroDocumento',
    ]);
    const search = input(query, 'q', 120),
      type = input(query, 'tipoDocumento', 20),
      document = input(query, 'numeroDocumento', 25);
    if (
      query.activo !== undefined &&
      !['true', 'false'].includes(query.activo as string)
    )
      throw new BadRequestException('Estado inválido');
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, studentReaders);
      const values: unknown[] = [after];
      const clauses = ['e.id>$1::bigint'];
      if (search) {
        values.push(escapedLike(search));
        clauses.push(
          `(e.codigo_estudiante ILIKE $${values.length} OR p.numero_documento ILIKE $${values.length} OR concat_ws(' ',p.nombres,p.apellido_paterno,p.apellido_materno) ILIKE $${values.length} OR concat_ws(' ',p.apellido_paterno,p.apellido_materno,p.nombres) ILIKE $${values.length})`,
        );
      }
      if (type) {
        values.push(type);
        clauses.push(`p.tipo_documento=$${values.length}`);
      }
      if (document) {
        values.push(document);
        clauses.push(`p.numero_documento=$${values.length}`);
      }
      if (query.activo !== undefined) {
        values.push(query.activo === 'true');
        clauses.push(`e.activo=$${values.length}`);
      }
      values.push(limit + 1);
      const rows = (await manager.query(
        `SELECT e.id,e.codigo_estudiante,e.fecha_registro::text AS fecha_registro,e.activo,p.tipo_documento,p.numero_documento,p.nombres,p.apellido_paterno,p.apellido_materno FROM estudiantes e JOIN personas p ON p.id=e.persona_id WHERE ${clauses.join(' AND ')} ORDER BY e.id LIMIT $${values.length}`,
        values,
      )) as Student[];
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? items.at(-1)!.id : null,
      };
    });
  }
  async get(actor: Identity, id: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      const roles = await authorize(manager, actor, studentReaders);
      return this.view(
        manager,
        id,
        studentWriters.some((role) => roles.includes(role)),
      );
    });
  }
  async document(actor: Identity, query: Record<string, unknown>) {
    if (
      Object.keys(query).some(
        (key) => !['tipoDocumento', 'numeroDocumento'].includes(key),
      )
    )
      throw new BadRequestException('Filtro no permitido');
    const type = input(query, 'tipoDocumento', 20, true),
      number = input(query, 'numeroDocumento', 25, true);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, studentWriters);
      const [row] = (await manager.query(
        `SELECT ${personSelect}) AS persona,e.id AS estudiante_id,e.codigo_estudiante FROM personas p LEFT JOIN estudiantes e ON e.persona_id=p.id WHERE p.tipo_documento=$1 AND p.numero_documento=$2`,
        [type, number],
      )) as Record<string, unknown>[];
      return { encontrado: !!row, registro: row ?? null };
    });
  }
  async create(actor: Identity, dto: StudentDto, ip?: string) {
    if (Boolean(dto.personaId) === Boolean(dto.persona))
      throw new BadRequestException(
        'Indique personaId o persona, exclusivamente',
      );
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, studentWriters);
      let personId = dto.personaId;
      if (dto.persona) {
        const fields = Object.entries(dto.persona).filter(
          ([, value]) => value !== undefined,
        );
        const [person] = (await manager.query(
          `INSERT INTO personas (${fields.map(([key]) => personColumns[key]).join(',')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(',')}) RETURNING id`,
          fields.map(([, value]) => value),
        )) as { id: string }[];
        personId = person!.id;
      } else {
        const [person] = (await manager.query(
          'SELECT activo FROM personas WHERE id=$1::bigint FOR UPDATE',
          [personId],
        )) as { activo: boolean }[];
        if (!person) throw new NotFoundException('Persona no encontrada');
        if (!person.activo) throw new ConflictException('Persona inactiva');
      }
      const [inserted] = (await manager.query(
        'INSERT INTO estudiantes (persona_id,codigo_estudiante,fecha_registro) VALUES ($1,$2,$3) RETURNING id',
        [personId, dto.codigoEstudiante, dto.fechaRegistro],
      )) as { id: string }[];
      const after = await this.view(manager, inserted!.id);
      if (dto.persona)
        await this.audit.record(
          {
            usuarioId: actor.id,
            accion: 'CREATE',
            entidad: 'personas',
            entidadId: personId!,
            nuevo: after.persona,
            ip,
          },
          manager,
        );
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: 'CREATE',
          entidad: 'estudiantes',
          entidadId: after.id,
          nuevo: after,
          ip,
        },
        manager,
      );
      return after;
    });
  }
  async update(actor: Identity, id: string, dto: EditStudentDto, ip?: string) {
    validId(id);
    if (dto.activo === undefined && !Object.keys(dto.persona ?? {}).length)
      throw new BadRequestException('Indique al menos un cambio');
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, studentWriters);
      await manager.query(
        'SELECT id FROM estudiantes WHERE id=$1::bigint FOR UPDATE',
        [id],
      );
      const before = await this.view(manager, id);
      await manager.query('SELECT id FROM personas WHERE id=$1 FOR UPDATE', [
        before.persona_id,
      ]);
      if (dto.activo === true && before.persona.activo === false)
        throw new ConflictException('Persona inactiva');
      const fields = Object.entries(dto.persona ?? {}).filter(
        ([, value]) => value !== undefined,
      );
      if (fields.length)
        await manager.query(
          `UPDATE personas SET ${fields.map(([key], index) => `${personColumns[key]}=$${index + 1}`).join(',')} WHERE id=$${fields.length + 1}`,
          [...fields.map(([, value]) => value), before.persona_id],
        );
      if (dto.activo !== undefined)
        await manager.query('UPDATE estudiantes SET activo=$1 WHERE id=$2', [
          dto.activo,
          id,
        ]);
      const after = await this.view(manager, id);
      if (fields.length)
        await this.audit.record(
          {
            usuarioId: actor.id,
            accion: 'UPDATE',
            entidad: 'personas',
            entidadId: before.persona_id,
            anterior: before.persona,
            nuevo: after.persona,
            motivo: dto.motivo,
            ip,
          },
          manager,
        );
      await this.audit.record(
        {
          usuarioId: actor.id,
          accion: dto.activo === false ? 'INACTIVATE' : 'UPDATE',
          entidad: 'estudiantes',
          entidadId: id,
          anterior: before,
          nuevo: after,
          motivo: dto.motivo,
          ip,
        },
        manager,
      );
      return after;
    });
  }
}
