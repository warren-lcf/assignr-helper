import { DraftFacetKey } from '../enums/draft_facet_key.enum';

/** What one facet select of the draft editor needs to draw itself. */
export interface IDraftFacetControl {
  /** Which filter the select edits. */
  key: DraftFacetKey;
  /** The select label (translated). */
  label: string;
  /** Text of the "any value" option (translated). */
  any_label: string;
  /** Stable test id for the select. */
  testid: string;
  /** The values on offer. */
  options: string[];
}
