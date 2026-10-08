import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { DraftStatus } from '../../enums/draft_status.enum';
import { SendResultStatus } from '../../enums/send_result_status.enum';
import { CONTACT_FIXTURES } from '../../mocks/email_contact.mock';
import { FULL_SEND_RESULT, PARTIAL_SEND_RESULT } from '../../mocks/send_result.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { ISendDraftResult } from '../../models/send_draft_result.model';
import { SendResultsPanelComponent } from './send_results_panel.component';

function render(result: ISendDraftResult, can_retry = true) {
  TestBed.configureTestingModule({
    imports: [SendResultsPanelComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(SendResultsPanelComponent);
  fixture.componentRef.setInput('result', result);
  fixture.componentRef.setInput('contacts', [...CONTACT_FIXTURES]);
  fixture.componentRef.setInput('can_retry', can_retry);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  let retries = 0;
  fixture.componentInstance.retry_requested.subscribe(() => retries++);
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    by_testid,
    retries: () => retries,
  };
}

describe('SendResultsPanelComponent', () => {
  it('summarizes a full send in a polite live region, with the counts', () => {
    const { by_testid } = render(FULL_SEND_RESULT);

    const summary = by_testid('send-results-summary');
    expect(summary?.getAttribute('role')).toBe('status');
    expect(summary?.getAttribute('aria-live')).toBe('polite');
    expect(summary?.textContent).toContain('Sent to 2 people.');
    expect(summary?.textContent).not.toContain('could not be reached');
    expect(by_testid('send-results-sent')?.textContent?.trim()).toBe('2');
    expect(by_testid('send-results-failed')?.textContent?.trim()).toBe('0');
    expect(by_testid('send-results-retry')).toBeNull();
  });

  it('summarizes a partial send with both numbers', () => {
    const { by_testid } = render(PARTIAL_SEND_RESULT);

    expect(by_testid('send-results-summary')?.textContent).toContain('Sent to 1 person.');
    expect(by_testid('send-results-summary')?.textContent).toContain(
      '1 person could not be reached.',
    );
  });

  it('uses the plural for several failures', () => {
    const { by_testid } = render({ ...PARTIAL_SEND_RESULT, failed: 3 });

    expect(by_testid('send-results-summary')?.textContent).toContain(
      '3 people could not be reached.',
    );
  });

  it('lists each person by name with a status in words and an icon', () => {
    const { by_testid } = render(PARTIAL_SEND_RESULT);

    expect(by_testid('send-result-contact-1')?.textContent).toContain('Alice Archer');
    const sent = by_testid('send-result-status-contact-1');
    expect(sent?.textContent).toContain('Sent');
    expect(sent?.textContent).toContain('check_circle');
    const failed = by_testid('send-result-status-contact-2');
    expect(failed?.textContent).toContain('Failed');
    expect(failed?.textContent).toContain('error');
    expect(by_testid('send-result-status-contact-3')?.textContent).toContain(
      'Skipped: unsubscribed',
    );
  });

  it('shows a plain reason for a failure and never the raw code', () => {
    const { by_testid, element } = render(PARTIAL_SEND_RESULT);

    expect(by_testid('send-result-reason-contact-2')?.textContent?.trim()).toBe(
      'The email service refused this message.',
    );
    expect(by_testid('send-result-reason-contact-1')).toBeNull();
    expect(element.textContent).not.toContain('PROVIDER_REJECTED');
  });

  it('shows a generic reason for a failure code it does not know', () => {
    const { by_testid } = render({
      ...PARTIAL_SEND_RESULT,
      results: [
        { contact_id: 'contact-2', status: SendResultStatus.FAILED, error_code: 'MYSTERY' },
      ],
    });

    expect(by_testid('send-result-reason-contact-2')?.textContent?.trim()).toBe(
      'The message could not be delivered.',
    );
  });

  it('marks someone already reached by an earlier send', () => {
    const { by_testid } = render({
      status: DraftStatus.SENT,
      sent: 1,
      failed: 0,
      results: [
        { contact_id: 'contact-1', status: SendResultStatus.ALREADY_SENT, error_code: null },
      ],
    });

    expect(by_testid('send-result-status-contact-1')?.textContent).toContain('Already sent');
  });

  it('does not make up a name for a contact that is no longer in the list', () => {
    const { component } = render(FULL_SEND_RESULT);

    expect(
      component.name_of({ contact_id: 'gone', status: SendResultStatus.SENT, error_code: null }),
    ).toBe('A contact that is no longer in your list');
  });

  it('offers a retry for a partial send, and emits when it is pressed', () => {
    const { by_testid, retries } = render(PARTIAL_SEND_RESULT);

    by_testid('send-results-retry')?.click();

    expect(retries()).toBe(1);
  });

  it('disables the retry while it is not allowed', () => {
    const { by_testid } = render(PARTIAL_SEND_RESULT, false);

    expect((by_testid('send-results-retry') as HTMLButtonElement).disabled).toBe(true);
  });
});
