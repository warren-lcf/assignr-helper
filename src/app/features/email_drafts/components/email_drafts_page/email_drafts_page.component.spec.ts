import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent, ToastService } from '@hch-shared-libraries/ui-kit/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GAMES_RESULT } from '../../../games/mocks/game_view.mock';
import { GamesApiService } from '../../../games/services/games_api.service';
import { EmailSettingsChange } from '../../enums/email_settings_change.enum';
import { EmailView } from '../../enums/email_view.enum';
import { ALICE, CAROL_UNSUBSCRIBED, CONTACT_FIXTURES } from '../../mocks/email_contact.mock';
import { DRAFT_FIXTURES, OPEN_DRAFT } from '../../mocks/email_draft.mock';
import { CONFIGURED_SETTINGS, UNCONFIGURED_SETTINGS } from '../../mocks/email_settings.mock';
import {
  ISessionDoubleOptions,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IEmailContact } from '../../models/email_contact.model';
import { IEmailDraft } from '../../models/email_draft.model';
import { IEmailSettings } from '../../models/email_settings.model';
import { EmailContactsApiService } from '../../services/email_contacts_api.service';
import { EmailDraftsApiService } from '../../services/email_drafts_api.service';
import { EmailSettingsApiService } from '../../services/email_settings_api.service';
import { AddContactDialogComponent } from '../add_contact_dialog/add_contact_dialog.component';
import { DraftEditorComponent } from '../draft_editor/draft_editor.component';
import { EmailSettingsDialogComponent } from '../email_settings_dialog/email_settings_dialog.component';
import { ImportContactsDialogComponent } from '../import_contacts_dialog/import_contacts_dialog.component';
import { EmailDraftsPageComponent } from './email_drafts_page.component';

function http_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations: [] } });
}

interface IRenderOptions {
  permissions?: readonly PermissionKey[];
  session?: ISessionDoubleOptions;
  drafts?: () => Observable<IEmailDraft[]>;
  contacts?: () => Observable<IEmailContact[]>;
  settings?: () => Observable<IEmailSettings>;
  delete_draft?: () => Observable<void>;
  delete_contact?: () => Observable<void>;
  dialog_results?: Map<unknown, unknown>;
}

