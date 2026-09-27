import type { SchemaObject } from '@nestjs/swagger';

export function pageSchema(item: SchemaObject): SchemaObject {
  return {
    type: 'object',
    required: ['items', 'nextCursor'],
    properties: {
      items: { type: 'array', items: item },
      nextCursor: {
        type: 'string',
        nullable: true,
        description: 'Pasar como after; null indica fin',
      },
    },
  };
}
