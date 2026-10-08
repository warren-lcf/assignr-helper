import { Page, Route, expect as base_expect, test } from '@playwright/test';
import { assert_layout_is_sound } from './helpers/layout_checks';
import { SEED_USER_EMAIL, sign_in_and_open } from './helpers/sign_in';

/** The dev server compiles lazily, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** Times and dates are asserted in UTC and English, whatever the machine running the suite uses. */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

/** The secret that opens the mocked link. Obviously fake. */
const TOKEN = 'e2e-public-token-0123456789';
const DEAD_TOKEN = 'e2e-dead-token-0123456789';

const HOUR_MS = 3_600_000;
const SATURDAY = Date.UTC(2026, 9, 10);
const SUNDAY = Date.UTC(2026, 9, 11);
const UNKNOWN_LOCATION = 'Location to be announced';

interface IMockGame {
  game_id: string;
  start_at: number;
  local_date: number | null;
  venue_name: string | null;
  location_group: string;
  level: string | null;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  open_slot_count: number;
  slots: { position: string; is_open: boolean }[];
  fee_minor: null;
  currency: null;
}

function make_game(game_id: string, overrides: Partial<IMockGame>): IMockGame {
  return {
    game_id,
    start_at: SATURDAY + 14 * HOUR_MS,
    local_date: SATURDAY,
    venue_name: 'Field 3',
    location_group: 'Riverside Park',
    level: 'Premier',
    league: 'Fall League',
    home_team: 'Lions',
    away_team: 'Tigers',
    open_slot_count: 1,
    slots: [
      { position: 'Asst. Referee', is_open: false },
      { position: 'Referee', is_open: true },
    ],
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}

/** Five games over three locations; the placeholder location has one game without a date or teams. */
function make_dataset(): IMockGame[] {
  return [
    make_game('g1', {}),
    make_game('g2', {
      start_at: SATURDAY + 16 * HOUR_MS,
      home_team: 'Hawks',
      away_team: 'Owls',
      level: 'Select',
      open_slot_count: 3,
      slots: [
        { position: 'Referee', is_open: true },
        { position: 'Asst. Referee', is_open: true },
        { position: 'Mentor', is_open: true },
      ],
    }),
    make_game('g3', {
      local_date: SUNDAY,
      start_at: SUNDAY + 13 * HOUR_MS,
      home_team: 'Rams',
      away_team: 'Bulls',
      open_slot_count: 0,
      slots: [
        { position: 'Referee', is_open: false },
        { position: 'Asst. Referee', is_open: false },
      ],
    }),
    make_game('g4', {
      location_group: 'Lakeside Fields',
      start_at: SATURDAY + 9 * HOUR_MS,
      home_team: 'Wolves',
      away_team: 'Bears',
      league: 'Spring League',
      level: 'Recreational',
      open_slot_count: 2,
      slots: [
        { position: 'Referee', is_open: true },
        { position: 'Assistant referee 1', is_open: true },
      ],
      venue_name: 'Pitch 1',
    }),
    make_game('g5', {
      location_group: UNKNOWN_LOCATION,
      local_date: null,
      start_at: SUNDAY + 20 * HOUR_MS,
      home_team: null,
      away_team: null,
      venue_name: null,
      level: null,
      league: null,
    }),
  ];
}

interface IMockOptions {
  games?: IMockGame[];
  /** What the next calls do, in order: a failure, or null for a normal answer. After the list, calls answer normally. */
  failures?: (404 | 429 | 500 | 'abort' | null)[];
}

/** The in-test backend: what it was asked, and with which headers. */
interface IMockApi {
  requests: { token: string; params: URLSearchParams; headers: Record<string, string> }[];
  all_api_headers: { path: string; headers: Record<string, string> }[];
}

function json(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
  return route.fulfill({
    status,
    headers: { 'cache-control': 'no-store', ...headers },
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function matches(game: IMockGame, params: URLSearchParams): boolean {
  const exact = (name: string, value: string | null) =>
    !params.get(name) || value?.toLowerCase() === params.get(name)?.toLowerCase();
  if (!exact('level', game.level) || !exact('league', game.league)) return false;
  if (!exact('location_group', game.location_group)) return false;
  const search = (params.get('search') ?? '').trim().toLowerCase();
  if (!search) return true;
  return [
    game.home_team,
    game.away_team,
    game.league,
    game.level,
    game.venue_name,
    game.location_group,
  ].some((field) => field?.toLowerCase().includes(search));
}

function sorted_distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
}

/** Groups like the backend: locations A to Z (unknown last), dates ascending (unknown last), games by start. */
function group_games(games: IMockGame[]) {
  const locations = [...new Set(games.map((game) => game.location_group))].sort((a, b) =>
    a === UNKNOWN_LOCATION ? 1 : b === UNKNOWN_LOCATION ? -1 : a.localeCompare(b),
  );
  return locations.map((location_label) => {
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
  });
}

/**
 * Mocks the backend (it is not running in E2E) for the public endpoint. Only
 * same-origin `/api/**` calls are intercepted, so the Auth emulator is untouched.
 * @param page Page under test.
 * @param options The games the backend holds and failures to simulate.
 * @returns A log of what the page asked for, and every API request header set.
 */
async function install_api_mock(page: Page, options: IMockOptions = {}): Promise<IMockApi> {
  const api: IMockApi = { requests: [], all_api_headers: [] };
  const dataset = options.games ?? make_dataset();
  const failures = [...(options.failures ?? [])];
  let served = 0;

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      api.all_api_headers.push({ path: url.pathname, headers: request.headers() });
      if (url.pathname === '/api/me') {
        return json(route, 200, {
          data: {
            uid: 'u1',
            email: SEED_USER_EMAIL,
            tenant_id: 'tenant-1',
            role: 'REFEREE',
            actual_tenant_id: 'tenant-1',
            actual_role: 'REFEREE',
            permissions: ['games.read'],
          },
        });
      }
      if (url.pathname === '/api/games') {
        return json(route, 200, {
          data: { locations: [], total: 0, truncated: false },
        });
      }
      const match = /^\/api\/public\/q\/([^/]+)\/games$/.exec(url.pathname);
      if (!match) {
        return json(route, 404, { code: 'NOT_FOUND', message: 'Not found' });
      }
      const token = decodeURIComponent(match[1]);
      api.requests.push({ token, params: url.searchParams, headers: request.headers() });
      // Unknown, expired, revoked and malformed tokens all look the same, and carry no violations.
      if (token !== TOKEN) {
        return json(route, 404, { code: 'NOT_FOUND', message: 'Not found' });
      }
      const failure = failures.shift();
      if (failure === 'abort') return route.abort('failed');
      if (failure === 404) return json(route, 404, { code: 'NOT_FOUND', message: 'Not found' });
      if (failure === 429) {
        return json(
          route,
          429,
          { code: 'RATE_LIMITED', message: 'Slow down' },
          { 'retry-after': '1' },
        );
      }
      if (failure === 500) return json(route, 500, { code: 'INTERNAL', message: 'Boom' });
      served++;
      const found = dataset.filter((game) => matches(game, url.searchParams));
      return json(route, 200, {
        data: {
          // Each answer is one minute later than the last, so a refresh is visible in the stamp.
          as_of: Date.UTC(2026, 9, 7, 15, 4 + served - 1, 0),
          total: found.length,
          locations: group_games(found),
          levels: sorted_distinct(dataset.map((game) => game.level)),
          leagues: sorted_distinct(dataset.map((game) => game.league)),
          location_groups: sorted_distinct(dataset.map((game) => game.location_group)),
        },
      });
    },
  );
  return api;
}

async function open_public(page: Page, token: string = TOKEN): Promise<void> {
  await page.goto(`/q/${token}`);
}

/** Lets animations (panel expansion, select overlays) finish: the layout checks measure scaled boxes while one runs. */
async function wait_for_animations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

async function assert_settled_layout_is_sound(page: Page): Promise<void> {
  await wait_for_animations(page);
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll('*'))) element.scrollTop = 0;
  });
  await assert_layout_is_sound(page);
}

