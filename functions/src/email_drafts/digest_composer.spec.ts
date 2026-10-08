import { describe, expect, it } from 'vitest';
import { GamesListService } from '../games/games_list.service.js';
import { InMemoryGameStore } from '../sync/stores/in_memory_game_store.js';
import { InMemoryOrganizationStore } from '../sync/stores/in_memory_organization_store.js';
import { InMemoryVenueStore } from '../sync/stores/in_memory_venue_store.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { DigestComposer } from './digest_composer.js';
import { make_contract_filters } from './stores/contracts/make_contract_draft.js';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Builds the composer over in-memory stores.
 * @returns The composer and the stores a spec seeds.
 */
function make_composer() {
  const games = new InMemoryGameStore();
  const venues = new InMemoryVenueStore({ generate_id: () => 'v1' });
  const organizations = new InMemoryOrganizationStore({ generate_id: () => 'o1' });
  const composer = new DigestComposer({
    games_service: new GamesListService({ games, venues, organizations, now: () => NOW }),
    venues,
    now: () => NOW,
  });
  return { composer, games };
}

describe('DigestComposer.load_games', () => {
  it('lists open games that have not started, soonest first in the flat list', async () => {
    const { composer, games } = make_composer();
    await games.save_games([
      make_contract_game('t1', 'later', { start_at: NOW + 3 * HOUR }),
      make_contract_game('t1', 'soon', { start_at: NOW + HOUR }),
      make_contract_game('t1', 'started', { start_at: NOW - HOUR }),
      make_contract_game('t1', 'taken', { start_at: NOW + 2 * HOUR, is_open: false }),
      make_contract_game('t1', 'cancelled', {
        start_at: NOW + 2 * HOUR,
        status: GameStatus.CANCELLED,
      }),
      make_contract_game('t2', 'other', { start_at: NOW + HOUR }),
    ]);

    const loaded = await composer.load_games('t1', make_contract_filters());

    expect(loaded.games.map((game) => game.game_id)).toEqual(['soon', 'later']);
    expect(loaded.total).toBe(2);
    expect(loaded.truncated).toBe(false);
  });

  it('applies the filters and honours the date window', async () => {
    const { composer, games } = make_composer();
    await games.save_games([
      make_contract_game('t1', 'a', { start_at: NOW + HOUR, level: 'U12' }),
      make_contract_game('t1', 'b', { start_at: NOW + 2 * HOUR, level: 'U14' }),
      make_contract_game('t1', 'c', { start_at: NOW + 5 * DAY, level: 'U12' }),
    ]);

    const by_level = await composer.load_games('t1', make_contract_filters({ level: 'u12' }));
    const by_window = await composer.load_games(
      't1',
      make_contract_filters({ date_from: NOW + DAY, date_to: NOW + 6 * DAY }),
    );
    const by_end = await composer.load_games('t1', make_contract_filters({ date_to: NOW + DAY }));

    expect(by_level.games.map((g) => g.game_id)).toEqual(['a', 'c']);
    expect(by_window.games.map((g) => g.game_id)).toEqual(['c']);
    expect(by_end.games.map((g) => g.game_id)).toEqual(['a', 'b']);
  });

  it('finds nothing, without a query, when the window ended in the past', async () => {
    const { composer, games } = make_composer();
    await games.save_games([make_contract_game('t1', 'a', { start_at: NOW + HOUR })]);

    const loaded = await composer.load_games('t1', make_contract_filters({ date_to: NOW - DAY }));

    expect(loaded).toEqual({ groups: [], games: [], total: 0, truncated: false, time_zone: null });
  });

  it('keeps the soonest 200 and says so when more match', async () => {
    const { composer, games } = make_composer();
    await games.save_games(
      Array.from({ length: 210 }, (_, i) =>
        make_contract_game('t1', `g${String(i).padStart(3, '0')}`, { start_at: NOW + HOUR + i }),
      ),
    );

    const loaded = await composer.load_games('t1', make_contract_filters());

    expect(loaded.games).toHaveLength(200);
    expect(loaded.games[0].game_id).toBe('g000');
    expect(loaded.games[199].game_id).toBe('g199');
    expect(loaded.total).toBe(210);
    expect(loaded.truncated).toBe(true);
  });

  it('groups the games by location and date as the signed-in list does', async () => {
    const { composer, games } = make_composer();
    await games.save_games([
      make_contract_game('t1', 'a', { start_at: NOW + HOUR, local_date: Date.UTC(2027, 0, 16) }),
    ]);

    const loaded = await composer.load_games('t1', make_contract_filters());

    expect(loaded.groups).toHaveLength(1);
    expect(loaded.groups[0].dates[0].games.map((g) => g.game_id)).toEqual(['a']);
  });
});

describe('DigestComposer.render', () => {
  it('renders the draft subject and intro with the per-recipient parts', async () => {
    const { composer, games } = make_composer();
    await games.save_games([
      make_contract_game('t1', 'a', {
        start_at: NOW + HOUR,
        local_date: Date.UTC(2027, 0, 16),
        home_team: 'Hawks',
        away_team: 'Eagles',
      }),
    ]);
    const loaded = await composer.load_games('t1', make_contract_filters());

    const rendered = composer.render({
      content: { subject: 'Weekend games', intro: 'Help us out.' },
      games: loaded,
      sender_name: 'Dana',
      postal_address: '1 Main St',
      recipient_greeting: 'Hi Sam,',
      quick_link_url: 'https://app.example.test/q/abc',
      unsubscribe_url: 'https://app.example.test/unsubscribe/xyz',
    });

    expect(rendered.subject).toBe('Weekend games');
    expect(rendered.html).toContain('Help us out.');
    expect(rendered.html).toContain('Hi Sam,');
    expect(rendered.html).toContain('Hawks vs Eagles');
    expect(rendered.html).toContain('Sent by Dana');
    expect(rendered.html).toContain('1 Main St');
    expect(rendered.html).toContain('href="https://app.example.test/q/abc"');
    expect(rendered.html).toContain('href="https://app.example.test/unsubscribe/xyz"');
  });

  it('falls back to the standard sender name and intro', async () => {
    const { composer } = make_composer();
    const loaded = await composer.load_games('t1', make_contract_filters());

    const rendered = composer.render({
      content: { subject: 'S', intro: null },
      games: loaded,
      sender_name: null,
      postal_address: null,
      recipient_greeting: null,
      quick_link_url: null,
      unsubscribe_url: 'https://app.example.test/unsubscribe/xyz',
    });

    expect(rendered.html).toContain('Sent by Your referee scheduler');
    expect(rendered.html).toContain('These games still need officials.');
    expect(rendered.html).not.toContain('View the live list');
  });
});
