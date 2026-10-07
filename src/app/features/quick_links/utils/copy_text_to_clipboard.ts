/**
 * Puts text on the clipboard. Uses the asynchronous Clipboard API where the
 * browser allows it (secure context, permission), otherwise falls back to
 * selecting a temporary text area and the legacy copy command. The text is not
 * logged anywhere.
 * @param text The text to copy.
 * @param document_ref The document to use for the fallback.
 * @param navigator_ref The navigator that may offer the Clipboard API.
 * @returns True when the text was copied, false when the browser refused both ways.
 */
export async function copy_text_to_clipboard(
  text: string,
  document_ref: Document = document,
  navigator_ref: Navigator = navigator,
): Promise<boolean> {
  try {
    if (navigator_ref.clipboard) {
      await navigator_ref.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: use the fallback below. Nothing here may carry the text.
  }
  return copy_with_selection(text, document_ref);
}

function copy_with_selection(text: string, document_ref: Document): boolean {
  const previously_focused = document_ref.activeElement as HTMLElement | null;
  const area = document_ref.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  document_ref.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document_ref.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    previously_focused?.focus?.();
  }
}
