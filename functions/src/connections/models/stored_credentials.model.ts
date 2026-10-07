/**
 * A connection's API client credentials, as the tenant entered them. These are
 * secrets: they live only in Secret Manager and are never returned by the API.
 */
export interface IStoredCredentials {
  client_id: string;
  client_secret: string;
}
