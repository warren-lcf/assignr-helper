/** Command to request (claim) an open game. */
export interface IGameRequestCommand {
  game_external_id: string;
  /** Provider position id; null lets the provider choose. */
  position_external_id: string | null;
}
