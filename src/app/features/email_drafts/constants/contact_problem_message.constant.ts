import { ContactProblem } from '../enums/contact_problem.enum';

/** English reason for each kind of unusable pasted line; translated where shown. */
export const CONTACT_PROBLEM_MESSAGE: Readonly<Record<ContactProblem, string>> = {
  [ContactProblem.INVALID_EMAIL]: 'Not a valid email address',
  [ContactProblem.DUPLICATE]: 'This address is repeated from an earlier line',
  [ContactProblem.NAME_TOO_LONG]: 'The name is too long',
  [ContactProblem.EMAIL_TOO_LONG]: 'The address is too long',
};
