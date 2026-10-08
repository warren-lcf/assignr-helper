import { DraftStatus } from '../enums/draft_status.enum';
import { RecipientMode } from '../enums/recipient_mode.enum';
import { IDraftFilters } from './draft_filters.model';

/** One email draft as the drafts API reports it. */
export interface IEmailDraft {
  draft_id: string;
  subject: string;
  intro: string | null;
  filters: IDraftFilters;
  include_quick_link: boolean;
  quick_link_expiry_days: number;
  recipient_mode: RecipientMode;
  contact_ids: string[];
  status: DraftStatus;
  /** How many people the send went to, once sent. */
  recipient_count: number | null;
  sent_at: number | null;
  created_at: number;
  updated_at: number;
}
