/** Which draft the editor on the Email Drafts screen has open. */
export interface IEditorTarget {
  /** The stored draft to open, or null to write a new one. */
  draft_id: string | null;
}
