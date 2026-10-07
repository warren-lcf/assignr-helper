/** A rendered email ready to hand to a mail sender. */
export interface IRenderedDigest {
  subject: string;
  /** Table-based, inline-styled HTML with every dynamic value escaped. */
  html: string;
  /** Plain-text alternative carrying the same content. */
  text: string;
}
