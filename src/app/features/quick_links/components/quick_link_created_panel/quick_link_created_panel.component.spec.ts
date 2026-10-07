import { TestBed } from '@angular/core/testing';
import { ToastService } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { CopyStatus } from '../../enums/copy_status.enum';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { QuickLinkCreatedPanelComponent } from './quick_link_created_panel.component';

const URL_TEXT = 'https://app.example.com/q/fake-token-for-specs';

/** Replaces the browser clipboard; `undefined` removes it, as an insecure context does. */
function stub_clipboard(write_text: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: write_text ? { writeText: write_text } : undefined,
    configurable: true,
  });
}

function render() {
  const toast = { show_success: vi.fn(), show_error: vi.fn() };
  TestBed.configureTestingModule({
    imports: [QuickLinkCreatedPanelComponent],
    providers: [
      { provide: ToastService, useValue: toast },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(QuickLinkCreatedPanelComponent);
  fixture.componentRef.setInput('url', URL_TEXT);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click_copy = async () => {
    by_testid('quick-link-created-copy')?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  return { fixture, element, toast, by_testid, click_copy };
}

describe('QuickLinkCreatedPanelComponent', () => {
  afterEach(() => {
    stub_clipboard(undefined);
    vi.restoreAllMocks();
  });

  it('warns that the link will not be shown again', () => {
    const { by_testid } = render();
    const warning = by_testid('quick-link-created-warning');

    expect(warning?.textContent).toContain('Copy this link now.');
    expect(warning?.textContent).toContain('It will not be shown again.');
    expect(warning?.getAttribute('role')).toBe('note');
  });

  it('shows the link in a read-only field so it can also be copied by hand', () => {
    const { by_testid } = render();
    const input = by_testid('quick-link-created-url') as HTMLInputElement;

    expect(input.value).toBe(URL_TEXT);
    expect(input.readOnly).toBe(true);
  });

  it('selects the whole link when the field is focused or clicked', () => {
    const { by_testid } = render();
    const input = by_testid('quick-link-created-url') as HTMLInputElement;
    const select = vi.spyOn(input, 'select');

    input.dispatchEvent(new Event('focus'));
    input.click();

    expect(select).toHaveBeenCalledTimes(2);
  });

  it('copies the link, confirms in a toast and announces it in a polite live region', async () => {
    const copy = vi.fn(() => Promise.resolve());
    stub_clipboard(copy);
    const { fixture, toast, by_testid, click_copy } = render();

    await click_copy();

    expect(copy).toHaveBeenCalledWith(URL_TEXT);
    expect(toast.show_success).toHaveBeenCalledWith('Link copied.');
    expect(fixture.componentInstance.copy_status()).toBe(CopyStatus.COPIED);
    const status = by_testid('quick-link-copy-status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toContain('Link copied to the clipboard.');
  });

  it('says to copy by hand when the browser refuses, without echoing the link', async () => {
    stub_clipboard(undefined);
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => false);
    const { fixture, toast, by_testid, click_copy } = render();

    await click_copy();

    expect(fixture.componentInstance.copy_status()).toBe(CopyStatus.FAILED);
    expect(toast.show_error).toHaveBeenCalledWith(
      'Could not copy automatically. Select the link and copy it yourself.',
    );
    expect(toast.show_success).not.toHaveBeenCalled();
    expect(by_testid('quick-link-copy-status')?.textContent).toContain('copy it yourself');
    expect(toast.show_error.mock.calls[0][0]).not.toContain('q/');
  });

  it('says nothing in the live region before a copy attempt', () => {
    const { by_testid } = render();

    expect(by_testid('quick-link-copy-status')?.textContent?.trim()).toBe('');
  });
});
