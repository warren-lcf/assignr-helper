import { Router } from 'express';

/**
 * Builds the unauthenticated liveness route.
 * @openapi
 * /api/health:
 *   get:
 *     summary: Liveness probe
 *     responses:
 *       200:
 *         description: The API is up.
 * @param now Clock returning the current instant in UTC milliseconds.
 * @returns An Express router exposing `GET /health`.
 */
export function create_health_router(now: () => number = Date.now): Router {
  const router = Router();
  router.get('/health', (_request, response) => {
    response.json({ data: { status: 'ok', checked_at: now() } });
  });
  return router;
}
