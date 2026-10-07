import { ConnectionTestFailure } from '../enums/connection_test_failure.enum.js';

/** Outcome of testing a connection's stored credentials. */
export interface IConnectionTestResult {
  ok: boolean;
  /** Null when `ok`. */
  failure: ConnectionTestFailure | null;
}
