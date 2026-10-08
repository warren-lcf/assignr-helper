import { Page, expect as base_expect, test } from '@playwright/test';
import { assert_settled_layout_is_sound, json } from './helpers/settled_layout';
import { SEED_USER_EMAIL, sign_in_and_open } from './helpers/sign_in';

/** The dev server compiles lazily, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** The secrets that open the mocked links. Obviously fake. */
const TOKEN = 'e2e-unsub-token-0123456789';
const USED_TOKEN = 'e2e-unsub-used-0123456789';
const DEAD_TOKEN = 'e2e-unsub-dead-0123456789';

const MASKED = 'a***@example.test';

/** What the next calls do, in order: a failure, or null for a normal answer. After the list, calls answer normally. */
type Failure = 404 | 429 | 500 | 'abort' | null;

interface IMockOptions {
  get_failures?: Failure[];
  post_failures?: Failure[];
  /** How long the unsubscribe takes, so a double click has something to hit. */
  post_delay_ms?: number;
}

/** The in-test backend: what it was asked, and with which headers. */
interface IMockApi {
  gets: { token: string; headers: Record<string, string> }[];
  posts: { token: string; headers: Record<string, string> }[];
  all_api_headers: { path: string; headers: Record<string, string> }[];
}

function fail(route: Parameters<typeof json>[0], failure: Failure) {
  if (failure === 'abort') return route.abort('failed');
  if (failure === 404) return json(route, 404, { code: 'NOT_FOUND', message: 'Not found' });
  if (failure === 429) {
    return json(route, 429, { code: 'RATE_LIMITED', message: 'Slow down' }, { 'retry-after': '1' });
  }
  return json(route, 500, { code: 'INTERNAL', message: 'Boom' });
}

/**
 * Mocks the backend (it is not running in E2E) for the public unsubscribe
 * endpoints. Only same-origin `/api/**` calls are intercepted, so the Auth
 * emulator is untouched.
 * @param page Page under test.
 * @param options Failures to simulate.
 * @returns A log of what the page asked for.
 */
async function install_api_mock(page: Page, options: IMockOptions = {}): Promise<IMockApi> {
  const api: IMockApi = { gets: [], posts: [], all_api_headers: [] };
  const get_failures = [...(options.get_failures ?? [])];
  const post_failures = [...(options.post_failures ?? [])];
  const unsubscribed = new Set<string>([USED_TOKEN]);

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
        return json(route, 200, { data: { locations: [], total: 0, truncated: false } });
      }
      const match = /^\/api\/public\/unsubscribe\/([^/]+)$/.exec(url.pathname);
      if (!match) return json(route, 404, { code: 'NOT_FOUND', message: 'Not found' });
      const token = decodeURIComponent(match[1]);
      const method = request.method();
      const log = { token, headers: request.headers() };

      // Unknown, expired and malformed tokens all look the same, and carry no violations.
      if (token !== TOKEN && token !== USED_TOKEN) {
        (method === 'GET' ? api.gets : api.posts).push(log);
        return json(route, 404, { code: 'NOT_FOUND', message: 'Not found' });
      }
      if (method === 'GET') {
        api.gets.push(log);
        const failure = get_failures.shift();
        if (failure) return fail(route, failure);
        return json(route, 200, {
          data: { email_masked: MASKED, already_unsubscribed: unsubscribed.has(token) },
        });
      }
      api.posts.push(log);
      if (options.post_delay_ms) await new Promise((r) => setTimeout(r, options.post_delay_ms));
      const failure = post_failures.shift();
      if (failure) return fail(route, failure);
      unsubscribed.add(token);
      return json(route, 200, { data: { unsubscribed: true } });
    },
  );
  return api;
}

async function open_unsubscribe(page: Page, token: string = TOKEN): Promise<void> {
  await page.goto(`/unsubscribe/${token}`);
}

