import { AssignrApiError } from './assignr_api_error.js';

/** The access token was rejected (401); the caller should refresh and retry once. */
export class AssignrAuthError extends AssignrApiError {
  public constructor(message: string, body: unknown) {
    super(message, 401, body);
    this.name = 'AssignrAuthError';
  }
}
