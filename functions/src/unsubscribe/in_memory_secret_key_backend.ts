import { ISecretKeyBackend } from './ports/secret_key_backend.interface.js';

/** In-memory {@link ISecretKeyBackend}: the reference behaviour, and the double for specs. */
export class InMemorySecretKeyBackend implements ISecretKeyBackend {
  /** Stored secrets by id; exposed so a spec can inspect or seed them. */
  public readonly secrets = new Map<string, string>();

  /** @inheritdoc */
  public async read(secret_id: string): Promise<string | null> {
    return this.secrets.get(secret_id) ?? null;
  }

  /** @inheritdoc */
  public async create_if_absent(secret_id: string, value: string): Promise<boolean> {
    if (this.secrets.has(secret_id)) {
      return false;
    }
    this.secrets.set(secret_id, value);
    return true;
  }
}
