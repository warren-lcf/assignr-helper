import { seed_auth_users } from '../scripts/seed_auth_user.cjs';

/**
 * Runs once before the E2E suite: makes sure the seeded test user exists in the
 * Auth emulator. Idempotent, so a reused emulator is fine.
 * @returns Resolves when the seed user exists.
 */
export default async function global_setup(): Promise<void> {
  await seed_auth_users();
}
