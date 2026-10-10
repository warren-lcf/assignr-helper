import { Locator, Page, Route, expect as base_expect, test } from '@playwright/test';
import {
  agenda_group,
  agenda_header,
  agenda_labels,
  assert_agenda_layout_is_sound,
} from './helpers/agenda_list';
import { assert_layout_is_sound } from './helpers/layout_checks';
import { SEED_USER_EMAIL, sign_in_and_open } from './helpers/sign_in';
import { json, wait_for_animations } from './helpers/settled_layout';

/** The dev server compiles lazily and Firebase Auth loads on demand, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** Times and dates are asserted in UTC and English, whatever the machine running the suite uses. */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

/** What a tenant owner may do, as `GET /api/me` reports it. */
const OWNER_PERMISSIONS = ['games.read', 'calendar_feed.manage', 'quick_links.manage'];
/** What a tenant member holds: games, but no calendar link management. */
const MEMBER_PERMISSIONS = ['games.read', 'reports.write'];
/** A role that cannot read games. */
const NO_GAMES_PERMISSIONS = ['reports.write'];

/** Obviously fake tokens; the page must keep them out of everything but the one-time panel. */
const FIRST_TOKEN = 'e2e-fake-token-one-never-real-0123456789';
const SECOND_TOKEN = 'e2e-fake-token-two-never-real-9876543210';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const VENUE_ZONE = 'America/Chicago';

/**
 * The games sit on calendar days a few days ahead of whenever the suite runs, so they are always
 * upcoming and the Next up card always has a game to show; the expected texts are worked out from the
 * same instants, in UTC and English.
 */
const FIRST_DAY = Math.floor(Date.now() / DAY_MS) * DAY_MS + 3 * DAY_MS;
const SECOND_DAY = FIRST_DAY + DAY_MS;

/** The weekday heading of a calendar date, as the agenda writes it ("Saturday, Oct 10"). */
function heading_of(local_date: number): string {
  return new Date(local_date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Kick-off on the venue's clock with its zone ("9:00 AM CDT"). */
function venue_time_of(start_at: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: VENUE_ZONE,
    timeZoneName: 'short',
  }).format(start_at);
}

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

