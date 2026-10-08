import { IPreviewSkipped } from './preview_skipped.model';

/** The payload of the draft preview request. */
export interface IDraftPreview {
  subject: string;
  /** Server-rendered HTML. Untrusted: only ever shown inside a sandboxed iframe. */
  html: string;
  /** The plain-text version of the email. */
  text: string;
  game_count: number;
  eligible_recipient_count: number;
  skipped: IPreviewSkipped;
  /** Warning codes (see PreviewWarningCode). Unknown codes may appear. */
  warnings: string[];
}
