import { randomBytes } from 'node:crypto';
import { UnsubscribeKeyUnavailableError } from './errors/unsubscribe_key_unavailable.error.js';
import { ISecretKeyBackend } from './ports/secret_key_backend.interface.js';
import { IUnsubscribeKeyProvider } from './ports/unsubscribe_key_provider.interface.js';

/** Shortest key, in bytes, that is accepted as an HMAC key. */
const MIN_KEY_BYTES = 32;

/** Settings of {@link SecretManagerUnsubscribeKeys}. */
export interface ISecretManagerUnsubscribeKeysOptions {
  backend: ISecretKeyBackend;
  /** Key version new tokens are signed with. Defaults to 1. */
  current_version?: number;
  /** Key versions tokens may name; must include the current one. Defaults to just version 1. */
  supported_versions?: readonly number[];
  /** Makes a new key. Defaults to 32 random bytes; specs replace it. */
  generate_key?: () => Buffer;
  /** Waits between reads while another instance finishes creating the key. Specs replace it. */
  wait?: (milliseconds: number) => Promise<void>;
  /** Reads to make, after losing the creation race, before giving up. Defaults to 10. */
  max_polls?: number;
  /** Milliseconds between those reads. Defaults to 500. */
  poll_interval_ms?: number;
}

/**
 * Names the secret that holds a key version.
 * @param version Key version.
 * @returns The Secret Manager secret id, for example `assignr-helper-unsubscribe-key-v1`.
 */
export function unsubscribe_key_secret_id(version: number): string {
  return `assignr-helper-unsubscribe-key-v${version}`;
}

/**
 * Signing keys for unsubscribe tokens, kept in a platform-level secret in Secret Manager (one
 * secret per key version, holding the key as base64 text). The current version's secret is
 * created on first use with 32 random bytes; creation is conditional, so when several instances
 * start together exactly one creates it and the others read what it wrote. Keys are cached for
 * the life of the instance. When a key cannot be read or created every call fails with
 * {@link UnsubscribeKeyUnavailableError}: nothing is ever signed with a missing key.
 *
 * To rotate: create secret `…-v2` (or just let a new version number be deployed), make 2 the
 * current version and keep 1 in `supported_versions` until old links no longer matter.
 */
export class SecretManagerUnsubscribeKeys implements IUnsubscribeKeyProvider {
  public readonly current_version: number;

  private readonly supported_versions: ReadonlySet<number>;
  private readonly cache = new Map<number, Promise<Buffer>>();
  private readonly generate_key: () => Buffer;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly max_polls: number;
  private readonly poll_interval_ms: number;

  /**
   * Creates the provider.
   * @param options Backend, versions and timing.
   * @throws Error when the current version is not among the supported ones.
   */
  public constructor(private readonly options: ISecretManagerUnsubscribeKeysOptions) {
    this.current_version = options.current_version ?? 1;
    this.supported_versions = new Set(options.supported_versions ?? [this.current_version]);
    if (!this.supported_versions.has(this.current_version)) {
      throw new Error('The current unsubscribe key version must be a supported one');
    }
    this.generate_key = options.generate_key ?? (() => randomBytes(MIN_KEY_BYTES));
    this.wait =
      options.wait ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.max_polls = options.max_polls ?? 10;
    this.poll_interval_ms = options.poll_interval_ms ?? 500;
  }

  /** @inheritdoc */
  public async get_signing_key(): Promise<Buffer> {
    return this.key_for(this.current_version);
  }

  /** @inheritdoc */
  public async get_verification_key(version: number): Promise<Buffer | null> {
    if (!this.supported_versions.has(version)) {
      return null;
    }
    return this.key_for(version);
  }

  /**
   * Loads a key once per instance. A failure is not cached, so the next call tries again.
   * @param version A supported version.
   * @returns The key.
   */
  private key_for(version: number): Promise<Buffer> {
    let pending = this.cache.get(version);
    if (!pending) {
      pending = this.load(version).catch((error: unknown) => {
        this.cache.delete(version);
        throw error;
      });
      this.cache.set(version, pending);
    }
    return pending;
  }

  /**
   * Reads the key, creating it first when this is the current version and it does not exist.
   * @param version A supported version.
   * @returns The key.
   * @throws UnsubscribeKeyUnavailableError when it cannot be read, created or decoded.
   */
  private async load(version: number): Promise<Buffer> {
    try {
      const secret_id = unsubscribe_key_secret_id(version);
      const existing = await this.options.backend.read(secret_id);
      if (existing !== null) {
        return this.decode(existing);
      }
      if (version !== this.current_version) {
        throw new Error('A retired unsubscribe key version has no secret');
      }
      const generated = this.generate_key();
      const created = await this.options.backend.create_if_absent(
        secret_id,
        generated.toString('base64'),
      );
      if (created) {
        return this.decode(generated.toString('base64'));
      }
      // Another instance won the race and is still writing the first version.
      for (let attempt = 0; attempt < this.max_polls; attempt++) {
        await this.wait(this.poll_interval_ms);
        const written = await this.options.backend.read(secret_id);
        if (written !== null) {
          return this.decode(written);
        }
      }
      throw new Error('The unsubscribe key secret exists but has no readable version');
    } catch (error) {
      console.error('The unsubscribe signing key could not be loaded', error);
      throw new UnsubscribeKeyUnavailableError({ cause: error });
    }
  }

  /**
   * Decodes a stored key and checks it is long enough to be a key.
   * @param text Base64 secret text.
   * @returns The key bytes.
   * @throws Error without the text when the key is too short.
   */
  private decode(text: string): Buffer {
    const key = Buffer.from(text.trim(), 'base64');
    if (key.length < MIN_KEY_BYTES) {
      throw new Error('The stored unsubscribe key is shorter than 32 bytes');
    }
    return key;
  }
}
