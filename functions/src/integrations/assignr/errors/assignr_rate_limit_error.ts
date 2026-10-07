import { AssignrApiError } from './assignr_api_error.js';

/** Rate limit (429) still in force after the bounded retries were exhausted. */
export class AssignrRateLimitError extends AssignrApiError {
  public constructor(
    message: string,
    body: unknown,
    public readonly retry_after_ms: number,
  ) {
    super(message, 429, body);
    this.name = 'AssignrRateLimitError';
  }
}
