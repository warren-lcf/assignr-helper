import { AssignmentResponseAction } from '../enums/assignment_response_action.enum.js';

/** Command to accept or decline an assignment. */
export interface IAssignmentResponseCommand {
  /** Provider game id the assignment belongs to; the game is re-read afterwards. */
  game_external_id: string;
  assignment_external_id: string;
  action: AssignmentResponseAction;
  /** Optional reason, used when declining. */
  reason: string | null;
  /** Last observed lock version, for optimistic concurrency. */
  lock_version: number | null;
}
