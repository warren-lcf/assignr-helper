import { IContactParseProblem } from './contact_parse_problem.model';
import { IParsedContactLine } from './parsed_contact_line.model';

/** The outcome of reading pasted contact lines. */
export interface IContactParseResult {
  /** Lines that can be sent. */
  valid: IParsedContactLine[];
  /** Lines that cannot. */
  problems: IContactParseProblem[];
}
