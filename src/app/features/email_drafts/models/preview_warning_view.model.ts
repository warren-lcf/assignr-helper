import { PreviewFixTarget } from '../enums/preview_fix_target.enum';

/** One preview warning ready to draw: translated text and where its fix lives. */
export interface IPreviewWarningView {
  /** The warning code as the server reported it. */
  code: string;
  is_blocking: boolean;
  icon: string;
  headline: string;
  advice: string;
  fix_target: PreviewFixTarget | null;
  fix_label: string | null;
}
