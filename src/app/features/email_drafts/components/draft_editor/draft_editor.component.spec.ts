import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent, ToastService } from '@hch-shared-libraries/ui-kit/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GAMES_RESULT } from '../../../games/mocks/game_view.mock';
import { IGamesResult } from '../../../games/models/games_result.model';
import { GamesApiService } from '../../../games/services/games_api.service';
import { DraftStatus } from '../../enums/draft_status.enum';
import { EmailView } from '../../enums/email_view.enum';
import { PreviewFixTarget } from '../../enums/preview_fix_target.enum';
import { PreviewWarningCode } from '../../enums/preview_warning_code.enum';
import { RecipientMode } from '../../enums/recipient_mode.enum';
import { SendOutcomeKind } from '../../enums/send_outcome_kind.enum';
import { BLOCKED_PREVIEW, CLEAN_PREVIEW, make_draft_preview } from '../../mocks/draft_preview.mock';
import { CONTACT_FIXTURES } from '../../mocks/email_contact.mock';
import {
  OPEN_DRAFT,
  PARTIAL_DRAFT,
  SENDING_DRAFT,
  SENT_DRAFT,
  make_email_draft,
} from '../../mocks/email_draft.mock';
import { CONFIGURED_SETTINGS } from '../../mocks/email_settings.mock';
import { FULL_SEND_RESULT, PARTIAL_SEND_RESULT } from '../../mocks/send_result.mock';
import { OWNER_PERMISSIONS, make_session_service_double } from '../../mocks/session_service.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IDraftPreview } from '../../models/draft_preview.model';
import { IEmailDraft } from '../../models/email_draft.model';
import { IEmailSettings } from '../../models/email_settings.model';
import { ISendDialogData } from '../../models/send_dialog_data.model';
import { ISendDialogOutcome } from '../../models/send_dialog_outcome.model';
import { ISaveDraftRequest } from '../../models/save_draft_request.model';
import { EmailDraftsApiService } from '../../services/email_drafts_api.service';
import { SendConfirmDialogComponent } from '../send_confirm_dialog/send_confirm_dialog.component';
import { DraftEditorComponent } from './draft_editor.component';

