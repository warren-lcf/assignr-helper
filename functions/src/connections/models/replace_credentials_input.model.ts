/** New credentials for an existing connection. */
export interface IReplaceCredentialsInput {
  /** Omit to keep the stored client id (rotating only the secret). */
  client_id?: string;
  client_secret: string;
}
