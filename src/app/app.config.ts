import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { APP_HEADER_IDENTITY_PROVIDER } from '@hch-shared-libraries/ui-kit/app';
import {
  BEARER_AUTH_INTERCEPTOR_CONFIG,
  bearer_auth_interceptor,
} from '@hch-shared-libraries/ui-kit/authorization';
import {
  TRANSLATION_PROVIDER,
  resolve_default_translation_locale,
} from '@hch-shared-libraries/ui-kit/core/translation';
import { routes } from './app.routes';
import { IdentityService } from './core/services/identity/identity.service';
import { AppTranslationService } from './core/services/translation/app_translation.service';

/** API paths that receive the signed-in user's bearer token. */
const API_URL_PREFIXES = ['/api/'];

/**
 * Application-wide providers. The app runs zoneless (Angular 22 default, no
 * `zone.js`) and talks only to our own `/api/**` backend over the Fetch-backed
 * `HttpClient`, with the signed-in user's token attached.
 */
export const app_config: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([bearer_auth_interceptor])),
    {
      provide: BEARER_AUTH_INTERCEPTOR_CONFIG,
      useFactory: () => {
        const identity = inject(IdentityService);
        return { get_token: () => identity.get_id_token(), url_prefixes: API_URL_PREFIXES };
      },
    },
    { provide: APP_HEADER_IDENTITY_PROVIDER, useExisting: IdentityService },
    { provide: TRANSLATION_PROVIDER, useExisting: AppTranslationService },
    provideAppInitializer(() => {
      inject(IdentityService).start();
      return inject(AppTranslationService).load_locale(resolve_default_translation_locale());
    }),
  ],
};