function render(options: IRenderOptions = {}) {
  const drafts_api = {
    list_drafts: vi.fn(options.drafts ?? (() => of([...DRAFT_FIXTURES]))),
    delete_draft: vi.fn(options.delete_draft ?? (() => of(undefined))),
    get_draft: vi.fn(() => of(OPEN_DRAFT)),
    get_preview: vi.fn(() =>
      of({
        ...{
          subject: 's',
          html: '',
          text: '',
          game_count: 1,
          eligible_recipient_count: 1,
          skipped: { unsubscribed: 0, missing: 0 },
          warnings: [],
        },
      }),
    ),
  };
  const contacts_api = {
    list_contacts: vi.fn(options.contacts ?? (() => of([...CONTACT_FIXTURES]))),
    delete_contact: vi.fn(options.delete_contact ?? (() => of(undefined))),
  };
  const settings_api = {
    get_settings: vi.fn(options.settings ?? (() => of(CONFIGURED_SETTINGS))),
  };
  const toast = { show_success: vi.fn(), show_error: vi.fn(), show_info: vi.fn() };
  const dialog_results = options.dialog_results ?? new Map<unknown, unknown>();
  const dialog = {
    open: vi.fn((component: unknown, config?: unknown) => ({
      afterClosed: () => of(dialog_results.get(component)),
      config,
    })),
  };
  const session = make_session_service_double(
    options.permissions ?? OWNER_PERMISSIONS,
    options.session,
  );
  TestBed.configureTestingModule({
    imports: [EmailDraftsPageComponent],
    providers: [
      { provide: EmailDraftsApiService, useValue: drafts_api },
      { provide: EmailContactsApiService, useValue: contacts_api },
      { provide: EmailSettingsApiService, useValue: settings_api },
      { provide: GamesApiService, useValue: { list_games: () => of(GAMES_RESULT) } },
      { provide: SessionService, useValue: session },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(EmailDraftsPageComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    for (let round = 0; round < 2; round++) {
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const confirmation = (answer: boolean) => dialog_results.set(ConfirmationDialogComponent, answer);
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    drafts_api,
    contacts_api,
    settings_api,
    toast,
    dialog,
    dialog_results,
    session,
    settle,
    by_testid,
    confirmation,
  };
}

describe('EmailDraftsPageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('states', () => {
    it('shows skeleton cards while the drafts load', () => {
      const pending = new Subject<IEmailDraft[]>();
      const { by_testid, element } = render({ drafts: () => pending });

      expect(by_testid('email-drafts-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('hch-skeleton-card')).toHaveLength(3);
      expect(element.querySelector('app-drafts-list')).toBeNull();
    });

    it('shows skeletons while the session loads, and asks for nothing yet', async () => {
      const { by_testid, drafts_api, settle } = render({ session: { is_loading: true } });
      await settle();

      expect(by_testid('email-drafts-loading')).not.toBeNull();
      expect(drafts_api.list_drafts).not.toHaveBeenCalled();
    });

    it('lists a card per draft under the page title, with a polite count', async () => {
      const { by_testid, element, settle } = render();
      await settle();

      expect(element.querySelector('hch-page-container')).not.toBeNull();
      expect(element.querySelectorAll('app-drafts-list mat-card')).toHaveLength(4);
      const count = by_testid('email-drafts-count');
      expect(count?.textContent?.trim()).toBe('4 drafts');
      expect(count?.getAttribute('aria-live')).toBe('polite');
    });

    it('names a single draft in the singular', async () => {
      const { by_testid, settle } = render({ drafts: () => of([OPEN_DRAFT]) });
      await settle();

      expect(by_testid('email-drafts-count')?.textContent?.trim()).toBe('1 draft');
    });

    it('invites the first draft when there are none, and the invitation opens the editor', async () => {
      const { by_testid, component, element, settle } = render({ drafts: () => of([]) });
      await settle();

      expect(by_testid('email-drafts-empty')?.textContent).toContain('No email drafts yet');
      by_testid('email-drafts-empty-new')?.click();
      await settle();

      expect(component.editor_target()).toEqual({ draft_id: null });
      expect(element.querySelector('app-draft-editor')).not.toBeNull();
    });

    it('shows a no-access state, and asks for nothing, without email.send', async () => {
      const { by_testid, contacts_api, drafts_api, settings_api, settle } = render({
        permissions: MEMBER_PERMISSIONS,
      });
      await settle();

      expect(by_testid('email-drafts-no-access')?.textContent).toContain(
        'You do not have access to email',
      );
      expect(drafts_api.list_drafts).not.toHaveBeenCalled();
      expect(contacts_api.list_contacts).not.toHaveBeenCalled();
      expect(settings_api.get_settings).not.toHaveBeenCalled();
      expect(by_testid('email-new-draft')).toBeNull();
    });

    it('shows an error with a retry when the drafts fail, and loads again on retry', async () => {
      let calls = 0;
      const { by_testid, drafts_api, element, settle } = render({
        drafts: () =>
          ++calls === 1 ? throwError(() => http_error(500, 'INTERNAL')) : of([OPEN_DRAFT]),
      });
      await settle();

      expect(element.textContent).toContain('Email drafts could not be loaded');
      expect(logged).toHaveBeenCalledWith('Could not load the email drafts', expect.anything());
      by_testid('email-drafts-retry')?.click();
      await settle();

      expect(drafts_api.list_drafts).toHaveBeenCalledTimes(2);
      expect(by_testid('email-drafts-count')?.textContent?.trim()).toBe('1 draft');
    });

    it('tells a platform administrator to choose a tenant first', async () => {
      const { element, settle } = render({
        drafts: () => throwError(() => http_error(400, 'TENANT_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('Choose a tenant first');
    });

    it('reloads the session, not the drafts, when the session is what failed', async () => {
      const { by_testid, drafts_api, session, settle } = render({
        permissions: [],
        session: { has_failed: true },
      });
      await settle();

      by_testid('email-drafts-retry')?.click();

      expect(session.reload_count()).toBe(1);
      expect(drafts_api.list_drafts).not.toHaveBeenCalled();
    });
  });

  describe('the not-configured banner', () => {
    it('shows when sending is not set up, and its button opens the sender settings', async () => {
      const dialog_results = new Map<unknown, unknown>();
      const { by_testid, dialog, settle } = render({
        settings: () => of(UNCONFIGURED_SETTINGS),
        dialog_results,
      });
      await settle();

      expect(by_testid('email-not-configured-banner')?.getAttribute('role')).toBe('status');
      by_testid('email-not-configured-setup')?.click();
      await settle();

      expect(dialog.open).toHaveBeenCalledWith(
        EmailSettingsDialogComponent,
        expect.objectContaining({ data: UNCONFIGURED_SETTINGS }),
      );
    });

    it('does not show once sending is set up', async () => {
      const { by_testid, settle } = render();
      await settle();

      expect(by_testid('email-not-configured-banner')).toBeNull();
    });

    it('does not show while the settings are still loading', async () => {
      const pending = new Subject<IEmailSettings>();
      const { by_testid, fixture, settle } = render({ settings: () => pending });
      // The app is never stable while a request is open, so only let the other requests land.
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();

      expect(by_testid('email-drafts-count')).not.toBeNull();
      expect(by_testid('email-not-configured-banner')).toBeNull();

      pending.next(UNCONFIGURED_SETTINGS);
      pending.complete();
      await settle();
      expect(by_testid('email-not-configured-banner')).not.toBeNull();
    });

    it('stays out of the way when the settings cannot be read, and logs why', async () => {
      const { by_testid, settle } = render({
        settings: () => throwError(() => http_error(500, 'INTERNAL')),
      });
      await settle();

      expect(by_testid('email-not-configured-banner')).toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not load the sender settings', expect.anything());
    });
  });

  describe('the header actions', () => {
    it('offers New draft and Sender settings to someone who may send', async () => {
      const { component, settle } = render();
      await settle();

      const actions = component.header_actions();
      expect(actions.map((action) => action.testid)).toEqual([
        'email-new-draft',
        'email-sender-settings',
      ]);
      expect(actions[1].disabled).toBe(false);
    });

    it('offers nothing without access, and while the editor is open', async () => {
      const member = render({ permissions: MEMBER_PERMISSIONS });
      await member.settle();
      expect(member.component.header_actions()).toEqual([]);
      TestBed.resetTestingModule();

      const owner = render();
      await owner.settle();
      owner.component.on_new_draft_requested();
      expect(owner.component.header_actions()).toEqual([]);
    });

    it('disables Sender settings until the settings have loaded', () => {
      const pending = new Subject<IEmailSettings>();
      const { component } = render({ settings: () => pending });

      expect(
        component.header_actions().find((a) => a.testid === 'email-sender-settings')?.disabled,
      ).toBe(true);
    });
  });

  describe('the editor', () => {
    it('opens on a new draft, and on a stored one', async () => {
      const { component, element, settle } = render();
      await settle();

      component.on_new_draft_requested();
      await settle();
      expect(element.querySelector('app-draft-editor')).not.toBeNull();
      expect(component.editor_target()).toEqual({ draft_id: null });

      component.on_editor_closed(null);
      await settle();
      component.on_open_draft_requested(OPEN_DRAFT);
      await settle();
      expect(component.editor_target()).toEqual({ draft_id: 'draft-1' });
    });

    it('returns to the lists when it closes, reading the drafts again', async () => {
      const { component, drafts_api, element, settle } = render();
      await settle();
      component.on_new_draft_requested();
      await settle();

      component.on_editor_closed(null);
      await settle();

      expect(element.querySelector('app-draft-editor')).toBeNull();
      expect(element.querySelector('app-drafts-list')).not.toBeNull();
      expect(drafts_api.list_drafts).toHaveBeenCalledTimes(2);
    });

    it('lands on the contacts area when the editor sends the sender there', async () => {
      const { component, element, settle } = render();
      await settle();
      component.on_new_draft_requested();
      await settle();

      component.on_editor_closed(EmailView.CONTACTS);
      await settle();

      expect(component.view()).toBe(EmailView.CONTACTS);
      expect(element.querySelector('app-contacts-panel')).not.toBeNull();
    });

    it('reads the drafts again whenever the editor says something changed', async () => {
      const { component, drafts_api, fixture, settle } = render();
      await settle();
      component.on_new_draft_requested();
      await settle();

      fixture.debugElement
        .query((node) => node.name === 'app-draft-editor')
        .componentInstance.draft_changed.emit();
      await settle();

      expect(drafts_api.list_drafts).toHaveBeenCalledTimes(2);
      expect(
        fixture.debugElement.query((node) => node.name === 'app-draft-editor').componentInstance,
      ).toBeInstanceOf(DraftEditorComponent);
    });

    it('opens the sender settings when the editor asks', async () => {
      const { component, dialog, fixture, settle } = render();
      await settle();
      component.on_new_draft_requested();
      await settle();

      fixture.debugElement
        .query((node) => node.name === 'app-draft-editor')
        .componentInstance.settings_requested.emit();
      await settle();

      expect(dialog.open).toHaveBeenCalledWith(EmailSettingsDialogComponent, expect.anything());
    });
  });

  describe('views', () => {
    it('switches between drafts and contacts, and ignores an unknown view', async () => {
      const { component, element, settle } = render();
      await settle();

      component.on_view_selected(EmailView.CONTACTS);
      await settle();
      expect(element.querySelector('app-contacts-panel')).not.toBeNull();
      expect(element.querySelector('app-drafts-list')).toBeNull();

      component.on_view_selected('SOMETHING_ELSE');
      expect(component.view()).toBe(EmailView.CONTACTS);

      component.on_view_selected(EmailView.DRAFTS);
      await settle();
      expect(element.querySelector('app-drafts-list')).not.toBeNull();
    });

    it('shows the contacts, with a load error that has a retry', async () => {
      let calls = 0;
      const { by_testid, component, contacts_api, settle } = render({
        contacts: () =>
          ++calls === 1 ? throwError(() => http_error(500, 'INTERNAL')) : of([ALICE]),
      });
      await settle();
      component.on_view_selected(EmailView.CONTACTS);
      await settle();

      expect(by_testid('contacts-error')).not.toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not load the contacts', expect.anything());
      by_testid('contacts-retry')?.click();
      await settle();

      expect(contacts_api.list_contacts).toHaveBeenCalledTimes(2);
      expect(by_testid('contact-row-contact-1')).not.toBeNull();
    });
  });

  describe('deleting a draft', () => {
    it('asks first, naming the draft, and deletes nothing when declined', async () => {
      const { by_testid, confirmation, dialog, drafts_api, settle } = render();
      await settle();
      confirmation(false);

      by_testid('draft-delete-draft-1')?.click();
      await settle();

      const [, config] = dialog.open.mock.calls[0] as unknown as [
        unknown,
        { data: { message: string; is_destructive: boolean } },
      ];
      expect(config.data.is_destructive).toBe(true);
      expect(config.data.message).toContain('Games available this weekend');
      expect(config.data.message).toContain('cannot be undone');
      expect(drafts_api.delete_draft).not.toHaveBeenCalled();
    });

    it('deletes when confirmed, then reads the list again and says so', async () => {
      const { by_testid, confirmation, drafts_api, settle, toast } = render();
      await settle();
      confirmation(true);

      by_testid('draft-delete-draft-1')?.click();
      await settle();

      expect(drafts_api.delete_draft).toHaveBeenCalledWith('draft-1');
      expect(toast.show_success).toHaveBeenCalledWith('Deleted "Games available this weekend".');
      expect(drafts_api.list_drafts).toHaveBeenCalledTimes(2);
    });

    it('says so, with the real error logged, when the delete fails', async () => {
      const { by_testid, confirmation, settle, toast } = render({
        delete_draft: () => throwError(() => http_error(500, 'INTERNAL')),
      });
      await settle();
      confirmation(true);

      by_testid('draft-delete-draft-1')?.click();
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(
        'Could not delete "Games available this weekend". Try again.',
      );
      expect(logged).toHaveBeenCalledWith('Could not delete the draft', expect.anything());
    });

    it('lets one delete run at a time', async () => {
      const pending = new Subject<void>();
      const { by_testid, component, confirmation, drafts_api, settle } = render({
        delete_draft: () => pending,
      });
      await settle();
      confirmation(true);

      by_testid('draft-delete-draft-1')?.click();
      await settle();
      expect(component.busy_draft_id()).toBe('draft-1');
      await component.on_delete_draft_requested(OPEN_DRAFT);

      expect(drafts_api.delete_draft).toHaveBeenCalledTimes(1);
      pending.next();
      pending.complete();
      await settle();
      expect(component.busy_draft_id()).toBeNull();
    });
  });

  describe('contacts', () => {
    async function contacts_page(options: IRenderOptions = {}) {
      const rendered = render(options);
      await rendered.settle();
      rendered.component.on_view_selected(EmailView.CONTACTS);
      await rendered.settle();
      return rendered;
    }

    it('adds a contact through the dialog, then reads the contacts again and says so', async () => {
      const dialog_results = new Map<unknown, unknown>([[AddContactDialogComponent, ALICE]]);
      const { by_testid, contacts_api, dialog, settle, toast } = await contacts_page({
        dialog_results,
      });

      by_testid('contacts-add')?.click();
      await settle();

      expect(dialog.open).toHaveBeenCalledWith(AddContactDialogComponent, expect.anything());
      expect(toast.show_success).toHaveBeenCalledWith('Added Alice Archer.');
      expect(contacts_api.list_contacts).toHaveBeenCalledTimes(2);
    });

    it('does nothing when the add dialog is dismissed', async () => {
      const { by_testid, contacts_api, settle, toast } = await contacts_page();

      by_testid('contacts-add')?.click();
      await settle();

      expect(toast.show_success).not.toHaveBeenCalled();
      expect(contacts_api.list_contacts).toHaveBeenCalledTimes(1);
    });

    it('reads the contacts again after an import, however the dialog closes', async () => {
      const dialog_results = new Map<unknown, unknown>([
        [ImportContactsDialogComponent, { added: 1, skipped_existing: 0, invalid: [] }],
      ]);
      const { by_testid, contacts_api, settle } = await contacts_page({ dialog_results });

      by_testid('contacts-import')?.click();
      await settle();
      expect(contacts_api.list_contacts).toHaveBeenCalledTimes(2);

      // Dismissed with Escape after the summary: an import may still have run.
      dialog_results.delete(ImportContactsDialogComponent);
      by_testid('contacts-import')?.click();
      await settle();
      expect(contacts_api.list_contacts).toHaveBeenCalledTimes(3);
    });

    it('asks before deleting a contact, naming them, and deletes nothing when declined', async () => {
      const { by_testid, confirmation, contacts_api, dialog, settle } = await contacts_page();
      confirmation(false);

      by_testid('contact-delete-contact-3')?.click();
      await settle();

      const [, config] = dialog.open.mock.calls[0] as unknown as [
        unknown,
        { data: { message: string; is_destructive: boolean } },
      ];
      expect(config.data.is_destructive).toBe(true);
      expect(config.data.message).toContain(CAROL_UNSUBSCRIBED.display_name);
      expect(contacts_api.delete_contact).not.toHaveBeenCalled();
    });

    it('deletes a contact when confirmed, then reads the list again and says so', async () => {
      const { by_testid, confirmation, contacts_api, settle, toast } = await contacts_page();
      confirmation(true);

      by_testid('contact-delete-contact-2')?.click();
      await settle();

      expect(contacts_api.delete_contact).toHaveBeenCalledWith('contact-2');
      expect(toast.show_success).toHaveBeenCalledWith('Deleted Bob Baker.');
      expect(contacts_api.list_contacts).toHaveBeenCalledTimes(2);
    });

    it('says so, with the real error logged, when a contact cannot be deleted', async () => {
      const { by_testid, confirmation, settle, toast } = await contacts_page({
        delete_contact: () => throwError(() => http_error(500, 'INTERNAL')),
      });
      confirmation(true);

      by_testid('contact-delete-contact-2')?.click();
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith('Could not delete Bob Baker. Try again.');
      expect(logged).toHaveBeenCalledWith('Could not delete the contact', expect.anything());
    });

    it('lets one contact delete run at a time', async () => {
      const pending = new Subject<void>();
      const { by_testid, component, confirmation, contacts_api, settle } = await contacts_page({
        delete_contact: () => pending,
      });
      confirmation(true);

      by_testid('contact-delete-contact-2')?.click();
      await settle();
      expect(component.busy_contact_id()).toBe('contact-2');
      await component.on_delete_contact_requested(ALICE);

      expect(contacts_api.delete_contact).toHaveBeenCalledTimes(1);
      pending.next();
      pending.complete();
      await settle();
      expect(component.busy_contact_id()).toBeNull();
    });
  });

  describe('the sender settings', () => {
    it('opens the dialog with the stored settings', async () => {
      const { by_testid, dialog, settle } = render();
      await settle();

      by_testid('email-sender-settings')?.click();
      await settle();

      expect(dialog.open).toHaveBeenCalledWith(
        EmailSettingsDialogComponent,
        expect.objectContaining({ data: CONFIGURED_SETTINGS }),
      );
    });

    it('reads the settings again and says so after a save or a removal', async () => {
      const dialog_results = new Map<unknown, unknown>([
        [EmailSettingsDialogComponent, EmailSettingsChange.SAVED],
      ]);
      const { by_testid, settings_api, settle, toast } = render({ dialog_results });
      await settle();

      by_testid('email-sender-settings')?.click();
      await settle();
      expect(toast.show_success).toHaveBeenCalledWith('Sender settings saved.');
      expect(settings_api.get_settings).toHaveBeenCalledTimes(2);

      dialog_results.set(EmailSettingsDialogComponent, EmailSettingsChange.REMOVED);
      by_testid('email-sender-settings')?.click();
      await settle();
      expect(toast.show_success).toHaveBeenCalledWith('Sender settings removed.');
      expect(settings_api.get_settings).toHaveBeenCalledTimes(3);
    });

    it('does nothing when the dialog is dismissed', async () => {
      const { by_testid, settings_api, settle, toast } = render();
      await settle();

      by_testid('email-sender-settings')?.click();
      await settle();

      expect(toast.show_success).not.toHaveBeenCalled();
      expect(settings_api.get_settings).toHaveBeenCalledTimes(1);
    });

    it('does not open before the settings are known', async () => {
      const pending = new Subject<IEmailSettings>();
      const { component, dialog, settle } = render({ settings: () => pending });
      await new Promise((resolve) => setTimeout(resolve));

      await component.on_settings_requested();

      expect(dialog.open).not.toHaveBeenCalled();
      pending.next(CONFIGURED_SETTINGS);
      pending.complete();
      await settle();
    });
  });
});
