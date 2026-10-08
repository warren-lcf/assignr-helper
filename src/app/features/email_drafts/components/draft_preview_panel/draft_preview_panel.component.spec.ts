import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { PreviewFixTarget } from '../../enums/preview_fix_target.enum';
import { PreviewView } from '../../enums/preview_view.enum';
import { PreviewWarningCode } from '../../enums/preview_warning_code.enum';
import { BLOCKED_PREVIEW, CLEAN_PREVIEW, make_draft_preview } from '../../mocks/draft_preview.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IDraftPreview } from '../../models/draft_preview.model';
import { DraftPreviewPanelComponent } from './draft_preview_panel.component';

interface IInputs {
  preview?: IDraftPreview;
  is_saved?: boolean;
  is_loading?: boolean;
  has_error?: boolean;
  is_stale?: boolean;
  can_send?: boolean;
  can_test_send?: boolean;
  is_test_sending?: boolean;
  is_retry?: boolean;
  show_actions?: boolean;
  show_test_send?: boolean;
}

function render(inputs: IInputs = {}) {
  TestBed.configureTestingModule({
    imports: [DraftPreviewPanelComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(DraftPreviewPanelComponent);
  const set = (next: IInputs) => {
    for (const [name, value] of Object.entries(next)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };
  set({ is_saved: true, preview: CLEAN_PREVIEW, ...inputs });
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const events = {
    refresh: 0,
    test_send: 0,
    send: 0,
    fixes: [] as PreviewFixTarget[],
  };
  const component = fixture.componentInstance;
  component.refresh_requested.subscribe(() => events.refresh++);
  component.test_send_requested.subscribe(() => events.test_send++);
  component.send_requested.subscribe(() => events.send++);
  component.fix_requested.subscribe((target) => events.fixes.push(target));
  return { fixture, component, element, by_testid, events, set };
}

describe('DraftPreviewPanelComponent', () => {
  it('asks to save the draft first when there is nothing saved to preview', () => {
    const { by_testid } = render({ is_saved: false, preview: undefined });

    expect(by_testid('draft-preview-unsaved')?.textContent).toContain('Save the draft');
    expect(by_testid('draft-send')).toBeNull();
    expect(by_testid('draft-test-send')).toBeNull();
  });

  it('shows skeletons while the preview loads', () => {
    const { by_testid } = render({ preview: undefined, is_loading: true });

    expect(by_testid('draft-preview-loading')?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows an error with Try again when the preview could not be loaded', () => {
    const { by_testid, events } = render({ preview: undefined, has_error: true });

    expect(by_testid('draft-preview-error')?.getAttribute('role')).toBe('alert');
    by_testid('draft-preview-retry')?.click();
    expect(events.refresh).toBe(1);
  });

  it('shows the subject, the game count and the recipient count', () => {
    const { by_testid } = render();

    expect(by_testid('draft-preview-subject')?.textContent?.trim()).toBe(CLEAN_PREVIEW.subject);
    expect(by_testid('draft-preview-games')?.textContent?.trim()).toBe('4 games');
    expect(by_testid('draft-preview-recipients')?.textContent?.trim()).toBe('2');
    expect(by_testid('draft-preview-skipped')?.textContent?.trim()).toBe('1');
  });

  it('names a single game in the singular', () => {
    const { by_testid } = render({ preview: make_draft_preview({ game_count: 1 }) });

    expect(by_testid('draft-preview-games')?.textContent?.trim()).toBe('1 game');
  });

  it('shows the email only in a frame with an empty sandbox, bound through srcdoc', () => {
    const { by_testid } = render();

    const frame = by_testid('draft-preview-frame') as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('title')).toBe('Email preview');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.srcdoc).toContain('Riverside Park');
  });

  it('says the preview shows the content rather than the exact look', () => {
    const { by_testid, component, fixture } = render();

    expect(by_testid('draft-preview-note')?.textContent).toContain(
      'Fonts and colours may look different',
    );
    component.on_view_changed(PreviewView.TEXT);
    fixture.detectChanges();
    expect(by_testid('draft-preview-note')).toBeNull();
  });

  it('never puts the server html into the page itself', () => {
    const html = '<p id="injected">Injected</p><script>window.__pwned = true</script>';
    const { element } = render({ preview: make_draft_preview({ html }) });

    expect(element.querySelector('#injected')).toBeNull();
    expect((window as unknown as Record<string, unknown>)['__pwned']).toBeUndefined();
    expect(element.innerHTML).not.toContain('<script');
  });

  it('switches to the plain-text version and back', () => {
    const { by_testid, component, fixture } = render();

    component.on_view_changed(PreviewView.TEXT);
    fixture.detectChanges();
    expect(by_testid('draft-preview-frame')).toBeNull();
    expect(by_testid('draft-preview-text')?.textContent).toContain('Lions vs Tigers');

    component.on_view_changed(PreviewView.EMAIL);
    fixture.detectChanges();
    expect(by_testid('draft-preview-frame')).not.toBeNull();
    expect(by_testid('draft-preview-text')).toBeNull();
  });

  it('ignores a version it does not know', () => {
    const { component } = render();

    component.on_view_changed('SOMETHING_ELSE');

    expect(component.view()).toBe(PreviewView.EMAIL);
  });

  it('shows blocking warnings with their fix, marked in words and not only by colour', () => {
    const { by_testid, events } = render({ preview: BLOCKED_PREVIEW });

    const not_configured = by_testid('draft-warning-email_not_configured');
    expect(not_configured?.textContent).toContain('Sending is not set up yet');
    expect(not_configured?.textContent).toContain('Blocks sending');
    expect(by_testid('draft-warning-no_recipients')?.textContent).toContain('Nobody would receive');

    by_testid('draft-warning-fix-email_not_configured')?.click();
    by_testid('draft-warning-fix-no_recipients')?.click();
    expect(events.fixes).toEqual([PreviewFixTarget.SETTINGS, PreviewFixTarget.CONTACTS]);
  });

  it('shows an advisory warning without calling it blocking', () => {
    const { by_testid } = render({
      preview: make_draft_preview({ warnings: [PreviewWarningCode.NO_POSTAL_ADDRESS] }),
    });

    const warning = by_testid('draft-warning-no_postal_address');
    expect(warning?.textContent).toContain('Advice');
    expect(warning?.textContent).not.toContain('Blocks sending');
    expect(by_testid(`draft-warning-fix-${PreviewWarningCode.NO_POSTAL_ADDRESS}`)).not.toBeNull();
  });

  it('shows a generic advisory for a warning code it does not know', () => {
    const { by_testid } = render({ preview: make_draft_preview({ warnings: ['brand_new'] }) });

    expect(by_testid('draft-warning-brand_new')?.textContent).toContain(
      'The preview reported something to check',
    );
  });

  it('says the preview is out of date while there are unsaved changes', () => {
    const { by_testid } = render({ is_stale: true });

    expect(by_testid('draft-preview-stale')?.getAttribute('role')).toBe('status');
    expect(by_testid('draft-preview-stale')?.textContent).toContain('Only the saved draft');
  });

  it('enables Send and the test send only when allowed', () => {
    const blocked = render({ can_send: false, can_test_send: false });
    expect((blocked.by_testid('draft-send') as HTMLButtonElement).disabled).toBe(true);
    expect((blocked.by_testid('draft-test-send') as HTMLButtonElement).disabled).toBe(true);

    blocked.set({ can_send: true, can_test_send: true });
    expect((blocked.by_testid('draft-send') as HTMLButtonElement).disabled).toBe(false);
    expect((blocked.by_testid('draft-test-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits when Send or the test send is pressed', () => {
    const { by_testid, events } = render({ can_send: true, can_test_send: true });

    by_testid('draft-send')?.click();
    by_testid('draft-test-send')?.click();

    expect(events.send).toBe(1);
    expect(events.test_send).toBe(1);
  });

  it('shows a spinner and disables the test send while it is on its way', () => {
    const { by_testid } = render({ can_test_send: true, is_test_sending: true });

    const button = by_testid('draft-test-send') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('mat-progress-spinner')).not.toBeNull();
  });

  it('words the send button for a retry', () => {
    const { by_testid } = render({ can_send: true, is_retry: true });

    expect(by_testid('draft-send')?.textContent).toContain('Retry failed recipients');
  });

  it('hides only the test send when the draft was already sent once', () => {
    const { by_testid } = render({ can_send: true, show_test_send: false });

    expect(by_testid('draft-test-send')).toBeNull();
    expect(by_testid('draft-send')).not.toBeNull();
  });

  it('hides the send buttons when the draft can no longer be sent', () => {
    const { by_testid } = render({ show_actions: false });

    expect(by_testid('draft-send')).toBeNull();
    expect(by_testid('draft-test-send')).toBeNull();
  });
});
