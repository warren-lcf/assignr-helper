import { describe, expect, it } from 'vitest';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { GameListScope } from '../../sync/enums/game_list_scope.enum.js';
import { GAMES_LIST_LIMITS } from '../games_list_limits.constant.js';
import { create_games_list_query_schema } from './games_list_query.schema.js';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const schema = create_games_list_query_schema(() => NOW);

describe('games list query schema', () => {
  it('defaults to open games from three hours ago to 120 days ahead, with no filters', () => {
    const result = parse_with_schema(schema, {});

    expect(result).toEqual({
      ok: true,
      data: {
        scope: GameListScope.OPEN,
        window_start: NOW - 3 * HOUR,
        window_end: NOW + 120 * DAY,
        filters: {
          search: null,
          connection_id: null,
          organization_id: null,
          league: null,
          level: null,
          age_group: null,
          location_group: null,
          only_with_open_slots: false,
          include_cancelled: false,
        },
      },
    });
  });

  it('reads the clock again for every parse', () => {
    let time = NOW;
    const moving = create_games_list_query_schema(() => time);

    const first = parse_with_schema(moving, {});
    time += DAY;
    const second = parse_with_schema(moving, {});

    expect(first.ok && second.ok && second.data.window_start - first.data.window_start).toBe(DAY);
  });

  it('parses every parameter from query-string text', () => {
    const result = parse_with_schema(schema, {
      scope: 'ALL',
      from: '1000',
      to: '2000',
      search: '  thunder  ',
      connection_id: 'c1',
      organization_id: 'org_1',
      league: 'Metro League',
      level: 'Premier',
      age_group: 'U12',
      location_group: 'North Complex',
      only_with_open_slots: 'true',
      include_cancelled: 'true',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        scope: GameListScope.ALL,
        window_start: 1000,
        window_end: 2000,
        filters: {
          search: 'thunder',
          connection_id: 'c1',
          organization_id: 'org_1',
          league: 'Metro League',
          level: 'Premier',
          age_group: 'U12',
          location_group: 'North Complex',
          only_with_open_slots: true,
          include_cancelled: true,
        },
      },
    });
  });

  it.each([GameListScope.OPEN, GameListScope.MINE, GameListScope.ALL])(
    'accepts scope %s',
    (scope) => {
      const result = parse_with_schema(schema, { scope });

      expect(result.ok && result.data.scope).toBe(scope);
    },
  );

  it('treats blank filter values as not supplied', () => {
    const result = parse_with_schema(schema, {
      search: '   ',
      connection_id: '',
      organization_id: ' ',
      league: '',
      level: '  ',
      age_group: '',
      location_group: '',
    });

    expect(result.ok && result.data.filters).toMatchObject({
      search: null,
      connection_id: null,
      organization_id: null,
      league: null,
      level: null,
      age_group: null,
      location_group: null,
    });
  });

  it('accepts a window of exactly 400 days and a zero-length window', () => {
    expect(parse_with_schema(schema, { from: '0', to: String(400 * DAY) }).ok).toBe(true);
    expect(parse_with_schema(schema, { from: '5', to: '5' }).ok).toBe(true);
  });

  it('accepts a search of exactly 100 characters', () => {
    expect(
      parse_with_schema(schema, { search: 'a'.repeat(GAMES_LIST_LIMITS.MAX_SEARCH_LENGTH) }).ok,
    ).toBe(true);
  });

  describe('rejections', () => {
    /**
     * Parses and returns the violations.
     * @param input Query-string values.
     * @returns The violations, or an empty list when the input was accepted.
     */
    function violations_of(input: unknown) {
      const result = parse_with_schema(schema, input);
      return result.ok ? [] : result.violations;
    }

    it('rejects an unknown scope', () => {
      expect(violations_of({ scope: 'EVERYTHING' })).toEqual([
        { path: 'scope', message: 'Must be OPEN, MINE or ALL' },
      ]);
    });

    it.each([['abc'], [''], ['-5'], ['1.5'], ['1e3'], ['0x10'], [' 5'], ['1234567890123456']])(
      'rejects the instant %j',
      (value) => {
        expect(violations_of({ from: value })).toEqual([
          { path: 'from', message: 'Must be a whole number of UTC milliseconds' },
        ]);
        expect(violations_of({ to: value }).map((violation) => violation.path)).toEqual(['to']);
      },
    );

    it('rejects a window that ends before it starts', () => {
      expect(violations_of({ from: '2000', to: '1999' })).toEqual([
        { path: 'to', message: 'Must not be before from' },
      ]);
    });

    it('rejects a window longer than 400 days', () => {
      expect(violations_of({ from: '0', to: String(400 * DAY + 1) })).toEqual([
        { path: 'to', message: 'The window may span at most 400 days' },
      ]);
    });

    it('applies the window rule to defaults too', () => {
      expect(violations_of({ from: String(NOW - 500 * DAY) }).map((v) => v.path)).toEqual(['to']);
      expect(violations_of({ to: String(NOW - 10 * DAY) }).map((v) => v.path)).toEqual(['to']);
    });

    it('rejects a search over 100 characters', () => {
      expect(violations_of({ search: 'a'.repeat(101) })).toEqual([
        { path: 'search', message: 'Must be at most 100 characters' },
      ]);
    });

    it('rejects ids with unexpected characters or length', () => {
      expect(violations_of({ connection_id: "c1' OR 1=1" }).map((v) => v.path)).toEqual([
        'connection_id',
      ]);
      expect(violations_of({ organization_id: 'a'.repeat(65) }).map((v) => v.path)).toEqual([
        'organization_id',
      ]);
    });

    it.each(['TRUE', '1', 'yes', ''])('rejects the flag value %j', (value) => {
      expect(violations_of({ only_with_open_slots: value })).toEqual([
        { path: 'only_with_open_slots', message: 'Must be true or false' },
      ]);
      expect(violations_of({ include_cancelled: value }).map((v) => v.path)).toEqual([
        'include_cancelled',
      ]);
    });

    it('rejects unknown parameters', () => {
      expect(violations_of({ tenant_id: 'other' })).toHaveLength(1);
    });

    it('rejects repeated or nested parameters', () => {
      expect(violations_of({ search: ['a', 'b'] }).map((v) => v.path)).toEqual(['search']);
      expect(violations_of({ league: { $ne: 'x' } }).map((v) => v.path)).toEqual(['league']);
    });

    it('reports every problem at once', () => {
      expect(
        violations_of({ scope: 'X', from: 'a', only_with_open_slots: 'maybe' }).map((v) => v.path),
      ).toEqual(['scope', 'from', 'only_with_open_slots']);
    });
  });
});
