import { Locator, Page, Route, expect as base_expect, test } from '@playwright/test';
import { assert_settled_layout_is_sound, json } from './helpers/settled_layout';
import { SEED_USER_EMAIL, sign_in_and_open } from './helpers/sign_in';

/** The dev server compiles lazily and Firebase Auth loads on demand, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** Times and dates are asserted in UTC and English, whatever the machine running the suite uses. */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

const REFEREE_PERMISSIONS = ['games.read', 'games.respond', 'reports.write'];

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const NOW = Date.now();

/** Below this width the ui-kit shrinks its keypad keys from 72 px to 64 px. */
const KEYPAD_WIDE_VIEWPORT_PX = 768;

type ReportStatus = 'DRAFT' | 'READY' | 'SUBMITTED' | 'NOT_SUPPORTED';

interface IMockGame {
  game_id: string;
  connection_id: string;
  organization_id: string;
  organization_name: string;
  venue_name: string | null;
  location_group: string;
  local_date: number;
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

interface IMockIncident {
  incident_id: string;
  idempotency_key: string;
  team_side: 'HOME' | 'AWAY';
  jersey_number: number | null;
  incident_type: 'YELLOW' | 'SECOND_YELLOW' | 'RED' | 'OTHER';
  minute: number | null;
  reason_code: string | null;
  notes: string | null;
}

interface IMockReport {
  report_id: string;
  game_id: string;
  status: ReportStatus;
  home_score: number | null;
  away_score: number | null;
  notes: string | null;
  incidents: IMockIncident[];
  client_revision: number;
  lock_version: number;
  created_at: number;
  updated_at: number;
}

/** One request that reached the mocked backend. */
interface IApiCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  params: URLSearchParams;
}

/** The in-test backend: what it holds and what it was asked. */
interface IMockApi {
  calls: IApiCall[];
  reports: IMockReport[];
  /** While true every `/api/**` request fails at the network, as with no signal. */
  network_down: boolean;
  /** Requests that were turned away because the network was down. */
  refused_count: number;
}

interface IMockOptions {
  permissions?: string[];
  games?: IMockGame[];
  /** Reports that already exist when the page opens. */
  seed?: Partial<IMockReport>[];
  /** How many `GET /api/games` calls fail with a 500 before the mock starts answering. */
  games_failures?: number;
}

function make_game(game_id: string, minutes_ago: number, overrides: Partial<IMockGame>): IMockGame {
  const start_at = NOW - minutes_ago * MINUTE_MS;
  return {
    game_id,
    connection_id: 'conn-1',
    organization_id: 'org-1',
    organization_name: 'Metro Youth Soccer',
    venue_name: 'Field 3',
    location_group: 'Riverside Park',
    local_date: Date.UTC(
      new Date(start_at).getUTCFullYear(),
      new Date(start_at).getUTCMonth(),
      new Date(start_at).getUTCDate(),
    ),
    time_zone: 'America/Chicago',
    start_at,
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
      { position: 'Referee', state: 'MINE' },
      { position: 'Asst. Referee', state: 'FILLED' },
    ],
    my_position: 'Referee',
    fee_minor: null,
    currency: null,
    ...overrides,
  };
}

/** Three of the referee's games: the latest and one earlier today need a report, one from yesterday is done. */
function make_dataset(): IMockGame[] {
  return [
    make_game('g1', 40, {}),
    make_game('g2', 5 * 60, { home_team: 'Hawks', away_team: 'Owls', venue_name: 'Field 1' }),
    make_game('g3', 26 * 60, { home_team: 'Eagles', away_team: 'Falcons', venue_name: 'Pitch 2' }),
  ];
}

