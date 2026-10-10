import { Page, Route, expect as base_expect, test } from '@playwright/test';
import { read_seed_users } from '../scripts/seed_auth_user.cjs';
import {
  agenda_group,
  agenda_header,
  agenda_labels,
  assert_agenda_layout_is_sound,
  measure_header_offsets,
  scroll_to_last_row,
} from './helpers/agenda_list';
import { type_in_one_burst } from './helpers/type_in_one_burst';

const seed_user = read_seed_users()[0];

/** The dev server compiles lazily and Firebase Auth loads on demand, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** Times and dates are asserted in UTC and English, whatever the machine running the suite uses. */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

const REFEREE_PERMISSIONS = ['games.read', 'games.respond', 'reports.write'];

const HOUR_MS = 3_600_000;
const SATURDAY = Date.UTC(2026, 9, 10);
const SUNDAY = Date.UTC(2026, 9, 11);

interface IMockGame {
  game_id: string;
  connection_id: string;
  organization_id: string;
  organization_name: string;
  venue_name: string | null;
  location_group: string;
  local_date: number | null;
  time_zone: string | null;
  start_at: number;
  end_at: number | null;
  status: 'SCHEDULED' | 'CANCELLED';
  level: string | null;
  league: string | null;
  age_group: string | null;
  game_type: string | null;
  gender: string | null;
  home_team: string | null;
  away_team: string | null;
  is_open: boolean;
  is_mine: boolean;
  open_slot_count: number;
  total_slot_count: number;
  slots: { position: string; state: 'OPEN' | 'FILLED' | 'MINE' }[];
  my_position: string | null;
  fee_minor: null;
  currency: null;
}

const UNKNOWN_LOCATION = 'Location to be announced';