/** On a phone the selects sit in an expansion panel; open it. On wider screens they are always shown. */
async function open_filters(page: Page): Promise<void> {
  await expect(page.getByTestId('public-filter-bar')).toBeVisible();
  const header = page.getByTestId('public-filters-panel').locator('.mat-expansion-panel-header');
  if ((await header.count()) > 0 && (await header.getAttribute('aria-expanded')) === 'false') {
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  }
  await wait_for_animations(page);
}

async function choose_facet(page: Page, testid: string, option: string): Promise<void> {
  await open_filters(page);
  await page.getByTestId(testid).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  // Let the select panel finish closing before anything else is clicked.
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

function last_request(api: IMockApi): URLSearchParams {
  return api.requests[api.requests.length - 1].params;
}

/** Pretends the tab is hidden or visible, and tells the page, as a real tab switch would. */
async function set_visibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((next) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test.describe('public quick link page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('shows the games grouped by location, then date, then time, with no app chrome', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_public(page);

    await expect(page.getByTestId('public-count')).toHaveText('5 games');
    await expect(page.getByRole('heading', { name: 'Games available' }).first()).toBeVisible();
    await expect(page).toHaveTitle('Games available');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.getByText(/^As of \d{1,2}:04\s?[AP]M$/)).toBeVisible();

    const locations = page.locator('[data-testid^="public-location-"]');
    await expect(locations).toHaveCount(3);
    await expect(locations.nth(0)).toContainText('Lakeside Fields');
    await expect(locations.nth(1)).toContainText('Riverside Park');
    await expect(locations.nth(2)).toContainText('Location to be announced');

    const riverside = page.getByTestId('public-location-1');
    await expect(riverside.getByRole('heading', { level: 3 })).toHaveText([
      'Oct 10, 2026',
      'Oct 11, 2026',
    ]);
    await expect(page.getByTestId('public-game-time-g1')).toHaveText('2:00 PM');
    await expect(page.getByTestId('public-game-title-g1')).toHaveText('Lions vs Tigers');
    await expect(page.getByTestId('public-game-spots-g1')).toContainText('1 open spot');
    await expect(page.getByTestId('public-game-spots-g2')).toContainText('3 open spots');
    await expect(page.getByTestId('public-game-spots-g3')).toContainText('No open spots');
    // Within a date the games run in start-time order.
    await expect(
      page.getByTestId('public-date-1-0').locator('[data-testid^="public-game-title-"]'),
    ).toHaveText(['Lions vs Tigers', 'Hawks vs Owls']);
    // Unknown date and no teams yet sit last and say so.
    const unknown = page.getByTestId('public-location-2');
    await expect(unknown.getByRole('heading', { level: 3 })).toHaveText(['Date to be announced']);
    await expect(page.getByTestId('public-game-title-g5')).toHaveText('Teams to be announced');

    // No fees and no organization names anywhere, and none of the signed-in chrome.
    await expect(page.getByTestId('public-list')).not.toContainText(/\$|fee|Metro|organization/i);
    await expect(page.locator('hch-sidebar, hch-app-header, hch-utility-nav-bar')).toHaveCount(0);
    await expect(page.locator('hch-login-page')).toHaveCount(0);

    // A signed-out visitor sends no Authorization header, to the API or anywhere.
    expect(api.requests).toHaveLength(1);
    for (const { headers } of api.all_api_headers) expect(headers['authorization']).toBeUndefined();

    await assert_settled_layout_is_sound(page);
  });

  test('names which positions are open and which are filled, without saying who holds them', async ({
    page,
  }) => {
    await install_api_mock(page);
    await open_public(page);

    await expect(page.getByTestId('public-game-position-g2-0')).toContainText('Referee: Open');
    await expect(page.getByTestId('public-game-position-g2-1')).toContainText(
      'Asst. Referee: Open',
    );
    await expect(page.getByTestId('public-game-position-g2-2')).toContainText('Mentor: Open');
    // One open of two: the open position is listed first, the filled one after it.
    await expect(page.getByTestId('public-game-position-g1-0')).toContainText('Referee: Open');
    await expect(page.getByTestId('public-game-position-g1-1')).toContainText(
      'Asst. Referee: Filled',
    );
    await expect(page.getByTestId('public-list')).not.toContainText(/Yours/);

    await assert_settled_layout_is_sound(page);
  });

  test('sends the search once after typing stops, and narrows the list', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_public(page);
    await expect(page.getByTestId('public-count')).toHaveText('5 games');
    const before = api.requests.length;

    await page.getByTestId('public-filter-bar').getByRole('textbox').pressSequentially('lions', {
      delay: 40,
    });

    await expect(page.getByTestId('public-count')).toHaveText('1 game');
    await expect(page.getByTestId('public-game-g1')).toBeVisible();
    expect(api.requests.slice(before).map((request) => request.params.get('search'))).toEqual([
      'lions',
    ]);
  });

  test('filters by level, league and location with facet options from the response', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_public(page);
    await expect(page.getByTestId('public-count')).toHaveText('5 games');

    await open_filters(page);
    await page.getByTestId('public-filter-level').click();
    // The options are the server lists, in the order it sorted them.
    await expect(page.getByRole('option')).toHaveText([
      'All levels',
      'Premier',
      'Recreational',
      'Select',
    ]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await choose_facet(page, 'public-filter-level', 'Select');
    await expect(page.getByTestId('public-count')).toHaveText('1 game');
    expect(last_request(api).get('level')).toBe('Select');

    // The other levels stay on offer while one is chosen.
    await page.getByTestId('public-filter-level').click();
    await expect(page.getByRole('option', { name: 'Premier', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await choose_facet(page, 'public-filter-level', 'All levels');
    await choose_facet(page, 'public-filter-league', 'Spring League');
    await expect(page.getByTestId('public-count')).toHaveText('1 game');
    expect(last_request(api).get('league')).toBe('Spring League');
    expect(last_request(api).get('level')).toBeNull();

    await choose_facet(page, 'public-filter-league', 'All leagues');
    await choose_facet(page, 'public-filter-location', 'Lakeside Fields');
    await expect(page.getByTestId('public-count')).toHaveText('1 game');
    expect(last_request(api).get('location_group')).toBe('Lakeside Fields');
    await assert_settled_layout_is_sound(page);
  });

  test('clears search and filters with Clear filters', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_public(page);
    await expect(page.getByTestId('public-count')).toHaveText('5 games');

    await page.getByTestId('public-filter-bar').getByRole('textbox').fill('hawks');
    await choose_facet(page, 'public-filter-league', 'Fall League');
    await expect(page.getByTestId('public-count')).toHaveText('1 game');

    await page.getByTestId('public-clear-filters').click();

    await expect(page.getByTestId('public-count')).toHaveText('5 games');
    await expect(page.getByTestId('public-filter-bar').getByRole('textbox')).toHaveValue('');
    expect(last_request(api).get('search')).toBeNull();
    expect(last_request(api).get('league')).toBeNull();
  });

  test('says when nothing matches, and offers to clear', async ({ page }) => {
    await install_api_mock(page);
    await open_public(page);

    await page.getByTestId('public-filter-bar').getByRole('textbox').fill('zebras');

    await expect(page.getByText('No games match your search')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('public-empty-clear').click();

    await expect(page.getByTestId('public-count')).toHaveText('5 games');
  });

  test('says there are no games right now when the link has none', async ({ page }) => {
    await install_api_mock(page, { games: [] });
    await open_public(page);

    await expect(page.getByTestId('public-empty')).toContainText('No games right now');
    await assert_settled_layout_is_sound(page);
  });

  test('refreshes on request and updates the as-of time', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_public(page);
    await expect(page.getByText(/^As of \d{1,2}:04\s?[AP]M$/)).toBeVisible();

    await page.getByTestId('public-refresh').click();

    await expect(page.getByText(/^As of \d{1,2}:05\s?[AP]M$/)).toBeVisible();
    expect(api.requests).toHaveLength(2);
  });

  test('says only that the link is no longer active for a dead link', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_public(page, DEAD_TOKEN);

    await expect(page.getByTestId('public-inactive')).toContainText(
      'This link is no longer active',
    );
    await expect(page.getByTestId('public-inactive')).toContainText(
      'Ask the person who sent it for a new one.',
    );
    // Nothing hints at why, and nothing is offered but the message.
    await expect(page.locator('body')).not.toContainText(/expired|revoked|invalid|not found/i);
    await expect(page.getByTestId('public-refresh')).toHaveCount(0);
    await expect(page.getByTestId('public-retry')).toHaveCount(0);
    await expect(page.getByTestId('public-filter-bar')).toHaveCount(0);
    expect(api.requests).toHaveLength(1);
    await assert_settled_layout_is_sound(page);
  });

  test('shows a friendly "too many requests" state, then recovers on retry', async ({ page }) => {
    const api = await install_api_mock(page, { failures: [429] });
    await open_public(page);

    await expect(page.getByTestId('public-error')).toContainText('Too many requests');
    await expect(page.getByTestId('public-error')).toContainText('Please try again in a moment.');
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('public-retry').click();

    await expect(page.getByTestId('public-count')).toHaveText('5 games');
    expect(api.requests).toHaveLength(2);
  });

  test('shows a retry for a network failure, then the games', async ({ page }) => {
    await install_api_mock(page, { failures: ['abort'] });
    await open_public(page);

    await expect(page.getByText('Games could not be loaded')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('public-retry').click();

    await expect(page.getByTestId('public-count')).toHaveText('5 games');
  });

  test('keeps the last list, with a notice, when a refresh fails', async ({ page }) => {
    await install_api_mock(page, { failures: [null, 500] });
    await open_public(page);
    await expect(page.getByTestId('public-count')).toHaveText('5 games');

    await page.getByTestId('public-refresh').click();

    await expect(page.getByTestId('public-stale-notice')).toContainText('Showing the last update.');
    await expect(page.getByTestId('public-count')).toHaveText('5 games');
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('public-stale-retry').click();
    await expect(page.getByTestId('public-stale-notice')).toHaveCount(0);
  });

  test('refreshes by itself every minute while visible, and pauses while the tab is hidden', async ({
    page,
  }) => {
    await page.clock.install();
    const api = await install_api_mock(page);
    await open_public(page);
    await expect(page.getByTestId('public-count')).toHaveText('5 games');
    expect(api.requests).toHaveLength(1);

    await page.clock.fastForward(59_000);
    expect(api.requests).toHaveLength(1);
    await page.clock.fastForward(2_000);
    await expect.poll(() => api.requests.length).toBe(2);

    await set_visibility(page, 'hidden');
    await page.clock.fastForward(300_000);
    expect(api.requests).toHaveLength(2);

    // Coming back after a long absence refreshes at once.
    await set_visibility(page, 'visible');
    await expect.poll(() => api.requests.length).toBe(3);
  });

  test('sends no Authorization header from a signed-in browser either', async ({ page }) => {
    const api = await install_api_mock(page);
    await sign_in_and_open(page, '/games');
    // The app does attach the token to its own calls...
    await expect
      .poll(() => api.all_api_headers.some((entry) => entry.headers['authorization']))
      .toBe(true);

    const before = api.requests.length;
    await open_public(page);
    await expect(page.getByTestId('public-count')).toHaveText('5 games');

    // ...but never to the public endpoint.
    const public_calls = api.requests.slice(before);
    expect(public_calls.length).toBeGreaterThan(0);
    for (const call of public_calls) expect(call.headers['authorization']).toBeUndefined();
    await expect(page.locator('hch-sidebar, hch-app-header')).toHaveCount(0);
  });
});
