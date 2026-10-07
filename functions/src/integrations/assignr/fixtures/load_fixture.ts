import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads a JSON fixture used by the adapter specs. The shipped fixtures follow
 * the documented response shapes; replace them with sanitized recordings from a
 * live account to catch field drift.
 * @param name File name inside `fixtures/`, e.g. `games_page_1.json`.
 * @returns The parsed JSON.
 */
export function load_fixture(name: string): unknown {
  const directory = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(join(directory, name), 'utf8')) as unknown;
}
