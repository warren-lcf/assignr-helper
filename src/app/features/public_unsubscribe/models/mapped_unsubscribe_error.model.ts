import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';

/** A failed unsubscribe call translated for the page. */
export interface IMappedUnsubscribeError {
  /** What went wrong. */
  kind: UnsubscribeErrorKind;
  /** Short, translated heading. */
  headline: string;
  /** Translated explanation of what to do. */
  description: string;
}
