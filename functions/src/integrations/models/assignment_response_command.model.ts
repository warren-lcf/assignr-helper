import { AssignmentResponseAction } from '../enums/assignment_response_action.enum.js';

/** Command to accept or decline an assignment. */
export interface IAssignmentResponseCommand {
  assignment_external_id: string;
  action: AssignmentResponseAction;
  /** Optional reason, used when declining. */
  reason: string | null;
  /** Last observed lock version, for optimistic concurrency. */
  lock_version: number | null;
}
