import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import {
  CardHeaderAction,
  CardHeaderActionVariant,
  PageContainerComponent,
} from '@hch-shared-libraries/ui-kit/app';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
  EmptyStateComponent,
  SkeletonCardComponent,
  ToastService,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { firstValueFrom } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IQuickLinkView } from '../../models/quick_link_view.model';
import { QuickLinksApiService } from '../../services/quick_links_api.service';
import { format_quick_link_label } from '../../utils/format_quick_link_label';
import { is_tenant_required } from '../../utils/is_tenant_required';
import { summarize_quick_link_scope } from '../../utils/summarize_quick_link_scope';
import { CreateQuickLinkDialogComponent } from '../create_quick_link_dialog/create_quick_link_dialog.component';
import { QuickLinkCardComponent } from '../quick_link_card/quick_link_card.component';

/** How many skeleton cards stand in for links while they load. */
const SKELETON_CARD_COUNT = 3;

/** Dialog sizing: roomy on a desktop, never wider than the screen on a phone. */
const DIALOG_WIDTH = '520px';
const DIALOG_MAX_WIDTH = 'calc(100vw - 32px)';

/**
 * The tenant's Quick links screen: create, list and revoke the tokenized,
 * sign-in-free links that show a live, read-only list of open games. Needs
 * `quick_links.manage`; without it the screen says so instead of breaking.
 *
 * There is no separate "rotate" action. To replace a link, create a new one
 * (its address is shown once, in the create dialog), send it, then revoke the
 * old one from its card.
 */
@Component({
  selector: 'app-quick-links-page',
  standalone: true,
  imports: [
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonCardComponent,
    QuickLinkCardComponent,
  ],
  templateUrl: './quick_links_page.component.html',
  styleUrl: './quick_links_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickLinksPageComponent {
  private readonly api = inject(QuickLinksApiService);
  private readonly session = inject(SessionService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(AppTranslationService);
  private readonly user_date = new UserDatePipe();

  /** True while `/api/me` has not answered yet, so "no access" never flashes before permissions load. */
  public readonly is_session_pending = computed(
    () =>
      this.session.is_loading() || (this.session.context() === null && !this.session.has_failed()),
  );
  public readonly can_manage = computed(() =>
    this.session.permissions().has(PermissionKey.QUICK_LINKS_MANAGE),
  );

  /** The tenant's links; not requested until permissions are known and allow managing. */
  public readonly links = rxResource({
    params: () => (!this.is_session_pending() && this.can_manage() ? true : undefined),
    stream: () => this.api.list_quick_links(),
  });
  public readonly link_list = computed<IQuickLinkView[]>(() =>
    this.links.hasValue() ? this.links.value() : [],
  );
  /** "3 links"; the page's live region for how many links there are. */
  public readonly count_text = computed(() =>
    this.t(this.link_list().length === 1 ? '1 quick link' : '{{count}} quick links', {
      count: this.link_list().length,
    }),
  );

  /** Skeletons show until permissions are known and the first list has arrived. */
  public readonly is_loading = computed(
    () =>
      this.is_session_pending() ||
      (this.can_manage() && !this.links.hasValue() && this.links.error() === undefined),
  );
  public readonly session_failed = computed(
    () => !this.is_session_pending() && this.session.has_failed(),
  );
  public readonly has_no_access = computed(
    () => !this.is_session_pending() && !this.session.has_failed() && !this.can_manage(),
  );
  public readonly load_failed = computed(
    () => !this.links.hasValue() && this.links.error() !== undefined,
  );
  /** True when the failure is a platform administrator who has not picked a tenant. */
  public readonly needs_tenant = computed(() => is_tenant_required(this.links.error()));

  /** The link being revoked, if any; a second revoke waits. */
  public readonly busy_link_id = signal<string | null>(null);

  public readonly skeleton_slots = Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => index);

  /** "Create link" in the page header; only for those who may manage. */
  public readonly header_actions = computed<CardHeaderAction[]>(() =>
    this.can_manage()
      ? [
          {
            icon: 'add_link',
            label: this.t('Create link'),
            on_click: () => void this.on_create_requested(),
            variant: CardHeaderActionVariant.PRIMARY,
            testid: 'quick-links-create',
          },
        ]
      : [],
  );

  public constructor() {
    effect(() => {
      const error = this.links.error();
      if (error) console.error('Could not load the quick links', error);
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
   * Loads the links (or the session, when that is what failed) again.
   * @returns Nothing.
   */
  public retry(): void {
    if (this.session_failed()) this.session.reload();
    else this.links.reload();
  }

  /**
   * Opens the create dialog. Whatever way it closes, the list is read again, so
   * a link created but not "Done"-closed still appears.
   * @returns Resolves when the dialog has closed.
   */
  public async on_create_requested(): Promise<void> {
    const created = await firstValueFrom(
      this.dialog
        .open<CreateQuickLinkDialogComponent, void, IQuickLinkView>(
          CreateQuickLinkDialogComponent,
          {
            width: DIALOG_WIDTH,
            maxWidth: DIALOG_MAX_WIDTH,
          },
        )
        .afterClosed(),
    );
    this.links.reload();
    if (created) this.toast.show_success(this.t('Quick link created.'));
  }

  /**
   * Asks for confirmation, then revokes. The prompt names the link.
   * @param link The link to revoke.
   * @returns Resolves when the dialog has closed and any revoke is done.
   */
  public async on_revoke_requested(link: IQuickLinkView): Promise<void> {
    const label = this.label_of(link);
    const scope = summarize_quick_link_scope(
      link.scope,
      (utc_ms) => this.user_date.transform(utc_ms, UserDateFormat.CALENDAR_DATE),
      (key, params) => this.t(key, params),
    ).join('; ');
    const data: ConfirmationDialogData = {
      title: this.t('Revoke this quick link?'),
      message: this.t(
        '"{{label}}" ({{scope}}) stops working at once. Anyone who has its address will see that it is no longer active. This cannot be undone.',
        { label, scope },
      ),
      confirm_button_label: this.t('Revoke'),
      cancel_button_label: this.t('Cancel'),
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
    if (!confirmed || this.busy_link_id() !== null) return;

    this.busy_link_id.set(link.link_id);
    try {
      await firstValueFrom(this.api.revoke_quick_link(link.link_id));
      this.toast.show_success(this.t('Revoked "{{label}}".', { label }));
    } catch (error) {
      console.error('Could not revoke the quick link', error);
      this.toast.show_error(this.t('Could not revoke "{{label}}". Try again.', { label }));
    } finally {
      this.busy_link_id.set(null);
      this.links.reload();
    }
  }

  private label_of(link: IQuickLinkView): string {
    return format_quick_link_label(
      link.created_at,
      (utc_ms) => this.user_date.transform(utc_ms, UserDateFormat.SHORT),
      (key, params) => this.t(key, params),
    );
  }
}
