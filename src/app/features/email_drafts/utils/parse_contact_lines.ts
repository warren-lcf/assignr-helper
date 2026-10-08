import {
  CONTACT_NAME_MAX_LENGTH,
  EMAIL_ADDRESS_MAX_LENGTH,
  IMPORT_PROBLEM_TEXT_MAX_LENGTH,
} from '../constants/email_limits.constant';
import { ContactProblem } from '../enums/contact_problem.enum';
import { IContactParseProblem } from '../models/contact_parse_problem.model';
import { IContactParseResult } from '../models/contact_parse_result.model';
import { IParsedContactLine } from '../models/parsed_contact_line.model';
import { is_plausible_email } from './is_plausible_email';

/** "Name <address>": everything before the angle brackets is the name. */
const ANGLE_PATTERN = /^(.*?)<\s*([^<>\s]*)\s*>\s*$/;

/** Removes one pair of quotes around a name, as in "Doe, Jane" <jane@example.com>. */
function strip_quotes(name: string): string {
  return name.length >= 2 && name.startsWith('"') && name.endsWith('"')
    ? name.slice(1, -1).trim()
    : name;
}

/**
 * Reads pasted text, one contact per line: either `Name <address>` or a bare
 * address. Blank lines are ignored (but still counted in the row numbers),
 * a repeated address is reported rather than sent twice, and every line that
 * cannot be sent is reported with the reason so the person can fix the paste.
 * @param text The pasted text.
 * @returns The lines that can be sent and the lines that cannot.
 */
export function parse_contact_lines(text: string): IContactParseResult {
  const valid: IParsedContactLine[] = [];
  const problems: IContactParseProblem[] = [];
  const seen = new Set<string>();

  text.split(/\r\n|\r|\n/).forEach((raw_line, index) => {
    const line = raw_line.trim();
    if (!line) return;
    const row = index + 1;
    const shown = line.slice(0, IMPORT_PROBLEM_TEXT_MAX_LENGTH);
    const angle = ANGLE_PATTERN.exec(line);
    const name = angle ? strip_quotes(angle[1].trim()) : '';
    const email_address = (angle ? angle[2] : line).trim();

    const problem = find_problem(name, email_address, seen);
    if (problem) {
      problems.push({ row, problem, text: shown });
      return;
    }
    seen.add(email_address.toLowerCase());
    valid.push({ row, entry: name ? { display_name: name, email_address } : { email_address } });
  });

  return { valid, problems };
}

function find_problem(
  name: string,
  email_address: string,
  seen: ReadonlySet<string>,
): ContactProblem | null {
  if (email_address.length > EMAIL_ADDRESS_MAX_LENGTH) return ContactProblem.EMAIL_TOO_LONG;
  if (!is_plausible_email(email_address)) return ContactProblem.INVALID_EMAIL;
  if (name.length > CONTACT_NAME_MAX_LENGTH) return ContactProblem.NAME_TOO_LONG;
  if (seen.has(email_address.toLowerCase())) return ContactProblem.DUPLICATE;
  return null;
}
