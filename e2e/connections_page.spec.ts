import { Page, Route, expect as base_expect, test } from '@playwright/test';
import { read_seed_users } from '../scripts/seed_auth_user.cjs';
import { assert_layout_is_sound } from './helpers/layout_checks';

const seed_user = read_seed_users()[0];

/** The dev server compiles lazily and Firebase Auth loads on demand, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** What a tenant owner may do, as `GET /api/me` reports it. */
const OWNER_PERMISSIONS = [
  'connections.manage',
  'games.read',
  'reports.write',
  'sync.run',
  'email.send',
  'quick_links.manage',
  'games.respond',
];

/** What a referee who may only look holds. */
const REFEREE_PERMISSIONS = ['games.read', 'games.respond', 'reports.write'];

const SECRET_TO_REJECT = 'bad-secret';
const NEW_SECRET = 'a-brand-new-secret-value';

interface IMockConnection {
  connection_id: string;
  provider: 'ASSIGNR';
  status: 'CONNECTED' | 'NEEDS_ATTENTION' | 'DISCONNECTED';
  account_label: string | null;
  last_sync_at: number | null;
  last_error: string | null;
}

/** The in-test backend: a stateful list the mocked write endpoints mutate, and a log of what they received. */
interface IMockApi {
  connections: IMockConnection[];
  requests: { method: string; path: string; body: unknown }[];
}

function make_initial_connections(): IMockConnection[] {
  return [
    {
      connection_id: 'conn-1',
      provider: 'ASSIGNR',
      status: 'CONNECTED',
      account_label: 'Metro Youth Soccer Assignor',
      last_sync_at: 1_786_234_975_000,
      last_error: null,
    },
    {
      connection_id: 'conn-2',
      provider: 'ASSIGNR',
      status: 'NEEDS_ATTENTION',
      account_label: 'County Rec League',
      last_sync_at: null,
      last_error: 'The provider rejected the stored credentials.',
    },
  ];
}

function make_run(kind: string, started_at: number) {
  return {
    run_id: `run-${kind}-${started_at}`,
    connection_id: 'conn-1',
    kind,
    status: 'SUCCEEDED',
    window_start: null,
    window_end: null,
    started_at,
    finished_at: started_at + 1200,
    duration_ms: 1200,
    seen_count: 1234,
    created_count: 12,
    updated_count: 3,
    removed_count: 1,
    error: null,
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function api_error(route: Route, status: number, code: string, message: string): Promise<void> {
  return json(route, status, { code, message, violations: [] });
}

/**
 * Mocks the backend (it is not running in E2E) for this page. Only same-origin
 * `/api/**` calls are intercepted, so the Auth emulator is untouched.
 * @param page Page under test.
 * @param options Permissions the user holds and the starting connections.
 * @returns The mock's state, to assert on.
 */
async function install_api_mock(
  page: Page,
  options: { permissions?: string[]; connections?: IMockConnection[] } = {},
): Promise<IMockApi> {
  const api: IMockApi = {
    connections: options.connections ?? make_initial_connections(),
    requests: [],
  };
  const permissions = options.permissions ?? OWNER_PERMISSIONS;
  let next_id = 10;

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const path = url.pathname;
      const body: unknown = method === 'GET' ? null : request.postDataJSON();
      api.requests.push({ method, path, body });
      const find = (connection_id: string) =>
        api.connections.find((connection) => connection.connection_id === connection_id);

      if (method === 'GET' && path === '/api/me') {
        return json(route, 200, {
          data: {
            uid: 'u1',
            email: seed_user.email,
            tenant_id: 'tenant-1',
            role: 'TENANT_OWNER',
            actual_tenant_id: 'tenant-1',
            actual_role: 'TENANT_OWNER',
            permissions,
          },
        });
      }
      if (method === 'GET' && path === '/api/connections') {
        return json(route, 200, { data: { connections: api.connections } });
      }
      if (method === 'POST' && path === '/api/connections') {
        const { client_secret } = body as { client_secret: string };
        if (client_secret === SECRET_TO_REJECT) {
          return api_error(
            route,
            422,
            'CREDENTIALS_REJECTED',
            'The provider did not accept these credentials',
          );
        }
        const connection: IMockConnection = {
          connection_id: `conn-${next_id++}`,
          provider: 'ASSIGNR',
          status: 'CONNECTED',
          account_label: 'Lakeside Futsal Assignor',
          last_sync_at: null,
          last_error: null,
        };
        api.connections.push(connection);
        return json(route, 201, { data: { connection } });
      }

      const match =
        /^\/api\/connections\/([^/]+)\/(credentials|test|disconnect|sync|sync-runs)$/.exec(path);
      const connection = match ? find(decodeURIComponent(match[1])) : undefined;
      if (!match || !connection) return api_error(route, 404, 'NOT_FOUND', 'Not found');

      switch (`${method} ${match[2]}`) {
        case 'PUT credentials':
          connection.status = 'CONNECTED';
          connection.last_error = null;
          return json(route, 200, { data: { connection } });
        case 'POST test':
          return json(route, 200, { data: { ok: true, failure: null } });
        case 'POST disconnect':
          connection.status = 'DISCONNECTED';
          return json(route, 200, { data: { connection } });
        case 'POST sync':
          connection.last_sync_at = 1_786_321_375_000;
          return json(route, 200, { data: { runs: [make_run('OPEN_GAMES', 1_786_321_375_000)] } });
        case 'GET sync-runs':
          return json(route, 200, {
            data: {
              runs: [
                make_run('OPEN_GAMES', 1_786_234_975_000),
                make_run('MY_GAMES', 1_786_234_970_000),
              ],
            },
          });
        default:
          return api_error(route, 404, 'NOT_FOUND', 'Not found');
      }
    },
  );
  return api;
}

