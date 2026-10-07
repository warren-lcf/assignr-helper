import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { IdentityService } from '../services/identity/identity.service';
import { auth_guard } from './auth_guard';

function run_guard(is_logged_in: ReturnType<typeof signal<boolean | undefined>>, url = '/games') {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: IdentityService, useValue: { is_logged_in } }],
  });
  const result = TestBed.runInInjectionContext(() =>
    auth_guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
  TestBed.tick();
  return result;
}

describe('auth_guard', () => {
  it('lets a signed-in user through', async () => {
    const result = run_guard(signal<boolean | undefined>(true));

    expect(isObservable(result)).toBe(true);
    expect(await firstValueFrom(result as never)).toBe(true);
  });

  it('redirects a signed-out user to login, remembering the page', async () => {
    const result = await firstValueFrom(
      run_guard(signal<boolean | undefined>(false), '/match-reports') as never,
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/login?return_url=%2Fmatch-reports',
    );
  });

  it('waits for the first auth state instead of redirecting early', async () => {
    const is_logged_in = signal<boolean | undefined>(undefined);
    const pending = firstValueFrom(run_guard(is_logged_in) as never);
    let settled = false;
    void pending.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    is_logged_in.set(true);
    TestBed.tick();

    expect(await pending).toBe(true);
  });
});
