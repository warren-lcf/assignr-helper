import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IdentityService } from '../identity/identity.service';
import { PermissionKey } from './permission_key.enum';
import { ISessionContext } from './session_context.model';
import { SessionService } from './session.service';

const owner: ISessionContext = {
  uid: 'u1',
  email: 'owner@example.test',
  tenant_id: 't1',
  role: 'TENANT_OWNER',
  actual_tenant_id: 't1',
  actual_role: 'TENANT_OWNER',
  permissions: ['connections.manage', 'games.read'],
};

function make_service(is_logged_in: boolean | undefined = true) {
  const logged_in = signal<boolean | undefined>(is_logged_in);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: IdentityService, useValue: { is_logged_in: logged_in } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const service = TestBed.inject(SessionService);
  return { service, http, logged_in };
}

/** Lets a flushed response reach the resource. Never await it while a request is still open: the app is not stable then. */
async function settle(): Promise<void> {
  TestBed.tick();
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('SessionService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('has no permissions while /api/me is loading', async () => {
    const { service, http } = make_service();
    TestBed.tick();

    expect(service.is_loading()).toBe(true);
    expect(service.permissions().size).toBe(0);
    expect(service.has_permission(PermissionKey.CONNECTIONS_MANAGE)).toBe(false);
    http.expectOne('/api/me');
  });

  it('exposes the permissions the API reports once loaded', async () => {
    const { service, http } = make_service();
    TestBed.tick();
    http.expectOne('/api/me').flush({ data: owner });
    await settle();

    expect(service.is_loading()).toBe(false);
    expect(service.context()).toEqual(owner);
    expect(service.permissions()).toEqual(new Set(['connections.manage', 'games.read']));
    expect(service.has_permission(PermissionKey.CONNECTIONS_MANAGE)).toBe(true);
    expect(service.has_permission(PermissionKey.SYNC_RUN)).toBe(false);
  });

  it('loads /api/me only once however many readers ask', async () => {
    const { service, http } = make_service();
    TestBed.tick();
    http.expectOne('/api/me').flush({ data: owner });
    await settle();

    service.has_permission(PermissionKey.GAMES_READ);
    service.permissions();
    TestBed.tick();

    http.expectNone('/api/me');
  });

  it('stays permission-less and logs the real error when /api/me fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, http } = make_service();
    TestBed.tick();
    http
      .expectOne('/api/me')
      .flush({ code: 'NO_MEMBERSHIP' }, { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(service.has_failed()).toBe(true);
    expect(service.is_loading()).toBe(false);
    expect(service.context()).toBeNull();
    expect(service.permissions().size).toBe(0);
    expect(logged).toHaveBeenCalledWith('Could not load the session', expect.anything());
    logged.mockRestore();
  });

  it('does not call the API while signed out and loads once the user signs in', async () => {
    const { service, http, logged_in } = make_service(false);
    TestBed.tick();
    http.expectNone('/api/me');
    expect(service.permissions().size).toBe(0);

    logged_in.set(true);
    TestBed.tick();
    http.expectOne('/api/me').flush({ data: owner });
    await settle();

    expect(service.has_permission(PermissionKey.CONNECTIONS_MANAGE)).toBe(true);
  });

  it('reloads the session on demand', async () => {
    const { service, http } = make_service();
    TestBed.tick();
    http.expectOne('/api/me').flush({ data: owner });
    await settle();

    service.reload();
    TestBed.tick();

    http.expectOne('/api/me').flush({ data: { ...owner, permissions: [] } });
    await settle();
    expect(service.permissions().size).toBe(0);
  });
});
