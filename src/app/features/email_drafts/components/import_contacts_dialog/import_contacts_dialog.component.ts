import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormField, FormRoot, TreeValidationResult, form, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_count } from '../../../connections/utils/format_count';
import { CONTACT_PROBLEM_MESSAGE } from '../../constants/contact_problem_message.constant';
import { MAX_IMPORT_ENTRIES } from '../../constants/email_limits.constant';
import { IImportContactsResult } from '../../models/import_contacts_result.model';
import { IImportInvalidRow } from '../../models/import_invalid_row.model';
import { IImportFormModel } from '../../models/import_form.model';
import { EmailContactsApiService } from '../../services/email_contacts_api.service';
import { map_email_api_error } from '../../utils/map_email_api_error';
import { parse_contact_lines } from '../../utils/parse_contact_lines';

/** How many unusable lines are listed before "and N more". */
const PROBLEM_LIST_LIMIT = 20;

/**
 * Dialog that adds many contacts at once from pasted text, one `Name <email>`
 * or bare email per line, at most 200. The text is read here first: lines that
 * cannot be used are listed with the reason and skipped, so the person can
 * fix the paste. Importing requires ticking the consent confirmation ("I
 * confirm these people agreed to receive these emails"), which is what the
 * request attests with `consent_attested: true`. After the import the dialog
 * shows what the server did: added, already there, not accepted. Closes with
 * that summary.
 */
@Component({
  selector: 'app-import-contacts-dialog',
  standalone: true,
  imports: [
    FormField,
    FormRoot,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './import_contacts_dialog.component.html',
  styleUrl: './import_contacts_dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportContactsDialogComponent {
  private readonly api = inject(EmailContactsApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly dialog_ref =
    inject<MatDialogRef<ImportContactsDialogComponent, IImportContactsResult>>(MatDialogRef);

  /** The form's value. */
  public readonly model = signal<IImportFormModel>({ raw_text: '', consent_attested: false });
  /** A failure that belongs to the form as a whole. */
  public readonly form_error = signal<string | null>(null);
  /** True once the person has tried to import, so a missing consent tick is called out. */
  public readonly attempted = signal(false);
  /** What the server did, once the import has run. */
  public readonly result = signal<IImportContactsResult | null>(null);

  public readonly show_consent_error = computed(
    () => this.attempted() && !this.model().consent_attested,
  );
  public readonly parsed = computed(() => parse_contact_lines(this.model().raw_text));
  public readonly more_problems_text = computed(() =>
    this.t('and {{count}} more', { count: this.hidden_problem_count() }),
  );
  public readonly intro_text = computed(() =>
    this.t(
      'One person per line, either "{{example}}" or just the email address. Up to {{max}} lines.',
      { example: 'Name <email>', max: MAX_IMPORT_ENTRIES },
    ),
  );
  public readonly summary_text = computed(() => {
    const { valid, problems } = this.parsed();
    return this.t('{{ready}} ready to import, {{skipped}} skipped', {
      ready: format_count(valid.length),
      skipped: format_count(problems.length),
    });
  });
  public readonly shown_problems = computed(() =>
    this.parsed()
      .problems.slice(0, PROBLEM_LIST_LIMIT)
      .map((problem) => ({
        row: problem.row,
        title: this.t('Line {{row}}: {{reason}}', {
          row: problem.row,
          reason: this.t(CONTACT_PROBLEM_MESSAGE[problem.problem]),
        }),
        text: problem.text,
      })),
  );
  public readonly hidden_problem_count = computed(() =>
    Math.max(0, this.parsed().problems.length - PROBLEM_LIST_LIMIT),
  );

  public readonly form = form(
    this.model,
    (path) => {
      validate(path.raw_text, ({ value }) => {
        const { valid } = parse_contact_lines(value());
        if (valid.length === 0) {
          return { kind: 'empty', message: this.t('Paste at least one valid line.') };
        }
        return valid.length > MAX_IMPORT_ENTRIES
          ? {
              kind: 'too_many',
              message: this.t('Paste at most {{max}} contacts at a time. You pasted {{count}}.', {
                max: MAX_IMPORT_ENTRIES,
                count: valid.length,
              }),
            }
          : undefined;
      });
      validate(path.consent_attested, ({ value }) =>
        value()
          ? undefined
          : {
              kind: 'consent',
              message: this.t('Confirm that these people agreed to receive these emails.'),
            },
      );
    },
    { submission: { action: () => this.import_contacts() } },
  );

  public constructor() {
    effect(() => {
      // A request in flight must not be cancelled by Escape or a click outside.
      this.dialog_ref.disableClose = this.form().submitting();
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
   * One refused row as a line of text.
   * @param row The row the server refused.
   * @returns The translated line, with the server's reason as given.
   */
  public row_text(row: IImportInvalidRow): string {
    return this.t('Row {{row}}: {{reason}}', { row: row.row, reason: row.reason });
  }

  /**
   * Records the consent tick.
   * @param checked Whether the box is ticked.
   * @returns Nothing.
   */
  public on_consent_changed(checked: boolean): void {
    this.model.update((model) => ({ ...model, consent_attested: checked }));
  }

  /**
   * Closes the dialog once the summary has been read.
   * @returns Nothing.
   */
  public done(): void {
    this.dialog_ref.close(this.result() ?? undefined);
  }

  /**
   * Sends the lines that can be used, with the consent attestation.
   * @returns Field errors for the form to show, or nothing on success.
   */
  private async import_contacts(): Promise<TreeValidationResult> {
    this.form_error.set(null);
    const entries = this.parsed().valid.map((line) => line.entry);
    try {
      this.result.set(
        await firstValueFrom(this.api.import_contacts({ entries, consent_attested: true })),
      );
      return undefined;
    } catch (error) {
      console.error('Could not import the contacts', error);
      const mapped = map_email_api_error(error, (key) => this.t(key), ['raw_text', 'entries']);
      this.form_error.set(
        mapped.field_errors['raw_text'] ?? mapped.field_errors['entries'] ?? mapped.form_error,
      );
      return undefined;
    }
  }
}
