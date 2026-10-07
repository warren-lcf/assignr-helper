import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ToastService } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { CopyStatus } from '../../enums/copy_status.enum';
import { copy_text_to_clipboard } from '../../utils/copy_text_to_clipboard';

/**
 * The "copy this link now" panel shown once a link has been created. The link
 * is the only place the secret token ever appears, so the panel says plainly
 * that it will not be shown again, offers a Copy button (with a manual
 * fallback when the browser refuses the clipboard) and announces the result.
 * It holds the URL only as an input: nothing is stored, logged or put in the
 * address bar.
 */
@Component({
  selector: 'app-quick-link-created-panel',
  standalone: true,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './quick_link_created_panel.component.html',
  styleUrl: './quick_link_created_panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickLinkCreatedPanelComponent {
  private readonly toast = inject(ToastService);
  private readonly translation = inject(AppTranslationService);

  /** The absolute address to hand to the recipient. */
  public readonly url = input.required<string>();

  public readonly copy_status = signal<CopyStatus>(CopyStatus.IDLE);
  /** Spoken by the polite live region after a copy attempt. */
  public readonly status_text = computed(() => {
    switch (this.copy_status()) {
      case CopyStatus.COPIED:
        return this.t('Link copied to the clipboard.');
      case CopyStatus.FAILED:
        return this.t('Could not copy automatically. Select the link and copy it yourself.');
      default:
        return '';
    }
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
   * Copies the link and says whether that worked, in a toast and the live region.
   * @returns Resolves when the attempt is done.
   */
  public async copy(): Promise<void> {
    const copied = await copy_text_to_clipboard(this.url());
    this.copy_status.set(copied ? CopyStatus.COPIED : CopyStatus.FAILED);
    if (copied) this.toast.show_success(this.t('Link copied.'));
    else
      this.toast.show_error(
        this.t('Could not copy automatically. Select the link and copy it yourself.'),
      );
  }

  /**
   * Selects the whole link so it can be copied by hand.
   * @param event The focus or click event on the read-only field.
   * @returns Nothing.
   */
  public select_all(event: Event): void {
    (event.target as HTMLInputElement).select();
  }
}
