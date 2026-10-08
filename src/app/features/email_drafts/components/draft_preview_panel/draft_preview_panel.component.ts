import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SkeletonLineComponent } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_count } from '../../../connections/utils/format_count';
import { format_games_label } from '../../../games/utils/format_games_label';
import { PreviewFixTarget } from '../../enums/preview_fix_target.enum';
import { PreviewView } from '../../enums/preview_view.enum';
import { IDraftPreview } from '../../models/draft_preview.model';
import { build_preview_warnings } from '../../utils/build_preview_warnings';

/**
 * The preview of the email a saved draft would send: how many games and
 * people it covers, the warnings (blocking ones stop the Send button and say
 * how to fix them), the email itself and its plain-text version.
 *
 * The email HTML comes from the server and is treated as untrusted: it is only
 * ever bound to the `srcdoc` of an iframe with an empty `sandbox` (no scripts,
 * no forms, no same-origin access), never to `innerHTML`. Angular also
 * sanitizes the `srcdoc` binding, which keeps the content (tables, links,
 * images) but drops `<style>` elements and `style` attributes, so the preview
 * shows the content rather than the exact look; a note under it says so. It
 * only emits; the editor sends the test email and runs the send flow.
 */
@Component({
  selector: 'app-draft-preview-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SkeletonLineComponent,
  ],
  templateUrl: './draft_preview_panel.component.html',
  styleUrl: './draft_preview_panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftPreviewPanelComponent {
  private readonly translation = inject(AppTranslationService);

  /** The loaded preview, or undefined while there is none. */
  public readonly preview = input<IDraftPreview | undefined>(undefined);
  /** True once the draft has been saved at all (only a saved draft can be previewed). */
  public readonly is_saved = input(false);
  /** True while the preview loads. */
  public readonly is_loading = input(false);
  /** True when the preview could not be loaded. */
  public readonly has_error = input(false);
  /** True when the form has changes that are not saved yet, so the preview is out of date. */
  public readonly is_stale = input(false);
  /** Whether Send is allowed right now. */
  public readonly can_send = input(false);
  /** Whether the test send is allowed right now. */
  public readonly can_test_send = input(false);
  /** True while a test email is on its way. */
  public readonly is_test_sending = input(false);
  /** True when sending retries recipients an earlier send missed. */
  public readonly is_retry = input(false);
  /** Whether the Send and test buttons are shown at all (a sent draft has neither). */
  public readonly show_actions = input(true);
  /** Whether the test send button is shown (only a draft that has not been sent can be test-sent). */
  public readonly show_test_send = input(true);

  /** Emits when the preview should be loaded again. */
  public readonly refresh_requested = output<void>();
  /** Emits when "Send test to me" is pressed. */
  public readonly test_send_requested = output<void>();
  /** Emits when Send is pressed. */
  public readonly send_requested = output<void>();
  /** Emits when a warning's fix action is pressed. */
  public readonly fix_requested = output<PreviewFixTarget>();

  public readonly views = PreviewView;
  public readonly view = signal<PreviewView>(PreviewView.EMAIL);

  public readonly warnings = computed(() => {
    const preview = this.preview();
    return preview ? build_preview_warnings(preview, (key) => this.t(key)) : [];
  });
  public readonly games_text = computed(() =>
    format_games_label(this.preview()?.game_count ?? 0, (key, params) => this.t(key, params)),
  );
  public readonly recipients_text = computed(() =>
    format_count(this.preview()?.eligible_recipient_count ?? 0),
  );
  public readonly skipped_text = computed(() => {
    const skipped = this.preview()?.skipped;
    return format_count((skipped?.unsubscribed ?? 0) + (skipped?.missing ?? 0));
  });

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
   * Passes a warning's fix action up.
   * @param target Where the fix lives, or null when the warning has none.
   * @returns Nothing.
   */
  public on_fix_clicked(target: PreviewFixTarget | null): void {
    if (target !== null) this.fix_requested.emit(target);
  }

  /**
   * Switches between the email and its plain-text version; an unknown value is ignored.
   * @param value The toggle's value.
   * @returns Nothing.
   */
  public on_view_changed(value: string): void {
    const view = Object.values(PreviewView).find((candidate) => candidate === value);
    if (view) this.view.set(view);
  }
}
