/** One position of a publicly shown game. It names the position but never who holds it. */
export interface IPublicGameSlot {
  /** The position as the provider names it, such as "Referee" or "Mentor"; may be empty. */
  position: string;
  /** True while nobody is assigned to the position. */
  is_open: boolean;
}
