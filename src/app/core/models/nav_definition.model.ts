/** One entry in the app's main navigation; drives both the sidebar and the routes. */
export interface INavDefinition {
  /** Route path without a leading slash. */
  path: string;
  /** English label, also the translation key. */
  label: string;
  /** Material icon ligature. */
  icon: string;
}
