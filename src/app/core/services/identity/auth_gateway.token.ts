import { InjectionToken, inject } from '@angular/core';
import { IAuthGateway } from './auth_gateway.interface';
import { FirebaseAuthGateway } from './firebase_auth_gateway';

/** DI token for the sign-in provider; defaults to Firebase Auth. */
export const AUTH_GATEWAY = new InjectionToken<IAuthGateway>('AUTH_GATEWAY', {
  providedIn: 'root',
  factory: () => inject(FirebaseAuthGateway),
});
