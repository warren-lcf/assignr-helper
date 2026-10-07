import { SyncKind } from '../enums/sync_kind.enum';

/** English label (also the translation key) for each sync kind. */
export const SYNC_KIND_LABEL: Readonly<Record<SyncKind, string>> = {
  [SyncKind.REFERENCE_DATA]: 'Reference data',
  [SyncKind.OPEN_GAMES]: 'Open games',
  [SyncKind.MY_GAMES]: 'My games',
};
