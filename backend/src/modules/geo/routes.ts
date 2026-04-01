import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';

let cache: Record<string, string[]> | null = null;

function communesDataPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', '..', 'data', 'communes-by-wilaya.json');
}

function loadCommunesByWilaya(): Record<string, string[]> {
  if (cache) {
    return cache;
  }
  try {
    const raw = readFileSync(communesDataPath(), 'utf8');
    cache = JSON.parse(raw) as Record<string, string[]>;
    return cache;
  } catch {
    throw new Error('Fichier communes introuvable ou invalide (data/communes-by-wilaya.json).');
  }
}

export async function registerGeoRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { wilayaCode?: string } }>(
    '/v1/geo/communes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            wilayaCode: { type: 'string' },
          },
          required: ['wilayaCode'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              wilayaCode: { type: 'number' },
              communes: { type: 'array', items: { type: 'string' } },
              count: { type: 'number' },
              source: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const raw = String(request.query.wilayaCode ?? '').trim();
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1 || n > 58) {
        return reply.code(400).send({ message: 'wilayaCode invalide (1–58).' });
      }
      let data: Record<string, string[]>;
      try {
        data = loadCommunesByWilaya();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Données communes indisponibles.';
        return reply.code(503).send({ message: msg });
      }
      const key = String(n);
      const rawList = data[key];
      const communes = Array.isArray(rawList)
        ? rawList.filter((x): x is string => typeof x === 'string')
        : [];
      return {
        wilayaCode: n,
        communes,
        count: communes.length,
        source: 'othmanus/algeria-cities (commune_name_ascii)',
      };
    },
  );
}