function api_failure(status: number, code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

interface IRenderOptions {
  draft_id?: string | null;
  get_draft?: () => Observable<IEmailDraft>;
  create_draft?: (request: ISaveDraftRequest) => Observable<IEmailDraft>;
  update_draft?: (id: string, request: ISaveDraftRequest) => Observable<IEmailDraft>;
  get_preview?: () => Observable<IDraftPreview>;
  send_test?: () => Observable<void>;
  list_games?: () => Observable<IGamesResult>;
  settings?: IEmailSettings;
  /** What each dialog answers when it closes, by component. */
  dialog_results?: Map<unknown, unknown>;
  email?: string | null;
}

function render(options: IRenderOptions = {}) {
  const api = {
    get_draft: vi.fn(options.get_draft ?? (() => of(OPEN_DRAFT))),
    create_draft: vi.fn(
      options.create_draft ??
        ((request: ISaveDraftRequest) =>
          of(
            make_email_draft({
              draft_id: 'draft-new',
              ...request,
              contact_ids: request.contact_ids ?? [],
              updated_at: 1,
            }),
          )),
    ),
    update_draft: vi.fn(
      options.update_draft ??
        ((id: string, request: ISaveDraftRequest) =>
          of(
            make_email_draft({
              draft_id: id,
              ...request,
              contact_ids: request.contact_ids ?? [],
              updated_at: 2,
            }),
          )),
    ),
    get_preview: vi.fn(options.get_preview ?? (() => of(CLEAN_PREVIEW))),
    send_test: vi.fn(options.send_test ?? (() => of(undefined))),
  };
  const games_api = { list_games: vi.fn(options.list_games ?? (() => of(GAMES_RESULT))) };
  const toast = { show_success: vi.fn(), show_error: vi.fn(), show_info: vi.fn() };
  const dialog_results = options.dialog_results ?? new Map<unknown, unknown>();
  const dialog = {
    open: vi.fn((component: unknown, config?: unknown) => ({
      afterClosed: () => of(dialog_results.get(component)),
      config,
    })),
  };
  const session = make_session_service_double(OWNER_PERMISSIONS);
  if (options.email !== undefined) {
    session.context.update((context) =>
      context ? { ...context, email: options.email ?? null } : context,
    );
  }
  TestBed.configureTestingModule({
    imports: [DraftEditorComponent],
    providers: [
      { provide: EmailDraftsApiService, useValue: api },
      { provide: GamesApiService, useValue: games_api },
      { provide: SessionService, useValue: session },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(DraftEditorComponent);
  fixture.componentRef.setInput(
    'draft_id',
    options.draft_id === undefined ? 'draft-1' : options.draft_id,
  );
  fixture.componentRef.setInput('contacts', [...CONTACT_FIXTURES]);
  fixture.componentRef.setInput('settings', options.settings ?? CONFIGURED_SETTINGS);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const component = fixture.componentInstance;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    for (let round = 0; round < 3; round++) {
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  };
  const type = (id: string, value: string) => {
    const input = by_testid(id) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const save = async () => {
    by_testid('draft-save')?.click();
    fixture.detectChanges();
    await settle();
  };
  const events = {
    changed: 0,
    closed: [] as (EmailView | null)[],
    settings: 0,
  };
  component.draft_changed.subscribe(() => events.changed++);
  component.closed.subscribe((target) => events.closed.push(target));
  component.settings_requested.subscribe(() => events.settings++);
  return {
    fixture,
    component,
    element,
    api,
    games_api,
    toast,
    dialog,
    dialog_results,
    session,
    events,
    by_testid,
    settle,
    type,
    save,
  };
}

describe('DraftEditorComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('a new draft', () => {
    it('starts blank, loads nothing, and asks to save before previewing', async () => {
      const { api, by_testid, component, settle } = render({ draft_id: null });
      await settle();

      expect(api.get_draft).not.toHaveBeenCalled();
      expect(component.is_new()).toBe(true);
      expect(component.title()).toBe('New email draft');
      expect((by_testid('draft-subject') as HTMLInputElement).value).toBe('');
      expect(by_testid('draft-preview-unsaved')).not.toBeNull();
      expect(api.get_preview).not.toHaveBeenCalled();
    });

    it('is not dirty until something is typed', async () => {
      const { by_testid, component, settle, type } = render({ draft_id: null });
      await settle();
      expect(component.is_dirty()).toBe(false);
      expect(by_testid('draft-dirty')).toBeNull();

      type('draft-subject', 'Hello');

      expect(component.is_dirty()).toBe(true);
      expect(by_testid('draft-dirty')?.getAttribute('role')).toBe('status');
    });

    it('offers the facet choices that the open games provide', async () => {
      const { component, games_api, settle } = render({ draft_id: null });
      await settle();

      expect(games_api.list_games).toHaveBeenCalledTimes(1);
      expect(component.facet_options().level).toEqual(['Premier']);
      expect(component.facet_options().league).toEqual(['Fall League']);
      expect(component.facet_options().location_group).toEqual(
        expect.arrayContaining(['Riverside Park']),
      );
      expect(component.facet_controls().map((control) => control.testid)).toEqual([
        'draft-filter-level',
        'draft-filter-league',
        'draft-filter-age-group',
        'draft-filter-location',
      ]);
    });

    it('still works, and says nothing, when the choices cannot be loaded', async () => {
      const { by_testid, component, settle } = render({
        draft_id: null,
        list_games: () => throwError(() => api_failure(500, 'INTERNAL')),
      });
      await settle();

      expect(component.facet_options().level).toEqual([]);
      expect(by_testid('draft-subject')).not.toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not load the filter choices', expect.anything());
    });

    it('translates the unknown-location placeholder in the choices only', () => {
      const { component } = render({ draft_id: null });

      expect(component.option_label('Location to be announced')).toBe('Location to be announced');
      expect(component.option_label('Riverside Park')).toBe('Riverside Park');
    });
  });

  describe('opening a stored draft', () => {
    it('shows a skeleton while it loads, then fills the form', async () => {
      const pending = new Subject<IEmailDraft>();
      const { by_testid, element, fixture, settle } = render({ get_draft: () => pending });

      expect(by_testid('draft-editor-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelector('hch-skeleton-line')).not.toBeNull();
      expect(by_testid('draft-subject')).toBeNull();

      pending.next(OPEN_DRAFT);
      pending.complete();
      await settle();
      fixture.detectChanges();

      expect((by_testid('draft-subject') as HTMLInputElement).value).toBe(OPEN_DRAFT.subject);
      expect((by_testid('draft-intro') as HTMLTextAreaElement).value).toBe(OPEN_DRAFT.intro);
      expect((by_testid('draft-quick-link-days') as HTMLInputElement).value).toBe('7');
      expect(by_testid('draft-editor-status')?.textContent).toContain('Draft');
    });

    it('is not dirty straight after loading', async () => {
      const { component, settle } = render();
      await settle();

      expect(component.is_dirty()).toBe(false);
      expect(component.title()).toBe(OPEN_DRAFT.subject);
    });

    it('shows an error with Try again when the draft cannot be loaded', async () => {
      let calls = 0;
      const { api, by_testid, element, settle } = render({
        get_draft: () =>
          ++calls === 1 ? throwError(() => api_failure(500, 'INTERNAL')) : of(OPEN_DRAFT),
      });
      await settle();

      expect(element.textContent).toContain('The draft could not be loaded');
      expect(logged).toHaveBeenCalledWith('Could not load the draft', expect.anything());
      by_testid('draft-editor-retry')?.click();
      await settle();

      expect(api.get_draft).toHaveBeenCalledTimes(2);
      expect(by_testid('draft-subject')).not.toBeNull();
    });
  });

  describe('saving', () => {
    it('refuses a blank subject and sends nothing', async () => {
      const { api, element, save, settle } = render({ draft_id: null });
      await settle();

      await save();

      expect(api.create_draft).not.toHaveBeenCalled();
      expect(element.querySelector('mat-error')?.textContent).toContain('Enter a subject.');
    });

    it('creates a new draft with the request built from the form, then previews it', async () => {
      const { api, events, save, settle, toast, type, component } = render({ draft_id: null });
      await settle();

      type('draft-subject', '  Weekend games ');
      type('draft-intro', 'Hello');
      await save();

      expect(api.create_draft).toHaveBeenCalledWith({
        subject: 'Weekend games',
        intro: 'Hello',
        filters: {},
        include_quick_link: false,
        quick_link_expiry_days: 14,
        recipient_mode: RecipientMode.ALL_CONSENTED,
      });
      expect(toast.show_success).toHaveBeenCalledWith('Draft saved.');
      expect(events.changed).toBe(1);
      expect(component.is_dirty()).toBe(false);
      expect(api.get_preview).toHaveBeenCalledWith('draft-new');
    });

    it('replaces a stored draft instead of creating another', async () => {
      const { api, save, settle, type } = render();
      await settle();

      type('draft-subject', 'Changed');
      await save();

      expect(api.create_draft).not.toHaveBeenCalled();
      expect(api.update_draft).toHaveBeenCalledTimes(1);
      expect(api.update_draft.mock.calls[0][0]).toBe('draft-1');
      expect(api.update_draft.mock.calls[0][1].subject).toBe('Changed');
    });

    it('sends the chosen people only for a chosen-people draft', async () => {
      const { api, component, save, settle, type } = render({ draft_id: null });
      await settle();

      type('draft-subject', 'Just two');
      component.on_mode_changed(RecipientMode.SELECTED);
      component.on_contacts_chosen(['contact-2', 'contact-1']);
      await save();

      expect(api.create_draft.mock.calls[0][0]).toMatchObject({
        recipient_mode: RecipientMode.SELECTED,
        contact_ids: ['contact-1', 'contact-2'],
      });
    });

    it('turns the toggles and filters into the request', async () => {
      const { api, component, save, settle, type } = render({ draft_id: null });
      await settle();

      type('draft-subject', 'Filtered');
      type('draft-search', 'lions');
      component.model.update((model) => ({
        ...model,
        level: 'Premier',
        date_from: new Date(2026, 9, 10),
        date_to: new Date(2026, 9, 12),
      }));
      component.on_open_slots_changed(true);
      component.on_quick_link_changed(true);
      await save();

      expect(api.create_draft.mock.calls[0][0]).toMatchObject({
        filters: {
          search: 'lions',
          level: 'Premier',
          only_with_open_slots: true,
          date_from: Date.UTC(2026, 9, 10),
          date_to: Date.UTC(2026, 9, 12),
        },
        include_quick_link: true,
      });
    });

    it('refuses a last date before the first date', async () => {
      const { api, component, element, save, settle, type } = render({ draft_id: null });
      await settle();

      type('draft-subject', 'Dates');
      component.model.update((model) => ({
        ...model,
        date_from: new Date(2026, 9, 12),
        date_to: new Date(2026, 9, 10),
      }));
      await save();

      expect(api.create_draft).not.toHaveBeenCalled();
      expect(element.textContent).toContain('The last date cannot be before the first date.');
    });

    it('disables the quick link days until the toggle is on, and checks the range', async () => {
      const { api, by_testid, component, save, settle, type } = render({ draft_id: null });
      await settle();
      expect((by_testid('draft-quick-link-days') as HTMLInputElement).disabled).toBe(true);

      component.on_quick_link_changed(true);
      await settle();
      expect((by_testid('draft-quick-link-days') as HTMLInputElement).disabled).toBe(false);

      type('draft-subject', 'Days');
      type('draft-quick-link-days', '120');
      await save();
      expect(api.create_draft).not.toHaveBeenCalled();
      expect(component.form.quick_link_expiry_days().errors()[0]?.message).toBe(
        'Enter a whole number of days from 1 to 90.',
      );

      type('draft-quick-link-days', '30');
      await save();
      expect(api.create_draft).toHaveBeenCalledTimes(1);
      expect(api.create_draft.mock.calls[0][0].quick_link_expiry_days).toBe(30);
    });

    it('counts the intro against its limit, right-aligned in a hint', async () => {
      const { by_testid, settle, type } = render({ draft_id: null });
      await settle();

      type('draft-intro', 'Hello');

      expect(by_testid('draft-intro-counter')?.textContent?.trim()).toBe('5 of 2,000');
    });

    it('refuses an intro that is too long', async () => {
      const { api, element, save, settle, type } = render({ draft_id: null });
      await settle();

      type('draft-subject', 'Long');
      type('draft-intro', 'x'.repeat(2001));
      await save();

      expect(api.create_draft).not.toHaveBeenCalled();
      expect(element.textContent).toContain('The message can be at most 2000 characters.');
    });

    it('shows a server validation message under its field and keeps the form', async () => {
      const { by_testid, element, save, settle, type } = render({
        draft_id: null,
        create_draft: () =>
          throwError(() =>
            api_failure(400, 'VALIDATION_ERROR', [
              { path: 'subject', message: 'Subject has odd characters' },
            ]),
          ),
      });
      await settle();

      type('draft-subject', 'Odd');
      await save();

      expect(element.querySelector('mat-error')?.textContent).toContain(
        'Subject has odd characters',
      );
      expect(by_testid('draft-save')).not.toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not save the draft', expect.anything());
    });

    it('shows a translated message, never the server wording, for any other failure', async () => {
      const { by_testid, save, settle, type } = render({
        draft_id: null,
        create_draft: () => throwError(() => api_failure(500, 'INTERNAL')),
      });
      await settle();

      type('draft-subject', 'Boom');
      await save();

      expect(by_testid('draft-form-error')?.getAttribute('role')).toBe('alert');
      expect(by_testid('draft-form-error')?.textContent).toContain(
        'Something went wrong. Try again.',
      );
      expect(by_testid('draft-form-error')?.textContent).not.toContain('server text');
    });

    it('reads the draft again when it turns out to be locked', async () => {
      const { api, by_testid, save, settle, type } = render({
        update_draft: () => throwError(() => api_failure(409, 'DRAFT_LOCKED')),
      });
      await settle();

      type('draft-subject', 'Too late');
      await save();

      expect(by_testid('draft-form-error')?.textContent).toContain('already been sent');
      expect(api.get_draft).toHaveBeenCalledTimes(2);
    });

    it('shows a spinner and blocks the button while saving', async () => {
      const pending = new Subject<IEmailDraft>();
      const { by_testid, fixture, save, settle, type } = render({
        draft_id: null,
        create_draft: () => pending,
      });
      await settle();

      type('draft-subject', 'Slow');
      await save();
      fixture.detectChanges();

      const button = by_testid('draft-save') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.querySelector('mat-progress-spinner')).not.toBeNull();
    });
  });

  describe('previewing and sending', () => {
    async function saved_editor(options: IRenderOptions = {}) {
      const rendered = render(options);
      await rendered.settle();
      return rendered;
    }

    it('loads the preview of the saved draft', async () => {
      const { api, by_testid } = await saved_editor();

      expect(api.get_preview).toHaveBeenCalledWith('draft-1');
      expect(by_testid('draft-preview-recipients')?.textContent?.trim()).toBe('2');
    });

    it('enables Send and the test send for a clean, saved, unchanged draft', async () => {
      const { by_testid, component } = await saved_editor();

      expect(component.can_send()).toBe(true);
      expect(component.can_test_send()).toBe(true);
      expect((by_testid('draft-send') as HTMLButtonElement).disabled).toBe(false);
    });

    it('blocks Send while there are unsaved changes, and says the preview is stale', async () => {
      const { by_testid, component, type } = await saved_editor();

      type('draft-subject', 'Something else');

      expect(component.can_send()).toBe(false);
      expect(component.can_test_send()).toBe(false);
      expect((by_testid('draft-send') as HTMLButtonElement).disabled).toBe(true);
      expect(by_testid('draft-preview-stale')).not.toBeNull();
    });

    it('blocks Send for a blocking warning, and the test send when sending is not set up', async () => {
      const { by_testid, component } = await saved_editor({
        get_preview: () => of(BLOCKED_PREVIEW),
      });

      expect(component.can_send()).toBe(false);
      expect(component.can_test_send()).toBe(false);
      expect((by_testid('draft-send') as HTMLButtonElement).disabled).toBe(true);
    });

    it('allows the test send, but not Send, when only nobody would receive it', async () => {
      const { component } = await saved_editor({
        get_preview: () =>
          of(
            make_draft_preview({
              eligible_recipient_count: 0,
              warnings: [PreviewWarningCode.NO_RECIPIENTS],
            }),
          ),
      });

      expect(component.can_send()).toBe(false);
      expect(component.can_test_send()).toBe(true);
    });

    it('does not block Send for an advisory warning', async () => {
      const { component } = await saved_editor({
        get_preview: () =>
          of(make_draft_preview({ warnings: [PreviewWarningCode.NO_POSTAL_ADDRESS] })),
      });

      expect(component.can_send()).toBe(true);
    });

    it('reads the preview again when the sender settings change', async () => {
      const { api, fixture, settle } = await saved_editor();

      fixture.componentRef.setInput('settings', { ...CONFIGURED_SETTINGS, configured: false });
      fixture.detectChanges();
      await settle();

      expect(api.get_preview).toHaveBeenCalledTimes(2);
    });

    it('shows a preview error and loads again on request', async () => {
      let calls = 0;
      const { api, by_testid, settle } = await saved_editor({
        get_preview: () =>
          ++calls === 1 ? throwError(() => api_failure(500, 'INTERNAL')) : of(CLEAN_PREVIEW),
      });

      expect(by_testid('draft-preview-error')).not.toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not load the preview', expect.anything());
      by_testid('draft-preview-retry')?.click();
      await settle();

      expect(api.get_preview).toHaveBeenCalledTimes(2);
      expect(by_testid('draft-preview-recipients')).not.toBeNull();
    });

    describe('the test send', () => {
      it('emails the saved draft to the signed-in user and names their address', async () => {
        const { api, by_testid, settle, toast } = await saved_editor({ email: 'me@example.test' });

        by_testid('draft-test-send')?.click();
        await settle();

        expect(api.send_test).toHaveBeenCalledWith('draft-1');
        expect(toast.show_success).toHaveBeenCalledWith('Test email sent to me@example.test.');
      });

      it('words the confirmation generically when the account has no address on file', async () => {
        const { by_testid, settle, toast } = await saved_editor({ email: null });

        by_testid('draft-test-send')?.click();
        await settle();

        expect(toast.show_success).toHaveBeenCalledWith('Test email sent to your address.');
      });

      it('explains a failure with a translated message and logs the real error', async () => {
        const { by_testid, settle, toast } = await saved_editor({
          send_test: () => throwError(() => api_failure(409, 'NO_EMAIL_ON_ACCOUNT')),
        });

        by_testid('draft-test-send')?.click();
        await settle();

        expect(toast.show_error).toHaveBeenCalledWith(
          'Your account has no email address to send the test to.',
        );
        expect(logged).toHaveBeenCalledWith('Could not send the test email', expect.anything());
      });

      it('sends one test at a time', async () => {
        const pending = new Subject<void>();
        const { api, by_testid, component, fixture, settle } = await saved_editor({
          send_test: () => pending,
        });

        by_testid('draft-test-send')?.click();
        fixture.detectChanges();
        await component.on_test_send_requested();

        expect(api.send_test).toHaveBeenCalledTimes(1);
        pending.next();
        pending.complete();
        await settle();
      });
    });

    describe('the send confirmation', () => {
      it('opens with what the sender was shown on the preview, never addresses', async () => {
        const { by_testid, dialog, settle } = await saved_editor();

        by_testid('draft-send')?.click();
        await settle();

        const [component, config] = dialog.open.mock.calls[0] as unknown as [
          unknown,
          { data: ISendDialogData },
        ];
        expect(component).toBe(SendConfirmDialogComponent);
        expect(config.data).toEqual({
          draft_id: 'draft-1',
          subject: CLEAN_PREVIEW.subject,
          recipient_count: 2,
          recipient_names: ['Alice Archer', 'Bob Baker'],
          more_recipient_count: 0,
          game_count: 4,
          include_quick_link: true,
          quick_link_expiry_days: 7,
          is_retry: false,
        });
        expect(JSON.stringify(config.data)).not.toContain('@');
      });

      it('counts the recipients the preview counts, naming only the first few', async () => {
        const { by_testid, dialog, settle } = await saved_editor({
          get_preview: () => of(make_draft_preview({ eligible_recipient_count: 12 })),
        });

        by_testid('draft-send')?.click();
        await settle();

        const [, config] = dialog.open.mock.calls[0] as unknown as [
          unknown,
          { data: ISendDialogData },
        ];
        expect(config.data.recipient_count).toBe(12);
        expect(config.data.more_recipient_count).toBe(10);
      });

      it('shows the result, reads the draft again and tells the list after a send', async () => {
        const dialog_results = new Map<unknown, unknown>([
          [
            SendConfirmDialogComponent,
            { kind: SendOutcomeKind.SENT, result: FULL_SEND_RESULT } satisfies ISendDialogOutcome,
          ],
        ]);
        const { api, by_testid, events, settle, toast } = await saved_editor({
          dialog_results,
          get_draft: () => of(OPEN_DRAFT),
        });
        api.get_draft.mockReturnValue(
          of({ ...OPEN_DRAFT, status: DraftStatus.SENT, recipient_count: 2 }),
        );

        by_testid('draft-send')?.click();
        await settle();

        expect(by_testid('send-results-summary')?.textContent).toContain('Sent to 2 people.');
        expect(toast.show_success).toHaveBeenCalledWith('The email was sent.');
        expect(events.changed).toBe(1);
        expect(by_testid('draft-subject')).toBeNull();
        expect(by_testid('draft-editor-status')?.textContent).toContain('Sent');
        expect(by_testid('draft-send')).toBeNull();
      });

      it('explains that nothing was sent when the recipient count changed, and reads the preview again', async () => {
        const dialog_results = new Map<unknown, unknown>([
          [SendConfirmDialogComponent, { kind: SendOutcomeKind.COUNT_CHANGED }],
        ]);
        const { api, by_testid, settle } = await saved_editor({ dialog_results });

        by_testid('draft-send')?.click();
        await settle();

        expect(by_testid('draft-count-changed')?.getAttribute('role')).toBe('alert');
        expect(by_testid('draft-count-changed')?.textContent).toContain('Nothing was sent');
        expect(api.get_preview).toHaveBeenCalledTimes(2);
        expect(by_testid('send-results')).toBeNull();
      });

      it('clears that notice at the next attempt', async () => {
        const dialog_results = new Map<unknown, unknown>([
          [SendConfirmDialogComponent, { kind: SendOutcomeKind.COUNT_CHANGED }],
        ]);
        const { by_testid, component, settle } = await saved_editor({ dialog_results });
        by_testid('draft-send')?.click();
        await settle();
        expect(component.count_changed_notice()).toBe(true);

        dialog_results.set(SendConfirmDialogComponent, undefined);
        by_testid('draft-send')?.click();
        await settle();

        expect(component.count_changed_notice()).toBe(false);
      });

      it('says the draft is no longer a draft, and reads it again, when it was locked meanwhile', async () => {
        const dialog_results = new Map<unknown, unknown>([
          [SendConfirmDialogComponent, { kind: SendOutcomeKind.LOCKED }],
        ]);
        const { api, by_testid, events, settle, toast } = await saved_editor({ dialog_results });

        by_testid('draft-send')?.click();
        await settle();

        expect(toast.show_error).toHaveBeenCalledWith(
          'This draft has already been sent and can no longer be changed.',
        );
        expect(api.get_draft).toHaveBeenCalledTimes(2);
        expect(events.changed).toBe(1);
      });

      it('does nothing when the sender cancels', async () => {
        const { api, by_testid, events, settle, toast } = await saved_editor();

        by_testid('draft-send')?.click();
        await settle();

        expect(toast.show_success).not.toHaveBeenCalled();
        expect(events.changed).toBe(0);
        expect(api.get_draft).toHaveBeenCalledTimes(1);
      });

      it('never opens when sending is not allowed', async () => {
        const { component, dialog, settle } = await saved_editor({
          get_preview: () => of(BLOCKED_PREVIEW),
        });

        await component.on_send_requested();
        await settle();

        expect(dialog.open).not.toHaveBeenCalled();
      });
    });

    describe('after a partial send', () => {
      it('retries only the failed, with the preview count and a retry dialog', async () => {
        const dialog_results = new Map<unknown, unknown>([
          [
            SendConfirmDialogComponent,
            {
              kind: SendOutcomeKind.SENT,
              result: PARTIAL_SEND_RESULT,
            } satisfies ISendDialogOutcome,
          ],
        ]);
        const { api, by_testid, dialog, settle } = await saved_editor({ dialog_results });
        api.get_draft.mockReturnValue(of({ ...OPEN_DRAFT, status: DraftStatus.PARTIALLY_SENT }));
        api.get_preview.mockReturnValue(of(make_draft_preview({ eligible_recipient_count: 1 })));

        by_testid('draft-send')?.click();
        await settle();
        expect(by_testid('send-results-summary')?.textContent).toContain(
          '1 person could not be reached.',
        );

        dialog_results.set(SendConfirmDialogComponent, undefined);
        by_testid('send-results-retry')?.click();
        await settle();

        const [, config] = dialog.open.mock.calls[1] as unknown as [
          unknown,
          { data: ISendDialogData },
        ];
        expect(config.data.is_retry).toBe(true);
        expect(config.data.recipient_count).toBe(1);
      });
    });
  });

  describe('a draft that is no longer a draft', () => {
    it('shows a sent draft read-only, with no form and no preview', async () => {
      const { api, by_testid, settle } = render({
        get_draft: () => of(SENT_DRAFT),
        draft_id: 'draft-2',
      });
      await settle();

      expect(by_testid('draft-subject')).toBeNull();
      expect(by_testid('draft-locked-subject')?.textContent?.trim()).toBe(SENT_DRAFT.subject);
      expect(by_testid('draft-locked-recipients')?.textContent?.trim()).toBe('42');
      expect(by_testid('draft-locked-sent')?.textContent).toContain('2026');
      expect(by_testid('draft-preview')).toBeNull();
      expect(api.get_preview).not.toHaveBeenCalled();
    });

    it('shows the intro of a sent draft', async () => {
      const { by_testid, settle } = render({
        get_draft: () => of({ ...SENT_DRAFT, intro: 'Hello all' }),
        draft_id: 'draft-2',
      });
      await settle();

      expect(by_testid('draft-locked-intro')?.textContent).toContain('Hello all');
    });

    it('says a draft being sent is being sent, and checks again on request', async () => {
      const { api, by_testid, settle } = render({
        get_draft: () => of(SENDING_DRAFT),
        draft_id: 'draft-4',
      });
      await settle();

      expect(by_testid('draft-sending-notice')?.getAttribute('role')).toBe('status');
      expect(by_testid('draft-send')).toBeNull();
      api.get_draft.mockReturnValue(of({ ...SENDING_DRAFT, status: DraftStatus.SENT }));
      by_testid('draft-refresh')?.click();
      await settle();

      expect(by_testid('draft-sending-notice')).toBeNull();
    });

    it('offers a retry for a partly sent draft, with a preview of who is left', async () => {
      const { api, by_testid, component, settle } = render({
        get_draft: () => of(PARTIAL_DRAFT),
        draft_id: 'draft-3',
      });
      await settle();

      expect(component.is_partially_sent()).toBe(true);
      expect(api.get_preview).toHaveBeenCalledWith('draft-3');
      expect(by_testid('draft-send')?.textContent).toContain('Retry failed recipients');
      expect(by_testid('draft-test-send')).toBeNull();
      expect(component.can_test_send()).toBe(false);
    });

    it('tells the sender when the draft cannot be read again', async () => {
      const { api, component, settle, toast } = render({
        get_draft: () => of(SENDING_DRAFT),
        draft_id: 'draft-4',
      });
      await settle();
      api.get_draft.mockReturnValue(throwError(() => api_failure(500, 'INTERNAL')));

      await component.refresh_draft();

      expect(toast.show_error).toHaveBeenCalledWith('The draft could not be refreshed. Try again.');
      expect(logged).toHaveBeenCalledWith('Could not read the draft again', expect.anything());
    });
  });

  describe('leaving', () => {
    it('closes at once when nothing is unsaved', async () => {
      const { by_testid, dialog, events, settle } = render();
      await settle();

      by_testid('draft-editor-back')?.click();
      await settle();

      expect(events.closed).toEqual([null]);
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('asks first when there are unsaved changes, naming the draft, and stays if declined', async () => {
      const { by_testid, dialog, events, settle, type } = render();
      await settle();

      type('draft-subject', 'Something else');
      by_testid('draft-editor-back')?.click();
      await settle();

      expect(dialog.open).toHaveBeenCalledTimes(1);
      const [, config] = dialog.open.mock.calls[0] as unknown as [
        unknown,
        { data: { message: string; is_destructive: boolean; confirm_button_label: string } },
      ];
      expect(config.data.is_destructive).toBe(true);
      expect(config.data.message).toContain('Something else');
      expect(config.data.confirm_button_label).toBe('Discard changes');
      expect(events.closed).toEqual([]);
    });

    it('leaves when the sender agrees to discard', async () => {
      const { component, dialog_results, events, settle, type } = render();
      await settle();
      dialog_results.set(ConfirmationDialogComponent, true);

      type('draft-subject', 'Something else');
      await component.on_leave_requested();

      expect(events.closed).toEqual([null]);
    });

    it('names a draft with no subject yet generically in the prompt', async () => {
      const { component, dialog, settle, type } = render({ draft_id: null });
      await settle();

      type('draft-search', 'x');
      await component.on_leave_requested();

      const [, config] = dialog.open.mock.calls[0] as unknown as [
        unknown,
        { data: { message: string } },
      ];
      expect(config.data.message).toContain('this draft');
    });

    it('opens the sender settings from a warning fix', async () => {
      const { component, events } = render();

      component.on_fix_requested(PreviewFixTarget.SETTINGS);

      expect(events.settings).toBe(1);
    });

    it('goes to the contacts area from a warning fix, closing the editor', async () => {
      const { component, events, settle } = render();
      await settle();

      component.on_fix_requested(PreviewFixTarget.CONTACTS);
      await settle();

      expect(events.closed).toEqual([EmailView.CONTACTS]);
    });
  });
});
