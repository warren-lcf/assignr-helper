import { AssignrApiError } from '../integrations/assignr/errors/assignr_api_error.js';
import { ISyncRunError } from './models/sync_run_error.model.js';

/**
 * Reduces a thrown value to the safe summary stored on a failed run. Only the
 * name, message and HTTP status are kept; response bodies and headers (which may
 * echo tokens) are dropped.
 * @param error Anything thrown during a sync.
 * @returns The summary to record.
 */
export function to_sync_run_error(error: unknown): ISyncRunError {
  if (error instanceof AssignrApiError) {
    return { name: error.name, message: error.message, status: error.status };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, status: null };
  }
  return { name: 'UnknownError', message: String(error), status: null };
}
