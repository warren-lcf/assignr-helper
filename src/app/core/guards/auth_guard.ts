import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { IdentityService } from '../services/identity/identity.service';

/**
 * Lets signed-in users through and sends everyone else to `/login`, keeping the
 * page they asked for in `return_url`. Waits for the first auth state so a
 * reload on a protected page does not bounce a signed-in user.
 * @param _route The route being activated.
 * @param state The router state with the requested URL.
 * @returns True when signed in, otherwise a redirect to the login page.
 */
export const auth_guard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return toObservable(inject(IdentityService).is_logged_in).pipe(
    filter((is_logged_in) => is_logged_in !== undefined),
    take(1),
    map((is_logged_in) =>
      is_logged_in
        ? true
        : router.createUrlTree(['/login'], { queryParams: { return_url: state.url } }),
    ),
  );
};
