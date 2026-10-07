import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FormField,
  FormRoot,
  TreeValidationResult,
  form,
  minDateError,
  validate,
} from '@angular/forms/signals';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TagChipInputComponent } from '@hch-shared-libraries/ui-kit/common/tag_chip_input';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { QUICK_LINK_EXPIRY_PRESET } from '../../constants/quick_link_expiry_preset.constant';
import { QuickLinkExpiryPreset } from '../../enums/quick_link_expiry_preset.enum';
import { ICreateQuickLinkFormModel } from '../../models/create_quick_link_form.model';
import { ICreatedQuickLink } from '../../models/created_quick_link.model';
import { IQuickLinkView } from '../../models/quick_link_view.model';
import { QuickLinksApiService } from '../../services/quick_links_api.service';
import { build_create_quick_link_request } from '../../utils/build_create_quick_link_request';
import { build_quick_link_url } from '../../utils/build_quick_link_url';
import { map_create_quick_link_error } from '../../utils/map_create_quick_link_error';
import { to_utc_midnight } from '../../utils/to_utc_midnight';
import { QuickLinkCreatedPanelComponent } from '../quick_link_created_panel/quick_link_created_panel.component';

/** A blank form: every level, any date, expiring in 30 days (never expiring has to be chosen on purpose). */
function blank_model(): ICreateQuickLinkFormModel {
  return { levels: [], date_start: null, date_end: null, expiry: QuickLinkExpiryPreset.DAYS_30 };
}

/**
 * Dialog that creates a quick link. Everything is optional: levels to
 * restrict the link to (free-text chips), a first and last date (Material
 * date pickers, sent as UTC-midnight milliseconds) and an expiry preset.
 *
 * On success the same dialog switches to the "copy this link now" panel. The
 * absolute URL, and with it the secret token, exists only in this component's
 * state: it is never written to storage, the address bar or the console, and
 * is gone when the dialog closes. While the panel is up the dialog cannot be
 * dismissed by Escape or a click outside, so the link is not lost by accident;
 * Done closes it with the new link's details.
 */
@Component({
  selector: 'app-create-quick-link-dialog',
  standalone: true,
  imports: [
    FormField,
    FormRoot,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TagChipInputComponent,
    QuickLinkCreatedPanelComponent,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './create_quick_link_dialog.component.html',
  styleUrl: './create_quick_link_dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateQuickLinkDialogComponent {
  private readonly api = inject(QuickLinksApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly document = inject(DOCUMENT);
  private readonly dialog_ref =
    inject<MatDialogRef<CreateQuickLinkDialogComponent, IQuickLinkView>>(MatDialogRef);

  /** The form's value. */
  public readonly model = signal<ICreateQuickLinkFormModel>(blank_model());
  /** A failure that belongs to the form as a whole. */
  public readonly form_error = signal<string | null>(null);
  /** The created link, with its one-time token; null until creation succeeds. */
  public readonly created = signal<ICreatedQuickLink | null>(null);
  /** The absolute URL to hand over; derived from the created link and held only in this dialog. */
  public readonly link_url = computed(() => {
    const created = this.created();
    return created ? build_quick_link_url(this.document.location.origin, created.path) : null;
  });

  public readonly expiry_options = computed(() =>
    Object.values(QuickLinkExpiryPreset).map((value) => ({
      value,
      label: this.t(QUICK_LINK_EXPIRY_PRESET[value].label),
    })),
  );

  public readonly form = form(
    this.model,
    (path) => {
      validate(path.date_end, (field) => {
        const start = field.valueOf(path.date_start);
        const end = field.value();
        return start && end && to_utc_midnight(end) < to_utc_midnight(start)
          ? minDateError(start, {
              message: this.t('The last date cannot be before the first date.'),
            })
          : undefined;
      });
    },
    { submission: { action: () => this.create() } },
  );

  public constructor() {
    effect(() => {
      // A submit in flight must not be cancelled, and a created link must be closed with Done.
      this.dialog_ref.disableClose = this.form().submitting() || this.created() !== null;
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
   * Updates the levels from the chip input.
   * @param levels The levels as they now stand.
   * @returns Nothing.
   */
  public on_levels_changed(levels: string[]): void {
    this.model.update((model) => ({ ...model, levels }));
  }

  /**
   * Closes the dialog once the link has been copied (or the user chose not to).
   * @returns Nothing.
   */
  public done(): void {
    this.dialog_ref.close(this.created()?.quick_link);
  }

  /**
   * Sends the request. On success the dialog shows the one-time URL; on failure
   * the server's reasons come back as errors on the matching fields, or stay
   * as the form-level message.
   * @returns Field errors for the form to show, or nothing on success.
   */
  private async create(): Promise<TreeValidationResult> {
    this.form_error.set(null);
    try {
      const created = await firstValueFrom(
        this.api.create_quick_link(build_create_quick_link_request(this.model())),
      );
      this.created.set(created);
      return undefined;
    } catch (error) {
      // The failed request's address is the owner endpoint; it carries no secret.
      console.error('Could not create the quick link', error);
      const mapped = map_create_quick_link_error(error, (key) => this.t(key));
      this.form_error.set(mapped.form_error);
      const fields = {
        levels: this.form.levels,
        date_start: this.form.date_start,
        date_end: this.form.date_end,
        expiry: this.form.expiry,
      } as const;
      return Object.entries(mapped.field_errors).flatMap(([name, message]) =>
        name in fields
          ? [{ kind: 'server', message, fieldTree: fields[name as keyof typeof fields] }]
          : [],
      );
    }
  }
}
