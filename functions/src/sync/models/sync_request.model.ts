import { ISyncWindow } from '../../integrations/models/sync_window.model.js';
import { SyncKind } from '../enums/sync_kind.enum.js';

/** A request to run one sync. */
export interface ISyncRequest {
  tenant_id: string;
  connection_id: string;
  kind: SyncKind;
  /** Date window for game syncs; ignored for reference data. */
  window: ISyncWindow;
  /** Actor stamped on every row written (a user id, or a system id for scheduled runs). */
  actor: string;
}
