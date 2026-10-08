import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  CardHeaderAction,
  CardHeaderActionVariant,
  PageContainerComponent,
} from '@hch-shared-libraries/ui-kit/app';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
  EmptyStateComponent,
  ResponsiveTabOption,
  ResponsiveTabSelectComponent,
  SkeletonCardComponent,
  ToastService,
} from '@hch-shared-libraries/ui-kit/core';
import { firstValueFrom } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_count } from '../../../connections/utils/format_count';
import { is_tenant_required } from '../../../quick_links/utils/is_tenant_required';
import { EMAIL_SKELETON_COUNT } from '../../constants/email_limits.constant';
import { EmailSettingsChange } from '../../enums/email_settings_change.enum';
import { EmailView } from '../../enums/email_view.enum';
import { IEditorTarget } from '../../models/editor_target.model';
import { IEmailContact } from '../../models/email_contact.model';
import { IEmailDraft } from '../../models/email_draft.model';
import { IImportContactsResult } from '../../models/import_contacts_result.model';
import { EmailContactsApiService } from '../../services/email_contacts_api.service';
import { EmailDraftsApiService } from '../../services/email_drafts_api.service';
import { EmailSettingsApiService } from '../../services/email_settings_api.service';
import { AddContactDialogComponent } from '../add_contact_dialog/add_contact_dialog.component';
import { ContactsPanelComponent } from '../contacts_panel/contacts_panel.component';
import { DraftEditorComponent } from '../draft_editor/draft_editor.component';
import { DraftsListComponent } from '../drafts_list/drafts_list.component';
import { EmailSettingsDialogComponent } from '../email_settings_dialog/email_settings_dialog.component';
import { ImportContactsDialogComponent } from '../import_contacts_dialog/import_contacts_dialog.component';

/** Dialog sizing: roomy on a desktop, never wider than the screen on a phone. */
const DIALOG_WIDTH = '560px';
const DIALOG_MAX_WIDTH = 'calc(100vw - 32px)';

/**
 * The Email Drafts screen: write and send a "games available" email, manage
 * the contacts it goes to, and set up the sender. Needs `email.send`; without
 * it the screen says so and asks the API for nothing. Drafts and Contacts are
 * two views of one screen; the draft editor takes the place of both while a
 * draft is open.
 *
 * Sending is outward-facing and cannot be undone, so every step that leads to
 * it is explicit: sending is blocked until the sender is set up, a preview
 * shows what would go out and to how many people, and the last step is a
 * confirmation that names the number.
 */
