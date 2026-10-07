import type { NextFunction, Request, Response } from 'express';

/**
 * Sets the headers every public quick-link response carries, including errors: nothing is
 * cached (the page changes as games are taken), the token in the URL is never sent on as a
 * referrer, search engines are told to stay away, and browsers may not guess content types.
 * Mounted ahead of the routes so even the 404 and 429 answers have them.
 * @param _req Express request (unused).
 * @param res Express response.
 * @param next Continues to the route.
 * @returns Nothing.
 */
export function apply_public_headers(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}
