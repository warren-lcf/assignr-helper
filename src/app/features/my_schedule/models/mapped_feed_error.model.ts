import { FeedErrorKind } from '../enums/feed_error_kind.enum';

/** A failed calendar feed call translated for the screen. */
export interface IMappedFeedError {
  kind: FeedErrorKind;
  /** Translated sentence saying what happened and what to do. */
  message: string;
}
