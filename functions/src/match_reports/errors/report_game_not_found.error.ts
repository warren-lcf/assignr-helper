/** The game cannot be reported on: it does not exist for the tenant, is not the referee's own, or has been removed. */
export class ReportGameNotFoundError extends Error {
  public constructor(public readonly game_id: string) {
    super(`Game ${game_id} was not found`);
    this.name = 'ReportGameNotFoundError';
  }
}
