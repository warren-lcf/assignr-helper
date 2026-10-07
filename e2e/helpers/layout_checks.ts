import { Page, expect } from '@playwright/test';

/** Longest label (in characters) treated as a compact control for wrap checks. */
const COMPACT_LABEL_MAX_LENGTH = 40;

/** Minimum gap, in pixels, between vertically stacked sibling form fields. */
const STACKED_FIELD_MIN_GAP = 16;

/**
 * Fails when the document scrolls horizontally.
 * @param page Page under test.
 * @returns Resolves when the assertion passes.
 */
export async function assert_no_horizontal_overflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(0);
}

/**
 * Fails when two visible interactive controls overlap.
 * @param page Page under test.
 * @returns Resolves when the assertion passes.
 */
export async function assert_no_control_collisions(page: Page): Promise<void> {
  const collisions = await page.evaluate(() => {
    const selector = 'button, a[href], input, select, textarea, [role="button"], [role="tab"]';
    const boxes = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0);
    const found: string[] = [];
    for (let left = 0; left < boxes.length; left++) {
      for (let right = left + 1; right < boxes.length; right++) {
        const a = boxes[left];
        const b = boxes[right];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const overlaps =
          a.box.left < b.box.right - 1 &&
          a.box.right > b.box.left + 1 &&
          a.box.top < b.box.bottom - 1 &&
          a.box.bottom > b.box.top + 1;
        if (overlaps)
          found.push(`${a.element.outerHTML.slice(0, 60)} x ${b.element.outerHTML.slice(0, 60)}`);
      }
    }
    return found;
  });
  expect(collisions, 'overlapping controls').toEqual([]);
}

/**
 * Fails when a short label inside a compact control has wrapped onto a second
 * line, which grows the control instead of overflowing or colliding.
 * @param page Page under test.
 * @returns Resolves when the assertion passes.
 */
export async function assert_no_wrapped_control_text(page: Page): Promise<void> {
  const wrapped = await page.evaluate((max_length) => {
    const selector = 'button, [role="tab"], [role="button"], mat-chip, .mat-mdc-chip';
    const found: string[] = [];
    for (const control of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').trim();
        if (!text || text.length > max_length) continue;
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
 * Fails when vertically stacked sibling form fields sit closer than the floor.
 * @param page Page under test.
 * @returns Resolves when the assertion passes.
 */
export async function assert_no_cramped_stacked_fields(page: Page): Promise<void> {
  const cramped = await page.evaluate((min_gap) => {
    const found: string[] = [];
    for (const parent of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const fields = Array.from(parent.children).filter((child) =>
        child.matches('mat-form-field, hch-field, hch-text-input, hch-select'),
      );
      for (let left = 0; left < fields.length; left++) {
        for (let right = left + 1; right < fields.length; right++) {
          const a = fields[left].getBoundingClientRect();
          const b = fields[right].getBoundingClientRect();
          const shares_column = a.left < b.right && a.right > b.left;
          const gap = b.top >= a.bottom ? b.top - a.bottom : a.top - b.bottom;
          if (shares_column && gap > 0 && gap < min_gap) found.push(`${gap}px`);
        }
      }
    }
    return found;
  }, STACKED_FIELD_MIN_GAP);
  expect(cramped, 'stacked fields too close').toEqual([]);
}

/**
 * Runs every layout check the golden-path specs must include.
 * @param page Page under test.
 * @returns Resolves when all checks pass.
 */
export async function assert_layout_is_sound(page: Page): Promise<void> {
  await assert_no_horizontal_overflow(page);
  await assert_no_control_collisions(page);
  await assert_no_wrapped_control_text(page);
  await assert_no_cramped_stacked_fields(page);
}
