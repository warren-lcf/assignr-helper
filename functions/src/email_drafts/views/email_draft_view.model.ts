import { DraftStatus } from '../enums/draft_status.enum.js';
import { RecipientMode } from '../enums/recipient_mode.enum.js';
import { IDraftFilters } from '../models/draft_filters.model.js';

/** An email draft as the owner's API shows it. */
export interface IEmailDraftView {
  draft_id: string;
  subject: string;
  intro: string | null;
  filters: IDraftFilters;
  include_quick_link: boolean;
  quick_link_expiry_days: number;
  recipient_mode: RecipientMode;
  contact_ids: string[];
  status: DraftStatus;
  recipient_count: number | null;
  sent_at: number | null;
  created_at: number;
  updated_at: number;
}
