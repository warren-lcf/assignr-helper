import { describe, expect, it } from 'vitest';
import { ConnectionNotAuthorizedError } from './errors/connection_not_authorized.error.js';
import { IConnection } from './models/connection.model.js';
import { NotConfiguredAccessTokenSource } from './not_configured_access_token_source.js';

describe('NotConfiguredAccessTokenSource', () => {
  it('never yields a token, naming the connection that needs reconnecting', async () => {
    const source = new NotConfiguredAccessTokenSource();

    await expect(
      source.get_access_token({ connection_id: 'c1' } as IConnection),
    ).rejects.toBeInstanceOf(ConnectionNotAuthorizedError);
    await expect(source.get_access_token({ connection_id: 'c1' } as IConnection)).rejects.toThrow(
      'Connection c1 needs to be reconnected',
    );
  });
});