function make_game(game_id: string, overrides: Partial<IMockGame>): IMockGame {
  const local_date = overrides.local_date === undefined ? SATURDAY : overrides.local_date;
  return {
    game_id,
    connection_id: 'conn-1',
    organization_id: 'org-1',
    organization_name: 'Metro Youth Soccer',
    venue_name: 'Field 3',
    location_group: 'Riverside Park',
    local_date,
    time_zone: 'America/Chicago',
    start_at: (local_date ?? SATURDAY) + 14 * HOUR_MS,
    end_at: null,
    status: 'SCHEDULED',
    level: 'Premier',
    league: 'Fall League',
    age_group: 'U12',
    game_type: 'Regular season',
    gender: 'Boys',
    home_team: 'Lions',
    away_team: 'Tigers',
    is_open: true,
    is_mine: false,
    open_slot_count: 1,
    total_slot_count: 2,
    slots: [
      { position: 'Asst. Referee', state: 'FILLED' },
      { position: 'Referee', state: 'OPEN' },
    ],
    my_position: null,
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}

/** Seven games over three locations; the placeholder location has one game without a date or teams. */
function make_dataset(): IMockGame[] {
  return [
    make_game('g1', { start_at: SATURDAY + 14 * HOUR_MS }),
    make_game('g2', {
      start_at: SATURDAY + 16 * HOUR_MS,
      home_team: 'Hawks',
      away_team: 'Owls',
      is_open: false,
      is_mine: true,
      open_slot_count: 0,
      total_slot_count: 3,
      slots: [
        { position: 'Center', state: 'MINE' },
        { position: 'Asst. Referee', state: 'FILLED' },
        { position: 'Asst. Referee', state: 'FILLED' },
      ],
      my_position: 'Center',
      age_group: 'U14',
      level: 'Select',
    }),
    make_game('g3', {
      local_date: SUNDAY,
      start_at: SUNDAY + 13 * HOUR_MS,
      status: 'CANCELLED',
      is_open: false,
      open_slot_count: 0,
      home_team: 'Rams',
      away_team: 'Bulls',
    }),
    make_game('g4', {
      location_group: 'Lakeside Fields',
      start_at: SATURDAY + 9 * HOUR_MS,
      home_team: 'Wolves',
      away_team: 'Bears',
      league: 'Spring League',
      level: 'Recreational',
      age_group: 'U10',
      open_slot_count: 2,
      slots: [
        { position: 'Referee', state: 'OPEN' },
        { position: 'Assistant referee 1', state: 'OPEN' },
      ],
      venue_name: 'Pitch 1',
    }),
    make_game('g5', {
      location_group: 'Lakeside Fields',
      local_date: SUNDAY,
      start_at: SUNDAY + 10 * HOUR_MS,
      home_team: 'Eagles',
      away_team: 'Falcons',
      league: 'Spring League',
      level: 'Recreational',
      age_group: 'U10',
      is_open: false,
      is_mine: true,
      open_slot_count: 0,
      slots: [
        { position: 'Assistant referee 1', state: 'MINE' },
        { position: 'Referee', state: 'FILLED' },
      ],
      my_position: 'Assistant referee 1',
    }),
    make_game('g6', {
      location_group: UNKNOWN_LOCATION,
      local_date: null,
      start_at: SUNDAY + 20 * HOUR_MS,
      home_team: null,
      away_team: null,
      venue_name: null,
      level: null,
      league: null,
      age_group: null,
      game_type: null,
      gender: null,
    }),
  ];
}

interface IMockOptions {
  permissions?: string[];
  games?: IMockGame[];
  truncated?: boolean;
  /** How many `GET /api/games` calls fail with a 500 before the mock starts answering. */
  failures?: number;
  /** Answers every `GET /api/games` with a 400 VALIDATION_ERROR. */
  reject_filters?: boolean;
}

/** The in-test backend: what it was asked. */
interface IMockApi {
  game_requests: URLSearchParams[];
  me_requests: number;
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function matches(game: IMockGame, params: URLSearchParams): boolean {
  const scope = params.get('scope') ?? 'OPEN';
  if (scope === 'OPEN' && !game.is_open) return false;
  if (scope === 'MINE' && !game.is_mine) return false;
  if (game.status === 'CANCELLED' && params.get('include_cancelled') !== 'true') return false;
  if (params.get('only_with_open_slots') === 'true' && game.open_slot_count <= 0) return false;
  const exact = (name: string, value: string | null) =>
    !params.get(name) || value?.toLowerCase() === params.get(name)?.toLowerCase();
  if (!exact('league', game.league) || !exact('level', game.level)) return false;
  if (!exact('age_group', game.age_group) || !exact('location_group', game.location_group)) {
    return false;
  }
  const search = (params.get('search') ?? '').trim().toLowerCase();
  if (!search) return true;
  return [game.home_team, game.away_team, game.league, game.level, game.location_group].some(
    (field) => field?.toLowerCase().includes(search),
  );
}

/** Groups like the backend: locations A to Z (unknown last), dates ascending (unknown last), games by start. */
function group_games(games: IMockGame[], truncated: boolean) {
  const locations = [...new Set(games.map((game) => game.location_group))].sort((a, b) =>
    a === UNKNOWN_LOCATION ? 1 : b === UNKNOWN_LOCATION ? -1 : a.localeCompare(b),
  );
  return {
    locations: locations.map((location_label) => {
      const in_location = games.filter((game) => game.location_group === location_label);
      const dates = [...new Set(in_location.map((game) => game.local_date))].sort((a, b) =>
        a === null ? 1 : b === null ? -1 : a - b,
      );
      return {
        location_label,
        dates: dates.map((local_date) => ({
          local_date,
          games: in_location
            .filter((game) => game.local_date === local_date)
            .sort((a, b) => a.start_at - b.start_at),
        })),
      };
    }),
    total: games.length,
    truncated,
  };
}

/**
 * Mocks the backend (it is not running in E2E) for this page. Only same-origin
 * `/api/**` calls are intercepted, so the Auth emulator is untouched.
 * @param page Page under test.
 * @param options Permissions, the games the backend holds and failures to simulate.
 * @returns A log of what the page asked for.
 */
async function install_api_mock(page: Page, options: IMockOptions = {}): Promise<IMockApi> {
  const api: IMockApi = { game_requests: [], me_requests: 0 };
  const dataset = options.games ?? make_dataset();
  const permissions = options.permissions ?? REFEREE_PERMISSIONS;
  let failures_left = options.failures ?? 0;

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/me') {
        api.me_requests++;
        return json(route, 200, {
          data: {
            uid: 'u1',
            email: seed_user.email,
            tenant_id: 'tenant-1',
            role: 'REFEREE',
            actual_tenant_id: 'tenant-1',
            actual_role: 'REFEREE',
            permissions,
          },
        });
      }
      if (url.pathname === '/api/games') {
        api.game_requests.push(url.searchParams);
        if (options.reject_filters) {
          return json(route, 400, {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query',
            violations: [{ path: 'search', message: 'Too long' }],
          });
        }
        if (failures_left > 0) {
          failures_left--;
          return json(route, 500, { code: 'INTERNAL', message: 'Boom', violations: [] });
        }
        const found = dataset.filter((game) => matches(game, url.searchParams));
        return json(route, 200, { data: group_games(found, options.truncated ?? false) });
      }
      return json(route, 404, { code: 'NOT_FOUND', message: 'Not found', violations: [] });
    },
  );
  return api;
}

