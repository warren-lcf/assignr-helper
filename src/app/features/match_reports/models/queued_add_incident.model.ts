import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { IAddIncidentRequest } from './add_incident_request.model';

/** A card waiting to be sent. */
export interface IQueuedAddIncident extends IAddIncidentRequest {
  kind: ReportOperationKind.ADD_INCIDENT;
  /** Identifies this queue entry while it is in flight; rises with every entry. */
  seq: number;
  /** True once the key was replaced after IDEMPOTENCY_KEY_CONFLICT, so it is replaced only once. */
  key_regenerated?: boolean;
}
