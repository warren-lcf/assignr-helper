import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LoginPageComponent } from '@hch-shared-libraries/ui-kit/authorization';
import type { EmailPasswordCredentials } from '@hch-shared-libraries/ui-kit/authorization';
import { SIGN_IN_FAILURE_MESSAGE } from '../../constants/sign_in_failure_message.constant';
import { ISignInResult } from '../../models/sign_in_result.model';
import { IdentityService } from '../../services/identity/identity.service';
import { AppTranslationService } from '../../services/translation/app_translation.service';

/** Public sign-in page: email and password, or Google. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LoginPageComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly identity = inject(IdentityService);
  private readonly router = inject(Router);
  private readonly translation = inject(AppTranslationService);

  /** Where to go after signing in; bound from the `return_url` query parameter. */
  public readonly return_url = input<string | undefined>(undefined);

  public readonly is_submitting = signal(false);
  public readonly error_message = signal<string | undefined>(undefined);

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @returns The translated text.
   */
  public t(key: string): string {
    return this.translation.translate(key);
  }

  /**
   * Signs in with the submitted email and password.
   * @param credentials Values from the form.
   * @returns Resolves when the attempt finishes.
   */
  public on_credentials_submitted(credentials: EmailPasswordCredentials): Promise<void> {
    return this.run(() =>
      this.identity.sign_in_with_email(credentials.email, credentials.password),
    );
  }

  /**
   * Signs in through Google.
   * @returns Resolves when the attempt finishes.
   */
  public on_google_requested(): Promise<void> {
    return this.run(() => this.identity.sign_in_with_google());
  }

  private async run(sign_in: () => Promise<ISignInResult>): Promise<void> {
    this.is_submitting.set(true);
    this.error_message.set(undefined);
    const result = await sign_in();
    this.is_submitting.set(false);
    if (result.ok) {
      await this.router.navigateByUrl(this.safe_return_url());
    } else if (result.failure) {
      this.error_message.set(this.t(SIGN_IN_FAILURE_MESSAGE[result.failure]));
    }
  }

  /** Only same-app paths are honoured, so a crafted link cannot redirect off-site. */
  private safe_return_url(): string {
    const target = this.return_url();
    return target && target.startsWith('/') && !target.startsWith('//') ? target : '/games';
  }
}
