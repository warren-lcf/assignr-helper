import { ReportOperationKind } from '../enums/report_operation_kind.enum';

/** A card removal waiting to be sent. The card is found by its idempotency key, so a card added a moment ago can still be removed. */
export interface IQueuedRemoveIncident {
  kind: ReportOperationKind.REMOVE_INCIDENT;
  /** Identifies this queue entry while it is in flight; rises with every entry. */
  seq: number;
  idempotency_key: string;
}