function make_game(game_id: string, overrides: Partial<IMockGame>): IMockGame {
  const local_date = overrides.local_date === undefined ? FIRST_DAY : overrides.local_date;
  return {
    game_id,
    connection_id: 'conn-1',
    organization_id: 'org-1',
    organization_name: 'Metro Youth Soccer',
    venue_name: 'Field 3',
    location_group: 'Riverside Park',
    local_date,
    time_zone: VENUE_ZONE,
    start_at: (local_date ?? FIRST_DAY) + 14 * HOUR_MS,
    end_at: null,
    status: 'SCHEDULED',
    level: 'Premier',
    league: 'Fall League',
    age_group: 'U12',
    game_type: 'Regular season',
    gender: 'Boys',
    home_team: 'Lions',
    away_team: 'Tigers',
    is_open: false,
    is_mine: true,
    open_slot_count: 0,
    total_slot_count: 2,
    slots: [
      { position: 'Center', state: 'MINE' },
      { position: 'Asst. Referee', state: 'FILLED' },
    ],
    my_position: 'Center',
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}

/** Three assigned games: two on the first day at two venues, one on the second day. */
function make_dataset(): IMockGame[] {
  return [
    make_game('g1', {}),
    make_game('g2', {
      location_group: 'Lakeside Fields',
      venue_name: 'Pitch 1',
      start_at: FIRST_DAY + 16 * HOUR_MS,
      home_team: 'Hawks',
      away_team: 'Owls',
      level: 'Select',
      league: 'Spring League',
      age_group: 'U14',
      slots: [
        { position: 'Referee', state: 'FILLED' },
        { position: 'Asst. Referee', state: 'MINE' },
      ],
      my_position: 'Asst. Referee',
    }),
    make_game('g3', {
      local_date: SECOND_DAY,
      start_at: SECOND_DAY + 13 * HOUR_MS,
      home_team: 'Rams',
      away_team: 'Bulls',
    }),
  ];
}

interface IMockFeed {
  status: 'ACTIVE';
  created_at: number;
  last_fetched_at: number | null;
  fetch_count: number;
  rotation_count: number;
}

interface IMockOptions {
  permissions?: string[];
  games?: IMockGame[];
  /** The feed the backend holds at the start; none by default. */
  feed?: IMockFeed | null;
  /** How many `GET /api/games` calls fail with a 500 before the mock starts answering. */
  game_failures?: number;
  /** How many `GET /api/my_schedule/feed` calls fail with a 500 before the mock starts answering. */
  feed_failures?: number;
}

/** The in-test backend: its state and a log of what it was asked. */
interface IMockApi {
  feed: IMockFeed | null;
  game_requests: URLSearchParams[];
  requests: { method: string; path: string }[];
}

const UNKNOWN_LOCATION = 'Location to be announced';

/** Groups like the backend: locations A to Z (unknown last), dates ascending, games by start. */
function group_games(games: IMockGame[]) {
  const locations = [...new Set(games.map((game) => game.location_group))].sort((a, b) =>
    a === UNKNOWN_LOCATION ? 1 : b === UNKNOWN_LOCATION ? -1 : a.localeCompare(b),
  );
  return {
    locations: locations.map((location_label) => {
      const here = games.filter((game) => game.location_group === location_label);
      const dates = [...new Set(here.map((game) => game.local_date))].sort(
        (a, b) => (a ?? Infinity) - (b ?? Infinity),
      );
      return {
        location_label,
        dates: dates.map((local_date) => ({
          local_date,
          games: here
            .filter((game) => game.local_date === local_date)
            .sort((a, b) => a.start_at - b.start_at),
        })),
      };
    }),
    total: games.length,
    truncated: false,
  };
}

function make_feed(overrides: Partial<IMockFeed> = {}): IMockFeed {
  return {
    status: 'ACTIVE',
    created_at: Date.now() - 5 * DAY_MS,
    last_fetched_at: null,
    fetch_count: 0,
    rotation_count: 0,
    ...overrides,
  };
}

/**
 * Mocks the backend (it is not running in E2E) for this page. Only same-origin `/api/**` calls are
 * intercepted, so the Auth emulator is untouched.
 * @param page Page under test.
 * @param options Permissions, the data the backend holds and failures to simulate.
 * @returns The mock's state, to assert on.
 */
async function install_api_mock(page: Page, options: IMockOptions = {}): Promise<IMockApi> {
  const api: IMockApi = {
    feed: options.feed === undefined ? null : options.feed,
    game_requests: [],
    requests: [],
  };
  const dataset = options.games ?? make_dataset();
  const permissions = options.permissions ?? OWNER_PERMISSIONS;
  let game_failures_left = options.game_failures ?? 0;
  let feed_failures_left = options.feed_failures ?? 0;
  let issued = 0;
  const tokens = [FIRST_TOKEN, SECOND_TOKEN];

  const issue = (route: Route, status: number) => {
    const token = tokens[Math.min(issued++, tokens.length - 1)];
    return json(route, status, {
      data: { feed: api.feed, token, path: `/api/public/cal/${token}.ics` },
    });
  };

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const url = new URL(request.url());
      api.requests.push({ method, path: url.pathname });

      if (method === 'GET' && url.pathname === '/api/me') {
        return json(route, 200, {
          data: {
            uid: 'u1',
            email: SEED_USER_EMAIL,
            tenant_id: 'tenant-1',
            role: 'TENANT_OWNER',
            actual_tenant_id: 'tenant-1',
            actual_role: 'TENANT_OWNER',
            permissions,
          },
        });
      }
      if (method === 'GET' && url.pathname === '/api/games') {
        api.game_requests.push(url.searchParams);
        if (game_failures_left > 0) {
          game_failures_left--;
          return json(route, 500, { code: 'INTERNAL', message: 'Boom', violations: [] });
        }
        return json(route, 200, { data: group_games(dataset) });
      }
      if (url.pathname === '/api/my_schedule/feed' && method === 'GET') {
        if (feed_failures_left > 0) {
          feed_failures_left--;
          return json(route, 500, { code: 'INTERNAL', message: 'Boom', violations: [] });
        }
        return json(route, 200, { data: { feed: api.feed } });
      }
      if (url.pathname === '/api/my_schedule/feed' && method === 'POST') {
        if (api.feed) {
          return json(route, 409, { code: 'FEED_EXISTS', message: 'Exists', violations: [] });
        }
        api.feed = make_feed({ created_at: Date.now() });
        return issue(route, 201);
      }
      if (url.pathname === '/api/my_schedule/feed/rotate' && method === 'POST') {
        if (!api.feed) {
          return json(route, 404, { code: 'NOT_FOUND', message: 'None', violations: [] });
        }
        api.feed = { ...api.feed, rotation_count: api.feed.rotation_count + 1 };
        return issue(route, 200);
      }
      if (url.pathname === '/api/my_schedule/feed' && method === 'DELETE') {
        api.feed = null;
        return json(route, 200, { data: { feed: null } });
      }
      return json(route, 404, { code: 'NOT_FOUND', message: 'Not found', violations: [] });
    },
  );
  return api;
}

