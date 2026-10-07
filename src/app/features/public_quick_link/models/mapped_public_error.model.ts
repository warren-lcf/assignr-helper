import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';

/** A failed public call translated for the page. */
export interface IMappedPublicError {
  /** What went wrong. */
  kind: PublicLinkErrorKind;
  /** Short, translated heading. */
  headline: string;
  /** Translated explanation of what to do. */
  description: string;
}
