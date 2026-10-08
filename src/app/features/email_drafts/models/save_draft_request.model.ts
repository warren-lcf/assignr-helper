import { RecipientMode } from '../enums/recipient_mode.enum';
import { IDraftFilters } from './draft_filters.model';

/** Body of the create and update draft requests. */
export interface ISaveDraftRequest {
  /** 1 to 200 characters. */
  subject: string;
  /** Plain text, at most 2000 characters, or null for none. */
  intro: string | null;
  filters: IDraftFilters;
  include_quick_link: boolean;
  /** 1 to 90. */
  quick_link_expiry_days: number;
  recipient_mode: RecipientMode;
  /** Only sent when the mode is SELECTED. */
  contact_ids?: string[];
}
