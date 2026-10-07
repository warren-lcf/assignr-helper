import { copy_text_to_clipboard } from './copy_text_to_clipboard';

function navigator_with(write_text?: (text: string) => Promise<void>): Navigator {
  return { clipboard: write_text ? { writeText: write_text } : undefined } as unknown as Navigator;
}

describe('copy_text_to_clipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the Clipboard API when it is available', async () => {
    const write_text = vi.fn(() => Promise.resolve());

    const copied = await copy_text_to_clipboard(
      'https://x/q/abc',
      document,
      navigator_with(write_text),
    );

    expect(copied).toBe(true);
    expect(write_text).toHaveBeenCalledWith('https://x/q/abc');
  });

  it('falls back to selecting a text area when the Clipboard API is missing', async () => {
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const copied = await copy_text_to_clipboard('the-link', document, navigator_with());

    expect(copied).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    // The temporary text area is gone and focus went back to where it was.
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('falls back when the Clipboard API refuses', async () => {
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;

    const copied = await copy_text_to_clipboard(
      'the-link',
      document,
      navigator_with(() => Promise.reject(new Error('denied'))),
    );

    expect(copied).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('reports failure when the fallback is refused too', async () => {
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => false);

    expect(await copy_text_to_clipboard('the-link', document, navigator_with())).toBe(false);
  });

  it('reports failure when the fallback throws', async () => {
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => {
      throw new Error('not allowed');
    });

    expect(await copy_text_to_clipboard('the-link', document, navigator_with())).toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
