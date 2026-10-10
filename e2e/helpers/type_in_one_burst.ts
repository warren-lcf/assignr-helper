import { Locator } from '@playwright/test';

/**
 * Types text into an input as fast as a person can, with no real-time gap between characters.
 * Every character is entered by its own `input` event, and all of them are dispatched inside ONE
 * browser task, so a debounce shorter than the whole burst can never fire in the middle of a word.
 *
 * Why not `pressSequentially`: it sends each key over the test protocol, so a loaded machine can
 * stretch the gap between two keys past a 300 ms search delay. The app then correctly searches for
 * the partial word, and a test that expects a single search for the whole word fails.
 * @param input The text box.
 * @param text The text to type, one character at a time.
 * @param gap_ms Optional real-time pause between characters, only for tests that prove the app
 *   DOES search mid-word when typing is slower than its delay.
 * @returns Resolves once the last input event has been dispatched.
 */
export async function type_in_one_burst(input: Locator, text: string, gap_ms = 0): Promise<void> {
  await input.focus();
  await input.evaluate(
    async (element, args) => {
      const field = element as HTMLInputElement;
      for (let length = 1; length <= args.text.length; length += 1) {
        field.value = args.text.slice(0, length);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        if (args.gap_ms > 0) {
          await new Promise((resolve) => setTimeout(resolve, args.gap_ms));
        }
      }
    },
    { text, gap_ms },
  );
}
