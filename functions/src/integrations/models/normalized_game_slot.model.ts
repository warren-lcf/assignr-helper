import { AssignmentResponseStatus } from '../enums/assignment_response_status.enum.js';

/** One officiating position on a game and who, if anyone, fills it. */
export interface INormalizedGameSlot {
  /** Position name as the provider reports it, e.g. `Referee`. */
  position: string;
  assignee_name: string | null;
  /** Provider id of the assignment; null while the slot is unfilled. */
  assignment_external_id: string | null;
  response_status: AssignmentResponseStatus;
  /** True when the slot is assigned to the connected account. */
  is_mine: boolean;
  /** Provider lock version used for optimistic concurrency, when supplied. */
  lock_version: number | null;
  /** Fee lines as the provider reports them; shape is provider specific. */
  fees: Record<string, unknown>[];
}
