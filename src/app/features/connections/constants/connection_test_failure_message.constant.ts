import { ConnectionTestFailure } from '../enums/connection_test_failure.enum';

/** English message (also the translation key) for each way a connection test can fail. */
export const CONNECTION_TEST_FAILURE_MESSAGE: Readonly<Record<ConnectionTestFailure, string>> = {
  [ConnectionTestFailure.NO_CREDENTIALS]:
    'No credentials are stored for {{label}}. Replace the credentials to reconnect.',
  [ConnectionTestFailure.REJECTED]:
    'Assignr did not accept the stored credentials for {{label}}. Replace the credentials.',
  [ConnectionTestFailure.UNREACHABLE]: 'Assignr could not be reached. Try again shortly.',
};
