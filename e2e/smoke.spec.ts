import { expect, test } from '@playwright/test';
import { assert_layout_is_sound } from './helpers/layout_checks';

test.describe('app boots', () => {
  test('renders the root and passes the layout checks', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('app-root')).toBeAttached();
    await assert_layout_is_sound(page);
  });
});