function requests_to(api: IMockApi, method: string, path: string) {
  return api.requests.filter((request) => request.method === method && request.path === path);
}

/**
 * Layout checks for the page, once animations and toasts are gone and from the top, as a user first
 * sees it: the shared checks, with the wrapped-label one leaving out the agenda's single-line,
 * ellipsized group labels (see `helpers/agenda_list.ts`).
 */
async function assert_settled_layout_is_sound(page: Page): Promise<void> {
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0, { timeout: 20_000 });
  await wait_for_animations(page);
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll('*'))) element.scrollTop = 0;
  });
  await assert_agenda_layout_is_sound(page);
}

/**
 * Layout checks for an open dialog: the page behind it is taken out of the layout for the length of
 * the check, so what is measured is the dialog and its overlay, with the full shared checks.
 */
async function assert_dialog_layout_is_sound(page: Page): Promise<void> {
  await wait_for_animations(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('app-root')?.style.setProperty('display', 'none');
  });
  try {
    await assert_layout_is_sound(page);
  } finally {
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('app-root')?.style.removeProperty('display');
    });
  }
}

async function open_schedule(page: Page): Promise<void> {
  await sign_in_and_open(page, '/my-schedule');
  // The shell's side navigation is still sliding in just after sign-in, which narrows the page. The calendar
  // link manager switches between a table and cards at 900px of its own width, so wait for the width to settle
  // before anything is clicked: a button of the layout that is about to disappear would be pressed otherwise.
  await wait_for_animations(page);
}

/** The visible one of the share link manager's row buttons (it draws a table and cards; one shows). */
function row_button(page: Page, name: 'Rotate' | 'Revoke'): Locator {
  return page
    .getByRole('button', { name: `${name} My schedule calendar link` })
    .filter({ visible: true });
}

