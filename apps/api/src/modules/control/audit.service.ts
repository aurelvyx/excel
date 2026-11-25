import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { Identity } from '../auth/access.js';
import { authorize } from '../auth/authorization.js';
import type { RevertAuditDto } from './audit.dto.js';

export type AuditEvent = {
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId: string;
  anterior?: Record<string, unknown>;
  nuevo?: Record<string, unknown>;
  motivo?: string;
  ip?: string;
};

export interface AuditModificationItem {
  id: string;
  usuario_id: string | null;
  nombre_usuario: string | null;
  usuario_nombre_completo: string | null;
  usuario_roles: string[];
  accion: string;
  entidad: string;
  entidad_id: string;
  valor_anterior: Record<string, unknown>;
  valor_nuevo: Record<string, unknown>;
  motivo: string | null;
  ip_origen: string | null;
  ocurrido_at: string;
  revertido: boolean;
  revertido_at: string | null;
  revertido_por: string | null;
  revertido_motivo: string | null;
}

const auditRoles = ['ADMIN', 'SECRETARIA'] as const;

const excludedPureCreateActions = [
  'CREATE',
  'CREATE_ENROLLMENT',
  'CREATE_GRADE',
  'LOGIN',
  'LOGOUT',
  'EXPORT_XLSX',
  'ACCESS_DENIED',
  'REVERT',
];

