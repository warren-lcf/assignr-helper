import { HttpInterceptorFn } from '@angular/common/http';
import { bearer_auth_interceptor } from '@hch-shared-libraries/ui-kit/authorization';

/**
 * Path prefix of the public endpoints. They are open to anyone holding a quick
 * link, so a signed-in user's bearer token must never be attached to them.
 */
export const PUBLIC_API_URL_PREFIX = '/api/public/';

/**
 * The app-wide bearer interceptor: the ui-kit interceptor for every `/api/`
 * call except `/api/public/`, which is sent as-is. The ui-kit interceptor can
 * only match by prefix, so it cannot express "everything under /api/ except
 * this" on its own.
 * @param req The outgoing request.
 * @param next The next handler.
 * @returns The response stream.
 */
export const app_bearer_auth_interceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith(PUBLIC_API_URL_PREFIX) || req.url === PUBLIC_API_URL_PREFIX.slice(0, -1)
    ? next(req)
    : bearer_auth_interceptor(req, next);
