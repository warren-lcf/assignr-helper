import { Page, expect as base_expect } from '@playwright/test';
import { read_seed_users } from '../../scripts/seed_auth_user.cjs';

const seed_user = read_seed_users()[0];

/** The dev server compiles lazily and Firebase Auth loads on demand, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** The seeded emulator user's email, for mocks that echo it back. */
export const SEED_USER_EMAIL: string = seed_user.email;

/**
 * Signs in with the seeded emulator user by opening a guarded path and using
 * the login page it redirects to, then waits for that path to load.
 * @param page Page under test.
 * @param path Guarded path to land on, such as `/quick-links`.
 * @returns Resolves when the path has loaded signed in.
 */
export async function sign_in_and_open(page: Page, path: string): Promise<void> {
  const escaped = path.replace(/[/]/g, '\\/');
  const landed = new RegExp(`${escaped}$`);
  const redirected = new RegExp(`\\/login\\?return_url=${encodeURIComponent(path)}$`);
  // Firebase Auth loads lazily and the route guard waits for it; a cold or busy machine can leave the first load hanging, so reload.
  await expect(async () => {
    await page.goto(path);
    await expect(page).toHaveURL(redirected, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  // The form can still be initialising when the first keystrokes land and wipe them, leaving the button disabled, so retry the whole sign-in.
  let attempts = 0;
  await expect(async () => {
    if (!landed.test(page.url())) {
      // A form that stayed disabled after the first attempt is stuck; start it afresh.
      if (attempts++ > 0) await page.reload();
      await page.getByTestId('credentials-form-email').fill(seed_user.email);
      await page.getByTestId('credentials-form-password').fill(seed_user.password);
      await page.getByTestId('credentials-form-submit').click({ timeout: 5000 });
    }
    await expect(page).toHaveURL(landed, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  // The shell reuses one scrolling container across routes, so on a short (landscape phone) screen the sign-in
  // form's scroll offset carries over to the new page. Start from the top, as a user opening the page would.
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll('*'))) element.scrollTop = 0;
  });
}
