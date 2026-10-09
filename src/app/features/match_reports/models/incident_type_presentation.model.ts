/** How a card is drawn: an icon and words always, with a tint as extra help. */
export interface IIncidentTypePresentation {
  /** English label; translated where it is shown. */
  label: string;
  /** Material icon name. */
  icon: string;
  /** CSS colour that tints the icon box. */
  accent: string;
}
