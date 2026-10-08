import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  FormField,
  FormRoot,
  TreeValidationResult,
  disabled,
  form,
  maxLength,
  requiredError,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  CardHeaderAction,
  CardHeaderActionVariant,
  CardHeaderComponent,
} from '@hch-shared-libraries/ui-kit/app';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
  EmptyStateComponent,
  SkeletonLineComponent,
  StatusChipComponent,
  ToastService,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IStatusPresentation } from '../../../connections/models/status_presentation.model';
import { format_count } from '../../../connections/utils/format_count';
import { DEFAULT_GAMES_FILTERS } from '../../../games/constants/default_games_filters.constant';
import { IGamesFilters } from '../../../games/models/games_filters.model';
import { GamesApiService } from '../../../games/services/games_api.service';
import { build_games_query } from '../../../games/utils/build_games_query';
import { derive_facet_options } from '../../../games/utils/derive_facet_options';
import { format_location_label } from '../../../games/utils/format_location_label';
import { to_utc_midnight } from '../../../quick_links/utils/to_utc_midnight';
import { DRAFT_STATUS_PRESENTATION } from '../../constants/draft_status_presentation.constant';
import {
  DRAFT_SEARCH_MAX_LENGTH,
  INTRO_MAX_LENGTH,
  QUICK_LINK_EXPIRY_MAX_DAYS,
  QUICK_LINK_EXPIRY_MIN_DAYS,
  SEND_DIALOG_NAME_LIMIT,
  SUBJECT_MAX_LENGTH,
} from '../../constants/email_limits.constant';
import { DraftFacetKey } from '../../enums/draft_facet_key.enum';
import { DraftStatus } from '../../enums/draft_status.enum';
import { EmailApiErrorCode } from '../../enums/email_api_error_code.enum';
import { EmailView } from '../../enums/email_view.enum';
import { PreviewFixTarget } from '../../enums/preview_fix_target.enum';
import { PreviewWarningCode } from '../../enums/preview_warning_code.enum';
import { RecipientMode } from '../../enums/recipient_mode.enum';
import { SendOutcomeKind } from '../../enums/send_outcome_kind.enum';
import { IDraftFacetControl } from '../../models/draft_facet_control.model';
import { IDraftFormModel } from '../../models/draft_form.model';
import { IEmailContact } from '../../models/email_contact.model';
import { IEmailDraft } from '../../models/email_draft.model';
import { IEmailSettings } from '../../models/email_settings.model';
import { ISendDialogData } from '../../models/send_dialog_data.model';
import { ISendDialogOutcome } from '../../models/send_dialog_outcome.model';
import { ISendDraftResult } from '../../models/send_draft_result.model';
import { EmailDraftsApiService } from '../../services/email_drafts_api.service';
import { blank_draft_form } from '../../utils/blank_draft_form';
import { build_preview_warnings, has_blocking_warning } from '../../utils/build_preview_warnings';
import { build_save_draft_request } from '../../utils/build_save_draft_request';
import { draft_to_form_model } from '../../utils/draft_to_form_model';
import { map_email_api_error } from '../../utils/map_email_api_error';
import { resolve_recipients } from '../../utils/resolve_recipients';
import { summarize_recipient_names } from '../../utils/summarize_recipient_names';
import { DraftPreviewPanelComponent } from '../draft_preview_panel/draft_preview_panel.component';
import { RecipientPickerComponent } from '../recipient_picker/recipient_picker.component';
import { SendConfirmDialogComponent } from '../send_confirm_dialog/send_confirm_dialog.component';
import { SendResultsPanelComponent } from '../send_results_panel/send_results_panel.component';

/** Dialog sizing: roomy on a desktop, never wider than the screen on a phone. */
const SEND_DIALOG_WIDTH = '520px';
const DIALOG_MAX_WIDTH = 'calc(100vw - 32px)';

/** Request fields a save error can be shown under. */
const SAVE_ERROR_FIELDS: readonly string[] = [
  'subject',
  'intro',
  'search',
  'level',
  'league',
  'age_group',
  'location_group',
  'date_from',
  'date_to',
  'quick_link_expiry_days',
];