test.describe('my schedule page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('lists the referee’s games by date, in time order, on the venue clock', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_schedule(page);

    await expect(page.getByTestId('my-schedule-count')).toHaveText('3 games');
    const list = page.getByTestId('my-schedule-agenda');
    await expect(agenda_labels(list, 0)).toHaveText([
      heading_of(FIRST_DAY),
      heading_of(SECOND_DAY),
    ]);
    // Grouped by date alone: the venues are named on the rows, not by a heading above them.
    await expect(agenda_labels(list, 1)).toHaveCount(0);
    await expect(agenda_header(agenda_group(list, String(FIRST_DAY)))).toContainText('2 games');
    await expect(agenda_header(agenda_group(list, String(SECOND_DAY)))).toContainText('1 game');

    // Within the first day the 9 AM game (Riverside) comes before the 11 AM one (Lakeside), though the
    // server lists Lakeside first.
    await expect(page.locator('[data-testid^="game-title-"]')).toHaveText([
      'Lions vs Tigers',
      'Hawks vs Owls',
      'Rams vs Bulls',
    ]);
    // The time column is on the venue's clock with its zone, whatever zone the viewer is in.
    await expect(page.getByTestId('game-time-g1')).toHaveText(
      venue_time_of(FIRST_DAY + 14 * HOUR_MS),
    );
    await expect(page.getByTestId('game-time-g2')).toHaveText(
      venue_time_of(FIRST_DAY + 16 * HOUR_MS),
    );
    await expect(page.getByTestId('game-time-g1')).toHaveCount(1);

    // Where, which position is the referee's own, and level and league.
    await expect(page.getByTestId('game-location-g1')).toContainText('Riverside Park');
    await expect(page.getByTestId('game-location-g2')).toContainText('Lakeside Fields');
    await expect(page.getByTestId('game-row-g2')).toContainText('Pitch 1');
    await expect(page.getByTestId('game-mine-g1')).toContainText('Mine: Center');
    await expect(page.getByTestId('game-mine-g2')).toContainText('Mine: Asst. Referee');
    await expect(page.getByTestId('game-row-g2')).toContainText('Select');
    await expect(page.getByTestId('game-row-g2')).toContainText('Spring League');
    await expect(list).not.toContainText(/\$|fee/i);

    // Exactly the contract's query: own games, from three hours ago to 120 days ahead, no cancelled.
    expect(api.game_requests).toHaveLength(1);
    const query = api.game_requests[0];
    expect(query.get('scope')).toBe('MINE');
    expect(query.get('include_cancelled')).toBe('false');
    expect(query.get('only_with_open_slots')).toBe('false');
    const from = Number(query.get('from'));
    const to = Number(query.get('to'));
    expect(Math.abs(from - (Date.now() - 3 * HOUR_MS))).toBeLessThan(5 * 60_000);
    expect(to - from).toBe(3 * HOUR_MS + 120 * DAY_MS);

    await assert_settled_layout_is_sound(page);
  });

  test('puts the next game in a Next up card, with where, when and which position', async ({
    page,
  }) => {
    await install_api_mock(page);
    await open_schedule(page);

    await expect(page.getByTestId('next-up-title')).toHaveText('Lions vs Tigers');
    await expect(page.getByTestId('next-up-date')).toHaveText(heading_of(FIRST_DAY));
    await expect(page.getByTestId('next-up-time')).toHaveText(
      venue_time_of(FIRST_DAY + 14 * HOUR_MS),
    );
    await expect(page.getByTestId('next-up-venue')).toContainText('Field 3');
    await expect(page.getByTestId('next-up-location')).toContainText('Riverside Park');
    await expect(page.getByTestId('next-up-position')).toContainText('Your position: Center');
    await expect(page.getByTestId('next-up-note')).toContainText(/Starts in [23] days/);
    await assert_settled_layout_is_sound(page);
  });

  test('says a game under way started, and keeps it as the next game', async ({ page }) => {
    const now = Date.now();
    const under_way = make_game('live', {
      local_date: Math.floor(now / DAY_MS) * DAY_MS,
      start_at: now - 20 * 60_000,
      end_at: now + HOUR_MS,
      home_team: 'Live',
      away_team: 'Now',
    });
    await install_api_mock(page, { games: [under_way, ...make_dataset()] });
    await open_schedule(page);

    await expect(page.getByTestId('next-up-title')).toHaveText('Live vs Now');
    await expect(page.getByTestId('next-up-note')).toContainText(/Started \d+ minutes? ago/);
    await assert_settled_layout_is_sound(page);
  });

  test('says nothing is coming up when every listed game is over, but still lists them', async ({
    page,
  }) => {
    const now = Date.now();
    const over = make_game('over', {
      local_date: Math.floor(now / DAY_MS) * DAY_MS,
      start_at: now - 3 * HOUR_MS,
      end_at: now - 2 * HOUR_MS,
      home_team: 'Past',
      away_team: 'Game',
    });
    await install_api_mock(page, { games: [over] });
    await open_schedule(page);

    await expect(page.getByTestId('next-up-empty')).toContainText('Nothing coming up');
    await expect(page.getByTestId('game-row-over')).toBeVisible();
    await assert_settled_layout_is_sound(page);
  });

  test('collapses a date from its header and opens it again', async ({ page }) => {
    await install_api_mock(page);
    await open_schedule(page);
    await expect(page.getByTestId('my-schedule-count')).toHaveText('3 games');

    const header = agenda_header(
      agenda_group(page.getByTestId('my-schedule-agenda'), String(FIRST_DAY)),
    );
    await expect(header).toHaveAttribute('aria-expanded', 'true');

    await header.click();

    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('game-row-g1')).toHaveCount(0);
    await expect(header).toContainText('2 games');
    await expect(page.getByTestId('game-row-g3')).toBeVisible();
    await assert_settled_layout_is_sound(page);

    await header.click();

    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('game-row-g1')).toBeVisible();
  });

  test('invites finding games when none are assigned, and the invitation goes to Games', async ({
    page,
  }) => {
    await install_api_mock(page, { games: [] });
    await open_schedule(page);

    await expect(page.getByText('No upcoming games')).toBeVisible();
    await expect(page.getByTestId('next-up-card')).toHaveCount(0);
    // The calendar link is still offered: it fills itself as games arrive.
    await expect(page.getByTestId('share-link-manager-create')).toBeVisible();
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('my-schedule-empty-games').click();
    await expect(page).toHaveURL(/\/games$/);
  });

  test('shows an error with a retry, then the schedule', async ({ page }) => {
    const api = await install_api_mock(page, { game_failures: 1 });
    await open_schedule(page);

    await expect(page.getByText('Your schedule could not be loaded')).toBeVisible();
    // The calendar link does not wait for the games.
    await expect(page.getByTestId('calendar-link')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('my-schedule-retry').click();

    await expect(page.getByTestId('my-schedule-count')).toHaveText('3 games');
    expect(api.game_requests).toHaveLength(2);
  });

  test('shows a clear no-access state, and asks for nothing, without games.read', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { permissions: NO_GAMES_PERMISSIONS });
    await open_schedule(page);

    await expect(page.getByTestId('my-schedule-no-access')).toContainText(
      'You do not have access to your schedule',
    );
    await expect(page.getByTestId('calendar-link')).toHaveCount(0);
    expect(api.game_requests).toHaveLength(0);
    expect(requests_to(api, 'GET', '/api/my_schedule/feed')).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });

  test('keeps the schedule when the calendar link cannot be read, and retries it alone', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { feed_failures: 1 });
    await open_schedule(page);

    await expect(page.getByTestId('calendar-link-load-error')).toContainText(
      'The calendar link could not be loaded.',
    );
    await expect(page.getByTestId('my-schedule-count')).toHaveText('3 games');
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('calendar-link-retry').click();

    await expect(page.getByTestId('share-link-manager-create')).toBeVisible();
    expect(api.game_requests).toHaveLength(1);
    expect(requests_to(api, 'GET', '/api/my_schedule/feed')).toHaveLength(2);
  });

  test('creates the calendar link: the address is shown once, copy works, and it is gone after Done', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    const api = await install_api_mock(page);
    await open_schedule(page);
    await expect(page.getByTestId('calendar-link-how-to')).toBeVisible();
    await expect(page.getByTestId('share-link-manager-create')).toBeVisible();
    await expect(page.getByTestId('calendar-link-status')).toHaveCount(0);

    await page.getByTestId('share-link-manager-create').click();

    // The one-time panel: the absolute address, a clear warning, and the webcal button.
    const origin = new URL(page.url()).origin;
    const address = `${origin}/api/public/cal/${FIRST_TOKEN}.ics`;
    await expect(page.getByTestId('share-link-manager-url')).toHaveText(address);
    await expect(page.getByTestId('share-link-manager-banner')).toContainText(
      'will not be shown again',
    );
    await expect(page.getByTestId('calendar-link-open-button')).toHaveAttribute(
      'href',
      address.replace(/^https?:/, 'webcal:'),
    );
    expect(requests_to(api, 'POST', '/api/my_schedule/feed')).toHaveLength(1);
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('share-link-manager-copy').click();
    if (browserName === 'chromium') {
      await expect(page.getByTestId('share-link-manager-copy')).toContainText('Copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
    }

    await page.getByTestId('share-link-manager-done').click();

    // Gone from the page, the webcal button, the address bar and storage, for good.
    await expect(page.getByTestId('share-link-manager-reveal')).toHaveCount(0);
    await expect(page.getByTestId('calendar-link-open')).toHaveCount(0);
    expect(await page.content()).not.toContain(FIRST_TOKEN);
    expect(page.url()).not.toContain(FIRST_TOKEN);
    expect(
      await page.evaluate(() =>
        JSON.stringify([localStorage, sessionStorage].map((storage) => ({ ...storage }))),
      ),
    ).not.toContain(FIRST_TOKEN);
    // What remains is the link's status, with no address.
    await expect(page.getByTestId('calendar-link-last-fetched')).toHaveText('Not fetched yet');
    await expect(page.getByTestId('calendar-link-fetch-count')).toHaveText('0');
    await assert_settled_layout_is_sound(page);

    // After a reload the status is still there and the address is not.
    await page.reload();
    await expect(page.getByTestId('calendar-link-last-fetched')).toHaveText('Not fetched yet');
    await expect(page.getByTestId('share-link-manager-url')).toHaveCount(0);
    await expect(page.getByTestId('calendar-link-open')).toHaveCount(0);
    expect(await page.content()).not.toContain(FIRST_TOKEN);
  });

  test('shows how often a calendar app has read the link, with right-aligned figures', async ({
    page,
  }) => {
    await install_api_mock(page, {
      feed: make_feed({ last_fetched_at: Date.now() - 2 * HOUR_MS, fetch_count: 1234 }),
    });
    await open_schedule(page);

    await expect(page.getByTestId('calendar-link-fetch-count')).toHaveText('1,234');
    await expect(page.getByTestId('calendar-link-last-fetched')).not.toHaveText('Not fetched yet');
    const style = await page.getByTestId('calendar-link-fetch-count').evaluate((element) => {
      const computed = getComputedStyle(element);
      return { align: computed.textAlign, numeric: computed.fontVariantNumeric };
    });
    expect(['right', 'end']).toContain(style.align);
    expect(style.numeric).toContain('tabular-nums');
    await assert_settled_layout_is_sound(page);
  });

  test('rotates the link after a confirmation that says the old one stops working', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { feed: make_feed({ fetch_count: 3 }) });
    await open_schedule(page);

    await row_button(page, 'Rotate').click();
    const message = page.getByTestId('share-link-manager-rotate-dialog-message');
    await expect(message).toContainText('stops working immediately');
    await expect(message).toContainText('Every calendar the old link was added to');
    await assert_dialog_layout_is_sound(page);
    await page.getByTestId('share-link-manager-rotate-dialog-cancel').click();
    await expect(message).toHaveCount(0);
    expect(requests_to(api, 'POST', '/api/my_schedule/feed/rotate')).toHaveLength(0);

    await row_button(page, 'Rotate').click();
    await page.getByTestId('share-link-manager-rotate-dialog-confirm').click();

    const origin = new URL(page.url()).origin;
    await expect(page.getByTestId('share-link-manager-url')).toHaveText(
      `${origin}/api/public/cal/${FIRST_TOKEN}.ics`,
    );
    expect(requests_to(api, 'POST', '/api/my_schedule/feed/rotate')).toHaveLength(1);
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('share-link-manager-done').click();
    await expect(page.getByTestId('share-link-manager-reveal')).toHaveCount(0);
    expect(await page.content()).not.toContain(FIRST_TOKEN);
  });

  test('revokes the link after a destructive confirmation', async ({ page }) => {
    const api = await install_api_mock(page, { feed: make_feed({ fetch_count: 3 }) });
    await open_schedule(page);
    await expect(page.getByTestId('calendar-link-fetch-count')).toHaveText('3');

    await row_button(page, 'Revoke').click();
    await expect(page.getByTestId('share-link-manager-revoke-dialog-message')).toContainText(
      'stops updating immediately',
    );
    await assert_dialog_layout_is_sound(page);
    await page.getByTestId('share-link-manager-revoke-dialog-cancel').click();
    expect(requests_to(api, 'DELETE', '/api/my_schedule/feed')).toHaveLength(0);
    await expect(page.getByTestId('calendar-link-fetch-count')).toBeVisible();

    await row_button(page, 'Revoke').click();
    await page.getByTestId('share-link-manager-revoke-dialog-confirm').click();

    await expect(page.getByText('Calendar link revoked.').first()).toBeVisible();
    await expect(page.getByTestId('calendar-link-status')).toHaveCount(0);
    await expect(page.getByTestId('share-link-manager-create')).toBeVisible();
    expect(requests_to(api, 'DELETE', '/api/my_schedule/feed')).toHaveLength(1);
    expect(api.feed).toBeNull();
    await assert_settled_layout_is_sound(page);
  });

  test('says a second create is not needed when a link exists, without asking the server', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { feed: make_feed() });
    await open_schedule(page);

    await page.getByTestId('share-link-manager-create').click();

    await expect(page.getByTestId('calendar-link-action-error')).toContainText(
      'rotate the existing one',
    );
    expect(requests_to(api, 'POST', '/api/my_schedule/feed')).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });

  test('shows a member the schedule and the link status, but no controls', async ({ page }) => {
    const api = await install_api_mock(page, {
      permissions: MEMBER_PERMISSIONS,
      feed: make_feed({ fetch_count: 12, last_fetched_at: Date.now() - HOUR_MS }),
    });
    await open_schedule(page);

    await expect(page.getByTestId('my-schedule-count')).toHaveText('3 games');
    await expect(page.getByTestId('calendar-link-fetch-count')).toHaveText('12');
    await expect(page.getByTestId('calendar-link-readonly')).toContainText(
      'Your role cannot create, replace or revoke the calendar link',
    );
    await expect(page.getByTestId('share-link-manager-create')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Rotate|Revoke) /i })).toHaveCount(0);
    await expect(page.getByTestId('calendar-link-how-to')).toHaveCount(0);
    expect(requests_to(api, 'POST', '/api/my_schedule/feed')).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });
});
