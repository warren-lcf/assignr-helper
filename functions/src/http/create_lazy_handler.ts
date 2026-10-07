import type { Request, Response } from 'express';

/** A request handler as Firebase's `onRequest` calls it. */
export type LazyRequestHandler = (req: Request, res: Response) => void;

/**
 * Wraps a handler factory so the handler is built on the first request instead of
 * when the module loads. The Firebase CLI imports the functions module during
 * deploy analysis, before it applies `functions/.env.<project>`, so building the
 * app at import time would fail on its own required environment variables there.
 * A failed build is logged and not cached, so the next request tries again.
 * @param factory Builds the real handler (and throws if configuration is missing).
 * @returns A handler that builds the real one once, then delegates to it.
 */
export function create_lazy_handler(factory: () => LazyRequestHandler): LazyRequestHandler {
  let handler: LazyRequestHandler | null = null;
  return (req: Request, res: Response): void => {
    try {
      handler ??= factory();
    } catch (error) {
      console.error('Could not start the API: configuration is invalid', error);
      res.status(500).json({ code: 'SERVER_MISCONFIGURED', message: 'The API is not available' });
      return;
    }
    handler(req, res);
  };
}
