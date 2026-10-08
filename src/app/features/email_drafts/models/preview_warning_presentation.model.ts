import { PreviewFixTarget } from '../enums/preview_fix_target.enum';

/** How one preview warning is shown. Texts are English keys, translated where shown. */
export interface IPreviewWarningPresentation {
  /** True when sending must stay disabled while the warning stands. */
  is_blocking: boolean;
  icon: string;
  headline: string;
  /** What to do about it. */
  advice: string;
  /** Where the fix lives, when there is a place to go. */
  fix_target: PreviewFixTarget | null;
  /** Label of the action that goes to the fix, when there is one. */
  fix_label: string | null;
}
