import { z } from 'zod';
import { IntegrationProvider } from '../../integrations/enums/integration_provider.enum.js';

/** A client id or secret as pasted: surrounding whitespace is dropped, nothing else is changed. */
const client_id_field = z.string().trim().min(1).max(256);
const client_secret_field = z.string().trim().min(1).max(512);

/** Body of `POST /connections`: which provider, and the tenant's own client credentials. */
export const connection_credentials_body_schema = z.strictObject({
  provider: z.enum(IntegrationProvider),
  client_id: client_id_field,
  client_secret: client_secret_field,
});

/** Body of `PUT /connections/:connection_id/credentials`; omit `client_id` to rotate only the secret. */
export const replace_credentials_body_schema = z.strictObject({
  client_id: client_id_field.optional(),
  client_secret: client_secret_field,
});