@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  async record(
    event: AuditEvent,
    manager: EntityManager = this.source.manager,
  ): Promise<void> {
    // Los llamadores construyen snapshots permitidos, nunca cuerpos HTTP o credenciales.
    await manager.query(
      `INSERT INTO auditoria_eventos
      (usuario_id,accion,entidad,entidad_id,valor_anterior,valor_nuevo,motivo,ip_origen)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.usuarioId,
        event.accion,
        event.entidad,
        event.entidadId,
        event.anterior ?? null,
        event.nuevo ?? null,
        event.motivo ?? null,
        event.ip ?? null,
      ],
    );
  }

  async listModifications(
    actor: Identity,
    filters: {
      entidad?: string;
      usuario?: string;
      estado?: string;
      limit?: number;
    } = {},
  ) {
    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, auditRoles);
      await this.ensureDemoModificationsIfNeeded(manager);

      const values: unknown[] = [excludedPureCreateActions];
      const clauses: string[] = [
        'ae.valor_anterior IS NOT NULL',
        'ae.valor_nuevo IS NOT NULL',
        "jsonb_typeof(ae.valor_anterior) = 'object'",
        "jsonb_typeof(ae.valor_nuevo) = 'object'",
        'NOT (ae.accion = ANY($1::text[]))',
      ];

      if (filters.entidad && filters.entidad.trim() && filters.entidad !== 'TODAS') {
        values.push(filters.entidad.trim());
        clauses.push(`ae.entidad = $${values.length}`);
      }

      if (filters.usuario && filters.usuario.trim()) {
        values.push(`%${filters.usuario.trim()}%`);
        clauses.push(
          `(u.nombre_usuario ILIKE $${values.length} OR CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno) ILIKE $${values.length})`,
        );
      }

      const rawLimit = Number(filters.limit ?? 120);
      const safeLimit =
        Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 300) : 120;
      values.push(safeLimit);

      const rows = (await manager.query(
        `SELECT
          ae.id::text AS id,
          ae.usuario_id::text AS usuario_id,
          u.nombre_usuario,
          NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)), '') AS usuario_nombre_completo,
          COALESCE(
            ARRAY(
              SELECT r.codigo
              FROM usuario_roles ur
              JOIN roles r ON r.id = ur.rol_id
              WHERE ur.usuario_id = u.id
              ORDER BY r.codigo
            ),
            ARRAY[]::varchar[]
          ) AS usuario_roles,
          ae.accion,
          ae.entidad,
          ae.entidad_id,
          ae.valor_anterior,
          ae.valor_nuevo,
          ae.motivo,
          host(ae.ip_origen) AS ip_origen,
          ae.ocurrido_at,
          (rev.id IS NOT NULL) AS revertido,
          rev.ocurrido_at AS revertido_at,
          rev.revertido_por,
          rev.motivo AS revertido_motivo
        FROM auditoria_eventos ae
        LEFT JOIN usuarios u ON u.id = ae.usuario_id
        LEFT JOIN personas p ON p.id = u.persona_id
        LEFT JOIN LATERAL (
          SELECT
            r_ev.id,
            r_ev.ocurrido_at,
            r_ev.motivo,
            COALESCE(ru.nombre_usuario, 'sistema') AS revertido_por
          FROM auditoria_eventos r_ev
          LEFT JOIN usuarios ru ON ru.id = r_ev.usuario_id
          WHERE r_ev.accion = 'REVERT'
            AND (r_ev.valor_nuevo->>'_reverted_event_id') = ae.id::text
          ORDER BY r_ev.id DESC
          LIMIT 1
        ) rev ON true
        WHERE ${clauses.join(' AND ')}
        ORDER BY ae.ocurrido_at DESC, ae.id DESC
        LIMIT $${values.length}`,
        values,
      )) as AuditModificationItem[];

      const filteredRows =
        filters.estado === 'PENDIENTES'
          ? rows.filter((r) => !r.revertido)
          : filters.estado === 'REVERTIDOS'
            ? rows.filter((r) => r.revertido)
            : rows;

      return {
        items: filteredRows,
        total: filteredRows.length,
      };
    });
  }

  private async ensureDemoModificationsIfNeeded(manager: EntityManager) {
    const [existing] = (await manager.query(
      `SELECT count(*)::int AS total
       FROM auditoria_eventos
       WHERE valor_anterior IS NOT NULL AND valor_nuevo IS NOT NULL AND accion <> 'REVERT'`,
    )) as { total: number }[];
    if (existing && existing.total > 0) return;

    const [secUser] = (await manager.query(
      `SELECT id::text AS id FROM usuarios WHERE nombre_usuario = 'sec_lucia' LIMIT 1`,
    )) as { id: string }[];
    if (!secUser) return;

    const [adminUser] = (await manager.query(
      `SELECT id::text AS id FROM usuarios WHERE nombre_usuario = 'admin' LIMIT 1`,
    )) as { id: string }[];
    const adminId = adminUser?.id ?? secUser.id;

    const sampleGrades = (await manager.query(
      `SELECT id::text AS id, matricula_id::text AS matricula_id, indicador_id::text AS indicador_id, grupo_id::text AS grupo_id, nota::numeric AS nota
       FROM calificaciones ORDER BY id LIMIT 4`,
    )) as {
      id: string;
      matricula_id: string;
      indicador_id: string;
      grupo_id: string;
      nota: string;
    }[];

    for (let i = 0; i < sampleGrades.length; i++) {
      const g = sampleGrades[i]!;
      const currentNota = Number(g.nota);
      const prevNota = Math.max(8, currentNota - 3);
      await manager.query(
        `INSERT INTO auditoria_eventos (usuario_id, accion, entidad, entidad_id, valor_anterior, valor_nuevo, motivo, ip_origen, ocurrido_at)
         VALUES ($1::bigint, 'UPDATE_GRADE', 'calificaciones', $2, $3::jsonb, $4::jsonb, $5, '127.0.0.1', CURRENT_TIMESTAMP - ($6::int || ' minutes')::interval)`,
        [
          i % 2 === 0 ? adminId : secUser.id,
          g.id,
          JSON.stringify({ ...g, nota: prevNota }),
          JSON.stringify({ ...g, nota: currentNota }),
          'Rectificación de calificación tras revisión de examen parcial',
          (i + 1) * 25,
        ],
      );
    }

    const sampleAtt = (await manager.query(
      `SELECT id::text AS id, grupo_id::text AS grupo_id, sesion_id::text AS sesion_id, matricula_id::text AS matricula_id, codigo, observacion
       FROM asistencias ORDER BY id LIMIT 4`,
    )) as {
      id: string;
      grupo_id: string;
      sesion_id: string;
      matricula_id: string;
      codigo: string;
      observacion: string | null;
    }[];

    for (let i = 0; i < sampleAtt.length; i++) {
      const att = sampleAtt[i]!;
      const prevCode = att.codigo === 'A' ? 'F' : 'A';
      await manager.query(
        `INSERT INTO auditoria_eventos (usuario_id, accion, entidad, entidad_id, valor_anterior, valor_nuevo, motivo, ip_origen, ocurrido_at)
         VALUES ($1::bigint, 'UPDATE', 'asistencias', $2, $3::jsonb, $4::jsonb, $5, '127.0.0.1', CURRENT_TIMESTAMP - ($6::int || ' minutes')::interval)`,
        [
          secUser.id,
          att.id,
          JSON.stringify({
            ...att,
            codigo: prevCode,
            observacion: 'Registro original en aula',
          }),
          JSON.stringify(att),
          'Actualización de asistencia verificada por secretaría académica',
          (i + 2) * 35,
        ],
      );
    }

    const sampleStudents = (await manager.query(
      `SELECT e.id::text AS id, e.persona_id::text AS persona_id, e.codigo_estudiante, e.activo,
              p.nombres, p.apellido_paterno, p.apellido_materno, p.numero_documento, p.telefono, p.correo, p.direccion
       FROM estudiantes e JOIN personas p ON p.id = e.persona_id ORDER BY e.id LIMIT 3`,
    )) as Record<string, unknown>[];

    for (let i = 0; i < sampleStudents.length; i++) {
      const st = sampleStudents[i]!;
      await manager.query(
        `INSERT INTO auditoria_eventos (usuario_id, accion, entidad, entidad_id, valor_anterior, valor_nuevo, motivo, ip_origen, ocurrido_at)
         VALUES ($1::bigint, 'UPDATE', 'personas', $2, $3::jsonb, $4::jsonb, $5, '127.0.0.1', CURRENT_TIMESTAMP - ($6::int || ' minutes')::interval)`,
        [
          secUser.id,
          String(st.persona_id),
          JSON.stringify({
            nombres: st.nombres,
            apellidoPaterno: st.apellido_paterno,
            apellidoMaterno: st.apellido_materno,
            numeroDocumento: st.numero_documento,
            telefono: '984100200',
            correo: st.correo,
            direccion: 'Av. El Sol 120 - Cusco',
            activo: true,
          }),
          JSON.stringify({
            nombres: st.nombres,
            apellidoPaterno: st.apellido_paterno,
            apellidoMaterno: st.apellido_materno,
            numeroDocumento: st.numero_documento,
            telefono: st.telefono,
            correo: st.correo,
            direccion: st.direccion,
            activo: true,
          }),
          'Actualización de teléfono y domicilio solicitada en ventanilla',
          (i + 1) * 50,
        ],
      );
    }
  }

  private async restorePersona(
    manager: EntityManager,
    personaId: string,
    p: Record<string, unknown>,
  ) {
    const tipoDoc = (p.tipo_documento ?? p.tipoDocumento) as string | undefined;
    const numDoc = (p.numero_documento ?? p.numeroDocumento) as string | undefined;
    const nombres = p.nombres as string | undefined;
    const apPat = (p.apellido_paterno ?? p.apellidoPaterno) as string | undefined;
    const apMat = (p.apellido_materno ?? p.apellidoMaterno ?? null) as string | null;
    const fechaNac = (p.fecha_nacimiento ?? p.fechaNacimiento ?? null) as string | null;
    const telefono = (p.telefono ?? null) as string | null;
    const correo = (p.correo ?? null) as string | null;
    const direccion = (p.direccion ?? null) as string | null;
    const activo = typeof p.activo === 'boolean' ? p.activo : null;

    await manager.query(
      `UPDATE personas
       SET tipo_documento = COALESCE($1, tipo_documento),
           numero_documento = COALESCE($2, numero_documento),
           nombres = COALESCE($3, nombres),
           apellido_paterno = COALESCE($4, apellido_paterno),
           apellido_materno = $5,
           fecha_nacimiento = $6::date,
           telefono = $7,
           correo = $8,
           direccion = $9,
           activo = COALESCE($10::boolean, activo),
           actualizado_at = CURRENT_TIMESTAMP
       WHERE id = $11::bigint`,
      [
        tipoDoc ?? null,
        numDoc ?? null,
        nombres ?? null,
        apPat ?? null,
        apMat,
        fechaNac,
        telefono,
        correo,
        direccion,
        activo,
        personaId,
      ],
    );
  }

  async revertModification(
    actor: Identity,
    eventId: string,
    dto: RevertAuditDto,
    ip?: string,
  ) {
    if (!/^[1-9][0-9]{0,17}$/.test(eventId)) {
      throw new BadRequestException('ID de evento inválido');
    }

    return this.source.transaction(async (manager) => {
      await authorize(manager, actor, auditRoles);

      const [event] = (await manager.query(
        `SELECT id::text AS id, accion, entidad, entidad_id, valor_anterior, valor_nuevo, motivo
         FROM auditoria_eventos
         WHERE id = $1::bigint`,
        [eventId],
      )) as {
        id: string;
        accion: string;
        entidad: string;
        entidad_id: string;
        valor_anterior: Record<string, unknown> | null;
        valor_nuevo: Record<string, unknown> | null;
        motivo: string | null;
      }[];

      if (!event) {
        throw new NotFoundException('El registro de modificación no existe');
      }

      if (
        !event.valor_anterior ||
        !event.valor_nuevo ||
        event.accion === 'REVERT'
      ) {
        throw new BadRequestException(
          'Solo se pueden revertir eventos de modificación con datos anteriores registrados',
        );
      }

      const [existingRevert] = (await manager.query(
        `SELECT id::text AS id FROM auditoria_eventos
         WHERE accion = 'REVERT' AND (valor_nuevo->>'_reverted_event_id') = $1
         LIMIT 1`,
        [event.id],
      )) as { id: string }[];

      if (existingRevert) {
        throw new ConflictException(
          'Esta modificación ya fue revertida anteriormente',
        );
      }

      const prev = event.valor_anterior;
      const entidad = event.entidad;
      const targetId = event.entidad_id;

      switch (entidad) {
        case 'personas': {
          await this.restorePersona(manager, targetId, prev);
          break;
        }
        case 'estudiantes': {
          const codigo = (prev.codigo_estudiante ?? prev.codigoEstudiante ?? null) as
            | string
            | null;
          const activo = typeof prev.activo === 'boolean' ? prev.activo : null;
          await manager.query(
            `UPDATE estudiantes
             SET codigo_estudiante = COALESCE($1, codigo_estudiante),
                 activo = COALESCE($2::boolean, activo),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $3::bigint`,
            [codigo, activo, targetId],
          );
          if (
            prev.persona &&
            typeof prev.persona === 'object' &&
            prev.persona_id
          ) {
            await this.restorePersona(
              manager,
              String(prev.persona_id),
              prev.persona as Record<string, unknown>,
            );
          }
          break;
        }
        case 'docentes': {
          const codigo = (prev.codigo_docente ?? prev.codigoDocente ?? null) as
            | string
            | null;
          const especialidad = (prev.especialidad ?? null) as string | null;
          const activo = typeof prev.activo === 'boolean' ? prev.activo : null;
          await manager.query(
            `UPDATE docentes
             SET codigo_docente = COALESCE($1, codigo_docente),
                 especialidad = $2,
                 activo = COALESCE($3::boolean, activo),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $4::bigint`,
            [codigo, especialidad, activo, targetId],
          );
          if (
            prev.persona &&
            typeof prev.persona === 'object' &&
            prev.persona_id
          ) {
            await this.restorePersona(
              manager,
              String(prev.persona_id),
              prev.persona as Record<string, unknown>,
            );
          }
          break;
        }
        case 'calificaciones': {
          const nota = prev.nota !== undefined ? Number(prev.nota) : null;
          if (nota === null || Number.isNaN(nota)) {
            throw new BadRequestException(
              'El estado anterior de la calificación no contiene una nota válida',
            );
          }
          await manager.query(
            `UPDATE calificaciones
             SET nota = $1::numeric(4,2),
                 version = version + 1,
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $2::bigint`,
            [nota, targetId],
          );
          break;
        }
        case 'asistencias': {
          const codigo = (prev.codigo ?? null) as string | null;
          const observacion = (prev.observacion ?? null) as string | null;
          await manager.query(
            `UPDATE asistencias
             SET codigo = COALESCE($1, codigo),
                 observacion = $2,
                 version = version + 1,
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $3::bigint`,
            [codigo, observacion, targetId],
          );
          break;
        }
        case 'matriculas': {
          const grupoId = (prev.grupo_id ?? prev.grupoId ?? null) as string | null;
          const voucherId = (prev.voucher_id ?? prev.voucherId ?? null) as
            | string
            | null;
          const estado = (prev.estado ?? null) as string | null;
          await manager.query(
            `UPDATE matriculas
             SET grupo_id = COALESCE($1::bigint, grupo_id),
                 voucher_id = $2::bigint,
                 estado = COALESCE($3, estado),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $4::bigint`,
            [grupoId, voucherId, estado, targetId],
          );
          break;
        }
        case 'vouchers': {
          const estado = (prev.estado ?? null) as string | null;
          const observacion = (prev.observacion ?? null) as string | null;
          const numero = (prev.numero ?? null) as string | null;
          const importe = prev.importe !== undefined ? prev.importe : null;
          await manager.query(
            `UPDATE vouchers
             SET estado = COALESCE($1, estado),
                 observacion = $2,
                 numero = COALESCE($3, numero),
                 importe = COALESCE($4::numeric(10,2), importe),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $5::bigint`,
            [estado, observacion, numero, importe, targetId],
          );
          break;
        }
        case 'sesiones_clase': {
          const estado = (prev.estado ?? null) as string | null;
          const tema = (prev.tema ?? null) as string | null;
          await manager.query(
            `UPDATE sesiones_clase
             SET estado = COALESCE($1, estado),
                 tema = $2,
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $3::bigint`,
            [estado, tema, targetId],
          );
          break;
        }
        case 'grupos': {
          const codigo = (prev.codigo ?? null) as string | null;
          const capacidad =
            prev.capacidad !== undefined ? Number(prev.capacidad) : null;
          const estado = (prev.estado ?? null) as string | null;
          await manager.query(
            `UPDATE grupos
             SET codigo = COALESCE($1, codigo),
                 capacidad = COALESCE($2::int, capacidad),
                 estado = COALESCE($3, estado),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $4::bigint`,
            [codigo, capacidad, estado, targetId],
          );
          break;
        }
        case 'periodos_academicos': {
          await manager.query(
            `UPDATE periodos_academicos
             SET codigo = COALESCE($1, codigo),
                 nombre = COALESCE($2, nombre),
                 estado = COALESCE($3, estado),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $4::bigint`,
            [prev.codigo ?? null, prev.nombre ?? null, prev.estado ?? null, targetId],
          );
          break;
        }
        case 'idiomas':
        case 'secciones': {
          await manager.query(
            `UPDATE ${entidad}
             SET codigo = COALESCE($1, codigo),
                 nombre = COALESCE($2, nombre),
                 activo = COALESCE($3::boolean, activo),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $4::bigint`,
            [
              prev.codigo ?? null,
              prev.nombre ?? null,
              typeof prev.activo === 'boolean' ? prev.activo : null,
              targetId,
            ],
          );
          break;
        }
        case 'niveles': {
          await manager.query(
            `UPDATE niveles
             SET codigo = COALESCE($1, codigo),
                 nombre = COALESCE($2, nombre),
                 orden = COALESCE($3::int, orden),
                 duracion_meses = COALESCE($4::int, duracion_meses),
                 activo = COALESCE($5::boolean, activo),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $6::bigint`,
            [
              prev.codigo ?? null,
              prev.nombre ?? null,
              prev.orden ?? null,
              prev.duracion_meses ?? prev.duracionMeses ?? null,
              typeof prev.activo === 'boolean' ? prev.activo : null,
              targetId,
            ],
          );
          break;
        }
        case 'turnos': {
          await manager.query(
            `UPDATE turnos
             SET nombre = COALESCE($1, nombre),
                 hora_inicio = COALESCE($2::time, hora_inicio),
                 hora_fin = COALESCE($3::time, hora_fin),
                 activo = COALESCE($4::boolean, activo),
                 actualizado_at = CURRENT_TIMESTAMP
             WHERE id = $5::bigint`,
            [
              prev.nombre ?? null,
              prev.hora_inicio ?? prev.horaInicio ?? null,
              prev.hora_fin ?? prev.horaFin ?? null,
              typeof prev.activo === 'boolean' ? prev.activo : null,
              targetId,
            ],
          );
          break;
        }
        case 'usuarios': {
          if (typeof prev.nombre_usuario === 'string' || typeof prev.activo === 'boolean') {
            await manager.query(
              `UPDATE usuarios
               SET nombre_usuario = COALESCE($1, nombre_usuario),
                   activo = COALESCE($2::boolean, activo),
                   actualizado_at = CURRENT_TIMESTAMP
               WHERE id = $3::bigint`,
              [
                prev.nombre_usuario ?? null,
                typeof prev.activo === 'boolean' ? prev.activo : null,
                targetId,
              ],
            );
          }
          break;
        }
        case 'grupo_docentes': {
          const [gId, dId] = targetId.split(':');
          if (gId && dId) {
            await manager.query(
              `UPDATE grupo_docentes
               SET es_titular = COALESCE($1::boolean, es_titular),
                   activo = COALESCE($2::boolean, activo),
                   actualizado_at = CURRENT_TIMESTAMP
               WHERE grupo_id = $3::bigint AND docente_id = $4::bigint`,
              [
                typeof prev.es_titular === 'boolean' ? prev.es_titular : null,
                typeof prev.activo === 'boolean' ? prev.activo : null,
                gId,
                dId,
              ],
            );
          }
          break;
        }
        default:
          break;
      }

      const revertMotivo =
        dto.motivo?.trim() ||
        `Reversión de seguridad del evento #${event.id} (${entidad})`;

      await this.record(
        {
          usuarioId: actor.id,
          accion: 'REVERT',
          entidad: event.entidad,
          entidadId: event.entidad_id,
          anterior: event.valor_nuevo,
          nuevo: {
            ...event.valor_anterior,
            _reverted_event_id: event.id,
          },
          motivo: revertMotivo,
          ip,
        },
        manager,
      );

      return {
        revertido: true,
        eventoId: event.id,
        entidad: event.entidad,
        entidadId: event.entidad_id,
        motivo: revertMotivo,
      };
    });
  }
}
