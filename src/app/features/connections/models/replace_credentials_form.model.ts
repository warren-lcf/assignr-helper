/** What the replace-credentials dialog edits itself. The secret is not part of it; see `SecretEntryFormComponent`. */
export interface IReplaceCredentialsFormModel {
  /** A new client id, or blank to keep the stored one. */
  client_id: string;
}
