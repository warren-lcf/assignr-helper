import { require_env } from './require_env.js';

/**
 * Tells whether the app is running in the local emulator environment, the only place a plain
 * `http://localhost` origin is allowed.
 * @param env Environment to read.
 * @returns True under the Firebase Functions emulator or against the Spanner emulator.
 */
function is_local_environment(env: NodeJS.ProcessEnv): boolean {
  return env['FUNCTIONS_EMULATOR'] === 'true' || Boolean(env['SPANNER_EMULATOR_HOST']);
}

/**
 * Reads `PUBLIC_APP_ORIGIN`, the address people open the app at. Links in emails (the quick link
 * and the unsubscribe link) are built from it, so a wrong value would send recipients somewhere
 * else; it is therefore required and checked strictly rather than defaulted.
 * @param env Environment to read; defaults to `process.env`.
 * @returns The origin without a trailing slash, for example `https://assignr-helper-prod.web.app`.
 * @throws When the variable is missing, is not a bare `https` origin (no path, query, fragment or
 *   credentials), or is `http://localhost:<port>` outside the local environment.
 */
export function read_public_app_origin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = require_env('PUBLIC_APP_ORIGIN', env).trim();
  const invalid = (reason: string): Error =>
    new Error(`Environment variable PUBLIC_APP_ORIGIN ${reason}`);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid('must be an origin such as https://app.example.com');
  }
  if (url.username !== '' || url.password !== '') {
    throw invalid('must not contain credentials');
  }
  if (raw !== url.origin) {
    throw invalid('must be only an origin: no path, query, fragment or trailing slash');
  }
  if (url.protocol === 'https:') {
    return url.origin;
  }
  if (url.protocol === 'http:' && url.hostname === 'localhost' && is_local_environment(env)) {
    return url.origin;
  }
  throw invalid(
    'must use https (http://localhost is accepted only when running against the local emulators)',
  );
}
