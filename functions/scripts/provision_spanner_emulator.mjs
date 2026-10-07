// Idempotently creates this app's own instance and database on a running Spanner emulator.
// Refuses to run against real Spanner. Uses an isolated project id so it never touches
// another app's data on a shared emulator.
//
//   SPANNER_EMULATOR_HOST=localhost:9010 node functions/scripts/provision_spanner_emulator.mjs

import { Spanner } from '@google-cloud/spanner';

const project_id = process.env.SPANNER_PROJECT_ID ?? 'assignr-helper-local';
const instance_id = process.env.SPANNER_INSTANCE_ID ?? 'local';
const database_id = process.env.SPANNER_DATABASE_ID ?? 'assignr-helper';

if (!process.env.SPANNER_EMULATOR_HOST) {
  console.error('Refusing to provision: SPANNER_EMULATOR_HOST is not set (this script is emulator-only).');
  process.exit(1);
}

const spanner = new Spanner({ projectId: project_id });
const instance = spanner.instance(instance_id);

const [instance_exists] = await instance.exists();
if (!instance_exists) {
  const [, operation] = await spanner.createInstance(instance_id, {
    config: 'emulator-config',
    nodes: 1,
    displayName: 'Local',
  });
  await operation.promise();
  console.log(`Created instance ${project_id}/${instance_id}`);
}

const database = instance.database(database_id);
const [database_exists] = await database.exists();
if (!database_exists) {
  const [, operation] = await instance.createDatabase(database_id);
  await operation.promise();
  console.log(`Created database ${database_id}`);
} else {
  console.log(`Database ${database_id} already exists`);
}

await database.close();
spanner.close();
