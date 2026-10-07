import { Page, Route, expect as base_expect, test } from '@playwright/test';
import { assert_layout_is_sound } from './helpers/layout_checks';
import { SEED_USER_EMAIL, sign_in_and_open } from './helpers/sign_in';

/** The dev server compiles lazily and Firebase Auth loads on demand, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** Dates are typed and asserted in US English and UTC, whatever the machine running the suite uses. */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

/** What a tenant owner may do, as `GET /api/me` reports it. */
const OWNER_PERMISSIONS = ['games.read', 'connections.manage', 'sync.run', 'quick_links.manage'];

/** What a tenant member holds: no quick link management. */
const MEMBER_PERMISSIONS = ['games.read', 'reports.write'];

/** The secret a created link carries. Obviously fake; the page must keep it out of everything but its one dialog. */
const NEW_TOKEN = 'e2e-fake-token-never-real-0123456789';

const DAY_MS = 86_400_000;

interface IMockQuickLink {
  link_id: string;
  scope: {
    organization_ids: string[];
    levels: string[];
    date_start: number | null;
    date_end: number | null;
  };
  state: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  expires_at: number | null;
  revoked_at: number | null;
  last_viewed_at: number | null;
  view_count: number;
  created_at: number;
}

/** The in-test backend: a stateful list the mocked write endpoints mutate, and a log of what they received. */
interface IMockApi {
  links: IMockQuickLink[];
  requests: { method: string; path: string; body: unknown }[];
}

interface IMockOptions {
  permissions?: string[];
  links?: IMockQuickLink[];
  /** How many `GET /api/quick_links` calls fail with a 500 before the mock starts answering. */
  list_failures?: number;
  /** Answers `POST /api/quick_links` with this 400 body instead of creating a link. */
  create_rejection?: { path: string; message: string };
}

function make_initial_links(): IMockQuickLink[] {
  return [
    {
      link_id: 'link-1',
      scope: {
        organization_ids: [],
        levels: ['Premier', 'Select'],
        date_start: Date.UTC(2026, 9, 10),
        date_end: Date.UTC(2026, 9, 20),
      },
      state: 'ACTIVE',
      expires_at: Date.UTC(2026, 10, 5, 15, 4, 0),
      revoked_at: null,
      last_viewed_at: Date.UTC(2026, 9, 6, 9, 30, 0),
      view_count: 1234,
      created_at: Date.UTC(2026, 9, 5, 15, 4, 0),
    },
    {
      link_id: 'link-2',
      scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
      state: 'EXPIRED',
      expires_at: Date.UTC(2026, 9, 1),
      revoked_at: null,
      last_viewed_at: null,
      view_count: 7,
      created_at: Date.UTC(2026, 8, 20, 8, 0, 0),
    },
    {
      link_id: 'link-3',
      scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
      state: 'REVOKED',
      expires_at: null,
      revoked_at: Date.UTC(2026, 9, 2, 10, 0, 0),
      last_viewed_at: null,
      view_count: 0,
      created_at: Date.UTC(2026, 8, 1, 8, 0, 0),
    },
  ];
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Mocks the backend (it is not running in E2E) for this page. Only same-origin
 * `/api/**` calls are intercepted, so the Auth emulator is untouched.
 * @param page Page under test.
 * @param options Permissions, the links the backend holds and failures to simulate.
 * @returns The mock's state, to assert on.
 */
async function install_api_mock(page: Page, options: IMockOptions = {}): Promise<IMockApi> {
  const api: IMockApi = { links: options.links ?? make_initial_links(), requests: [] };
  const permissions = options.permissions ?? OWNER_PERMISSIONS;
  let list_failures_left = options.list_failures ?? 0;
  let next_id = 10;

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;
      const body: unknown = method === 'GET' ? null : request.postDataJSON();
      api.requests.push({ method, path, body });

      if (method === 'GET' && path === '/api/me') {
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
      if (method === 'GET' && path === '/api/quick_links') {
        if (list_failures_left > 0) {
          list_failures_left--;
          return json(route, 500, { code: 'INTERNAL', message: 'Boom', violations: [] });
        }
        return json(route, 200, { data: { quick_links: api.links } });
      }
      if (method === 'POST' && path === '/api/quick_links') {
        if (options.create_rejection) {
          return json(route, 400, {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            violations: [options.create_rejection],
          });
        }
        const input = body as {
          scope?: Partial<IMockQuickLink['scope']>;
          expires_at?: number | null;
        };
        const link: IMockQuickLink = {
          link_id: `link-${next_id++}`,
          scope: {
            organization_ids: [],
            levels: input.scope?.levels ?? [],
            date_start: input.scope?.date_start ?? null,
            date_end: input.scope?.date_end ?? null,
          },
          state: 'ACTIVE',
          expires_at: input.expires_at ?? null,
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
          created_at: Date.now(),
        };
        api.links.unshift(link);
        return json(route, 201, {
          data: { quick_link: link, token: NEW_TOKEN, path: `/q/${NEW_TOKEN}` },
        });
      }
      const revoke = /^\/api\/quick_links\/([^/]+)\/revoke$/.exec(path);
      if (method === 'POST' && revoke) {
        const link = api.links.find((candidate) => candidate.link_id === revoke[1]);
        if (!link) {
          return json(route, 404, { code: 'NOT_FOUND', message: 'Not found', violations: [] });
        }
        link.state = 'REVOKED';
        link.revoked_at = Date.now();
        return json(route, 200, { data: { quick_link: link } });
      }
      return json(route, 404, { code: 'NOT_FOUND', message: 'Not found', violations: [] });
    },
  );
  return api;
}

