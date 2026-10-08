import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { SendOutcomeKind } from '../../enums/send_outcome_kind.enum';
import { FULL_SEND_RESULT } from '../../mocks/send_result.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { ISendDialogData } from '../../models/send_dialog_data.model';
import { ISendDraftResult } from '../../models/send_draft_result.model';
import { EmailDraftsApiService } from '../../services/email_drafts_api.service';
import { SendConfirmDialogComponent } from './send_confirm_dialog.component';

const DATA: ISendDialogData = {
  draft_id: 'draft-1',
  subject: 'Games available this weekend',
  recipient_count: 12,
  recipient_names: ['Alice Archer', 'Bob Baker'],
  more_recipient_count: 10,
  game_count: 4,
  include_quick_link: true,
  quick_link_expiry_days: 7,
  is_retry: false,
};

function api_failure(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations: [] } });
}

function render(
  send_draft: () => Observable<ISendDraftResult> = () => of(FULL_SEND_RESULT),
  data: Partial<ISendDialogData> = {},
) {
  const dialog_ref = { close: vi.fn(), disableClose: false };
  const api = { send_draft: vi.fn(send_draft) };
  TestBed.configureTestingModule({
    imports: [SendConfirmDialogComponent],
    providers: [
      { provide: MatDialogRef, useValue: dialog_ref },
      { provide: MAT_DIALOG_DATA, useValue: { ...DATA, ...data } },
      { provide: EmailDraftsApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(SendConfirmDialogComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    dialog_ref,
    by_testid,
    settle,
  };
}

describe('SendConfirmDialogComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('what it says', () => {
    it('states plainly how many people will be emailed now and that it cannot be undone', () => {
      const { by_testid } = render();

      expect(by_testid('send-confirm-headline')?.textContent?.trim()).toBe(
        'This will email 12 people now and cannot be undone.',
      );
    });

    it('uses the singular for one person', () => {
      const { by_testid } = render(undefined, {
        recipient_count: 1,
        recipient_names: ['Alice Archer'],
        more_recipient_count: 0,
      });

      expect(by_testid('send-confirm-headline')?.textContent?.trim()).toBe(
        'This will email 1 person now and cannot be undone.',
      );
      expect(by_testid('send-confirm-submit')?.textContent?.trim()).toBe('Send to 1 person now');
    });

    it('names the first few recipients and counts the rest, never an address', () => {
      const { by_testid, element } = render();

      expect(by_testid('send-confirm-recipients')?.textContent?.trim()).toBe(
        'Alice Archer, Bob Baker and 10 more',
      );
      expect(element.textContent).not.toContain('@');
    });

    it('lists only the names when everyone fits', () => {
      const { by_testid } = render(undefined, { more_recipient_count: 0 });

      expect(by_testid('send-confirm-recipients')?.textContent?.trim()).toBe(
        'Alice Archer, Bob Baker',
      );
    });

    it('shows the subject and the number of games', () => {
      const { by_testid } = render();

      expect(by_testid('send-confirm-subject')?.textContent?.trim()).toBe(DATA.subject);
      expect(by_testid('send-confirm-games')?.textContent?.trim()).toBe('4 games');
    });

    it('names a single game in the singular', () => {
      const { by_testid } = render(undefined, { game_count: 1 });

      expect(by_testid('send-confirm-games')?.textContent?.trim()).toBe('1 game');
    });

    it('mentions the live quick link and its expiry when there is one, and not otherwise', () => {
      const with_link = render();
      expect(with_link.by_testid('send-confirm-quick-link')?.textContent).toContain(
        'expiring in 7 days',
      );
      TestBed.resetTestingModule();

      const without = render(undefined, { include_quick_link: false });
      expect(without.by_testid('send-confirm-quick-link')).toBeNull();
    });

    it('puts the number on the confirm button', () => {
      const { by_testid } = render();

      expect(by_testid('send-confirm-submit')?.textContent?.trim()).toBe('Send to 12 people now');
    });

    it('explains a retry, and says nobody is emailed twice', () => {
      const { by_testid, element } = render(undefined, { is_retry: true });

      expect(element.querySelector('h2')?.textContent).toContain('Retry sending this email?');
      expect(by_testid('send-confirm-retry-note')?.textContent).toContain('not emailed twice');
    });

    it('has no retry note for a first send', () => {
      const { by_testid, element } = render();

      expect(element.querySelector('h2')?.textContent).toContain('Send this email now?');
      expect(by_testid('send-confirm-retry-note')).toBeNull();
    });
  });

  describe('focus and dismissal', () => {
    it('marks Cancel as the initial focus, so Enter cannot send', () => {
      const { by_testid } = render();

      expect(by_testid('send-confirm-cancel')?.hasAttribute('cdkFocusInitial')).toBe(true);
      expect(by_testid('send-confirm-submit')?.hasAttribute('cdkFocusInitial')).toBe(false);
      expect(by_testid('send-confirm-submit')?.getAttribute('type')).toBe('button');
    });

    it('closes without sending anything on Cancel', () => {
      const { api, by_testid, dialog_ref } = render();

      by_testid('send-confirm-cancel')?.click();

      expect(dialog_ref.close).toHaveBeenCalledWith();
      expect(api.send_draft).not.toHaveBeenCalled();
    });
  });

  describe('sending', () => {
    it('sends the count the sender was shown, then closes with the result', async () => {
      const { api, by_testid, dialog_ref, settle } = render();

      by_testid('send-confirm-submit')?.click();
      await settle();

      expect(api.send_draft).toHaveBeenCalledWith('draft-1', { confirm_recipient_count: 12 });
      expect(dialog_ref.close).toHaveBeenCalledWith({
        kind: SendOutcomeKind.SENT,
        result: FULL_SEND_RESULT,
      });
    });

    it('sends once however often the button is pressed while it is in flight', async () => {
      const pending = new Subject<ISendDraftResult>();
      const { api, by_testid, dialog_ref, fixture, settle } = render(() => pending);

      const button = by_testid('send-confirm-submit') as HTMLButtonElement;
      button.click();
      button.click();
      fixture.detectChanges();

      expect(api.send_draft).toHaveBeenCalledTimes(1);
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect((by_testid('send-confirm-cancel') as HTMLButtonElement).disabled).toBe(true);
      // The dialog cannot be dismissed while the request runs.
      expect(dialog_ref.disableClose).toBe(true);
      by_testid('send-confirm-cancel')?.click();
      expect(dialog_ref.close).not.toHaveBeenCalled();

      pending.next(FULL_SEND_RESULT);
      pending.complete();
      await settle();

      expect(dialog_ref.close).toHaveBeenCalledTimes(1);
    });

    it('closes with a count-changed outcome, sending nothing more, when the count moved', async () => {
      const { api, by_testid, dialog_ref, settle } = render(() =>
        throwError(() => api_failure(409, 'RECIPIENT_COUNT_CHANGED')),
      );

      by_testid('send-confirm-submit')?.click();
      await settle();

      expect(dialog_ref.close).toHaveBeenCalledWith({ kind: SendOutcomeKind.COUNT_CHANGED });
      expect(api.send_draft).toHaveBeenCalledTimes(1);
    });

    it('closes with a locked outcome when the draft was already sent', async () => {
      const { by_testid, dialog_ref, settle } = render(() =>
        throwError(() => api_failure(409, 'DRAFT_LOCKED')),
      );

      by_testid('send-confirm-submit')?.click();
      await settle();

      expect(dialog_ref.close).toHaveBeenCalledWith({ kind: SendOutcomeKind.LOCKED });
    });

    it('stays open with a translated reason for any other failure, and allows another try', async () => {
      let calls = 0;
      const { api, by_testid, dialog_ref, settle } = render(() =>
        ++calls === 1
          ? throwError(() => api_failure(422, 'EMAIL_NOT_CONFIGURED'))
          : of(FULL_SEND_RESULT),
      );

      by_testid('send-confirm-submit')?.click();
      await settle();

      expect(by_testid('send-confirm-error')?.getAttribute('role')).toBe('alert');
      expect(by_testid('send-confirm-error')?.textContent).toContain('Sending is not set up yet');
      expect(by_testid('send-confirm-error')?.textContent).not.toContain('server text');
      expect(dialog_ref.close).not.toHaveBeenCalled();
      expect(dialog_ref.disableClose).toBe(false);
      expect((by_testid('send-confirm-submit') as HTMLButtonElement).disabled).toBe(false);
      expect(logged).toHaveBeenCalledWith('Could not send the email', expect.anything());

      by_testid('send-confirm-submit')?.click();
      await settle();

      expect(api.send_draft).toHaveBeenCalledTimes(2);
      expect(dialog_ref.close).toHaveBeenCalledWith({
        kind: SendOutcomeKind.SENT,
        result: FULL_SEND_RESULT,
      });
    });
  });
});
