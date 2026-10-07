import { QuickLinkExpiryPreset } from '../enums/quick_link_expiry_preset.enum';

/** English label (also the translation key) and length in days for each expiry preset. */
export const QUICK_LINK_EXPIRY_PRESET: Readonly<
  Record<QuickLinkExpiryPreset, { label: string; days: number | null }>
> = {
  [QuickLinkExpiryPreset.NEVER]: { label: 'Never expires', days: null },
  [QuickLinkExpiryPreset.DAYS_7]: { label: 'In 7 days', days: 7 },
  [QuickLinkExpiryPreset.DAYS_30]: { label: 'In 30 days', days: 30 },
  [QuickLinkExpiryPreset.DAYS_90]: { label: 'In 90 days', days: 90 },
};
