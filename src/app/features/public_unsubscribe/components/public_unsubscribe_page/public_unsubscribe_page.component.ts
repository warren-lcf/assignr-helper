import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Meta } from '@angular/platform-browser';
import { CardHeaderComponent, PageContainerComponent } from '@hch-shared-libraries/ui-kit/app';
import { EmptyStateComponent, SkeletonLineComponent } from '@hch-shared-libraries/ui-kit/core';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { UnsubscribeErrorKind } from '../../enums/unsubscribe_error_kind.enum';
import { PublicUnsubscribeApiService } from '../../services/public_unsubscribe_api.service';
import { PublicUnsubscribeError } from '../../services/public_unsubscribe_error';
import { map_unsubscribe_error } from '../../utils/map_unsubscribe_error';
import { to_public_unsubscribe_error } from '../../utils/to_public_unsubscribe_error';
import { unwrap_public_unsubscribe_error } from '../../utils/unwrap_public_unsubscribe_error';

/** Name of the robots meta tag the page adds while it is open. */
const ROBOTS_META_NAME = 'robots';
const ROBOTS_META_SELECTOR = `name='${ROBOTS_META_NAME}'`;

/**
 * The public page behind the unsubscribe link in an email, shown with no
 * sign-in and no app chrome. It reads the link (which changes nothing) to show
 * the address it is for, partly hidden, and a single Unsubscribe button; only
 * pressing that button unsubscribes. It also covers the already-unsubscribed
 * address, success, and a calm "not valid" page that is the same for every bad
 * link.
 *
 * The token comes from the route and is used only in the request address; it
 * is never logged, stored or shown, and failures are reduced to a kind, status
 * and code before they get here. The page asks search engines not to index it.
 */
@Component({
  selector: 'app-public-unsubscribe-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CardHeaderComponent,
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonLineComponent,
  ],
  templateUrl: './public_unsubscribe_page.component.html',
  styleUrl: './public_unsubscribe_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicUnsubscribePageComponent {
  private readonly api = inject(PublicUnsubscribeApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly destroy_ref = inject(DestroyRef);
  private readonly meta = inject(Meta);

  /** The link secret token; bound from the `:token` route parameter. */
  public readonly token = input.required<string>();

  /** What the link is for. Reading it changes nothing. */
  public readonly info = rxResource({
    params: () => this.token(),
    stream: ({ params }) => this.api.get_info(params),
  });

  /** True while the unsubscribe request is in flight (a second press does nothing). */
  public readonly is_submitting = signal(false);
  /** True once this visit unsubscribed the address. */
  public readonly is_done = signal(false);
  /** The sanitized failure of the unsubscribe request, or null. */
  public readonly submit_error = signal<PublicUnsubscribeError | null>(null);

  /** The sanitized failure of reading the link, or null. */
  private readonly load_error = computed<PublicUnsubscribeError | null>(() => {
    const error = this.info.error();
    if (error === undefined) return null;
    return (
      unwrap_public_unsubscribe_error(error) ??
      new PublicUnsubscribeError(UnsubscribeErrorKind.UNAVAILABLE, 0)
    );
  });

  /** The link is unknown, expired or malformed, whether found out on reading or on pressing the button. */
  public readonly is_not_valid = computed(
    () =>
      this.load_error()?.kind === UnsubscribeErrorKind.NOT_VALID ||
      this.submit_error()?.kind === UnsubscribeErrorKind.NOT_VALID,
  );
  /** Reading the link failed for a reason that is worth trying again. */
  public readonly has_blocking_error = computed(
    () => this.load_error() !== null && !this.is_not_valid(),
  );
  public readonly load_messages = computed(() => {
    const error = this.load_error();
    return error ? map_unsubscribe_error(error.kind, (key) => this.t(key)) : null;
  });
  public readonly submit_messages = computed(() => {
    const error = this.submit_error();
    return error && error.kind !== UnsubscribeErrorKind.NOT_VALID
      ? map_unsubscribe_error(error.kind, (key) => this.t(key))
      : null;
  });
  public readonly load_icon = computed(() =>
    this.load_error()?.kind === UnsubscribeErrorKind.RATE_LIMITED ? 'hourglass_top' : 'error',
  );
  public readonly is_loading = computed(() => this.info.isLoading() && !this.info.hasValue());
  public readonly is_already_unsubscribed = computed(
    () => !this.is_done() && this.info.hasValue() && this.info.value().already_unsubscribed,
  );
  public readonly email_masked = computed(() =>
    this.info.hasValue() ? this.info.value().email_masked : '',
  );
  public readonly done_text = computed(() =>
    this.t('{{email}} will not receive these emails any more.', { email: this.email_masked() }),
  );
  public readonly already_text = computed(() =>
    this.t('{{email}} is already unsubscribed. You will not receive these emails.', {
      email: this.email_masked(),
    }),
  );
  public readonly ready_text = computed(() =>
    this.t('Stop {{email}} from receiving games available emails?', { email: this.email_masked() }),
  );
  public readonly skeleton_slots = [0, 1];

  public constructor() {
    const robots = this.meta.updateTag(
      { name: ROBOTS_META_NAME, content: 'noindex, nofollow' },
      ROBOTS_META_SELECTOR,
    );
    this.destroy_ref.onDestroy(() => {
      if (robots) this.meta.removeTagElement(robots);
    });

    effect(() => {
      const error = this.load_error();
      // Only kind, status and code: the original error holds the request address, which holds the token.
      if (error) {
        console.error('Could not read the unsubscribe link', {
          kind: error.kind,
          status: error.status,
          code: error.code,
        });
      }
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
   * Reads the link again (the Try again actions).
   * @returns Nothing.
   */
  public retry(): void {
    if (!this.info.isLoading()) this.info.reload();
  }

  /**
   * Unsubscribes the address. A second press while the request is running does nothing.
   * @returns Resolves when the request has finished.
   */
  public async unsubscribe(): Promise<void> {
    if (this.is_submitting() || this.is_done()) return;
    this.is_submitting.set(true);
    this.submit_error.set(null);
    try {
      await firstValueFrom(this.api.unsubscribe(this.token()));
      this.is_done.set(true);
    } catch (error) {
      const sanitized =
        unwrap_public_unsubscribe_error(error) ?? to_public_unsubscribe_error(error);
      // Only kind, status and code: the original error holds the request address, which holds the token.
      console.error('Could not unsubscribe', {
        kind: sanitized.kind,
        status: sanitized.status,
        code: sanitized.code,
      });
      this.submit_error.set(sanitized);
    } finally {
      this.is_submitting.set(false);
    }
  }
}