/** Lets dialog open animations finish: the layout checks measure scaled boxes while one is running. */
async function wait_for_animations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

/** Layout checks for the page itself, once any animation has finished and from the top, as a user first sees it. */
async function assert_settled_layout_is_sound(page: Page): Promise<void> {
  await wait_for_animations(page);
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll('*'))) element.scrollTop = 0;
  });
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

async function open_quick_links(page: Page): Promise<void> {
  await sign_in_and_open(page, '/quick-links');
}

test.describe('quick links page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('lists links with state text, scope, dates and right-aligned view counts', async ({
    page,
  }) => {
    await install_api_mock(page);
    await open_quick_links(page);

    await expect(page.getByTestId('quick-links-count')).toHaveText('3 quick links');
    await expect(page.getByTestId('quick-link-state-link-1')).toContainText('Active');
    await expect(page.getByTestId('quick-link-state-link-2')).toContainText('Expired');
    await expect(page.getByTestId('quick-link-state-link-3')).toContainText('Revoked');
    await expect(page.getByTestId('quick-link-scope-link-1')).toContainText(
      'Levels: Premier, Select',
    );
    await expect(page.getByTestId('quick-link-scope-link-1')).toContainText(
      'Oct 10, 2026 to Oct 20, 2026',
    );
    await expect(page.getByTestId('quick-link-scope-link-2')).toContainText('All levels');
    await expect(page.getByTestId('quick-link-expires-link-1')).toContainText('2026');
    await expect(page.getByTestId('quick-link-expires-link-3')).toHaveText('Never');
    await expect(page.getByTestId('quick-link-last-viewed-link-2')).toHaveText('Never');
    await expect(page.getByTestId('quick-link-views-link-1')).toHaveText('1,234');
    await expect(page.getByTestId('quick-link-revoked-link-3')).toContainText('2026');

    // Numbers are right-aligned with tabular figures, and only a link that still works can be revoked.
    const style = await page.getByTestId('quick-link-views-link-1').evaluate((element) => {
      const computed = getComputedStyle(element);
      return { align: computed.textAlign, numeric: computed.fontVariantNumeric };
    });
    expect(['right', 'end']).toContain(style.align);
    expect(style.numeric).toContain('tabular-nums');
    await expect(page.getByTestId('quick-link-revoke-link-1')).toBeVisible();
    await expect(page.getByTestId('quick-link-revoke-link-2')).toHaveCount(0);
    await expect(page.getByTestId('quick-link-revoke-link-3')).toHaveCount(0);

    await assert_settled_layout_is_sound(page);
  });

  test('creates a link: the dialog is sound, the URL is shown once, copy works, and it is gone after Done', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    const api = await install_api_mock(page);
    await open_quick_links(page);
    await expect(page.getByTestId('quick-link-card-link-1')).toBeVisible();

    await page.getByTestId('quick-links-create').click();
    await expect(page.getByTestId('create-link-expiry')).toBeVisible();
    await expect(page.getByTestId('create-link-expiry')).toContainText('In 30 days');
    await assert_dialog_layout_is_sound(page);

    const levels = page.getByTestId('create-link-levels').locator('input');
    await levels.fill('Premier');
    await levels.press('Enter');
    await levels.fill('Select');
    await levels.press('Enter');
    await page.getByTestId('create-link-date-start').fill('10/10/2026');
    await page.getByTestId('create-link-date-end').fill('10/20/2026');
    await page.getByTestId('create-link-date-end').press('Tab');
    await assert_dialog_layout_is_sound(page);

    const before = Date.now();
    await page.getByTestId('create-link-submit').click();

    // The one-time panel: the absolute URL, a clear warning, and no way to dismiss it by accident.
    const url_field = page.getByTestId('quick-link-created-url');
    await expect(url_field).toBeVisible();
    const origin = new URL(page.url()).origin;
    await expect(url_field).toHaveValue(`${origin}/q/${NEW_TOKEN}`);
    await expect(page.getByTestId('quick-link-created-warning')).toContainText(
      'It will not be shown again.',
    );
    await assert_dialog_layout_is_sound(page);
    await page.keyboard.press('Escape');
    await expect(url_field).toBeVisible();

    const [create] = requests_to(api, 'POST', /^\/api\/quick_links$/);
    const body = create.body as {
      scope: { levels: string[]; date_start: number; date_end: number };
      expires_at: number;
    };
    expect(body.scope).toEqual({
      levels: ['Premier', 'Select'],
      date_start: Date.UTC(2026, 9, 10),
      date_end: Date.UTC(2026, 9, 20),
    });
    expect(body.expires_at).toBeGreaterThan(before + 30 * DAY_MS - 60_000);
    expect(body.expires_at).toBeLessThan(Date.now() + 30 * DAY_MS + 60_000);

    await page.getByTestId('quick-link-created-copy').click();
    await expect(page.getByTestId('quick-link-copy-status')).toContainText(
      /Link copied to the clipboard\.|Could not copy automatically/,
    );
    if (browserName === 'chromium') {
      await expect(page.getByTestId('quick-link-copy-status')).toContainText('Link copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `${origin}/q/${NEW_TOKEN}`,
      );
    }

    await page.getByTestId('quick-link-created-done').click();
    await expect(page.getByText('Quick link created.')).toBeVisible();
    await expect(page.locator('[data-testid^="quick-link-card-"]')).toHaveCount(4);

    // The secret lives only in that dialog: nothing left on the page, in the address bar or in storage.
    expect(await page.content()).not.toContain(NEW_TOKEN);
    expect(page.url()).not.toContain(NEW_TOKEN);
    expect(
      await page.evaluate(() =>
        JSON.stringify([localStorage, sessionStorage].map((s) => ({ ...s }))),
      ),
    ).not.toContain(NEW_TOKEN);
  });

  test('sends "never expires" explicitly when that is chosen, with no scope for an unrestricted link', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_quick_links(page);

    await page.getByTestId('quick-links-create').click();
    await page.getByTestId('create-link-expiry').click();
    await page.getByRole('option', { name: 'Never expires' }).click();
    await page.getByTestId('create-link-submit').click();
    await expect(page.getByTestId('quick-link-created-url')).toBeVisible();

    expect(requests_to(api, 'POST', /^\/api\/quick_links$/)[0].body).toEqual({ expires_at: null });
  });

  test('shows a last date before the first date inline and does not call the API', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_quick_links(page);

    await page.getByTestId('quick-links-create').click();
    await page.getByTestId('create-link-date-start').fill('10/20/2026');
    await page.getByTestId('create-link-date-end').fill('10/10/2026');
    await page.getByTestId('create-link-submit').click();

    await expect(page.getByText('The last date cannot be before the first date.')).toBeVisible();
    expect(requests_to(api, 'POST', /^\/api\/quick_links$/)).toHaveLength(0);
    await assert_dialog_layout_is_sound(page);
  });

  test('shows a server validation error under its field and keeps the dialog open', async ({
    page,
  }) => {
    await install_api_mock(page, {
      create_rejection: { path: 'scope.levels', message: 'Use at most 10 levels' },
    });
    await open_quick_links(page);

    await page.getByTestId('quick-links-create').click();
    const levels = page.getByTestId('create-link-levels').locator('input');
    await levels.fill('Premier');
    await levels.press('Enter');
    await page.getByTestId('create-link-submit').click();

    await expect(page.getByTestId('create-link-levels-error')).toContainText(
      'Use at most 10 levels',
    );
    await expect(page.getByTestId('create-link-submit')).toBeEnabled();
    await assert_dialog_layout_is_sound(page);
  });

  test('asks before revoking: cancel keeps the link, confirm revokes it', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_quick_links(page);
    await expect(page.getByTestId('quick-link-state-link-1')).toContainText('Active');

    await page.getByTestId('quick-link-revoke-link-1').click();
    const message = page.getByTestId('confirmation-dialog-message');
    await expect(message).toContainText('Quick link created');
    await expect(message).toContainText('Levels: Premier, Select');
    await page.getByTestId('confirmation-dialog-cancel').click();
    await expect(message).toHaveCount(0);
    await expect(page.getByTestId('quick-link-state-link-1')).toContainText('Active');
    expect(requests_to(api, 'POST', /\/revoke$/)).toHaveLength(0);

    await page.getByTestId('quick-link-revoke-link-1').click();
    await page.getByTestId('confirmation-dialog-confirm').click();

    await expect(page.getByText('Revoked "Quick link created')).toBeVisible();
    await expect(page.getByTestId('quick-link-state-link-1')).toContainText('Revoked');
    await expect(page.getByTestId('quick-link-revoke-link-1')).toHaveCount(0);
    expect(requests_to(api, 'POST', /\/api\/quick_links\/link-1\/revoke$/)).toHaveLength(1);
  });

  test('shows a clear no-access state, and asks for no links, without quick_links.manage', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { permissions: MEMBER_PERMISSIONS });
    await open_quick_links(page);

    await expect(page.getByTestId('quick-links-no-access')).toContainText(
      'You do not have access to quick links',
    );
    await expect(page.getByTestId('quick-links-create')).toHaveCount(0);
    expect(requests_to(api, 'GET', /^\/api\/quick_links$/)).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });

  test('invites the first link when there are none, and the invitation opens the dialog', async ({
    page,
  }) => {
    await install_api_mock(page, { links: [] });
    await open_quick_links(page);

    await expect(page.getByText('No quick links yet')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('quick-links-empty-create').click();

    await expect(page.getByTestId('create-link-submit')).toBeVisible();
  });

  test('shows an error with a retry, then the links', async ({ page }) => {
    const api = await install_api_mock(page, { list_failures: 1 });
    await open_quick_links(page);

    await expect(page.getByText('Quick links could not be loaded')).toBeVisible();
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('quick-links-retry').click();

    await expect(page.getByTestId('quick-links-count')).toHaveText('3 quick links');
    expect(requests_to(api, 'GET', /^\/api\/quick_links$/)).toHaveLength(2);
  });
});
