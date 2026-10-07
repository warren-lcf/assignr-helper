/** Body of `PUT /api/connections/:id/credentials`. The secret is sent once and never kept. */
export interface IReplaceCredentialsRequest {
  /** The new client secret. */
  client_secret: string;
  /** A new client id; omit to keep the stored one. */
  client_id?: string;
}
