import { IQueuedAddIncident } from './queued_add_incident.model';
import { IQueuedRemoveIncident } from './queued_remove_incident.model';
import { IQueuedSetScores } from './queued_set_scores.model';

/** Any edit that can wait in the offline queue. */
export type QueuedOperation = IQueuedSetScores | IQueuedAddIncident | IQueuedRemoveIncident;
