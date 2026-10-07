import { describe, expect, it } from 'vitest';
import { split_statements } from './split_statements.js';

describe('split_statements', () => {
  it('splits on semicolons and trims', () => {
    expect(
      split_statements('CREATE TABLE a (x INT64) PRIMARY KEY (x);\n\nCREATE INDEX i ON a (x);'),
    ).toEqual(['CREATE TABLE a (x INT64) PRIMARY KEY (x)', 'CREATE INDEX i ON a (x)']);
  });

  it('drops line comments, including ones containing words like semicolon', () => {
    const sql = '-- header comment\nCREATE TABLE a (x INT64) PRIMARY KEY (x); -- trailing note\n';

    expect(split_statements(sql)).toEqual(['CREATE TABLE a (x INT64) PRIMARY KEY (x)']);
  });

  it('returns nothing for an empty or comment-only file', () => {
    expect(split_statements('')).toEqual([]);
    expect(split_statements('-- only a comment')).toEqual([]);
  });

  it('handles Windows line endings', () => {
    expect(split_statements('-- c\r\nCREATE TABLE a (x INT64) PRIMARY KEY (x);\r\n')).toEqual([
      'CREATE TABLE a (x INT64) PRIMARY KEY (x)',
    ]);
  });
});