function make_report(game_id: string, overrides: Partial<IMockReport> = {}): IMockReport {
  return {
    report_id: `rep-${game_id}`,
    game_id,
    status: 'DRAFT',
    home_score: null,
    away_score: null,
    notes: null,
    incidents: [],
    client_revision: 0,
    lock_version: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function failure(
  code: string,
  message: string,
  violations: { path: string; message: string }[] = [],
) {
  return { code, message, violations };
}

function summary_of(report: IMockReport) {
  return {
    report_id: report.report_id,
    game_id: report.game_id,
    status: report.status,
    home_score: report.home_score,
    away_score: report.away_score,
    // As the backend counts them: yellows include second yellows, reds are straight reds only.
    yellow_count: report.incidents.filter(
      (item) => item.incident_type === 'YELLOW' || item.incident_type === 'SECOND_YELLOW',
    ).length,
    red_count: report.incidents.filter((item) => item.incident_type === 'RED').length,
    updated_at: report.updated_at,
  };
}

function group_games(games: IMockGame[]) {
  const sorted = [...games].sort((a, b) => a.start_at - b.start_at);
  return {
    locations: sorted.length
      ? [
          {
            location_label: 'Riverside Park',
            dates: [{ local_date: sorted[0].local_date, games: sorted }],
          },
        ]
      : [],
    total: sorted.length,
    truncated: false,
  };
}

/**
 * Mocks the backend (it is not running in E2E) for the match report screens, as a small stateful fake:
 * a score request with a lower revision than the stored one is ignored, a card key sent again answers
 * with the report as it is, card ids are the server's own, marking ready needs both scores, and a report
 * that is not a draft refuses edits. Only same-origin `/api/**` calls are intercepted, so the Auth
 * emulator is untouched.
 * @param page Page under test.
 * @param options Permissions, the games and reports the backend holds, and failures to simulate.
 * @returns The fake, for specs to read what it was asked and to cut its network.
 */
async function install_api_mock(page: Page, options: IMockOptions = {}): Promise<IMockApi> {
  const api: IMockApi = {
    calls: [],
    reports: (options.seed ?? []).map((seed) =>
      make_report(seed.game_id ?? 'g1', seed as Partial<IMockReport>),
    ),
    network_down: false,
    refused_count: 0,
  };
  const games = options.games ?? make_dataset();
  const permissions = options.permissions ?? REFEREE_PERMISSIONS;
  let games_failures = options.games_failures ?? 0;
  let incident_counter = 0;

  const find = (report_id: string) => api.reports.find((report) => report.report_id === report_id);
  const touch = (report: IMockReport) => {
    report.updated_at = Date.now();
    report.lock_version++;
  };

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      if (api.network_down) {
        api.refused_count++;
        return route.abort('internetdisconnected');
      }
      const body = request.postData()
        ? (JSON.parse(request.postData() ?? '{}') as Record<string, unknown>)
        : null;
      api.calls.push({ method, path: url.pathname, body, params: url.searchParams });

      if (url.pathname === '/api/me') {
        return json(route, 200, {
          data: {
            uid: 'u1',
            email: SEED_USER_EMAIL,
            tenant_id: 'tenant-1',
            role: 'REFEREE',
            actual_tenant_id: 'tenant-1',
            actual_role: 'REFEREE',
            permissions,
          },
        });
      }
      if (url.pathname === '/api/games') {
        if (games_failures > 0) {
          games_failures--;
          return json(route, 500, failure('INTERNAL', 'Boom'));
        }
        return json(route, 200, { data: group_games(games.filter((game) => game.is_mine)) });
      }
      if (url.pathname === '/api/match_reports') {
        if (method === 'GET') {
          return json(route, 200, { data: { reports: api.reports.map(summary_of) } });
        }
        const game_id = String(body?.['game_id'] ?? '');
        const game = games.find((candidate) => candidate.game_id === game_id);
        if (!game) return json(route, 404, failure('NOT_FOUND', 'Not found'));
        if (game.status === 'CANCELLED') {
          return json(route, 409, failure('GAME_CANCELLED', 'Game cancelled'));
        }
        const existing = api.reports.find((report) => report.game_id === game_id);
        if (existing) return json(route, 200, { data: { report: existing } });
        const created = make_report(game_id);
        api.reports.push(created);
        return json(route, 201, { data: { report: created } });
      }

      const match = /^\/api\/match_reports\/([^/]+)(?:\/([a-z]+)(?:\/([^/]+))?)?$/.exec(
        url.pathname,
      );
      const report = match ? find(decodeURIComponent(match[1])) : undefined;
      if (!match || !report) return json(route, 404, failure('NOT_FOUND', 'Not found'));
      const action = match[2];

      if (!action && method === 'GET') return json(route, 200, { data: { report } });
      if (action === 'reopen') {
        report.status = 'DRAFT';
        touch(report);
        return json(route, 200, { data: { report } });
      }
      if (action === 'ready') {
        const violations = [
          ...(report.home_score === null ? [{ path: 'home_score', message: 'Required' }] : []),
          ...(report.away_score === null ? [{ path: 'away_score', message: 'Required' }] : []),
        ];
        if (violations.length > 0) {
          return json(route, 422, failure('REPORT_NOT_READY', 'Not ready', violations));
        }
        report.status = 'READY';
        touch(report);
        return json(route, 200, { data: { report } });
      }
      if (report.status !== 'DRAFT') {
        return json(route, 409, failure('REPORT_NOT_EDITABLE', 'Locked'));
      }
      if (action === 'scores' && method === 'PUT') {
        const revision = Number(body?.['client_revision'] ?? 0);
        if (revision >= report.client_revision) {
          report.home_score = body?.['home_score'] as number | null;
          report.away_score = body?.['away_score'] as number | null;
          if (body && 'notes' in body) report.notes = body['notes'] as string | null;
          report.client_revision = revision;
          touch(report);
        }
        return json(route, 200, { data: { report } });
      }
      if (action === 'incidents' && method === 'POST') {
        const key = String(body?.['idempotency_key'] ?? '');
        const replay = report.incidents.some((item) => item.idempotency_key === key);
        if (!replay) {
          report.incidents.push({
            incident_id: `inc-${++incident_counter}`,
            idempotency_key: key,
            team_side: body?.['team_side'] as 'HOME' | 'AWAY',
            incident_type: body?.['incident_type'] as IMockIncident['incident_type'],
            jersey_number: (body?.['jersey_number'] ?? null) as number | null,
            minute: (body?.['minute'] ?? null) as number | null,
            reason_code: (body?.['reason_code'] ?? null) as string | null,
            notes: (body?.['notes'] ?? null) as string | null,
          });
          touch(report);
        }
        return json(route, replay ? 200 : 201, { data: { report } });
      }
      if (action === 'incidents' && method === 'DELETE') {
        report.incidents = report.incidents.filter(
          (item) => item.incident_id !== decodeURIComponent(match[3] ?? ''),
        );
        touch(report);
        return json(route, 200, { data: { report } });
      }
      return json(route, 404, failure('NOT_FOUND', 'Not found'));
    },
  );
  return api;
}

