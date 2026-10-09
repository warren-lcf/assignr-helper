import { Locator, Page, expect } from '@playwright/test';
import {
  assert_no_control_collisions,
  assert_no_cramped_stacked_fields,
  assert_no_horizontal_overflow,
} from './layout_checks';

/**
 * The header texts of one level of a `hch-grouped-agenda-list`, in page order. Each level has its own
 * heading level (the list starts at 2), and the label is the text the app wrote, without the count
 * chip or the Hide and Show words.
 * @param root Where the list is (the page, or an element that holds it).
 * @param level 0 for the outermost level.
 * @returns A locator that matches one label per group.
 */
export function agenda_labels(root: Page | Locator, level: number): Locator {
  return root.getByRole('heading', { level: level + 2 }).locator('.agenda_label');
}

/**
 * The group at any level whose key is given (a location label, or a date's UTC-midnight milliseconds).
 * @param root Where the list is.
 * @param key The group key.
 * @returns The group's section, header and rows.
 */
export function agenda_group(root: Page | Locator, key: string): Locator {
  return root.locator(`section[data-testid="grouped-agenda-group"][data-agenda-key="${key}"]`);
}

/**
 * The header button of a group.
 * @param group A group from `agenda_group`.
 * @returns The button that collapses and opens it.
 */
export function agenda_header(group: Locator): Locator {
  return group.locator(':scope > :is(h2, h3, h4) > [data-testid="grouped-agenda-header"]');
}

/**
 * Where the pinned headers sit: how far each header's top is from the top of the nearest scrolling
 * ancestor (the page itself when nothing between scrolls).
 * @param page Page under test.
 * @param headers The header buttons to measure, outermost level first.
 * @returns One offset per header, in pixels.
 */
export async function measure_header_offsets(page: Page, headers: Locator[]): Promise<number[]> {
  return Promise.all(
    headers.map((header) =>
      header.evaluate((element) => {
        let scroller: HTMLElement | null = element.parentElement;
        while (scroller && scroller !== document.documentElement) {
          const overflow_y = getComputedStyle(scroller).overflowY;
          if (/(auto|scroll)/.test(overflow_y) && scroller.scrollHeight > scroller.clientHeight)
            break;
          scroller = scroller.parentElement;
        }
        const top =
          scroller && scroller !== document.documentElement
            ? scroller.getBoundingClientRect().top
            : 0;
        return Math.round(element.getBoundingClientRect().top - top);
      }),
    ),
  );
}

/**
 * Scrolls the last row of a list into view, so the headers above it are pinned.
 * @param rows The rows of the list.
 * @returns Resolves once the row is on screen.
 */
export async function scroll_to_last_row(rows: Locator): Promise<void> {
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toBeInViewport();
}

/** Longest label (in characters) treated as a compact control, as in the shared wrap check. */
const COMPACT_LABEL_MAX_LENGTH = 40;

/**
 * The shared wrapped-label check, minus text that cannot wrap. A group header's label is
 * `white-space: nowrap` with an ellipsis, so a name wider than its box is truncated on one line, yet
 * the browser reports two client rects for such text (the text and its ellipsis) and the shared check
 * would read that as a wrap. Every other compact control label is still held to one line.
 * @param page Page under test.
 * @returns Resolves when no wrappable label has wrapped.
 */
export async function assert_no_wrapped_control_text_ignoring_nowrap(page: Page): Promise<void> {
  const wrapped = await page.evaluate((max_length) => {
    const selector = 'button, [role="tab"], [role="button"], mat-chip, .mat-mdc-chip';
    const found: string[] = [];
    for (const control of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').trim();
        if (!text || text.length > max_length) continue;
        if (node.parentElement && getComputedStyle(node.parentElement).whiteSpace === 'nowrap') {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        if (range.getClientRects().length > 1) found.push(text);
      }
    }
    return found;
  }, COMPACT_LABEL_MAX_LENGTH);
  expect(wrapped, 'compact control labels wrapped').toEqual([]);
}

/**
 * The shared layout checks for a page that holds a grouped agenda list: overflow, collisions and
 * cramped fields exactly as the shared helper has them, and the wrapped-label check that leaves out
 * the list's single-line, ellipsized group labels.
 * @param page Page under test.
 * @returns Resolves when all checks pass.
 */
export async function assert_agenda_layout_is_sound(page: Page): Promise<void> {
  await assert_no_horizontal_overflow(page);
  await assert_no_control_collisions(page);
  await assert_no_wrapped_control_text_ignoring_nowrap(page);
  await assert_no_cramped_stacked_fields(page);
}