/** Signs in with the seeded user and lands on the Connections page. */
async function open_connections(page: Page): Promise<void> {
  // Firebase Auth loads lazily and the route guard waits for it; a cold or busy machine can leave the first load hanging, so reload.
  await expect(async () => {
    await page.goto('/connections');
    await expect(page).toHaveURL(/\/login\?return_url=%2Fconnections$/, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  // The form can still be initialising when the first keystrokes land and wipe them, leaving the button disabled, so retry the whole sign-in.
  await expect(async () => {
    if (!/\/connections$/.test(page.url())) {
      await page.getByTestId('credentials-form-email').fill(seed_user.email);
      await page.getByTestId('credentials-form-password').fill(seed_user.password);
      await page.getByTestId('credentials-form-submit').click({ timeout: 5000 });
    }
    await expect(page).toHaveURL(/\/connections$/, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
}

/** Lets dialog open animations finish: the layout checks measure scaled boxes while one is running. */
async function wait_for_animations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

/** Layout checks for the page itself, once any open animation has finished. */
async function assert_settled_layout_is_sound(page: Page): Promise<void> {
  await wait_for_animations(page);
  await assert_layout_is_sound(page);
}

/**
 * Layout checks for an open dialog. The shared checks look at every control in
 * the document, and a modal always sits on top of the page behind it, so the
 * page is taken out of the layout for the length of the check: what is left is
 * the dialog and its overlay.
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

function requests_to(api: IMockApi, method: string, path: RegExp) {
  return api.requests.filter((request) => request.method === method && path.test(request.path));
}

test.describe('connections page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('lists connections with status text, last error and the sync history', async ({ page }) => {
    await install_api_mock(page);
    await open_connections(page);

    await expect(page.getByTestId('connection-card-conn-1')).toContainText(
      'Metro Youth Soccer Assignor',
    );
    await expect(page.getByTestId('connection-card-conn-2')).toContainText('County Rec League');
    await expect(page.getByTestId('connection-status-conn-1')).toContainText('Connected');
    await expect(page.getByTestId('connection-status-conn-2')).toContainText('Needs attention');
    await expect(page.getByTestId('connection-error-conn-2')).toContainText(
      'The provider rejected the stored credentials.',
    );
    await expect(page.getByTestId('connection-last-synced-conn-2')).toContainText('Never');
    await expect(page.getByTestId('sync-history')).toContainText('Open games');
    await expect(page.getByTestId('sync-history')).toContainText('Succeeded');
    await expect(page.getByTestId('sync-history')).toContainText('1,234');

    await assert_settled_layout_is_sound(page);
  });

  test('adds a connection: layout is sound with the dialog open, then the list refreshes', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_connections(page);
    await expect(page.getByTestId('connection-card-conn-1')).toBeVisible();

    await page.getByTestId('connections-add').click();
    await expect(page.getByTestId('add-connection-client-id')).toBeVisible();
    await assert_dialog_layout_is_sound(page);

    await page.getByTestId('add-connection-client-id').fill('my-client-id');
    await page.getByTestId('add-connection-client-secret').fill(NEW_SECRET);
    await expect(page.getByTestId('add-connection-client-secret')).toHaveAttribute(
      'type',
      'password',
    );
    await page.getByTestId('add-connection-submit').click();

    await expect(page.getByText('Connected Lakeside Futsal Assignor.')).toBeVisible();
    await expect(page.getByTestId('add-connection-submit')).toHaveCount(0);
    await expect(page.getByTestId('connection-card-conn-10')).toContainText(
      'Lakeside Futsal Assignor',
    );
    expect(requests_to(api, 'POST', /^\/api\/connections$/)[0].body).toEqual({
      provider: 'ASSIGNR',
      client_id: 'my-client-id',
      client_secret: NEW_SECRET,
    });
    expect(await page.content()).not.toContain(NEW_SECRET);
  });

  test('shows required errors inline and does not call the API for an empty form', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_connections(page);

    await page.getByTestId('connections-add').click();
    await page.getByTestId('add-connection-submit').click();

    await expect(page.getByText('Enter the client ID.')).toBeVisible();
    await expect(page.getByText('Enter the client secret.')).toBeVisible();
    expect(requests_to(api, 'POST', /^\/api\/connections$/)).toHaveLength(0);
    await assert_dialog_layout_is_sound(page);
  });

  test('shows rejected credentials inline under the secret and keeps the dialog open', async ({
    page,
  }) => {
    await install_api_mock(page);
    await open_connections(page);

    await page.getByTestId('connections-add').click();
    await page.getByTestId('add-connection-client-id').fill('my-client-id');
    await page.getByTestId('add-connection-client-secret').fill(SECRET_TO_REJECT);
    await page.getByTestId('add-connection-submit').click();

    await expect(page.getByText('The provider did not accept these credentials')).toBeVisible();
    await expect(page.getByTestId('add-connection-submit')).toBeEnabled();
    await assert_dialog_layout_is_sound(page);
  });

  test('replaces credentials through the write-only secret form', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_connections(page);
    await expect(page.getByTestId('connection-status-conn-2')).toContainText('Needs attention');

    await page.getByTestId('connection-replace-conn-2').click();
    await expect(page.getByTestId('secret-entry-form-replace-client_secret')).toBeVisible();
    await expect(page.getByTestId('secret-entry-form-input-client_secret')).toHaveCount(0);
    await assert_dialog_layout_is_sound(page);

    await page.getByTestId('secret-entry-form-replace-client_secret').click();
    await page.getByTestId('secret-entry-form-input-client_secret').fill(NEW_SECRET);
    await assert_dialog_layout_is_sound(page);
    await page.getByTestId('secret-entry-form-save-client_secret').click();

    await expect(page.getByText('Replaced the credentials for County Rec League.')).toBeVisible();
    await expect(page.getByTestId('connection-status-conn-2')).toContainText('Connected');
    await expect(page.getByTestId('connection-error-conn-2')).toHaveCount(0);
    expect(requests_to(api, 'PUT', /\/api\/connections\/conn-2\/credentials$/)[0].body).toEqual({
      client_secret: NEW_SECRET,
    });
    expect(await page.content()).not.toContain(NEW_SECRET);
  });

  test('asks before disconnecting: cancel keeps it, confirm disconnects', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_connections(page);
    await expect(page.getByTestId('connection-status-conn-1')).toContainText('Connected');

    await page.getByTestId('connection-disconnect-conn-1').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toContainText(
      '"Metro Youth Soccer Assignor"',
    );
    await page.getByTestId('confirmation-dialog-cancel').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toHaveCount(0);
    await expect(page.getByTestId('connection-status-conn-1')).toContainText('Connected');
    expect(requests_to(api, 'POST', /\/disconnect$/)).toHaveLength(0);

    await page.getByTestId('connection-disconnect-conn-1').click();
    await page.getByTestId('confirmation-dialog-confirm').click();

    await expect(page.getByText('Disconnected Metro Youth Soccer Assignor.')).toBeVisible();
    await expect(page.getByTestId('connection-status-conn-1')).toContainText('Disconnected');
    expect(requests_to(api, 'POST', /\/disconnect$/)).toHaveLength(1);
  });

  test('syncs now and reports the result in a toast', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_connections(page);

    await page.getByTestId('connection-sync-conn-1').click();

    await expect(page.getByText('Synced Metro Youth Soccer Assignor.')).toBeVisible();
    expect(requests_to(api, 'POST', /\/connections\/conn-1\/sync$/)).toHaveLength(1);
  });

  test('tests a connection and reports the result in a toast', async ({ page }) => {
    await install_api_mock(page);
    await open_connections(page);

    await page.getByTestId('connection-test-conn-1').click();

    await expect(
      page.getByText('The connection to Metro Youth Soccer Assignor works.'),
    ).toBeVisible();
  });

  test('is read-only for a user without connections.manage or sync.run', async ({ page }) => {
    await install_api_mock(page, { permissions: REFEREE_PERMISSIONS });
    await open_connections(page);

    await expect(page.getByTestId('connection-card-conn-1')).toBeVisible();
    await expect(page.getByTestId('connection-card-conn-2')).toBeVisible();
    await expect(page.getByTestId('connections-add')).toHaveCount(0);
    await expect(page.locator('[data-testid^="connection-sync-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="connection-test-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="connection-replace-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="connection-disconnect-"]')).toHaveCount(0);
    await expect(page.locator('app-connection-card button')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);
  });

  test('invites the first connection when there are none', async ({ page }) => {
    await install_api_mock(page, { connections: [] });
    await open_connections(page);

    await expect(page.getByText('Connect your first assignor')).toBeVisible();
    await page.getByTestId('connections-empty-add').click();
    await expect(page.getByTestId('add-connection-client-id')).toBeVisible();
    await assert_dialog_layout_is_sound(page);
  });
});