@Component({
  selector: 'app-email-drafts-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    PageContainerComponent,
    EmptyStateComponent,
    ResponsiveTabSelectComponent,
    SkeletonCardComponent,
    ContactsPanelComponent,
    DraftEditorComponent,
    DraftsListComponent,
  ],
  templateUrl: './email_drafts_page.component.html',
  styleUrl: './email_drafts_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailDraftsPageComponent {
  private readonly drafts_api = inject(EmailDraftsApiService);
  private readonly contacts_api = inject(EmailContactsApiService);
  private readonly settings_api = inject(EmailSettingsApiService);
  private readonly session = inject(SessionService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(AppTranslationService);

  /** True while `/api/me` has not answered yet, so "no access" never flashes before permissions load. */
  public readonly is_session_pending = computed(
    () =>
      this.session.is_loading() || (this.session.context() === null && !this.session.has_failed()),
  );
  public readonly can_send_email = computed(() =>
    this.session.permissions().has(PermissionKey.EMAIL_SEND),
  );
  private readonly is_allowed = computed(() => !this.is_session_pending() && this.can_send_email());

  /** Sender settings; not requested until permissions are known and allow sending. */
  public readonly settings = rxResource({
    params: () => (this.is_allowed() ? true : undefined),
    stream: () => this.settings_api.get_settings(),
  });
  public readonly drafts = rxResource({
    params: () => (this.is_allowed() ? true : undefined),
    stream: () => this.drafts_api.list_drafts(),
  });
  public readonly contacts = rxResource({
    params: () => (this.is_allowed() ? true : undefined),
    stream: () => this.contacts_api.list_contacts(),
  });

  public readonly draft_list = computed<IEmailDraft[]>(() =>
    this.drafts.hasValue() ? this.drafts.value() : [],
  );
  public readonly contact_list = computed<IEmailContact[]>(() =>
    this.contacts.hasValue() ? this.contacts.value() : [],
  );
  /** "3 drafts"; the page live region for how many drafts there are. */
  public readonly count_text = computed(() =>
    this.draft_list().length === 1
      ? this.t('1 draft')
      : this.t('{{count}} drafts', { count: format_count(this.draft_list().length) }),
  );

  /** Skeletons show until permissions are known and the first list has arrived. */
  public readonly is_loading = computed(
    () =>
      this.is_session_pending() ||
      (this.can_send_email() && !this.drafts.hasValue() && this.drafts.error() === undefined),
  );
  public readonly session_failed = computed(
    () => !this.is_session_pending() && this.session.has_failed(),
  );
  public readonly has_no_access = computed(
    () => !this.is_session_pending() && !this.session.has_failed() && !this.can_send_email(),
  );
  public readonly load_failed = computed(
    () => !this.drafts.hasValue() && this.drafts.error() !== undefined,
  );
  /** True when the failure is a platform administrator who has not picked a tenant. */
  public readonly needs_tenant = computed(() => is_tenant_required(this.drafts.error()));
  public readonly contacts_loading = computed(
    () => !this.contacts.hasValue() && this.contacts.error() === undefined,
  );
  public readonly contacts_failed = computed(
    () => !this.contacts.hasValue() && this.contacts.error() !== undefined,
  );
  /** The banner shows only once the settings are known to be missing, never while they load. */
  public readonly show_not_configured_banner = computed(
    () => this.settings.hasValue() && !this.settings.value().configured,
  );

  public readonly views = EmailView;
  public readonly view = signal<EmailView>(EmailView.DRAFTS);
  /** The draft the editor has open, or null while the lists show. */
  public readonly editor_target = signal<IEditorTarget | null>(null);
  /** The draft being deleted, if any; a second delete waits. */
  public readonly busy_draft_id = signal<string | null>(null);
  /** The contact being deleted, if any; a second delete waits. */
  public readonly busy_contact_id = signal<string | null>(null);

  public readonly view_options = computed<ResponsiveTabOption[]>(() => [
    { value: EmailView.DRAFTS, label: this.t('Drafts') },
    { value: EmailView.CONTACTS, label: this.t('Contacts') },
  ]);
  public readonly skeleton_slots = Array.from(
    { length: EMAIL_SKELETON_COUNT },
    (_, index) => index,
  );

  /** "New draft" and "Sender settings" in the page header; only for those who may send. */
  public readonly header_actions = computed<CardHeaderAction[]>(() =>
    this.can_send_email() && this.editor_target() === null
      ? [
          {
            icon: 'edit',
            label: this.t('New draft'),
            on_click: () => this.on_new_draft_requested(),
            variant: CardHeaderActionVariant.PRIMARY,
            testid: 'email-new-draft',
          },
          {
            icon: 'settings',
            label: this.t('Sender settings'),
            on_click: () => void this.on_settings_requested(),
            variant: CardHeaderActionVariant.SECONDARY,
            disabled: !this.settings.hasValue(),
            testid: 'email-sender-settings',
          },
        ]
      : [],
  );

  public constructor() {
    effect(() => {
      const error = this.drafts.error();
      if (error) console.error('Could not load the email drafts', error);
    });
    effect(() => {
      const error = this.contacts.error();
      if (error) console.error('Could not load the contacts', error);
    });
    effect(() => {
      const error = this.settings.error();
      if (error) console.error('Could not load the sender settings', error);
    });
  }

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @param params Values for `{{placeholders}}`.
   * @returns The translated text.
   */
  public t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }

  /**
   * Loads the drafts (or the session, when that is what failed) again.
   * @returns Nothing.
   */
  public retry(): void {
    if (this.session_failed()) this.session.reload();
    else this.drafts.reload();
  }

  /**
   * Switches between Drafts and Contacts; an unknown value is ignored.
   * @param value The view's enum value, as the tab strip or select reports it.
   * @returns Nothing.
   */
  public on_view_selected(value: string): void {
    const view = Object.values(EmailView).find((candidate) => candidate === value);
    if (view) this.view.set(view);
  }

  /**
   * Opens the editor on a blank draft.
   * @returns Nothing.
   */
  public on_new_draft_requested(): void {
    this.editor_target.set({ draft_id: null });
  }

  /**
   * Opens the editor on a stored draft.
   * @param draft The draft to open.
   * @returns Nothing.
   */
  public on_open_draft_requested(draft: IEmailDraft): void {
    this.editor_target.set({ draft_id: draft.draft_id });
  }

  /**
   * Closes the editor and lands on the drafts list or another area.
   * @param target The area to land on; null keeps the current one.
   * @returns Nothing.
   */
  public on_editor_closed(target: EmailView | null): void {
    this.editor_target.set(null);
    if (target !== null) this.view.set(target);
    this.drafts.reload();
  }

  /**
   * Opens the sender settings dialog and reads them again afterwards.
   * @returns Resolves when the dialog has closed.
   */
  public async on_settings_requested(): Promise<void> {
    if (!this.settings.hasValue()) return;
    const change = await firstValueFrom(
      this.dialog
        .open<EmailSettingsDialogComponent, unknown, EmailSettingsChange>(
          EmailSettingsDialogComponent,
          { data: this.settings.value(), width: DIALOG_WIDTH, maxWidth: DIALOG_MAX_WIDTH },
        )
        .afterClosed(),
    );
    if (change === undefined) return;
    this.settings.reload();
    this.toast.show_success(
      change === EmailSettingsChange.REMOVED
        ? this.t('Sender settings removed.')
        : this.t('Sender settings saved.'),
    );
  }

  /**
   * Asks for confirmation, then deletes a draft. The prompt names it.
   * @param draft The draft to delete.
   * @returns Resolves when the dialog has closed and any delete is done.
   */
  public async on_delete_draft_requested(draft: IEmailDraft): Promise<void> {
    const data: ConfirmationDialogData = {
      title: this.t('Delete this draft?'),
      message: this.t(
        '"{{subject}}" is deleted for good. It has not been sent. This cannot be undone.',
        { subject: draft.subject },
      ),
      confirm_button_label: this.t('Delete'),
      cancel_button_label: this.t('Cancel'),
      is_destructive: true,
    };
    if (!(await this.confirm(data)) || this.busy_draft_id() !== null) return;

    this.busy_draft_id.set(draft.draft_id);
    try {
      await firstValueFrom(this.drafts_api.delete_draft(draft.draft_id));
      this.toast.show_success(this.t('Deleted "{{subject}}".', { subject: draft.subject }));
    } catch (error) {
      console.error('Could not delete the draft', error);
      this.toast.show_error(
        this.t('Could not delete "{{subject}}". Try again.', { subject: draft.subject }),
      );
    } finally {
      this.busy_draft_id.set(null);
      this.drafts.reload();
    }
  }

  /**
   * Opens the add contact dialog and reads the contacts again afterwards.
   * @returns Resolves when the dialog has closed.
   */
  public async on_add_contact_requested(): Promise<void> {
    const contact = await firstValueFrom(
      this.dialog
        .open<AddContactDialogComponent, void, IEmailContact>(AddContactDialogComponent, {
          width: DIALOG_WIDTH,
          maxWidth: DIALOG_MAX_WIDTH,
        })
        .afterClosed(),
    );
    if (!contact) return;
    this.contacts.reload();
    this.toast.show_success(this.t('Added {{name}}.', { name: contact.display_name }));
  }

  /**
   * Opens the paste import dialog and reads the contacts again afterwards.
   * @returns Resolves when the dialog has closed.
   */
  public async on_import_requested(): Promise<void> {
    await firstValueFrom(
      this.dialog
        .open<ImportContactsDialogComponent, void, IImportContactsResult>(
          ImportContactsDialogComponent,
          { width: DIALOG_WIDTH, maxWidth: DIALOG_MAX_WIDTH },
        )
        .afterClosed(),
    );
    // Whatever way it closed, an import may have run, so the list is read again.
    this.contacts.reload();
  }

  /**
   * Asks for confirmation, then deletes a contact. The prompt names them.
   * @param contact The contact to delete.
   * @returns Resolves when the dialog has closed and any delete is done.
   */
  public async on_delete_contact_requested(contact: IEmailContact): Promise<void> {
    const data: ConfirmationDialogData = {
      title: this.t('Delete this contact?'),
      message: this.t(
        '{{name}} ({{email}}) is removed from your contacts and will not receive any more emails. Drafts that chose this person no longer include them. This cannot be undone.',
        { name: contact.display_name, email: contact.email_address },
      ),
      confirm_button_label: this.t('Delete'),
      cancel_button_label: this.t('Cancel'),
      is_destructive: true,
    };
    if (!(await this.confirm(data)) || this.busy_contact_id() !== null) return;

    this.busy_contact_id.set(contact.contact_id);
    try {
      await firstValueFrom(this.contacts_api.delete_contact(contact.contact_id));
      this.toast.show_success(this.t('Deleted {{name}}.', { name: contact.display_name }));
    } catch (error) {
      console.error('Could not delete the contact', error);
      this.toast.show_error(
        this.t('Could not delete {{name}}. Try again.', { name: contact.display_name }),
      );
    } finally {
      this.busy_contact_id.set(null);
      this.contacts.reload();
    }
  }

  private async confirm(data: ConfirmationDialogData): Promise<boolean> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(
          ConfirmationDialogComponent,
          { data },
        )
        .afterClosed(),
    );
    return confirmed === true;
  }
}
