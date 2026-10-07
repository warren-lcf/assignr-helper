import { AssignrApiError } from './assignr_api_error.js';

/** Assignr refused the client credentials (the message never includes them). */
export class AssignrCredentialsRejectedError extends AssignrApiError {
  public constructor() {
    super('Assignr rejected the client credentials', 401, null);
    this.name = 'AssignrCredentialsRejectedError';
  }
}
