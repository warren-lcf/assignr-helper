import type { IRequestAuth } from './models/request_auth.model.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Must keep Express's own interface name to augment it.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    interface Request {
      /** Set by the auth middleware on every request that passed it. */
      auth?: IRequestAuth;
    }
  }
}
