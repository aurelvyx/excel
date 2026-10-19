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
import type { Identity } from '../auth/access.js';
import { authorize } from '../auth/authorization.js';
import { AuditService } from '../control/audit.service.js';
import { page, validId } from '../../common/validation.js';
import type { TeacherDto, EditTeacherDto } from './teachers.dto.js';

type TeacherRow = Record<string, unknown> & {
  id: string;
  persona_id: string;
  persona: Record<string, unknown>;
};
@Injectable()
export class TeachersService {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async view(manager: EntityManager, id: string): Promise<TeacherRow> {
    const [row] = (await manager.query(
      `SELECT d.*,jsonb_build_object('id',p.id::text,'tipoDocumento',p.tipo_documento,
      'numeroDocumento',p.numero_documento,'nombres',p.nombres,'apellidoPaterno',p.apellido_paterno,
      'apellidoMaterno',p.apellido_materno,'fechaNacimiento',p.fecha_nacimiento,'telefono',p.telefono,
      'correo',p.correo,'direccion',p.direccion,'activo',p.activo) AS persona
      FROM docentes d JOIN personas p ON p.id=d.persona_id WHERE d.id=$1::bigint`,
      [id],
    )) as TeacherRow[];
    if (!row) throw new NotFoundException('Docente no encontrado');
    return row;
  }
  async list(actor: Identity, query: Record<string, unknown>) {
    const { after, limit } = page(query, [
      'activo',
      'tipoDocumento',
      'numeroDocumento',
    ]);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      const values: unknown[] = [after];
      const clauses = ['d.id>$1::bigint'];
      if (query.activo !== undefined) {
        if (!['true', 'false'].includes(query.activo as string))
          throw new BadRequestException('Activo inválido');
        values.push(query.activo === 'true');
        clauses.push(`d.activo=$${values.length}`);
      }
      for (const key of ['tipoDocumento', 'numeroDocumento'])
        if (query[key] !== undefined) {
          if (
            typeof query[key] !== 'string' ||
            query[key].length > 25 ||
            !query[key].trim()
          )
            throw new BadRequestException('Documento inválido');
          values.push(query[key]);
          clauses.push(`p.${personColumns[key]}=$${values.length}`);
        }
      values.push(limit);
      const items = (await manager.query(
        `SELECT d.id,d.persona_id,d.codigo_docente,d.especialidad,d.activo,
        p.nombres,p.apellido_paterno,p.apellido_materno FROM docentes d JOIN personas p ON p.id=d.persona_id
        WHERE ${clauses.join(' AND ')} ORDER BY d.id LIMIT $${values.length}`,
        values,
      )) as { id: string }[];
      return {
        items,
        nextCursor: items.length === limit ? items.at(-1)!.id : null,
      };
    });
  }
  async get(actor: Identity, id: string) {
    validId(id);
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      return this.view(manager, id);
    });
  }
  async create(actor: Identity, dto: TeacherDto, ip?: string) {
    if (Boolean(dto.personaId) === Boolean(dto.persona))
      throw new BadRequestException(
        'Indique personaId o persona, exclusivamente',
      );
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      let personId = dto.personaId;
      if (dto.persona) {
        const entries = Object.entries(dto.persona).filter(
          ([, value]) => value !== undefined,
        );
        const [person] = (await manager.query(
          `INSERT INTO personas (${entries.map(([key]) => personColumns[key]).join(',')})
          VALUES (${entries.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
          entries.map(([, value]) => value),
        )) as { id: string }[];
        personId = person!.id;
      } else {
        const [person] = (await manager.query(
          'SELECT id,activo FROM personas WHERE id=$1::bigint FOR UPDATE',
          [personId],
        )) as { id: string; activo: boolean }[];
        if (!person) throw new NotFoundException('Persona no encontrada');
        if (!person.activo) throw new ConflictException('Persona inactiva');
      }
      const [teacher] = (await manager.query(
        'INSERT INTO docentes (persona_id,codigo_docente,especialidad) VALUES ($1,$2,$3) RETURNING id',
        [personId, dto.codigoDocente, dto.especialidad ?? null],
      )) as { id: string }[];
      const after = await this.view(manager, teacher!.id);
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
          entidad: 'docentes',
          entidadId: teacher!.id,
          nuevo: after,
          ip,
        },
        manager,
      );
      return after;
    });
  }
  async update(actor: Identity, id: string, dto: EditTeacherDto, ip?: string) {
    validId(id);
    if (
      dto.activo === undefined &&
      dto.codigoDocente === undefined &&
      dto.especialidad === undefined &&
      !Object.keys(dto.persona ?? {}).length
    )
      throw new BadRequestException('Indique al menos un cambio');
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, ['ADMIN']);
      await manager.query(
        'SELECT id FROM docentes WHERE id=$1::bigint FOR UPDATE',
        [id],
      );
      const before = await this.view(manager, id);
      await manager.query('SELECT id FROM personas WHERE id=$1 FOR UPDATE', [
        before.persona_id,
      ]);
      if (dto.activo === true && before.persona.activo === false)
        throw new ConflictException('Persona inactiva');
      if (dto.persona) {
        const entries = Object.entries(dto.persona).filter(
          ([, value]) => value !== undefined,
        );
        if (entries.length) {
          await manager.query(
            `UPDATE personas SET ${entries.map(([key], i) => `${personColumns[key]}=$${i + 1}`).join(',')}
          WHERE id=$${entries.length + 1}`,
            [...entries.map(([, value]) => value), before.persona_id],
          );
        }
      }
      await manager.query(
        'UPDATE docentes SET codigo_docente=$1,especialidad=$2,activo=$3 WHERE id=$4::bigint',
        [
          dto.codigoDocente ?? before.codigo_docente,
          dto.especialidad === undefined
            ? before.especialidad
            : dto.especialidad,
          dto.activo ?? before.activo,
          id,
        ],
      );
      const after = await this.view(manager, id);
      if (dto.persona)
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
          entidad: 'docentes',
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
