import { expect, test } from '@playwright/test';
import { assert_layout_is_sound } from './helpers/layout_checks';

test.describe('signed-out visitor', () => {
  test('is sent to sign-in with their destination remembered, without app chrome', async ({
    page,
  }) => {
    await page.goto('/match-reports');

    await expect(page).toHaveURL(/\/login\?return_url=%2Fmatch-reports$/);
    await expect(page.locator('hch-login-page')).toBeVisible();
    await expect(page.locator('hch-sidebar')).toHaveCount(0);
    await assert_layout_is_sound(page);
  });

  test('lands on sign-in from the root path too', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login\?return_url=%2Fgames$/);
    await expect(page.locator('hch-login-page')).toBeVisible();
  });
});
