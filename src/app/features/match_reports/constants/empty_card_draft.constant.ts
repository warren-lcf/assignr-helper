import { ICardDraft } from '../models/card_draft.model';

/** A card panel with nothing chosen yet. */
export const EMPTY_CARD_DRAFT: ICardDraft = {
  team_side: null,
  incident_type: null,
  jersey_digits: '',
  no_number: false,
  minute: null,
  reason_code: null,
};
