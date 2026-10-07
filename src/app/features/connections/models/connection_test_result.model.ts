import { ConnectionTestFailure } from '../enums/connection_test_failure.enum';

/** Result of `POST /api/connections/:id/test`. */
export interface IConnectionTestResult {
  /** True when the stored credentials work. */
  ok: boolean;
  /** Why the test failed; null when it passed. */
  failure: ConnectionTestFailure | null;
}
