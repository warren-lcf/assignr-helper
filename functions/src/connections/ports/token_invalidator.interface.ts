/** Port that drops cached provider tokens when a connection's credentials change. */
export interface ITokenInvalidator {
  /**
   * Forgets any cached token for the connection.
   * @param tenant_id Owning tenant.
   * @param connection_id Connection id.
   * @returns Nothing.
   */
  invalidate(tenant_id: string, connection_id: string): void;
}
