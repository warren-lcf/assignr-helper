import { RecipientMode } from '../enums/recipient_mode.enum';

/** The draft editor form value. Select-style filters use an empty string for any. */
export interface IDraftFormModel {
  subject: string;
  intro: string;
  search: string;
  level: string;
  league: string;
  age_group: string;
  location_group: string;
  /** Carried through from the loaded draft; this screen does not edit it. */
  organization_id: string | null;
  /** Carried through from the loaded draft; this screen does not edit it. */
  connection_id: string | null;
  only_with_open_slots: boolean;
  /** First calendar day as picked (a local Date), or null. */
  date_from: Date | null;
  /** Last calendar day as picked (a local Date), or null. */
  date_to: Date | null;
  include_quick_link: boolean;
  /** Null while the number field is empty. */
  quick_link_expiry_days: number | null;
  recipient_mode: RecipientMode;
  /** The chosen contacts, used when the mode is SELECTED. */
  contact_ids: string[];
}
