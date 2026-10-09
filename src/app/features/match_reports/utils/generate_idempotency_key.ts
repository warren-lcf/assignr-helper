/** Length of a generated key: a UUID without its dashes. The backend accepts 8 to 64 characters. */
export const IDEMPOTENCY_KEY_LENGTH = 32;

/**
 * Makes a fresh idempotency key for a card: 32 random hex characters, from a UUID where the browser has
 * one. Replaying a request with the same key never adds a second card, so a card added offline and
 * sent twice still appears once.
 * @returns A key of letters and digits only.
 */
export function generate_idempotency_key(): string {
  const crypto_api = globalThis.crypto;
  if (typeof crypto_api.randomUUID === 'function') {
    return crypto_api.randomUUID().replaceAll('-', '');
  }
  // randomUUID exists only in secure contexts; getRandomValues works everywhere.
  const bytes = crypto_api.getRandomValues(new Uint8Array(IDEMPOTENCY_KEY_LENGTH / 2));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
