import { QuickLinkExpiryPreset } from '../enums/quick_link_expiry_preset.enum';

/** The create dialog's form value. */
export interface ICreateQuickLinkFormModel {
  /** Levels to restrict the link to; empty shows every level. */
  levels: string[];
  /** First date to show (the visitor's calendar day, as picked), or null. */
  date_start: Date | null;
  /** Last date to show (the visitor's calendar day, as picked), or null. */
  date_end: Date | null;
  /** How long the link lives. */
  expiry: QuickLinkExpiryPreset;
}