function calls_to(api: IMockApi, method: string, path: RegExp): IApiCall[] {
  return api.calls.filter((call) => call.method === method && path.test(call.path));
}

async function open_list(page: Page, options: IMockOptions = {}): Promise<IMockApi> {
  const api = await install_api_mock(page, options);
  await sign_in_and_open(page, '/match-reports');
  return api;
}

async function open_entry(
  page: Page,
  options: IMockOptions = {},
  game_id = 'g1',
): Promise<IMockApi> {
  const api = await install_api_mock(page, options);
  await sign_in_and_open(page, `/match-reports/${game_id}`);
  await expect(page.getByTestId('match-report-entry')).toBeVisible();
  return api;
}

/** Measures a control and fails with its name when it is smaller than the floor. */
async function expect_size(
  locator: Locator,
  name: string,
  min_height: number,
  min_width = 0,
): Promise<void> {
  await expect(locator, name).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${name} has a box`).not.toBeNull();
  expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(min_height - 0.5);
  expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(min_width - 0.5);
}

/** No element of the entry screen reaches past the right edge of the screen. */
async function assert_entry_within_viewport(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() => {
    const limit = window.innerWidth + 1;
    return Array.from(document.querySelectorAll<HTMLElement>('app-match-report-entry-page *'))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > limit;
      })
      .map((element) => element.outerHTML.slice(0, 80));
  });
  expect(overflowing, 'elements past the right edge').toEqual([]);
}

/** The text Intl writes for a time on a venue clock, with every kind of space made plain. */
function venue_clock(start_at: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short',
  })
    .format(start_at)
    .replace(/\s/g, ' ');
}

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ').trim();

test.describe('match reports: the list', () => {
  test.describe.configure({ timeout: 120_000 });

  test('lists my games that need a report, with one giant button for the latest', async ({
    page,
  }) => {
    const api = await open_list(page, {
      seed: [
        {
          game_id: 'g3',
          status: 'READY',
          home_score: 2,
          away_score: 1,
          incidents: [
            {
              incident_id: 'inc-a',
              idempotency_key: 'key-a',
              team_side: 'HOME',
              incident_type: 'YELLOW',
              jersey_number: 4,
              minute: 20,
              reason_code: null,
              notes: null,
            },
            {
              incident_id: 'inc-b',
              idempotency_key: 'key-b',
              team_side: 'HOME',
              incident_type: 'SECOND_YELLOW',
              jersey_number: 4,
              minute: 70,
              reason_code: null,
              notes: null,
            },
            {
              incident_id: 'inc-c',
              idempotency_key: 'key-c',
              team_side: 'AWAY',
              incident_type: 'RED',
              jersey_number: null,
              minute: 80,
              reason_code: null,
              notes: null,
            },
          ],
        },
      ],
    });

    await expect(page.getByTestId('reports-needs-report')).toBeVisible();
    await expect(
      page.locator('[data-testid="reports-needs-report"] [data-testid^="report-row-"]'),
    ).toHaveCount(2);
    await expect(
      page.locator('[data-testid="reports-reported"] [data-testid^="report-row-"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId('reports-count')).toHaveText('2 games need a report');

    // The newest game first, and the giant button points at it.
    const rows = page.locator('[data-testid="reports-needs-report"] [data-testid^="report-row-"]');
    await expect(rows.nth(0)).toHaveAttribute('data-testid', 'report-row-g1');
    await expect(rows.nth(1)).toHaveAttribute('data-testid', 'report-row-g2');
    const giant = page.getByTestId('reports-report-latest');
    await expect(giant).toContainText('Report this game');
    await expect(giant).toContainText('Lions vs Tigers');
    await expect_size(giant, 'the giant button', 72, 200);

    // Kick-off is on the venue's clock, with its zone.
    expect(plain(await page.getByTestId('report-time-g1').textContent())).toBe(
      venue_clock(NOW - 40 * MINUTE_MS),
    );

    // The finished game shows its score and cards; numbers are right-aligned. Yellows include the second yellow.
    await expect(page.getByTestId('report-status-g3')).toContainText('Ready');
    await expect(page.getByTestId('report-score-g3')).toHaveText('2 – 1');
    await expect(page.getByTestId('report-yellow-g3')).toHaveText('2');
    await expect(page.getByTestId('report-red-g3')).toHaveText('1');
    const alignment = await page
      .getByTestId('report-score-g3')
      .evaluate((element) => getComputedStyle(element).textAlign);
    expect(['right', 'end']).toContain(alignment);
    await expect(page.getByTestId('report-status-g1')).toContainText('Needs a report');

    // It asked for the referee's own games from the last seven days up to twelve hours ahead.
    const games_call = calls_to(api, 'GET', /^\/api\/games$/)[0];
    expect(games_call.params.get('scope')).toBe('MINE');
    expect(games_call.params.get('include_cancelled')).toBe('false');
    const from = Number(games_call.params.get('from'));
    const to = Number(games_call.params.get('to'));
    expect(to - from).toBe(7 * 24 * HOUR_MS + 12 * HOUR_MS);

    await assert_settled_layout_is_sound(page);
  });

  test('opens the latest game from the giant button, and a row opens its own game', async ({
    page,
  }) => {
    await open_list(page);

    await page.getByTestId('reports-report-latest').click();
    await expect(page).toHaveURL(/\/match-reports\/g1$/);
    await expect(page.getByTestId('match-report-entry')).toBeVisible();

    await page.getByTestId('match-report-back').click();
    await expect(page).toHaveURL(/\/match-reports$/);
    await page.getByTestId('report-open-g2').click();
    await expect(page).toHaveURL(/\/match-reports\/g2$/);
    await expect(page.getByTestId('match-report-home-name')).toHaveText('Hawks');
  });

  test('says there are no games to report, with a way to Games', async ({ page }) => {
    await open_list(page, { games: [] });

    await expect(page.getByText('No games to report')).toBeVisible();
    await expect(page.getByTestId('reports-report-latest')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('reports-empty-games').click();
    await expect(page).toHaveURL(/\/games$/);
  });

  test('shows an error with Retry when the games cannot be loaded', async ({ page }) => {
    await open_list(page, { games_failures: 1 });

    await expect(page.getByText('Match reports could not be loaded')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('reports-retry').click();

    await expect(page.getByTestId('reports-needs-report')).toBeVisible();
    await expect(page.getByTestId('report-row-g1')).toBeVisible();
  });

  test('shows a clear no-access state and asks for nothing without games.read', async ({
    page,
  }) => {
    const api = await open_list(page, { permissions: ['reports.write'] });

    await expect(page.getByTestId('reports-no-access')).toBeVisible();
    expect(calls_to(api, 'GET', /^\/api\/games$/)).toHaveLength(0);
    expect(calls_to(api, 'GET', /^\/api\/match_reports/)).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });
});

test.describe('match reports: entering a report', () => {
  test.describe.configure({ timeout: 120_000 });

  test('opens the game’s report once and shows teams, kick-off, venue and the save state', async ({
    page,
  }) => {
    const api = await open_entry(page);

    await expect(page.getByTestId('match-report-home-name')).toHaveText('Lions');
    await expect(page.getByTestId('match-report-away-name')).toHaveText('Tigers');
    expect(plain(await page.getByTestId('match-report-kickoff').textContent())).toContain(
      venue_clock(NOW - 40 * MINUTE_MS),
    );
    await expect(page.getByTestId('match-report-header')).toContainText('Field 3');
    await expect(page.getByTestId('match-report-save-label')).toHaveText('Saved');
    const opened = calls_to(api, 'POST', /^\/api\/match_reports$/);
    expect(opened).toHaveLength(1);
    expect(opened[0].body).toEqual({ game_id: 'g1' });

    await assert_settled_layout_is_sound(page);
    await assert_entry_within_viewport(page);
  });

  test('every primary control is at least 72 px, every secondary one at least 56 px', async ({
    page,
  }) => {
    await open_entry(page);
    const wide = (page.viewportSize()?.width ?? 0) >= KEYPAD_WIDE_VIEWPORT_PX;

    for (const side of ['home', 'away']) {
      const group = page.getByTestId(`score-${side}`);
      await expect_size(group.getByTestId('score-stepper-plus'), `${side} plus`, 72, 72);
      await expect_size(group.getByTestId('score-stepper-minus'), `${side} minus`, 72, 72);
    }
    for (const id of ['HOME', 'AWAY', 'YELLOW', 'SECOND_YELLOW', 'RED']) {
      await expect_size(page.getByTestId(`choice-tile-${id}`), `tile ${id}`, 72);
    }
    const minute = page.getByTestId('card-minute');
    await expect_size(minute.getByTestId('score-stepper-plus'), 'minute plus', 72, 72);
    await expect_size(minute.getByTestId('score-stepper-minus'), 'minute minus', 72, 72);
    // The ui-kit keypad is 72 px on a wide screen and 64 px on a phone (see the report's ui-kit notes).
    for (const digit of '0123456789') {
      await expect_size(
        page.getByTestId(`big-numpad-key-${digit}`),
        `key ${digit}`,
        wide ? 72 : 64,
        wide ? 72 : 64,
      );
    }
    await expect_size(page.getByTestId('card-add'), 'Add card', 72);
    await expect_size(page.getByTestId('finish-open'), 'Finish report', 72);

    await expect_size(page.getByTestId('match-report-back'), 'back', 56);
    await expect_size(page.getByTestId('card-no-number'), 'No number', 56);
    await expect_size(page.getByTestId('card-clear-number'), 'Clear', 56);
    for (const value of [15, 30, 45, 60, 75, 90]) {
      await expect_size(page.getByTestId(`minute-quick-${value}`), `minute ${value}`, 56);
    }
    for (const reason of [
      'DISSENT',
      'FOUL_PLAY',
      'PERSISTENT_INFRINGEMENT',
      'UNSPORTING_BEHAVIOUR',
      'SERIOUS_FOUL_PLAY',
      'VIOLENT_CONDUCT',
    ]) {
      await expect_size(page.getByTestId(`card-reason-${reason}`), `reason ${reason}`, 56);
    }
  });

  test('the score numerals are big, tabular and right-aligned in their tiles', async ({ page }) => {
    await open_entry(page, { seed: [{ game_id: 'g1', home_score: 10, away_score: 1 }] });

    const measured = await page.evaluate(() =>
      ['home', 'away'].map((side) => {
        const tile = document.querySelector<HTMLElement>(
          `[data-testid="score-${side}"] [data-testid="score-stepper-value"]`,
        );
        const numeral = tile?.querySelector<HTMLElement>('.hch_score_stepper_value');
        const tile_box = tile?.getBoundingClientRect();
        const numeral_box = numeral?.getBoundingClientRect();
        return {
          text: numeral?.textContent?.trim(),
          gap_to_right_edge: (tile_box?.right ?? 0) - (numeral_box?.right ?? 0),
          font_size: Number.parseFloat(getComputedStyle(numeral as HTMLElement).fontSize),
          variant: getComputedStyle(numeral as HTMLElement).fontVariantNumeric,
        };
      }),
    );

    expect(measured.map((item) => item.text)).toEqual(['10', '1']);
    // "10" and "1" end at the same distance from the tile's right edge: right-aligned.
    expect(Math.abs(measured[0].gap_to_right_edge - measured[1].gap_to_right_edge)).toBeLessThan(1);
    expect(measured[0].gap_to_right_edge).toBeLessThan(30);
    for (const item of measured) {
      expect(item.font_size).toBeGreaterThanOrEqual(28);
      expect(item.variant).toContain('tabular-nums');
    }
  });

  test('score taps apply at once, are sent with a rising revision, and persist', async ({
    page,
  }) => {
    const api = await open_entry(page);
    const home = page.getByTestId('score-home').getByTestId('score-stepper-value');
    const away = page.getByTestId('score-away').getByTestId('score-stepper-value');

    await page.getByRole('button', { name: 'Add a goal for Lions' }).click();
    await page.getByRole('button', { name: 'Add a goal for Lions' }).click();
    await page.getByRole('button', { name: 'Add a goal for Tigers' }).click();
    await page.getByRole('button', { name: 'Remove a goal for Lions' }).click();

    await expect(home).toHaveText('1');
    await expect(away).toHaveText('1');
    await expect(page.getByTestId('match-report-save-label')).toHaveText('Saved');
    const sent = calls_to(api, 'PUT', /\/scores$/);
    // Taps made while one is in flight are merged, so there may be fewer calls than taps; the last one wins.
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent.length).toBeLessThanOrEqual(4);
    const revisions = sent.map((call) => Number(call.body?.['client_revision']));
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(sent.at(-1)?.body).toMatchObject({ home_score: 1, away_score: 1 });
    expect(sent.every((call) => !('notes' in (call.body ?? {})))).toBe(true);
    expect(api.reports[0]).toMatchObject({ home_score: 1, away_score: 1 });

    await page.reload();
    await expect(page.getByTestId('match-report-entry')).toBeVisible();
    await expect(home).toHaveText('1');
    await expect(away).toHaveText('1');
  });

  test('confirms a goalless result with one tap', async ({ page }) => {
    const api = await open_entry(page);

    await page.getByTestId('score-confirm-goalless').click();

    await expect(page.getByTestId('match-report-save-label')).toHaveText('Saved');
    expect(api.reports[0]).toMatchObject({ home_score: 0, away_score: 0 });
    await expect(page.getByTestId('score-confirm-goalless')).toHaveCount(0);
  });

  test('adds a card through team, card, number, minute and reason, then Undo takes it back', async ({
    page,
  }) => {
    const api = await open_entry(page);

    await page.getByTestId('choice-tile-AWAY').click();
    await page.getByTestId('choice-tile-RED').click();
    await page.getByTestId('big-numpad-key-1').click();
    await page.getByTestId('big-numpad-key-0').click();
    await expect(page.getByTestId('big-numpad-value')).toHaveText('10');
    await page.getByTestId('minute-quick-60').click();
    await page.getByTestId('card-reason-VIOLENT_CONDUCT').click();
    await assert_entry_within_viewport(page);
    await page.getByTestId('card-add').click();

    await expect.poll(() => calls_to(api, 'POST', /\/incidents$/).length).toBe(1);
    const sent = calls_to(api, 'POST', /\/incidents$/);
    expect(sent[0].path).toBe('/api/match_reports/rep-g1/incidents');
    expect(sent[0].body).toMatchObject({
      team_side: 'AWAY',
      incident_type: 'RED',
      jersey_number: 10,
      minute: 60,
      reason_code: 'VIOLENT_CONDUCT',
      notes: null,
    });
    expect(String(sent[0].body?.['idempotency_key'])).toMatch(/^[0-9a-f]{32}$/);

    // The panel is ready for the next card, and the card is listed with words and an icon.
    await expect(page.getByTestId('big-numpad-value')).toHaveText('');
    await expect(page.getByTestId('choice-tile-AWAY')).toHaveAttribute('aria-checked', 'false');
    const card = page.getByTestId('recorded-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Red card');
    await expect(card).toContainText('Tigers');
    await expect(card).toContainText('Number 10');
    await expect(card).toContainText('Minute 60');
    await expect(card).toContainText('Violent conduct');

    // Undo, offered for a few seconds, removes it again.
    await expect(page.getByText('Red card added for Tigers.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => calls_to(api, 'DELETE', /\/incidents\//).length).toBe(1);
    expect(calls_to(api, 'DELETE', /\/incidents\//)[0].path).toBe(
      '/api/match_reports/rep-g1/incidents/inc-1',
    );
    await expect(page.getByTestId('recorded-card')).toHaveCount(0);
    expect(api.reports[0].incidents).toEqual([]);
  });

  test('defaults the minute to the minutes since kick-off and offers No number', async ({
    page,
  }) => {
    const api = await open_entry(page);

    await page.getByTestId('choice-tile-HOME').click();
    await page.getByTestId('choice-tile-YELLOW').click();
    await page.getByTestId('big-numpad-key-7').click();
    await page.getByTestId('card-no-number').click();
    await expect(page.getByTestId('card-no-number')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('big-numpad-value')).toHaveText('');
    await page.getByTestId('card-add').click();

    await expect.poll(() => calls_to(api, 'POST', /\/incidents$/).length).toBe(1);
    const body = calls_to(api, 'POST', /\/incidents$/)[0].body;
    expect(body?.['jersey_number']).toBeNull();
    // The game kicked off 40 minutes before the page opened.
    expect(Number(body?.['minute'])).toBeGreaterThanOrEqual(40);
    expect(Number(body?.['minute'])).toBeLessThanOrEqual(45);
  });

  test('removes a card with one tap and no dialog; Undo adds it back as a new card with a new key', async ({
    page,
  }) => {
    const api = await open_entry(page, {
      seed: [
        {
          game_id: 'g1',
          incidents: [
            {
              incident_id: 'inc-seed',
              idempotency_key: 'seed-key-0000001',
              team_side: 'HOME',
              incident_type: 'YELLOW',
              jersey_number: 7,
              minute: 34,
              reason_code: 'DISSENT',
              notes: null,
            },
          ],
        },
      ],
    });
    const remove = page.getByTestId('recorded-card-remove');
    await expect_size(remove, 'Remove', 56);

    await remove.click();

    await expect(page.getByTestId('recorded-card')).toHaveCount(0);
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
    await expect.poll(() => calls_to(api, 'DELETE', /\/incidents\//).length).toBe(1);
    expect(calls_to(api, 'DELETE', /\/incidents\//)[0].path).toBe(
      '/api/match_reports/rep-g1/incidents/inc-seed',
    );
    await expect(page.getByText('Card removed.')).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();

    await expect.poll(() => calls_to(api, 'POST', /\/incidents$/).length).toBe(1);
    const readded = calls_to(api, 'POST', /\/incidents$/)[0].body;
    expect(readded).toMatchObject({
      team_side: 'HOME',
      incident_type: 'YELLOW',
      jersey_number: 7,
      minute: 34,
      reason_code: 'DISSENT',
    });
    expect(readded?.['idempotency_key']).not.toBe('seed-key-0000001');
    await expect(page.getByTestId('recorded-card')).toHaveCount(1);
  });

  test('finishes: blockers in words on a 422, then ready, read-only, and reopen', async ({
    page,
  }) => {
    await open_entry(page);

    await page.getByTestId('finish-open').click();
    await expect_size(page.getByTestId('finish-mark-ready'), 'Mark ready', 72);
    await page.getByTestId('finish-mark-ready').click();

    const blockers = page.getByTestId('finish-blocker');
    await expect(blockers).toHaveText([
      'Enter the final score for Lions.',
      'Enter the final score for Tigers.',
    ]);
    await expect(page.getByTestId('finish-ready-banner')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);

    // Entering a score clears the list; then it can be marked ready.
    await page.getByRole('button', { name: 'Add a goal for Lions' }).click();
    await expect(page.getByTestId('finish-blockers')).toHaveCount(0);
    await expect(page.getByTestId('match-report-save-label')).toHaveText('Saved');
    await page.getByTestId('finish-mark-ready').click();

    const banner = page.getByTestId('finish-ready-banner');
    await expect(banner).toContainText('Ready');
    await expect(banner).toContainText('Reports stay in this app for now.');
    await expect(page.getByTestId('match-report-card-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add a goal for Lions' })).toBeDisabled();
    await expect(page.getByTestId('finish-mark-ready')).toHaveCount(0);
    for (const id of ['finish-score-home', 'finish-score-away']) {
      const align = await page
        .getByTestId(id)
        .evaluate((element) => getComputedStyle(element).textAlign);
      expect(['right', 'end']).toContain(align);
    }
    await expect_size(page.getByTestId('finish-reopen'), 'Reopen to edit', 56);
    await assert_settled_layout_is_sound(page);
    await assert_entry_within_viewport(page);

    await page.getByTestId('finish-reopen').click();
    await expect(page.getByTestId('match-report-card-panel')).toBeVisible();
    await expect(page.getByTestId('finish-ready-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add a goal for Lions' })).toBeEnabled();
  });

  test('the finish summary counts the three kinds of card apart', async ({ page }) => {
    await open_entry(page, {
      seed: [
        {
          game_id: 'g1',
          home_score: 1,
          away_score: 0,
          incidents: [
            {
              incident_id: 'inc-1',
              idempotency_key: 'k1-000000000001',
              team_side: 'HOME',
              incident_type: 'YELLOW',
              jersey_number: 4,
              minute: 20,
              reason_code: null,
              notes: null,
            },
            {
              incident_id: 'inc-2',
              idempotency_key: 'k2-000000000002',
              team_side: 'HOME',
              incident_type: 'SECOND_YELLOW',
              jersey_number: 4,
              minute: 70,
              reason_code: null,
              notes: null,
            },
          ],
        },
      ],
    });

    await page.getByTestId('finish-open').click();

    await expect(page.getByTestId('finish-cards-home-yellow')).toHaveText('1');
    await expect(page.getByTestId('finish-cards-home-second-yellow')).toHaveText('1');
    await expect(page.getByTestId('finish-cards-home-red')).toHaveText('0');
    await expect(page.getByTestId('finish-cards-away-none')).toHaveText('No cards');
    await assert_settled_layout_is_sound(page);
  });

  test('shows a clear no-access state and starts no report without reports.write', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { permissions: ['games.read'] });
    await sign_in_and_open(page, '/match-reports/g1');

    await expect(page.getByTestId('match-report-no-access')).toBeVisible();
    expect(calls_to(api, 'POST', /^\/api\/match_reports$/)).toHaveLength(0);
    expect(calls_to(api, 'GET', /^\/api\/games$/)).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });

  test('says a cancelled game has no report, and offers the way back', async ({ page }) => {
    await install_api_mock(page, {
      games: [make_game('g1', 40, { status: 'CANCELLED' })],
    });
    await sign_in_and_open(page, '/match-reports/g1');

    await expect(page.getByText('This game was cancelled')).toBeVisible();
    await expect(page.getByTestId('match-report-retry')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('match-report-back').click();
    await expect(page).toHaveURL(/\/match-reports$/);
  });

  test('says a game that is not mine cannot be reported', async ({ page }) => {
    await install_api_mock(page);
    await sign_in_and_open(page, '/match-reports/not-mine');

    await expect(page.getByText('This game is not one of yours')).toBeVisible();
    await assert_settled_layout_is_sound(page);
  });
});

test.describe('match reports: with a poor signal', () => {
  test.describe.configure({ timeout: 120_000 });

  test('keeps edits made offline, says so, and sends them in order, once, when the signal returns', async ({
    page,
  }) => {
    const api = await open_entry(page);
    const requests_before = api.calls.length;

    api.network_down = true;
    await page.context().setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

    await page.getByRole('button', { name: 'Add a goal for Lions' }).click();
    await page.getByRole('button', { name: 'Add a goal for Lions' }).click();
    await page.getByTestId('choice-tile-HOME').click();
    await page.getByTestId('choice-tile-YELLOW').click();
    await page.getByTestId('big-numpad-key-9').click();
    await page.getByTestId('minute-quick-45').click();
    await page.getByTestId('card-add').click();

    await expect(page.getByTestId('match-report-save-label')).toHaveText(
      'Offline — 2 changes waiting',
    );
    await expect(page.getByTestId('score-home').getByTestId('score-stepper-value')).toHaveText('2');
    await expect(page.getByTestId('recorded-card')).toHaveCount(1);
    expect(api.calls.length).toBe(requests_before);
    await assert_settled_layout_is_sound(page);

    // Mark ready waits for the queue to empty.
    await page.getByTestId('finish-open').click();
    await expect(page.getByTestId('finish-mark-ready')).toBeDisabled();
    await expect(page.getByTestId('finish-waiting')).toContainText('2 changes are still saving');

    api.network_down = false;
    await page.context().setOffline(false);

    await expect(page.getByTestId('match-report-save-label')).toHaveText('Saved');
    await expect(page.getByTestId('finish-mark-ready')).toBeEnabled();
    const sent = api.calls.slice(requests_before).filter((call) => call.path.includes('/rep-g1/'));
    expect(sent.map((call) => `${call.method} ${call.path}`)).toEqual([
      'PUT /api/match_reports/rep-g1/scores',
      'POST /api/match_reports/rep-g1/incidents',
    ]);
    expect(sent[0].body).toMatchObject({ home_score: 2, away_score: 0 });
    expect(sent[1].body).toMatchObject({ team_side: 'HOME', jersey_number: 9, minute: 45 });
    expect(api.reports[0].incidents).toHaveLength(1);
    expect(api.reports[0]).toMatchObject({ home_score: 2, away_score: 0 });
  });

  test('keeps retrying when the device looks online but the server cannot be reached, and recovers by itself', async ({
    page,
  }) => {
    const api = await open_entry(page);

    api.network_down = true;
    await page.getByRole('button', { name: 'Add a goal for Tigers' }).click();
    await expect(page.getByTestId('match-report-save-label')).toHaveText(
      'Cannot reach the server — 1 change waiting',
    );
    await expect(page.getByTestId('score-away').getByTestId('score-stepper-value')).toHaveText('1');

    api.network_down = false;
    await expect(page.getByTestId('match-report-save-label')).toHaveText('Saved');
    expect(api.refused_count).toBeGreaterThanOrEqual(1);
    expect(api.reports[0]).toMatchObject({ home_score: 0, away_score: 1 });
    const sent = calls_to(api, 'PUT', /\/scores$/);
    expect(sent).toHaveLength(1);
  });
});
