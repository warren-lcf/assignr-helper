import { ContactProblem } from '../enums/contact_problem.enum';

/** One pasted line that cannot become a contact. */
export interface IContactParseProblem {
  /** Line number in the pasted text, starting at 1. */
  row: number;
  problem: ContactProblem;
  /** The line as pasted, trimmed and capped so a huge paste cannot flood the screen. */
  text: string;
}
