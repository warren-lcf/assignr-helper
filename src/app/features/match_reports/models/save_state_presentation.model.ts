/** How a save state is drawn: words and an icon always, never colour alone. */
export interface ISaveStatePresentation {
  /** English label; `{{count}}` is the number of edits waiting. */
  label: string;
  /** English label used when exactly one edit is waiting; the plain label is used when absent. */
  label_one?: string;
  /** Material icon name. */
  icon: string;
}
