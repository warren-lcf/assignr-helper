import { TestBed } from '@angular/core/testing';
import { SignInFailure } from '../../enums/sign_in_failure.enum';
import { IAuthUser } from '../../models/auth_user.model';
import { IAuthGateway } from './auth_gateway.interface';
import { AUTH_GATEWAY } from './auth_gateway.token';
import { IdentityService } from './identity.service';

const alex: IAuthUser = {
  uid: 'u1',
  display_name: 'Alex Referee',
  email: 'alex@example.test',
  avatar_url: null,
};

function make_gateway() {
  const stop = vi.fn();
  const state: { emit: (user: IAuthUser | null) => void } = { emit: () => undefined };
  const gateway = {
    watch_user: vi.fn(async (on_change: (user: IAuthUser | null) => void) => {
      state.emit = on_change;
      return stop;
    }),
    sign_in_with_email: vi.fn(async () => undefined),
    sign_in_with_google: vi.fn(async () => undefined),
    sign_out: vi.fn(async () => undefined),
    get_id_token: vi.fn(async () => 'id-token'),
  } satisfies IAuthGateway;
  return { gateway, stop, state };
}

function make_service(gateway: IAuthGateway): IdentityService {
  TestBed.configureTestingModule({ providers: [{ provide: AUTH_GATEWAY, useValue: gateway }] });
  return TestBed.inject(IdentityService);
}

describe('IdentityService', () => {
  it('is undetermined until the first auth state arrives', () => {
    const service = make_service(make_gateway().gateway);

    expect(service.is_logged_in()).toBeUndefined();
    expect(service.current_user()).toBeNull();
  });

  it('exposes the signed-in user as a header profile', async () => {
    const { gateway, state } = make_gateway();
    const service = make_service(gateway);
    service.start();
    await vi.waitFor(() => expect(gateway.watch_user).toHaveBeenCalled());

    state.emit(alex);

    expect(service.is_logged_in()).toBe(true);
    expect(service.current_user()).toEqual({
      display_name: 'Alex Referee',
      email: 'alex@example.test',
      avatar_url: undefined,
    });
  });

  it('omits an email and avatar that the account does not have', async () => {
    const { gateway, state } = make_gateway();
    const service = make_service(gateway);
    service.start();
    await vi.waitFor(() => expect(gateway.watch_user).toHaveBeenCalled());

    state.emit({ ...alex, email: null, avatar_url: 'https://example.test/a.png' });

    expect(service.current_user()).toEqual({
      display_name: 'Alex Referee',
      email: undefined,
      avatar_url: 'https://example.test/a.png',
    });
  });

  it('reports signed out when the user goes away', async () => {
    const { gateway, state } = make_gateway();
    const service = make_service(gateway);
    service.start();
    await vi.waitFor(() => expect(gateway.watch_user).toHaveBeenCalled());
    state.emit(alex);

    state.emit(null);

    expect(service.is_logged_in()).toBe(false);
    expect(service.current_user()).toBeNull();
  });

  it('stops watching when destroyed', async () => {
    const { gateway, stop } = make_gateway();
    const service = make_service(gateway);
    service.start();
    await vi.waitFor(() => expect(gateway.watch_user).toHaveBeenCalled());
    await Promise.resolve();

    TestBed.resetTestingModule();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops immediately when destroyed before the watcher is ready', async () => {
    const stop = vi.fn();
    let resolve_watch: (stop_fn: () => void) => void = () => undefined;
    const gateway = {
      ...make_gateway().gateway,
      watch_user: vi.fn(() => new Promise<() => void>((resolve) => (resolve_watch = resolve))),
    };
    const service = make_service(gateway);
    service.start();

    TestBed.resetTestingModule();
    resolve_watch(stop);
    await Promise.resolve();
    await Promise.resolve();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('falls back to signed out and logs when watching cannot start', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = {
      ...make_gateway().gateway,
      watch_user: vi.fn(async () => {
        throw new Error('sdk failed');
      }),
    };
    const service = make_service(gateway);

    service.start();
    await vi.waitFor(() => expect(service.is_logged_in()).toBe(false));

    expect(error_spy).toHaveBeenCalledWith(
      'Could not start watching the auth state',
      expect.any(Error),
    );
    error_spy.mockRestore();
  });

  it('signs in with email and password', async () => {
    const { gateway } = make_gateway();
    const service = make_service(gateway);

    const result = await service.sign_in_with_email('alex@example.test', 'pw');

    expect(result).toEqual({ ok: true, failure: null });
    expect(gateway.sign_in_with_email).toHaveBeenCalledWith('alex@example.test', 'pw');
  });

  it('reports a recognised failure without logging it as an error', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { gateway } = make_gateway();
    gateway.sign_in_with_email.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    const service = make_service(gateway);

    const result = await service.sign_in_with_email('alex@example.test', 'bad');

    expect(result).toEqual({ ok: false, failure: SignInFailure.INVALID_CREDENTIALS });
    expect(error_spy).not.toHaveBeenCalled();
    error_spy.mockRestore();
  });

  it('logs the real error for an unrecognised Google sign-in failure', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { gateway } = make_gateway();
    gateway.sign_in_with_google.mockRejectedValueOnce(new Error('boom'));
    const service = make_service(gateway);

    const result = await service.sign_in_with_google();

    expect(result).toEqual({ ok: false, failure: SignInFailure.UNKNOWN });
    expect(error_spy).toHaveBeenCalledWith('Sign-in failed', expect.any(Error));
    error_spy.mockRestore();
  });

  it('signs out and reads the id token through the gateway', async () => {
    const { gateway } = make_gateway();
    const service = make_service(gateway);

    await service.sign_out();

    expect(gateway.sign_out).toHaveBeenCalled();
    expect(await service.get_id_token()).toBe('id-token');
  });
});
