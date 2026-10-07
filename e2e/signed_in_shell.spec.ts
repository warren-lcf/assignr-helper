import { expect, test } from '@playwright/test';
import { read_seed_users } from '../scripts/seed_auth_user.cjs';
import { assert_layout_is_sound } from './helpers/layout_checks';

/** Below this width the sidebar collapses behind the hamburger button. */
const MOBILE_BREAKPOINT_PX = 768;

const seed_user = read_seed_users()[0];

test.describe('signed-in referee', () => {
  test('signs in, lands on the requested page inside the shell, and signs out', async ({
    page,
  }) => {
    await page.goto('/match-reports');
    await expect(page).toHaveURL(/\/login\?return_url=%2Fmatch-reports$/);

    await page.getByTestId('credentials-form-email').fill(seed_user.email);
    await page.getByTestId('credentials-form-password').fill(seed_user.password);
    await page.getByTestId('credentials-form-submit').click();

    await expect(page).toHaveURL(/\/match-reports$/);
    await expect(page.getByTestId('app-header-account')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Match Reports' }).first()).toBeVisible();
    const is_mobile = (page.viewportSize()?.width ?? 0) < MOBILE_BREAKPOINT_PX;
    if (is_mobile) {
      await expect(page.getByTestId('app-shell-nav-toggle')).toBeVisible();
    } else {
      await expect(page.locator('hch-sidebar')).toBeVisible();
    }
    await assert_layout_is_sound(page);

    await page.getByTestId('app-header-account').click();
    await page.getByTestId('app-header-logout').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('hch-login-page')).toBeVisible();
  });

  test('a wrong password shows an error and stays on sign-in', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('credentials-form-email').fill(seed_user.email);
    await page.getByTestId('credentials-form-password').fill(`${seed_user.password}-wrong`);
    await page.getByTestId('credentials-form-submit').click();

    await expect(page.getByText('The email or password is not correct.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
