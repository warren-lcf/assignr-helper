import { Database, Spanner } from '@google-cloud/spanner';

/**
 * Tells whether a Spanner emulator is configured for this test run.
 * @returns True when `SPANNER_EMULATOR_HOST` is set.
 */
export function is_spanner_emulator_configured(): boolean {
  return Boolean(process.env['SPANNER_EMULATOR_HOST']);
}

/**
 * Opens this app's own database on the emulator named by the environment. Only call it when
 * `is_spanner_emulator_configured()` is true. The defaults are the isolated ids the provisioning
 * script creates, so a shared emulator's other databases are never touched.
 * @returns The database handle and a function that closes the client.
 */
export function open_emulator_database(): { database: Database; close: () => Promise<void> } {
  const spanner = new Spanner({
    projectId: process.env['SPANNER_PROJECT_ID'] ?? 'assignr-helper-local',
  });
  const database = spanner
    .instance(process.env['SPANNER_INSTANCE_ID'] ?? 'local')
    .database(process.env['SPANNER_DATABASE_ID'] ?? 'assignr-helper');
  return {
    database,
    close: async () => {
      await database.close();
      spanner.close();
    },
  };
}
