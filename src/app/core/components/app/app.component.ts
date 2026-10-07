import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AppShellComponent } from '@hch-shared-libraries/ui-kit/app';
import { filter, map } from 'rxjs';
import { IdentityService } from '../../services/identity/identity.service';
import { NavigationService } from '../../services/navigation/navigation.service';
import { AppTranslationService } from '../../services/translation/app_translation.service';

/** Path prefix of the public sign-in page, which is shown without the app chrome. */
const LOGIN_PATH_PREFIX = '/login';

/**
 * Root component: the shared application shell (header, sidebar, breadcrumbs,
 * routed content). The sign-in page is shown without any chrome.
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

  private readonly current_url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  public readonly nav_items = this.navigation.nav_items;
  public readonly app_name = computed(() => this.translation.translate('Assignr Helper'));
  public readonly show_chrome = computed(() => !this.current_url().startsWith(LOGIN_PATH_PREFIX));

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
