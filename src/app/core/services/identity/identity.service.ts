import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type {
  AppHeaderIdentityProvider,
  AppHeaderUserProfile,
} from '@hch-shared-libraries/ui-kit/app';
import { SignInFailure } from '../../enums/sign_in_failure.enum';
import { IAuthUser } from '../../models/auth_user.model';
import { ISignInResult } from '../../models/sign_in_result.model';
import { AUTH_GATEWAY } from './auth_gateway.token';
import { map_sign_in_failure } from './map_sign_in_failure';

/**
 * Who is signed in, as signals, plus sign-in and sign-out. Implements the
 * ui-kit header's identity contract so the shell shows the avatar or login
 * button; `is_logged_in` stays `undefined` until the first auth state arrives.
 */
@Injectable({ providedIn: 'root' })
export class IdentityService implements AppHeaderIdentityProvider {
  private readonly gateway = inject(AUTH_GATEWAY);
  private readonly user = signal<IAuthUser | null>(null);
  private stop_watching: (() => void) | null = null;
  private destroyed = false;

  public readonly is_logged_in = signal<boolean | undefined>(undefined);
  public readonly current_user = computed<AppHeaderUserProfile | null>(() => {
    const user = this.user();
    if (!user) return null;
    return {
      display_name: user.display_name,
      email: user.email ?? undefined,
      avatar_url: user.avatar_url ?? undefined,
    };
  });

  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop_watching?.();
    });
  }

  /**
   * Begins watching the auth state. Safe to call once at startup.
   * @returns Nothing; `is_logged_in` becomes true or false when the first state arrives.
   */
  public start(): void {
    this.gateway
      .watch_user((user) => {
        this.user.set(user);
        this.is_logged_in.set(user !== null);
      })
      .then((stop) => {
        if (this.destroyed) stop();
        else this.stop_watching = stop;
      })
      .catch((error: unknown) => {
        console.error('Could not start watching the auth state', error);
        this.is_logged_in.set(false);
      });
  }

  /**
   * Signs in with an email and password.
   * @param email Account email.
   * @param password Account password.
   * @returns The outcome; never throws.
   */
  public sign_in_with_email(email: string, password: string): Promise<ISignInResult> {
    return this.attempt(() => this.gateway.sign_in_with_email(email, password));
  }

  /**
   * Signs in through Google.
   * @returns The outcome; never throws.
   */
  public sign_in_with_google(): Promise<ISignInResult> {
    return this.attempt(() => this.gateway.sign_in_with_google());
  }

  /**
   * Signs the current user out.
   * @returns Resolves when signed out.
   */
  public sign_out(): Promise<void> {
    return this.gateway.sign_out();
  }

  /**
   * Reads the current ID token for API calls.
   * @returns The token, or null when signed out.
   */
  public get_id_token(): Promise<string | null> {
    return this.gateway.get_id_token();
  }

  private async attempt(sign_in: () => Promise<void>): Promise<ISignInResult> {
    try {
      await sign_in();
      return { ok: true, failure: null };
    } catch (error) {
      const failure = map_sign_in_failure(error);
      if (failure === SignInFailure.UNKNOWN) console.error('Sign-in failed', error);
      return { ok: false, failure };
    }
  }
}
