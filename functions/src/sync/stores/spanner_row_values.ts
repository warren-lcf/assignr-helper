/**
 * Converts a Spanner INT64 or FLOAT64 cell to a number. Accepts numbers, numeric
 * strings, bigints and Spanner wrapper objects exposing a numeric `value`.
 * @param value Raw cell value from a query row.
 * @param column Column name, used in the error message.
 * @returns The numeric value.
 * @throws Error when the cell is null or not numeric.
 */
export function to_number(value: unknown, column: string): number {
  const converted = convert_number(value);
  if (converted === null) {
    throw new Error(`Column ${column} holds a non-numeric value`);
  }
  return converted;
}

/**
 * Converts a nullable Spanner INT64 or FLOAT64 cell to a number or null.
 * @param value Raw cell value from a query row.
 * @param column Column name, used in the error message.
 * @returns The numeric value, or null when the cell is null or undefined.
 * @throws Error when the cell is present but not numeric.
 */
export function to_nullable_number(value: unknown, column: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return to_number(value, column);
}

/**
 * Converts a nullable Spanner STRING cell to a string or null.
 * @param value Raw cell value from a query row.
 * @returns The text, or null when the cell is null or undefined.
 */
export function to_nullable_string(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * Converts a Spanner BOOL cell to a boolean.
 * @param value Raw cell value from a query row.
 * @param column Column name, used in the error message.
 * @returns The boolean value.
 * @throws Error when the cell is not a boolean.
 */
export function to_boolean(value: unknown, column: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Column ${column} holds a non-boolean value`);
  }
  return value;
}

/**
 * Parses a JSON-in-STRING column.
 * @param value Raw cell value from a query row.
 * @param column Column name, used in the error message.
 * @param fallback Returned when the cell is null, undefined or an empty string.
 * @returns The parsed value, or `fallback`.
 * @throws Error naming the column when the cell is not a string or holds corrupt JSON.
 */
export function parse_json<T>(value: unknown, column: string, fallback: T): T {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value !== 'string') {
    throw new Error(`Column ${column} holds a non-string value where JSON text was expected`);
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Column ${column} holds corrupt JSON: ${reason}`, { cause: error });
  }
}

/**
 * Normalizes the variants a Spanner client may return for a number.
 * @param value Raw cell value.
 * @returns A number, or null when the value is not numeric.
 */
function convert_number(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return convert_number((value as { value: unknown }).value);
  }
  return null;
}
