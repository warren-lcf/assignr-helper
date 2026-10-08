import { ContactProblem } from '../enums/contact_problem.enum';
import { parse_contact_lines } from './parse_contact_lines';

describe('parse_contact_lines', () => {
  it('reads a bare address', () => {
    expect(parse_contact_lines('jane@example.test').valid).toEqual([
      { row: 1, entry: { email_address: 'jane@example.test' } },
    ]);
  });

  it('reads Name <address>, with or without quotes around the name', () => {
    const { valid } = parse_contact_lines(
      'Jane Doe <jane@example.test>\n"Doe, Bob" <bob@example.test>',
    );

    expect(valid).toEqual([
      { row: 1, entry: { display_name: 'Jane Doe', email_address: 'jane@example.test' } },
      { row: 2, entry: { display_name: 'Doe, Bob', email_address: 'bob@example.test' } },
    ]);
  });

  it('accepts an address alone in angle brackets', () => {
    expect(parse_contact_lines('<amy@example.test>').valid).toEqual([
      { row: 1, entry: { email_address: 'amy@example.test' } },
    ]);
  });

  it('skips blank lines but keeps row numbers true to the paste, and handles CRLF', () => {
    const { valid } = parse_contact_lines('a@example.test\r\n\r\n   \r\nb@example.test');

    expect(valid.map((line) => line.row)).toEqual([1, 4]);
  });

  it('reports an invalid address with the line as pasted', () => {
    const { valid, problems } = parse_contact_lines('not an email\nok@example.test');

    expect(valid).toHaveLength(1);
    expect(problems).toEqual([
      { row: 1, problem: ContactProblem.INVALID_EMAIL, text: 'not an email' },
    ]);
  });

  it('reports a repeated address (ignoring case) on the later line only', () => {
    const { valid, problems } = parse_contact_lines('A@example.test\nBob <a@EXAMPLE.test>');

    expect(valid).toHaveLength(1);
    expect(problems).toEqual([
      { row: 2, problem: ContactProblem.DUPLICATE, text: 'Bob <a@EXAMPLE.test>' },
    ]);
  });

  it('reports a name that is too long', () => {
    const { problems } = parse_contact_lines(`${'N'.repeat(101)} <n@example.test>`);

    expect(problems[0].problem).toBe(ContactProblem.NAME_TOO_LONG);
  });

  it('reports an address that is too long', () => {
    const { problems } = parse_contact_lines(`${'a'.repeat(260)}@example.test`);

    expect(problems[0].problem).toBe(ContactProblem.EMAIL_TOO_LONG);
  });

  it('caps the echoed line so a huge paste cannot flood the screen', () => {
    const { problems } = parse_contact_lines('x'.repeat(5000));

    expect(problems[0].text).toHaveLength(120);
  });

  it('returns nothing for empty text', () => {
    expect(parse_contact_lines('')).toEqual({ valid: [], problems: [] });
  });
});
