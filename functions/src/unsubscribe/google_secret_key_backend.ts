import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { ISecretKeyBackend } from './ports/secret_key_backend.interface.js';

/** The slice of the Secret Manager client this backend uses; lets a spec pass a fake. */
export type IGoogleSecretClientLike = Pick<
  SecretManagerServiceClient,
  'accessSecretVersion' | 'createSecret' | 'addSecretVersion' | 'deleteSecret'
>;

/** gRPC status codes this backend reacts to. */
const GRPC_NOT_FOUND = 5;
const GRPC_ALREADY_EXISTS = 6;

/**
 * Reads the numeric gRPC status code off an error, when it has one.
 * @param error Anything that was thrown.
 * @returns The code, or null.
 */
function grpc_code_of(error: unknown): number | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : null;
}

/**
 * {@link ISecretKeyBackend} over Google Secret Manager. Creation is race-safe because it relies
 * on Secret Manager refusing a second `createSecret` for the same id (ALREADY_EXISTS): of
 * several instances starting at once, exactly one creates the secret and writes its first
 * version. A permissions or availability error is rethrown, never read as "missing".
 */
export class GoogleSecretKeyBackend implements ISecretKeyBackend {
  /**
   * Creates the backend.
   * @param project_id GCP project the secret lives in (`SECRET_MANAGER_PROJECT_ID`).
   * @param make_client Makes the Secret Manager client on first use; defaults to a new one using the ambient credentials.
   */
  public constructor(
    private readonly project_id: string,
    private readonly make_client: () => IGoogleSecretClientLike = () =>
      new SecretManagerServiceClient(),
  ) {}

  /** The Secret Manager client, created on first use so building the app opens no connection. */
  private get client(): IGoogleSecretClientLike {
    this.client_instance ??= this.make_client();
    return this.client_instance;
  }

  private client_instance: IGoogleSecretClientLike | null = null;

  /** @inheritdoc */
  public async read(secret_id: string): Promise<string | null> {
    try {
      const [version] = await this.client.accessSecretVersion({
        name: `${this.secret_name(secret_id)}/versions/latest`,
      });
      const payload = version.payload?.data;
      if (payload === null || payload === undefined) {
        return null;
      }
      return typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8');
    } catch (error) {
      if (grpc_code_of(error) === GRPC_NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  /** @inheritdoc */
  public async create_if_absent(secret_id: string, value: string): Promise<boolean> {
    try {
      await this.client.createSecret({
        parent: `projects/${this.project_id}`,
        secretId: secret_id,
        secret: { replication: { automatic: {} } },
      });
    } catch (error) {
      if (grpc_code_of(error) === GRPC_ALREADY_EXISTS) {
        return false;
      }
      throw error;
    }
    try {
      await this.client.addSecretVersion({
        parent: this.secret_name(secret_id),
        payload: { data: Buffer.from(value, 'utf8') },
      });
    } catch (error) {
      // Leave no empty secret behind: it would block every later attempt to create the key.
      await this.delete_quietly(secret_id);
      throw error;
    }
    return true;
  }

  private secret_name(secret_id: string): string {
    return `projects/${this.project_id}/secrets/${secret_id}`;
  }

  private async delete_quietly(secret_id: string): Promise<void> {
    try {
      await this.client.deleteSecret({ name: this.secret_name(secret_id) });
    } catch (error) {
      console.error('Could not remove a half-created secret', secret_id, error);
    }
  }
}
