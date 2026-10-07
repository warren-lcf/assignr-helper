import { AssignmentResponseStatus } from '../../integrations/enums/assignment_response_status.enum.js';

/** One officiating position of a stored game. */
export interface IStoredGameSlot {
  slot_id: string;
  position: string;
  assignee_name: string | null;
  assignment_external_id: string | null;
  response_status: AssignmentResponseStatus;
  is_mine: boolean;
  lock_version: number | null;
  fees: Record<string, unknown>[];
}