/**
 * Writes, previews and sends one email draft. A draft that is still a draft is
 * edited in a form (subject, intro, game filters, quick link, recipients) and
 * saved explicitly; a draft that was sent can only be looked at. Only the
 * saved draft can be previewed, test-sent or sent, so unsaved changes always
 * block those buttons.
 *
 * Sending is outward-facing and cannot be undone, so it only happens through
 * {@link SendConfirmDialogComponent}, which sends the recipient count the
 * sender was shown. If that count changed on the server, nothing is sent: the
 * preview is read again and the sender confirms again.
 */
@Component({
  selector: 'app-draft-editor',
  standalone: true,
  imports: [
    FormField,
    FormRoot,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    CardHeaderComponent,
    EmptyStateComponent,
    SkeletonLineComponent,
    StatusChipComponent,
    UserDatePipe,
    DraftPreviewPanelComponent,
    RecipientPickerComponent,
    SendResultsPanelComponent,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './draft_editor.component.html',
  styleUrl: './draft_editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftEditorComponent {
  private readonly api = inject(EmailDraftsApiService);
  private readonly games_api = inject(GamesApiService);
  private readonly session = inject(SessionService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(AppTranslationService);

  /** The draft to open, or null to write a new one. */
  public readonly draft_id = input<string | null>(null);
  /** All the tenant's contacts. */
  public readonly contacts = input.required<IEmailContact[]>();
  /** The sender settings, so the preview is read again when they change. */
  public readonly settings = input<IEmailSettings | undefined>(undefined);

  /** Emits after the draft was saved or sent, so the list behind can be read again. */
  public readonly draft_changed = output<void>();
  /** Emits when the editor should close, with the area to land on (null for the drafts list). */
  public readonly closed = output<EmailView | null>();
  /** Emits when the sender settings should be opened. */
  public readonly settings_requested = output<void>();

  private readonly top = viewChild.required<ElementRef<HTMLElement>>('top');

  /** The draft as last loaded or saved; null for a new draft that has not been saved. */
  public readonly draft = signal<IEmailDraft | null>(null);
  /** The form's value. */
  public readonly model = signal<IDraftFormModel>(blank_draft_form());
  /** A failure that belongs to the form as a whole. */
  public readonly form_error = signal<string | null>(null);
  /** True while a test email is on its way. */
  public readonly is_test_sending = signal(false);
  /** True while the send confirmation is open. */
  public readonly is_confirming = signal(false);
  /** The result of the send made in this session, if any. */
  public readonly send_result = signal<ISendDraftResult | null>(null);
  /** Set when the recipient count changed under the sender, until the next send attempt. */
  public readonly count_changed_notice = signal(false);

  private readonly baseline_key = signal(
    JSON.stringify(build_save_draft_request(blank_draft_form())),
  );

  public readonly loaded = rxResource({
    params: () => this.draft_id() ?? undefined,
    stream: ({ params }) => this.api.get_draft(params),
  });

  public readonly is_new = computed(() => this.draft_id() === null);
  /** The draft is still loading from the server. */
  public readonly is_loading_draft = computed(
    () => this.draft() === null && !this.is_new() && this.loaded.error() === undefined,
  );
  public readonly load_failed = computed(
    () => this.draft() === null && !this.is_new() && this.loaded.error() !== undefined,
  );
  /** True for a new draft and for a stored draft that has not been sent. */
  public readonly is_editable = computed(() => {
    const draft = this.draft();
    return draft === null ? this.is_new() : draft.status === DraftStatus.DRAFT;
  });
  public readonly is_partially_sent = computed(
    () => this.draft()?.status === DraftStatus.PARTIALLY_SENT,
  );
  public readonly is_sending_elsewhere = computed(
    () => this.draft()?.status === DraftStatus.SENDING,
  );
  public readonly status = computed<IStatusPresentation | null>(() => {
    const draft = this.draft();
    return draft ? DRAFT_STATUS_PRESENTATION[draft.status] : null;
  });
  public readonly title = computed(() => {
    const draft = this.draft();
    return draft ? draft.subject : this.t('New email draft');
  });

  private readonly request_key = computed(() =>
    JSON.stringify(build_save_draft_request(this.model())),
  );
  /** True when the form differs from what was last saved. */
  public readonly is_dirty = computed(
    () => this.is_editable() && this.request_key() !== this.baseline_key(),
  );

  public readonly facets = rxResource({
    params: () => (this.is_editable() ? true : undefined),
    stream: () => this.games_api.list_games(build_games_query(DEFAULT_GAMES_FILTERS)),
  });
  private readonly facet_filters = computed<IGamesFilters>(() => {
    const model = this.model();
    return {
      ...DEFAULT_GAMES_FILTERS,
      league: model.league || null,
      level: model.level || null,
      age_group: model.age_group || null,
      location_group: model.location_group || null,
    };
  });
  public readonly facet_options = computed(() =>
    derive_facet_options(
      this.facets.hasValue() ? this.facets.value() : undefined,
      this.facet_filters(),
    ),
  );
  public readonly facet_controls = computed<IDraftFacetControl[]>(() => {
    const options = this.facet_options();
    return [
      {
        key: DraftFacetKey.LEVEL,
        label: this.t('Level'),
        any_label: this.t('All levels'),
        testid: 'draft-filter-level',
        options: options.level,
      },
      {
        key: DraftFacetKey.LEAGUE,
        label: this.t('League'),
        any_label: this.t('All leagues'),
        testid: 'draft-filter-league',
        options: options.league,
      },
      {
        key: DraftFacetKey.AGE_GROUP,
        label: this.t('Age group'),
        any_label: this.t('All age groups'),
        testid: 'draft-filter-age-group',
        options: options.age_group,
      },
      {
        key: DraftFacetKey.LOCATION_GROUP,
        label: this.t('Location'),
        any_label: this.t('All locations'),
        testid: 'draft-filter-location',
        options: options.location_group,
      },
    ];
  });

  public readonly preview = rxResource({
    params: () => {
      const draft = this.draft();
      if (
        !draft ||
        (draft.status !== DraftStatus.DRAFT && draft.status !== DraftStatus.PARTIALLY_SENT)
      ) {
        return undefined;
      }
      return {
        draft_id: draft.draft_id,
        updated_at: draft.updated_at,
        configured: this.settings()?.configured ?? null,
      };
    },
    stream: ({ params }) => this.api.get_preview(params.draft_id),
  });
  public readonly preview_value = computed(() =>
    this.preview.hasValue() ? this.preview.value() : undefined,
  );
  private readonly warnings = computed(() => {
    const preview = this.preview_value();
    return preview ? build_preview_warnings(preview, (key) => this.t(key)) : [];
  });
  public readonly can_send = computed(() => {
    const draft = this.draft();
    const preview = this.preview_value();
    return (
      draft !== null &&
      (draft.status === DraftStatus.DRAFT || draft.status === DraftStatus.PARTIALLY_SENT) &&
      !this.is_dirty() &&
      preview !== undefined &&
      !this.preview.isLoading() &&
      !has_blocking_warning(this.warnings()) &&
      preview.eligible_recipient_count > 0 &&
      !this.is_confirming()
    );
  });
  public readonly can_test_send = computed(() => {
    const draft = this.draft();
    const codes = new Set(this.warnings().map((warning) => warning.code));
    return (
      draft !== null &&
      draft.status === DraftStatus.DRAFT &&
      !this.is_dirty() &&
      this.preview_value() !== undefined &&
      !codes.has(PreviewWarningCode.EMAIL_NOT_CONFIGURED) &&
      !codes.has(PreviewWarningCode.NO_GAMES)
    );
  });
  /** Only a draft that can still be sent has a preview. */
  public readonly show_preview = computed(() => this.is_editable() || this.is_partially_sent());

  public readonly header_actions = computed<CardHeaderAction[]>(() => [
    {
      icon: 'arrow_back',
      label: this.t('Back to drafts'),
      on_click: () => void this.on_leave_requested(),
      variant: CardHeaderActionVariant.SECONDARY,
      testid: 'draft-editor-back',
    },
  ]);

  public readonly subject_max = SUBJECT_MAX_LENGTH;
  public readonly intro_max = INTRO_MAX_LENGTH;
  public readonly expiry_min = QUICK_LINK_EXPIRY_MIN_DAYS;
  public readonly expiry_max = QUICK_LINK_EXPIRY_MAX_DAYS;
  public readonly any_value = '';
  public readonly date_time_format = UserDateFormat.SHORT;
  public readonly skeleton_slots = [0, 1, 2];

  public readonly expiry_hint = computed(() =>
    this.t('From {{min}} to {{max}} days', { min: this.expiry_min, max: this.expiry_max }),
  );
  public readonly intro_counter = computed(() =>
    this.t('{{count}} of {{max}}', {
      count: format_count(this.model().intro.length),
      max: format_count(INTRO_MAX_LENGTH),
    }),
  );

  public readonly form = form(
    this.model,
    (path) => {
      validate(path.subject, ({ value }) =>
        value().trim().length === 0
          ? requiredError({ message: this.t('Enter a subject.') })
          : undefined,
      );
      maxLength(path.subject, SUBJECT_MAX_LENGTH, {
        message: this.t('The subject can be at most {{max}} characters.', {
          max: SUBJECT_MAX_LENGTH,
        }),
      });
      maxLength(path.intro, INTRO_MAX_LENGTH, {
        message: this.t('The message can be at most {{max}} characters.', {
          max: INTRO_MAX_LENGTH,
        }),
      });
      maxLength(path.search, DRAFT_SEARCH_MAX_LENGTH, {
        message: this.t('The search can be at most {{max}} characters.', {
          max: DRAFT_SEARCH_MAX_LENGTH,
        }),
      });
      validate(path.date_to, (field) => {
        const start = field.valueOf(path.date_from);
        const end = field.value();
        return start && end && to_utc_midnight(end) < to_utc_midnight(start)
          ? { kind: 'range', message: this.t('The last date cannot be before the first date.') }
          : undefined;
      });
      disabled(path.quick_link_expiry_days, (field) => !field.valueOf(path.include_quick_link));
      validate(path.quick_link_expiry_days, ({ value }) => {
        const days = value();
        return days === null ||
          !Number.isInteger(days) ||
          days < QUICK_LINK_EXPIRY_MIN_DAYS ||
          days > QUICK_LINK_EXPIRY_MAX_DAYS
          ? {
              kind: 'range',
              message: this.t('Enter a whole number of days from {{min}} to {{max}}.', {
                min: QUICK_LINK_EXPIRY_MIN_DAYS,
                max: QUICK_LINK_EXPIRY_MAX_DAYS,
              }),
            }
          : undefined;
      });
    },
    { submission: { action: () => this.save() } },
  );

  public constructor() {
    effect(() => {
      if (!this.loaded.hasValue()) return;
      const loaded = this.loaded.value();
      untracked(() => {
        // Only the first answer fills the form; later reads must not overwrite what is being typed.
        if (this.draft()?.draft_id !== loaded.draft_id) this.adopt(loaded);
      });
    });
    effect(() => {
      const error = this.loaded.error();
      if (error) console.error('Could not load the draft', error);
    });
    effect(() => {
      const error = this.facets.error();
      if (error) console.error('Could not load the filter choices', error);
    });
    effect(() => {
      const error = this.preview.error();
      if (error) console.error('Could not load the preview', error);
    });
    afterNextRender(() => this.top().nativeElement.focus({ preventScroll: true }));
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
   * The form field behind one facet select.
   * @param key Which facet.
   * @returns The field to bind.
   */
  public field_for(key: DraftFacetKey) {
    switch (key) {
      case DraftFacetKey.LEVEL:
        return this.form.level;
      case DraftFacetKey.LEAGUE:
        return this.form.league;
      case DraftFacetKey.AGE_GROUP:
        return this.form.age_group;
      case DraftFacetKey.LOCATION_GROUP:
        return this.form.location_group;
    }
  }

  /**
   * A facet option as shown (only the unknown-location placeholder is translated).
   * @param label The option.
   * @returns The text to show.
   */
  public option_label(label: string): string {
    return format_location_label(label, (key) => this.t(key));
  }

  /**
   * Flips the "only games with open slots" toggle.
   * @param checked The new state.
   * @returns Nothing.
   */
  public on_open_slots_changed(checked: boolean): void {
    this.model.update((model) => ({ ...model, only_with_open_slots: checked }));
  }

  /**
   * Flips the "include a live quick link" toggle.
   * @param checked The new state.
   * @returns Nothing.
   */
  public on_quick_link_changed(checked: boolean): void {
    this.model.update((model) => ({ ...model, include_quick_link: checked }));
  }

  /**
   * Sets who the draft goes to.
   * @param recipient_mode The new mode.
   * @returns Nothing.
   */
  public on_mode_changed(recipient_mode: RecipientMode): void {
    this.model.update((model) => ({ ...model, recipient_mode }));
  }

  /**
   * Sets the chosen contacts.
   * @param contact_ids The ids now chosen.
   * @returns Nothing.
   */
  public on_contacts_chosen(contact_ids: string[]): void {
    this.model.update((model) => ({ ...model, contact_ids }));
  }

  /**
   * Leaves the editor. Unsaved changes are only dropped after the sender agrees.
   * @param target The area to land on afterwards; null for the drafts list.
   * @returns Resolves when the editor has been told to close, or the sender chose to stay.
   */
  public async on_leave_requested(target: EmailView | null = null): Promise<void> {
    if (this.is_dirty()) {
      const data: ConfirmationDialogData = {
        title: this.t('Discard unsaved changes?'),
        message: this.t('Your changes to "{{subject}}" have not been saved and will be lost.', {
          subject: this.model().subject.trim() || this.t('this draft'),
        }),
        confirm_button_label: this.t('Discard changes'),
        cancel_button_label: this.t('Keep editing'),
        is_destructive: true,
      };
      const confirmed = await firstValueFrom(
        this.dialog
          .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(
            ConfirmationDialogComponent,
            { data },
          )
          .afterClosed(),
      );
      if (!confirmed) return;
    }
    this.closed.emit(target);
  }

  /**
   * Goes to where a preview warning is fixed.
   * @param target The sender settings, or the contacts area.
   * @returns Nothing.
   */
  public on_fix_requested(target: PreviewFixTarget): void {
    if (target === PreviewFixTarget.SETTINGS) this.settings_requested.emit();
    else void this.on_leave_requested(EmailView.CONTACTS);
  }

  /**
   * Loads the preview again.
   * @returns Nothing.
   */
  public refresh_preview(): void {
    this.preview.reload();
  }

  /**
   * Reads the draft again (for a draft whose send is running).
   * @returns Resolves when the draft has been read.
   */
  public async refresh_draft(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    try {
      this.draft.set(await firstValueFrom(this.api.get_draft(draft.draft_id)));
    } catch (error) {
      console.error('Could not read the draft again', error);
      this.toast.show_error(this.t('The draft could not be refreshed. Try again.'));
    }
  }

  /**
   * Emails the saved draft to the signed-in user only.
   * @returns Resolves when the request has finished.
   */
  public async on_test_send_requested(): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.can_test_send() || this.is_test_sending()) return;
    this.is_test_sending.set(true);
    try {
      await firstValueFrom(this.api.send_test(draft.draft_id));
      const email = this.session.context()?.email;
      this.toast.show_success(
        email
          ? this.t('Test email sent to {{email}}.', { email })
          : this.t('Test email sent to your address.'),
      );
    } catch (error) {
      console.error('Could not send the test email', error);
      this.toast.show_error(
        map_email_api_error(error, (key) => this.t(key)).form_error ??
          this.t('Something went wrong. Try again.'),
      );
    } finally {
      this.is_test_sending.set(false);
    }
  }

  /**
   * Opens the send confirmation for the saved draft and handles how it ends.
   * Does nothing unless sending is allowed and no confirmation is already open.
   * @returns Resolves when the confirmation has closed and its outcome is handled.
   */
  public async on_send_requested(): Promise<void> {
    const draft = this.draft();
    const preview = this.preview_value();
    if (!draft || !preview || !this.can_send()) return;

    this.is_confirming.set(true);
    this.count_changed_notice.set(false);
    const recipients = resolve_recipients(this.contacts(), draft.recipient_mode, draft.contact_ids);
    const summary = summarize_recipient_names(recipients, SEND_DIALOG_NAME_LIMIT);
    const data: ISendDialogData = {
      draft_id: draft.draft_id,
      subject: preview.subject || draft.subject,
      recipient_count: preview.eligible_recipient_count,
      recipient_names: summary.names,
      more_recipient_count: Math.max(0, preview.eligible_recipient_count - summary.names.length),
      game_count: preview.game_count,
      include_quick_link: draft.include_quick_link,
      quick_link_expiry_days: draft.quick_link_expiry_days,
      is_retry: draft.status === DraftStatus.PARTIALLY_SENT,
    };
    try {
      const outcome = await firstValueFrom(
        this.dialog
          .open<SendConfirmDialogComponent, ISendDialogData, ISendDialogOutcome>(
            SendConfirmDialogComponent,
            { data, width: SEND_DIALOG_WIDTH, maxWidth: DIALOG_MAX_WIDTH },
          )
          .afterClosed(),
      );
      await this.handle_send_outcome(outcome);
    } finally {
      this.is_confirming.set(false);
    }
  }

  private async handle_send_outcome(outcome: ISendDialogOutcome | undefined): Promise<void> {
    switch (outcome?.kind) {
      case SendOutcomeKind.SENT:
        this.send_result.set(outcome.result ?? null);
        this.toast.show_success(this.t('The email was sent.'));
        await this.refresh_draft();
        this.draft_changed.emit();
        break;
      case SendOutcomeKind.COUNT_CHANGED:
        this.count_changed_notice.set(true);
        this.preview.reload();
        break;
      case SendOutcomeKind.LOCKED:
        this.toast.show_error(
          this.t('This draft has already been sent and can no longer be changed.'),
        );
        await this.refresh_draft();
        this.draft_changed.emit();
        break;
      default:
        break;
    }
  }

  private adopt(draft: IEmailDraft): void {
    const model = draft_to_form_model(draft);
    this.draft.set(draft);
    this.model.set(model);
    this.baseline_key.set(JSON.stringify(build_save_draft_request(model)));
  }

  /**
   * Saves the form: creates the draft, or replaces the stored one. On failure
   * the server's reasons come back as errors on the matching fields, or stay
   * as the form-level message.
   * @returns Field errors for the form to show, or nothing on success.
   */
  private async save(): Promise<TreeValidationResult> {
    this.form_error.set(null);
    const request = build_save_draft_request(this.model());
    const existing = this.draft();
    try {
      const saved = existing
        ? await firstValueFrom(this.api.update_draft(existing.draft_id, request))
        : await firstValueFrom(this.api.create_draft(request));
      this.draft.set(saved);
      this.baseline_key.set(JSON.stringify(request));
      this.toast.show_success(this.t('Draft saved.'));
      this.draft_changed.emit();
      return undefined;
    } catch (error) {
      console.error('Could not save the draft', error);
      const mapped = map_email_api_error(error, (key) => this.t(key), SAVE_ERROR_FIELDS);
      this.form_error.set(mapped.form_error);
      const fields = {
        subject: this.form.subject,
        intro: this.form.intro,
        search: this.form.search,
        level: this.form.level,
        league: this.form.league,
        age_group: this.form.age_group,
        location_group: this.form.location_group,
        date_from: this.form.date_from,
        date_to: this.form.date_to,
        quick_link_expiry_days: this.form.quick_link_expiry_days,
      } as const;
      if (mapped.code === EmailApiErrorCode.DRAFT_LOCKED) await this.refresh_draft();
      return Object.entries(mapped.field_errors).flatMap(([name, message]) =>
        name in fields
          ? [{ kind: 'server', message, fieldTree: fields[name as keyof typeof fields] }]
          : [],
      );
    }
  }
}
