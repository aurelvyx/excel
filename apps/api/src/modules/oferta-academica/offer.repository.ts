import { Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { catalogs, type Catalog, type CatalogKey } from './catalogs.js';
import { groupContext } from './group-context.js';

export type Row = Record<string, unknown> & { id: string };
@Injectable()
export class OfferRepository {
  config(key: CatalogKey): Catalog {
    return catalogs[key];
  }
  async find(
    manager: EntityManager,
    key: CatalogKey,
    id: string,
    lock = false,
  ): Promise<Row> {
    const [row] = (await manager.query(
      `SELECT t.*${key === 'grupos' && !lock ? `,${groupContext}` : ''} FROM ${this.config(key).table} t WHERE t.id=$1::bigint${lock ? ' FOR UPDATE' : ''}`,
      [id],
    )) as Row[];
    if (!row) throw new NotFoundException('Registro no encontrado');
    return row;
  }
  async save(
    manager: EntityManager,
    key: CatalogKey,
    data: Record<string, unknown>,
    id?: string,
  ): Promise<Row> {
    const config = this.config(key);
    const fields = Object.keys(data).filter(
      (field) => config.fields[field] && data[field] !== undefined,
    );
    const values = fields.map((field) => data[field]);
    const columns = fields.map((field) => config.fields[field]!);
    const parameters = fields.map((_field, index) => `$${index + 1}`);
    const sql = id
      ? `WITH updated AS (UPDATE ${config.table} SET ${columns.map((col, index) => `${col}=${parameters[index]}`).join(',')} WHERE id=$${values.length + 1}::bigint RETURNING *) SELECT * FROM updated`
      : `INSERT INTO ${config.table} (${columns.join(',')}) VALUES (${parameters.join(',')}) RETURNING *`;
    const [row] = (await manager.query(
      sql,
      id ? [...values, id] : values,
    )) as Row[];
    return row!;
  }
}
