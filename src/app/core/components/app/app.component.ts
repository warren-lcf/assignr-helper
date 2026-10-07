import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AppShellComponent } from '@hch-shared-libraries/ui-kit/app';
import { filter, map } from 'rxjs';
import { IdentityService } from '../../services/identity/identity.service';
import { NavigationService } from '../../services/navigation/navigation.service';
import { AppTranslationService } from '../../services/translation/app_translation.service';

/** Path prefix of the public sign-in page. */
const LOGIN_PATH_PREFIX = '/login';

/** Path prefix of the public quick link page, opened by anyone holding a link. */
const QUICK_LINK_PATH_PREFIX = '/q/';

/** Pages shown without any app chrome (no header, sidebar or utility bar): the public ones. */
const CHROMELESS_PATH_PREFIXES: readonly string[] = [LOGIN_PATH_PREFIX, QUICK_LINK_PATH_PREFIX];

/**
 * Root component: the shared application shell (header, sidebar, breadcrumbs,
 * routed content). The public pages (sign-in and quick links) are shown without any chrome.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly identity = inject(IdentityService);
  private readonly router = inject(Router);
  private readonly translation = inject(AppTranslationService);
  private readonly navigation = inject(NavigationService);
  private readonly location = inject(Location);

  private readonly current_url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    // Before the first navigation finishes the router still reports "/"; the browser address already says where we are,
    // which keeps the app chrome from flashing on a public page.
    { initialValue: this.router.url === '/' ? this.location.path() : this.router.url },
  );

  public readonly nav_items = this.navigation.nav_items;
  public readonly app_name = computed(() => this.translation.translate('Assignr Helper'));
  public readonly show_chrome = computed(
    () => !CHROMELESS_PATH_PREFIXES.some((prefix) => this.current_url().startsWith(prefix)),
  );

  /**
   * Opens the sign-in page.
   * @returns Resolves when navigation finishes.
   */
  public async on_login_clicked(): Promise<void> {
    await this.router.navigateByUrl(LOGIN_PATH_PREFIX);
  }

  /**
   * Signs out and returns to the sign-in page.
   * @returns Resolves when navigation finishes.
   */
  public async on_logout_clicked(): Promise<void> {
    await this.identity.sign_out();
    await this.router.navigateByUrl(LOGIN_PATH_PREFIX);
  }
}
