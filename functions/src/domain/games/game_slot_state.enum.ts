/** Whether one officiating position of a game can still be taken. */
export enum GameSlotState {
  /** Nobody is assigned; the position can be claimed. */
  OPEN = 'OPEN',
  /** Someone is assigned. */
  FILLED = 'FILLED',
  /** The connected account holds this position. */
  MINE = 'MINE',
}
