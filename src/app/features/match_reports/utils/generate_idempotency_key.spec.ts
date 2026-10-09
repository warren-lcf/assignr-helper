import { IDEMPOTENCY_KEY_LENGTH, generate_idempotency_key } from './generate_idempotency_key';

describe('generate_idempotency_key', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes 32 hex characters, which the backend accepts (8 to 64 of letters, digits, _ and -)', () => {
    const key = generate_idempotency_key();

    expect(key).toHaveLength(IDEMPOTENCY_KEY_LENGTH);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('makes a different key every time', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generate_idempotency_key()));

    expect(keys.size).toBe(50);
  });

  it('is the UUID without its dashes when the browser has randomUUID', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' });

    expect(generate_idempotency_key()).toBe('123e4567e89b12d3a456426614174000');
  });

  it('falls back to random bytes where randomUUID does not exist (insecure contexts)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_, index) => (bytes[index] = index));
        return bytes;
      },
    });

    expect(generate_idempotency_key()).toBe('000102030405060708090a0b0c0d0e0f');
  });
});
