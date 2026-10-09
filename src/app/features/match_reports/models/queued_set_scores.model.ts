import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { ISetScoresRequest } from './set_scores_request.model';

/** A score edit waiting to be sent. */
export interface IQueuedSetScores extends ISetScoresRequest {
  kind: ReportOperationKind.SET_SCORES;
  /** Identifies this queue entry while it is in flight; rises with every entry. */
  seq: number;
}
