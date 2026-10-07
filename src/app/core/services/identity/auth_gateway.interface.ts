import { IAuthUser } from '../../models/auth_user.model';

/**
 * Port to the sign-in provider (Firebase Auth). The identity service depends on
 * this, so specs swap in a fake and the Firebase SDK loads only when used.
 */
export interface IAuthGateway {
  /**
   * Starts watching the signed-in user. The callback runs once with the initial
   * state and again on every change.
   * @param on_change Receives the user, or null when signed out.
   * @returns A function that stops watching.
   */
  watch_user(on_change: (user: IAuthUser | null) => void): Promise<() => void>;

  /**
   * Signs in with an email and password.
   * @param email Account email.
   * @param password Account password.
   * @returns Resolves on success; rejects with an error carrying a `code`.
   */
  sign_in_with_email(email: string, password: string): Promise<void>;

  /**
   * Signs in through Google's popup.
   * @returns Resolves on success; rejects with an error carrying a `code`.
   */
  sign_in_with_google(): Promise<void>;

  /**
   * Signs the user out.
   * @returns Resolves when signed out.
   */
  sign_out(): Promise<void>;

  /**
   * Reads the current ID token for calling our API.
   * @returns The token, or null when signed out.
   */
  get_id_token(): Promise<string | null>;
}
