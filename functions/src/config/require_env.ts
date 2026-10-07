/**
 * Reads a required environment variable and fails closed when it is missing,
 * so a misconfigured deploy stops at start-up instead of running half-configured.
 * @param name Variable name.
 * @param env Environment to read; defaults to `process.env`.
 * @returns The non-empty value.
 * @throws When the variable is missing or blank.
 */
export function require_env(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
