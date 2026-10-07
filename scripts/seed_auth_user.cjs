// Idempotently creates the seeded test users in the Firebase Auth EMULATOR.
// Refuses to run against anything but a local emulator.
//
//   node scripts/seed_auth_user.cjs                       (CLI)
//   import { seed_auth_users } from '../scripts/seed_auth_user.cjs'   (E2E global setup)
// CommonJS so both the CLI and Playwright's TypeScript loader can use it.

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const DEFAULT_EMULATOR_URL = 'http://localhost:9099';
const SEED_FILE = join(__dirname, 'seed', 'auth_users.seed.json');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Reads the seeded users (test-only credentials for the emulator).
 * @returns {{ email: string, password: string, display_name: string }[]} The seed users.
 */
function read_seed_users() {
  return JSON.parse(readFileSync(SEED_FILE, 'utf8'));
}

/**
 * Creates each seed user in the Auth emulator if it does not exist yet.
 * @param {string} emulator_url Base URL of the Auth emulator.
 * @returns {Promise<string[]>} Emails created during this call (empty when all existed).
 */
async function seed_auth_users(emulator_url = DEFAULT_EMULATOR_URL) {
  const url = new URL(emulator_url);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing to seed ${url.hostname}: only a local emulator is allowed.`);
  }
  const base = `${url.origin}/identitytoolkit.googleapis.com/v1`;
  const created = [];

  for (const user of read_seed_users()) {
    const sign_up = await fetch(`${base}/accounts:signUp?key=demo-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true }),
    });
    const body = await sign_up.json();

    if (sign_up.ok) {
      const update = await fetch(`${base}/accounts:update?key=demo-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: body.idToken, displayName: user.display_name }),
      });
      if (!update.ok) {
        throw new Error(`Could not set the display name for ${user.email}: ${update.status}`);
      }
      created.push(user.email);
    } else if (body?.error?.message !== 'EMAIL_EXISTS') {
      throw new Error(`Seeding ${user.email} failed: ${body?.error?.message ?? sign_up.status}`);
    }
  }
  return created;
}

module.exports = { read_seed_users, seed_auth_users };

if (require.main === module) {
  const emulator_url = process.env.AUTH_EMULATOR_URL ?? DEFAULT_EMULATOR_URL;
  seed_auth_users(emulator_url)
    .then((created) =>
      console.log(created.length ? `Seeded: ${created.join(', ')}` : 'Seed users already exist'),
    )
    .catch((error) => {
      console.error('Auth seed failed', error);
      process.exitCode = 1;
    });
}