test.describe('public unsubscribe page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('shows the masked address and one button, changes nothing until the button is pressed, and has no app chrome', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_unsubscribe(page);

    await expect(page.getByTestId('unsubscribe-question')).toContainText(MASKED);
    await expect(page.getByTestId('unsubscribe-submit')).toHaveText('Unsubscribe');
    await expect(page).toHaveTitle('Unsubscribe');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.locator('hch-sidebar, hch-app-header')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);

    // Reading the link is a GET with no side effects; nothing was unsubscribed by opening it.
    expect(api.gets).toHaveLength(1);
    expect(api.posts).toHaveLength(0);
    // A signed-out visitor sends no Authorization header, to the API or anywhere.
    for (const { headers } of api.all_api_headers) expect(headers['authorization']).toBeUndefined();
  });

  test('unsubscribes once on the click, however fast the button is pressed, and says so', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { post_delay_ms: 600 });
    await open_unsubscribe(page);

    await page.getByTestId('unsubscribe-submit').dblclick();

    await expect(page.getByTestId('unsubscribe-done')).toContainText('You have been unsubscribed');
    await expect(page.getByTestId('unsubscribe-done')).toContainText(
      `${MASKED} will not receive these emails any more.`,
    );
    await expect(page.getByTestId('unsubscribe-submit')).toHaveCount(0);
    expect(api.posts).toHaveLength(1);
    expect(api.posts[0].headers['authorization']).toBeUndefined();
    await assert_settled_layout_is_sound(page);
  });

  test('says so, with no button, when the address is already unsubscribed', async ({ page }) => {
    const api = await install_api_mock(page);
    await open_unsubscribe(page, USED_TOKEN);

    await expect(page.getByTestId('unsubscribe-already')).toContainText(
      'You are already unsubscribed',
    );
    await expect(page.getByTestId('unsubscribe-submit')).toHaveCount(0);
    expect(api.posts).toHaveLength(0);
    await assert_settled_layout_is_sound(page);
  });

  test('shows the same calm page for any link that is not valid, with no button and no hint why', async ({
    page,
  }) => {
    const api = await install_api_mock(page);
    await open_unsubscribe(page, DEAD_TOKEN);

    await expect(page.getByTestId('unsubscribe-not-valid')).toContainText('This link is not valid');
    await expect(page.getByTestId('unsubscribe-submit')).toHaveCount(0);
    expect(api.posts).toHaveLength(0);
    // Nothing about the address, and no word that tells an expired link from an unknown one.
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('example.test');
    expect(text.toLowerCase()).not.toContain('expired');
    await assert_settled_layout_is_sound(page);
  });

  test('switches to the not-valid page when the link turns out dead on the click', async ({
    page,
  }) => {
    await install_api_mock(page, { post_failures: [404] });
    await open_unsubscribe(page);

    await page.getByTestId('unsubscribe-submit').click();

    await expect(page.getByTestId('unsubscribe-not-valid')).toBeVisible();
    await expect(page.getByTestId('unsubscribe-submit')).toHaveCount(0);
  });

  test('is friendly about too many requests, and Try again reads the link afresh', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { get_failures: [429] });
    await open_unsubscribe(page);

    await expect(page.getByTestId('unsubscribe-error')).toContainText('Too many requests');
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('unsubscribe-retry').click();

    await expect(page.getByTestId('unsubscribe-question')).toContainText(MASKED);
    expect(api.gets).toHaveLength(2);
  });

  test('keeps the button and explains when the click itself is rate limited, then works on the next try', async ({
    page,
  }) => {
    const api = await install_api_mock(page, { post_failures: [429] });
    await open_unsubscribe(page);

    await page.getByTestId('unsubscribe-submit').click();
    await expect(page.getByTestId('unsubscribe-submit-error')).toContainText('Too many requests');
    await expect(page.getByTestId('unsubscribe-submit')).toBeEnabled();
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('unsubscribe-submit').click();
    await expect(page.getByTestId('unsubscribe-done')).toBeVisible();
    expect(api.posts).toHaveLength(2);
  });

  test('offers Try again after a network or server failure', async ({ page }) => {
    await install_api_mock(page, { get_failures: ['abort', 500] });
    await open_unsubscribe(page);

    await expect(page.getByTestId('unsubscribe-error')).toContainText('Something went wrong');
    await page.getByTestId('unsubscribe-retry').click();
    await expect(page.getByTestId('unsubscribe-error')).toBeVisible();
    await page.getByTestId('unsubscribe-retry').click();
    await expect(page.getByTestId('unsubscribe-question')).toContainText(MASKED);
  });

  test('never writes the link secret to the console', async ({ page }) => {
    const logged: string[] = [];
    page.on('console', (message) => logged.push(message.text()));
    await install_api_mock(page, { get_failures: [500], post_failures: [500, 404] });
    await open_unsubscribe(page);

    await expect(page.getByTestId('unsubscribe-error')).toBeVisible();
    await page.getByTestId('unsubscribe-retry').click();
    await page.getByTestId('unsubscribe-submit').click();
    await expect(page.getByTestId('unsubscribe-submit-error')).toBeVisible();
    await page.getByTestId('unsubscribe-submit').click();
    await expect(page.getByTestId('unsubscribe-not-valid')).toBeVisible();

    expect(logged.some((line) => line.includes('Could not'))).toBe(true);
    for (const line of logged) expect(line).not.toContain(TOKEN);
  });

  test('sends no Authorization header from a signed-in browser either', async ({ page }) => {
    const api = await install_api_mock(page);
    await sign_in_and_open(page, '/games');
    // The app does attach the token to its own calls...
    await expect
      .poll(() => api.all_api_headers.some((entry) => entry.headers['authorization']))
      .toBe(true);

    await open_unsubscribe(page);
    await expect(page.getByTestId('unsubscribe-question')).toContainText(MASKED);
    await page.getByTestId('unsubscribe-submit').click();
    await expect(page.getByTestId('unsubscribe-done')).toBeVisible();

    // ...but never to the public endpoint.
    expect(api.gets.length + api.posts.length).toBeGreaterThan(1);
    for (const call of [...api.gets, ...api.posts]) {
      expect(call.headers['authorization']).toBeUndefined();
    }
    await expect(page.locator('hch-sidebar, hch-app-header')).toHaveCount(0);
  });
});
