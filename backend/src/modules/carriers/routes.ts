import type { FastifyInstance } from 'fastify';
import { listCarriers } from '@delivery-tool/carriers';

/**
 * Public list of carriers — same ids/labels as {@code setup_getContext} in Apps Script.
 */
export async function registerCarrierRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/carriers',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              carriers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                  },
                  required: ['id', 'label'],
                },
              },
            },
            required: ['carriers'],
          },
        },
      },
    },
    async () => ({
      carriers: listCarriers().map((c) => ({ id: c.id, label: c.displayName })),
    }),
  );
}
