import { DraftWarning } from '../enums/draft_warning.enum.js';

/** What a draft's email would look like and who would get it, right now. */
export interface IDraftPreview {
  subject: string;
  html: string;
  text: string;
  /** Games listed in the email. */
  game_count: number;
  /** Contacts who would be emailed. */
  eligible_recipient_count: number;
  skipped: {
    /** Unsubscribed contacts left out. */
    unsubscribed: number;
    /** Chosen contacts that no longer exist. */
    missing: number;
  };
  warnings: DraftWarning[];
}
