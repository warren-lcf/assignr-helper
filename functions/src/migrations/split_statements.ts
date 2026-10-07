/**
 * Splits a migration file into individual DDL statements.
 * Line comments (`--`) are removed first, so comments may not hide a statement
 * terminator and statements may not contain a literal semicolon.
 * @param sql Raw contents of a `.sql` migration file.
 * @returns Trimmed, non-empty statements without trailing semicolons.
 */
export function split_statements(sql: string): string[] {
  const without_comments = sql
    .split(/\r?\n/)
    .map((line) => {
      const comment_start = line.indexOf('--');
      return comment_start === -1 ? line : line.slice(0, comment_start);
    })
    .join('\n');

  return without_comments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
