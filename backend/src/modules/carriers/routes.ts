import type { FastifyInstance } from 'fastify';
import { getCarrierAdapterOrThrow, listCarriers, UnknownCarrierError } from '@delivery-tool/carriers';

const credentialsSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
} as const;

const testConnectionBodySchema = {
  type: 'object',
  properties: {
    credentials: credentialsSchema,
  },
  additionalProperties: false,
} as const;

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

  app.post<{
    Params: { carrierId: string };
    Body: { credentials?: Record<string, string> };
  }>(
    '/v1/carriers/:carrierId/test-connection',
    {
      schema: {
        params: {
          type: 'object',
          required: ['carrierId'],
          properties: {
            carrierId: { type: 'string' },
          },
        },
        body: testConnectionBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request, reply) => {
      let adapter;
      try {
        adapter = getCarrierAdapterOrThrow(request.params.carrierId);
      } catch (error) {
        if (error instanceof UnknownCarrierError) {
          return reply.code(404).send({
            ok: false,
            message: `Unknown carrier: ${request.params.carrierId}`,
          });
        }
        throw error;
      }
      if (!adapter.testConnection) {
        return reply.code(400).send({
          ok: false,
          message: `${adapter.id} adapter does not support testConnection`,
        });
      }
      return adapter.testConnection(request.body?.credentials ?? {});
    },
  );
}
