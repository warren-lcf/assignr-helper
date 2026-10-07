import { ConnectionStatus } from '../enums/connection_status.enum.js';

/** What a sync attempt changes on its connection. */
export interface ISyncOutcome {
  /** Set to the attempt's time on success; null leaves the previous value untouched. */
  last_sync_at: number | null;
  /** New last error; null clears it. */
  last_error: string | null;
  /** New status; null leaves it unchanged. */
  status: ConnectionStatus | null;
}
