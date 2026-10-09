/** The game was cancelled, so there is nothing to report on. */
export class ReportGameCancelledError extends Error {
  public constructor(public readonly game_id: string) {
    super(`Game ${game_id} was cancelled`);
    this.name = 'ReportGameCancelledError';
  }
}