/** Signs in with the seeded user and lands on the Games page. */
async function open_games(page: Page): Promise<void> {
  // Firebase Auth loads lazily and the route guard waits for it; a cold or busy machine can leave the first load hanging, so reload.
  await expect(async () => {
    await page.goto('/games');
    await expect(page).toHaveURL(/\/login\?return_url=%2Fgames$/, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  // The form can still be initialising when the first keystrokes land and wipe them, leaving the button disabled, so retry the whole sign-in.
  let attempts = 0;
  await expect(async () => {
    if (!/\/games$/.test(page.url())) {
      // A form that stayed disabled after the first attempt is stuck; start it afresh.
      if (attempts++ > 0) await page.reload();
      await page.getByTestId('credentials-form-email').fill(seed_user.email);
      await page.getByTestId('credentials-form-password').fill(seed_user.password);
      await page.getByTestId('credentials-form-submit').click({ timeout: 5000 });
    }
    await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  // The shell reuses one scrolling container across routes, so on a short (landscape phone) screen the sign-in
  // form's scroll offset carries over to the new page. Start from the top, as a user opening the page would.
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll('*'))) element.scrollTop = 0;
  });
}

/** Lets animations (panel expansion, select overlays) finish: the layout checks measure scaled boxes while one runs. */
async function wait_for_animations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

async function assert_settled_layout_is_sound(page: Page): Promise<void> {
  await wait_for_animations(page);
  // Controls scrolled behind the app header are clipped, not colliding; measure from the top, as the user first sees the page.
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll('*'))) element.scrollTop = 0;
  });
  await assert_agenda_layout_is_sound(page);
}

/** On a phone the facets and toggles sit in an expansion panel; open it. On wider screens they are always shown. */
async function open_filters(page: Page): Promise<void> {
  await expect(page.getByTestId('games-filter-bar')).toBeVisible();
  const header = page.getByTestId('games-filters-panel').locator('.mat-expansion-panel-header');
  if ((await header.count()) > 0 && (await header.getAttribute('aria-expanded')) === 'false') {
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  }
  await wait_for_animations(page);
}

/** Switches scope with the tab strip, or with the select a phone gets. */
async function choose_scope(page: Page, label: string): Promise<void> {
  const scope = page.getByTestId('games-scope');
  const tab = scope.getByRole('tab', { name: label });
  await expect(tab.or(scope.getByRole('combobox'))).toBeVisible();
  if (await tab.isVisible()) {
    await tab.click();
  } else {
    await page.getByTestId('games-scope').getByRole('combobox').click();
    await page.getByRole('option', { name: label }).click();
    // The closed panel and its backdrop stay in the DOM, still clickable, until the exit animation ends. A second
    // scope change would otherwise click that stale backdrop (closing the reopened panel) instead of the select.
    await expect(page.getByRole('listbox')).toHaveCount(0);
  }
}

