import { AssignrApiError } from './assignr_api_error.js';

/** Optimistic-lock conflict (409): the record changed since `lock_version` was read. */
export class AssignrConflictError extends AssignrApiError {
  public constructor(message: string, body: unknown) {
    super(message, 409, body);
    this.name = 'AssignrConflictError';
  }
}
