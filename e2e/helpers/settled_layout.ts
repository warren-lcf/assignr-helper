import { Page, Route, expect } from '@playwright/test';
import { assert_layout_is_sound } from './layout_checks';

/**
 * Answers a mocked API call with a JSON body.
 * @param route The intercepted route.
 * @param status HTTP status to answer with.
 * @param body JSON body.
 * @param headers Extra response headers.
 * @returns Resolves when the route has been fulfilled.
 */
export function json(
  route: Route,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<void> {
  return route.fulfill({
    status,
    headers: { 'cache-control': 'no-store', ...headers },
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Lets dialog open animations finish: the layout checks measure scaled boxes while one is running.
 * @param page Page under test.
 * @returns Resolves when nothing is animating.
 */
export async function wait_for_animations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
}

/**
 * Layout checks for the page itself, once any animation has finished and from the top, as a user first sees it.
 * @param page Page under test.
 * @returns Resolves when the checks pass.
 */
export async function assert_settled_layout_is_sound(page: Page): Promise<void> {
  // A toast sits over the page for a few seconds and would be measured as a control overlapping the content behind it.
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0, { timeout: 20_000 });
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
 * @param page Page under test.
 * @returns Resolves when the checks pass.
 */
export async function assert_dialog_layout_is_sound(page: Page): Promise<void> {
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