async function choose_facet(page: Page, testid: string, option: string): Promise<void> {
  await open_filters(page);
  await page.getByTestId(testid).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  // Let the select's panel finish closing before anything else is clicked.
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

function last_request(api: IMockApi): URLSearchParams {
  return api.game_requests[api.game_requests.length - 1];
}

test.describe('games page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('groups games by location, then date, then time', async ({ page }) => {
    await install_api_mock(page);
    await open_games(page);

    await expect(page.getByTestId('games-count')).toHaveText('3 games');
    const list = page.getByTestId('games-list');
    await expect(agenda_labels(list, 0)).toHaveText([
      'Lakeside Fields',
      'Riverside Park',
      UNKNOWN_LOCATION,
    ]);

    const riverside = agenda_group(list, 'Riverside Park');
    await expect(agenda_header(riverside)).toContainText('1 game');
    await expect(agenda_labels(riverside, 1)).toHaveText(['Saturday, Oct 10']);
    await expect(riverside.getByTestId('grouped-agenda-row')).toHaveCount(1);
    // 14:00 UTC is 9:00 AM on the venue's Chicago clock, whatever zone the viewer is in.
    await expect(page.getByTestId('game-time-g1')).toHaveText('9:00 AM CDT');
    await expect(page.getByTestId('game-title-g1')).toHaveText('Lions vs Tigers');
    await expect(page.getByTestId('game-slots-g1')).toContainText('1 open of 2 slots');
    // The grouped list owns the time column; the row does not draw a second time.
    await expect(riverside.locator('.agenda_row_time').getByTestId('game-time-g1')).toHaveCount(1);
    await expect(page.getByTestId('game-time-g1')).toHaveCount(1);

    // Unknown date and no teams yet sit last and say so.
    const unknown = agenda_group(list, UNKNOWN_LOCATION);
    await expect(agenda_labels(unknown, 1)).toHaveText(['Date to be announced']);
    await expect(page.getByTestId('game-title-g6')).toHaveText('Teams to be announced');
    // The venue is named by its group header, so the row does not repeat the location.
    await expect(page.getByTestId('game-location-g1')).toHaveCount(0);

    // Open scope hides assigned games and cancelled ones; no fee appears anywhere.
    await expect(page.getByTestId('game-row-g2')).toHaveCount(0);
    await expect(page.getByTestId('games-list')).not.toContainText(/\$|fee/i);

    await assert_settled_layout_is_sound(page);
  });

  test('sends the search once after typing stops, and narrows the list', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_games(page);
    await expect(page.getByTestId('games-count')).toHaveText('3 games');
    const before = api.game_requests.length;

    await type_in_one_burst(page.getByTestId('games-filter-bar').getByRole('textbox'), 'lions');

    await expect(page.getByTestId('games-count')).toHaveText('1 game');
    await expect(page.getByTestId('game-row-g1')).toBeVisible();
    const searched = api.game_requests.slice(before).map((params) => params.get('search'));
    expect(searched).toEqual(['lions']);
  });

  test('names every position of a game and whether it is open, filled or yours', async ({
    page,
  }) => {
    await install_api_mock(page);
    await open_games(page);

    const lakeside_open = page.getByTestId('game-positions-g4');
    await expect(lakeside_open).toBeVisible();
    await expect(page.getByTestId('game-position-g4-0')).toContainText('Referee: Open');
    await expect(page.getByTestId('game-position-g4-1')).toContainText('Assistant referee 1: Open');
    await expect(page.getByTestId('game-slots-g4')).toContainText('2 open of 2 slots');

    await expect(page.getByTestId('game-position-g1-0')).toContainText('Referee: Open');
    await expect(page.getByTestId('game-position-g1-1')).toContainText('Asst. Referee: Filled');

    await assert_settled_layout_is_sound(page);
  });

  test('turns off the venue grouping to list every game by date and time, and remembers it', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_games(page);
    await expect(page.getByTestId('games-count')).toHaveText('3 games');
    const list = page.getByTestId('games-list');
    await expect(agenda_labels(list, 0)).toHaveText([
      'Lakeside Fields',
      'Riverside Park',
      UNKNOWN_LOCATION,
    ]);
    const switch_control = page.getByTestId('games-toggle-group-by-venue').getByRole('switch');
    await expect(switch_control).toBeChecked();

    await switch_control.click();

    // One list by date, no venue headings; the Lakeside 9 AM game now comes before the Riverside 2 PM game.
    await expect(agenda_labels(list, 0)).toHaveText(['Saturday, Oct 10', 'Date to be announced']);
    await expect(agenda_labels(list, 1)).toHaveCount(0);
    await expect(list.getByRole('heading', { name: /Lakeside Fields/ })).toHaveCount(0);
    await expect(page.getByTestId('games-count')).toHaveText('3 games');
    await expect(page.locator('[data-testid^="game-row-"]')).toHaveText([
      /Wolves vs Bears/,
      /Lions vs Tigers/,
      /Teams to be announced/,
    ]);
    // With no heading saying where, each row names its location.
    await expect(page.getByTestId('game-location-g4')).toContainText('Lakeside Fields');
    await expect(page.getByTestId('game-location-g1')).toContainText('Riverside Park');
    // It only rearranges what is loaded: no new request.
    expect(api.game_requests).toHaveLength(1);
    await assert_settled_layout_is_sound(page);

    // The choice is remembered across a reload.
    await page.reload();
    await expect(agenda_labels(list, 0)).toHaveText(['Saturday, Oct 10', 'Date to be announced']);
    await expect(switch_control).not.toBeChecked();

    // Turning it back on restores the venue groups.
    await switch_control.click();
    await expect(agenda_labels(list, 0)).toHaveText([
      'Lakeside Fields',
      'Riverside Park',
      UNKNOWN_LOCATION,
    ]);
  });

  test('keeps the same date from several venues in one group when the venue grouping is off', async ({
    page,
  }) => {
    await install_api_mock(page);
    await open_games(page);
    await choose_scope(page, 'All games');
    await expect(page.getByTestId('games-count')).toHaveText('5 games');

    await page.getByTestId('games-toggle-group-by-venue').getByRole('switch').click();

    const list = page.getByTestId('games-list');
    await expect(agenda_labels(list, 0)).toHaveText([
      'Saturday, Oct 10',
      'Sunday, Oct 11',
      'Date to be announced',
    ]);
    // By date, then by start time, whichever venue a game is at: Saturday 9 AM, 2 PM, 4 PM, then Sunday 10 AM.
    await expect(page.locator('[data-testid^="game-title-"]')).toHaveText([
      'Wolves vs Bears',
      'Lions vs Tigers',
      'Hawks vs Owls',
      'Eagles vs Falcons',
      'Teams to be announced',
    ]);
    await assert_settled_layout_is_sound(page);
  });

  test('orders rows by location, then date, then start time', async ({ page }) => {
    await install_api_mock(page);
    await open_games(page);
    await choose_scope(page, 'All games');
    await expect(page.getByTestId('games-count')).toHaveText('5 games');

    const list = page.getByTestId('games-list');
    await expect(agenda_labels(list, 0)).toHaveText([
      'Lakeside Fields',
      'Riverside Park',
      UNKNOWN_LOCATION,
    ]);
    await expect(agenda_labels(agenda_group(list, 'Lakeside Fields'), 1)).toHaveText([
      'Saturday, Oct 10',
      'Sunday, Oct 11',
    ]);
    await expect(agenda_labels(agenda_group(list, 'Riverside Park'), 1)).toHaveText([
      'Saturday, Oct 10',
    ]);
    await expect(page.locator('[data-testid^="game-title-"]')).toHaveText([
      'Wolves vs Bears',
      'Eagles vs Falcons',
      'Lions vs Tigers',
      'Hawks vs Owls',
      'Teams to be announced',
    ]);
    // Every group says how many games it holds.
    await expect(agenda_header(agenda_group(list, 'Lakeside Fields'))).toContainText('2 games');
    await expect(agenda_header(agenda_group(list, 'Riverside Park'))).toContainText('2 games');
    await assert_settled_layout_is_sound(page);
  });

  test('collapses a group from its header and opens it again', async ({ page }) => {
    await install_api_mock(page);
    await open_games(page);
    await expect(page.getByTestId('games-count')).toHaveText('3 games');

    const list = page.getByTestId('games-list');
    const header = agenda_header(agenda_group(list, 'Riverside Park'));
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('game-row-g1')).toBeVisible();

    await header.click();

    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('game-row-g1')).toHaveCount(0);
    // The group still says how many games it holds, and the others are untouched.
    await expect(header).toContainText('1 game');
    await expect(page.getByTestId('game-row-g4')).toBeVisible();
    await expect(page.getByTestId('games-count')).toHaveText('3 games');
    await assert_settled_layout_is_sound(page);

    await header.click();

    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('game-row-g1')).toBeVisible();
  });

  test('moves between the group headers with the keyboard', async ({ page }) => {
    await install_api_mock(page);
    await open_games(page);
    await expect(page.getByTestId('games-count')).toHaveText('3 games');

    const headers = page.getByTestId('games-list').getByTestId('grouped-agenda-header');
    await expect(headers).toHaveCount(6);
    await headers.first().focus();

    await page.keyboard.press('ArrowDown');
    await expect(headers.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(headers.last()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(headers.nth(4)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(headers.first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'false');
  });

  test('keeps the location and date headers pinned while the games scroll past', async ({
    page,
  }) => {
    const many = Array.from({ length: 24 }, (_, index) =>
      make_game(`m${index}`, {
        start_at: SATURDAY + 6 * HOUR_MS + index * 10 * 60_000,
        home_team: `Home ${index}`,
        away_team: `Away ${index}`,
      }),
    );
    await install_api_mock(page, { games: many });
    await open_games(page);
    await expect(page.getByTestId('games-count')).toHaveText('24 games');

    const list = page.getByTestId('games-list');
    const location = agenda_group(list, 'Riverside Park');
    const location_header = agenda_header(location);
    const date_header = agenda_header(location.locator('section[data-agenda-level="1"]'));
    await scroll_to_last_row(list.getByTestId('grouped-agenda-row'));

    const [location_top, date_top] = await measure_header_offsets(page, [
      location_header,
      date_header,
    ]);
    const location_height = await location_header.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    // Both headers stay at the top of the scrolling area, the date header directly under the location header.
    expect(Math.abs(location_top)).toBeLessThanOrEqual(1);
    expect(Math.abs(date_top - location_height)).toBeLessThanOrEqual(1);
    await expect(location_header).toBeInViewport();
    await expect(date_header).toBeInViewport();
    // Pinned headers sit over the rows that scroll beneath them without overlapping any control.
    await wait_for_animations(page);
    await assert_agenda_layout_is_sound(page);
  });

  test('switches scope between open, my and all games', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_games(page);
    await expect(page.getByTestId('games-count')).toHaveText('3 games');
    expect(api.game_requests[0].get('scope')).toBe('OPEN');

    await choose_scope(page, 'My games');
    await expect(page.getByTestId('games-count')).toHaveText('2 games');
    await expect(page.getByTestId('game-row-g2')).toBeVisible();
    await expect(page.getByTestId('game-mine-g2')).toContainText('Mine: Center');
    await expect(page.getByTestId('game-row-g1')).toHaveCount(0);
    expect(api.game_requests.some((params) => params.get('scope') === 'MINE')).toBe(true);

    await choose_scope(page, 'All games');
    await expect(page.getByTestId('games-count')).toHaveText('5 games');
    expect(api.game_requests.some((params) => params.get('scope') === 'ALL')).toBe(true);
    await assert_settled_layout_is_sound(page);
  });

  test('filters by league, keeping the other leagues on offer, and with the toggles', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_games(page);
    await expect(page.getByTestId('games-count')).toHaveText('3 games');

    await choose_facet(page, 'games-filter-league', 'Spring League');
    await expect(page.getByTestId('games-count')).toHaveText('1 game');
    expect(api.game_requests.some((params) => params.get('league') === 'Spring League')).toBe(true);
    expect(
      api.game_requests.some(
        (params) => params.get('league') === null && params.get('scope') === 'OPEN',
      ),
    ).toBe(true);
    // The facet-free request keeps "Fall League" on offer even though it is not selected.
    await page.getByTestId('games-filter-league').click();
    await expect(page.getByRole('option', { name: 'Fall League', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await open_filters(page);
    await page.getByTestId('games-toggle-cancelled').click();
    await expect
      .poll(() => api.game_requests.some((params) => params.get('include_cancelled') === 'true'))
      .toBe(true);
    await page.getByTestId('games-toggle-open-slots').click();
    await expect
      .poll(() =>
        api.game_requests.some(
          (params) =>
            params.get('include_cancelled') === 'true' &&
            params.get('only_with_open_slots') === 'true',
        ),
      )
      .toBe(true);
    await assert_settled_layout_is_sound(page);
  });

  test('clears search, facets and toggles with Clear filters, keeping the scope', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_games(page);
    await choose_scope(page, 'All games');
    await expect(page.getByTestId('games-count')).toHaveText('5 games');

    await page.getByTestId('games-filter-bar').getByRole('textbox').fill('hawks');
    await choose_facet(page, 'games-filter-league', 'Fall League');
    await expect(page.getByTestId('games-count')).toHaveText('1 game');

    await page.getByTestId('games-clear-filters').click();

    await expect(page.getByTestId('games-count')).toHaveText('5 games');
    await expect(page.getByTestId('games-filter-bar').getByRole('textbox')).toHaveValue('');
    const request = last_request(api);
    expect(request.get('scope')).toBe('ALL');
    expect(request.get('search')).toBeNull();
    expect(request.get('league')).toBeNull();
  });

  test('says when no game matches, and offers to clear the filters', async ({ page }) => {
    await install_api_mock(page);
    await open_games(page);

    await page.getByTestId('games-filter-bar').getByRole('textbox').fill('zebras');

    await expect(page.getByText('No games match your filters')).toBeVisible();
    await expect(page.getByTestId('games-count')).toHaveText('0 games');
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('games-empty-clear').click();

    await expect(page.getByTestId('games-count')).toHaveText('3 games');
  });

  test('says there are no games yet, and links to Connections', async ({ page }) => {
    await install_api_mock(page, { games: [] });
    await open_games(page);

    await expect(page.getByText('No games yet')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('games-empty-connections').click();

    await expect(page).toHaveURL(/\/connections$/);
  });

  test('tells the user when the list was cut off', async ({ page }) => {
    await install_api_mock(page, { truncated: true });
    await open_games(page);

    await expect(page.getByTestId('games-truncated')).toContainText(
      'Showing the first 3 games — narrow your filters to see the rest.',
    );
    await assert_settled_layout_is_sound(page);
  });

  test('shows an error with a retry, then the games', async ({ page }) => {
    const api = await install_api_mock(page, { failures: 1 });
    await open_games(page);

    await expect(page.getByText('Games could not be loaded')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('games-retry').click();

    await expect(page.getByTestId('games-count')).toHaveText('3 games');
    expect(api.game_requests).toHaveLength(2);
  });

  test('explains rejected filters and clears them', async ({ page }) => {
    await install_api_mock(page, { reject_filters: true });
    await open_games(page);

    await expect(page.getByText('Those filters cannot be used')).toBeVisible();
    await expect(page.getByTestId('games-error-clear')).toBeVisible();
  });

  test('shows a clear no-access state, and asks for no games, without games.read', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { permissions: ['reports.write'] });
    await open_games(page);

    await expect(page.getByTestId('games-no-access')).toContainText(
      'You do not have access to games',
    );
    await expect(page.getByTestId('games-filter-bar')).toHaveCount(0);
    expect(api.game_requests).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });
});
