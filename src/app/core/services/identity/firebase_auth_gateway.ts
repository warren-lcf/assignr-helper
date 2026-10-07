import { Injectable } from '@angular/core';
import type { Auth, User } from 'firebase/auth';
import { environment } from '../../../../environments/environment';
import { IAuthUser } from '../../models/auth_user.model';
import { IAuthGateway } from './auth_gateway.interface';

/**
 * Firebase Auth implementation of the sign-in port. The SDK is loaded with
 * dynamic imports on first use so it stays out of the initial bundle. In
 * development it talks to the Auth emulator.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseAuthGateway implements IAuthGateway {
  private auth_promise: Promise<Auth> | null = null;

  /** @inheritdoc */
  public async watch_user(on_change: (user: IAuthUser | null) => void): Promise<() => void> {
    const auth = await this.get_auth();
    const auth_module = await import('firebase/auth');
    return auth_module.onAuthStateChanged(auth, (user) =>
      on_change(user ? this.to_auth_user(user) : null),
    );
  }

  /** @inheritdoc */
  public async sign_in_with_email(email: string, password: string): Promise<void> {
    const auth = await this.get_auth();
    const auth_module = await import('firebase/auth');
    await auth_module.signInWithEmailAndPassword(auth, email, password);
  }

  /** @inheritdoc */
  public async sign_in_with_google(): Promise<void> {
    const auth = await this.get_auth();
    const auth_module = await import('firebase/auth');
    await auth_module.signInWithPopup(auth, new auth_module.GoogleAuthProvider());
  }

  /** @inheritdoc */
  public async sign_out(): Promise<void> {
    const auth = await this.get_auth();
    const auth_module = await import('firebase/auth');
    await auth_module.signOut(auth);
  }

  /** @inheritdoc */
  public async get_id_token(): Promise<string | null> {
    const auth = await this.get_auth();
    return (await auth.currentUser?.getIdToken()) ?? null;
  }

  private get_auth(): Promise<Auth> {
    this.auth_promise ??= this.create_auth();
    return this.auth_promise;
  }

  private async create_auth(): Promise<Auth> {
    const [app_module, auth_module] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]);
    const app = app_module.initializeApp({
      apiKey: environment.firebase.api_key,
      authDomain: environment.firebase.auth_domain,
      projectId: environment.firebase.project_id,
      appId: environment.firebase.app_id,
    });
    const auth = auth_module.getAuth(app);
    if (environment.auth_emulator_url) {
      auth_module.connectAuthEmulator(auth, environment.auth_emulator_url, {
        disableWarnings: true,
      });
    }
    return auth;
  }

  private to_auth_user(user: User): IAuthUser {
    return {
      uid: user.uid,
      display_name: user.displayName ?? user.email ?? '',
      email: user.email,
      avatar_url: user.photoURL,
    };
  }
}
