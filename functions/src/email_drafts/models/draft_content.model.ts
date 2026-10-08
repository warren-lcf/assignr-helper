import { RecipientMode } from '../enums/recipient_mode.enum.js';
import { IDraftFilters } from './draft_filters.model.js';

/** What the owner writes in a draft: everything but its identity, status and send results. */
export interface IDraftContent {
  /** One line, 1 to 200 characters. */
  subject: string;
  /** Optional opening paragraph; null uses the standard one. */
  intro: string | null;
  filters: IDraftFilters;
  /** Whether a live quick link is created when the draft is sent and put in every email. */
  include_quick_link: boolean;
  /** Days the quick link works after sending, 1 to 90. */
  quick_link_expiry_days: number;
  recipient_mode: RecipientMode;
  /** The chosen contacts; always empty unless the mode is SELECTED. */
  contact_ids: string[];
}
