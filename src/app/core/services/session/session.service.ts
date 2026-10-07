import { httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject } from '@angular/core';
import { IdentityService } from '../identity/identity.service';
import { IApiEnvelope } from './api_envelope.model';
import { PermissionKey } from './permission_key.enum';
import { ISessionContext } from './session_context.model';

/**
 * The signed-in user's API-side context: tenant, role and the permission keys
 * of the effective role. Loads `GET /api/me` once per sign-in (the request is
 * held back while signed out, so signing in as someone else loads afresh) and
 * exposes the result as signals. Until it has loaded, or when it fails, the
 * user holds no permissions, so screens fall back to their read-only view.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly identity = inject(IdentityService);
  private readonly resource = httpResource<IApiEnvelope<ISessionContext>>(() =>
    this.identity.is_logged_in() ? '/api/me' : undefined,
  );

  /** The loaded context, or null while loading, signed out or failed. */
  public readonly context = computed<ISessionContext | null>(() =>
    this.resource.hasValue() ? this.resource.value().data : null,
  );
  /** Permission keys of the effective role; empty until loaded and after a failure. */
  public readonly permissions = computed<ReadonlySet<string>>(
    () => new Set(this.context()?.permissions ?? []),
  );
  /** True while `/api/me` is in flight. */
  public readonly is_loading = computed(() => this.resource.isLoading());
  /** True when `/api/me` failed. */
  public readonly has_failed = computed(() => this.resource.error() !== undefined);

  public constructor() {
    effect(() => {
      const error = this.resource.error();
      if (error) console.error('Could not load the session', error);
    });
  }

  /**
   * Whether the effective role holds a permission.
   * @param key The permission to check.
   * @returns True when granted; false while loading or when the load failed.
   */
  public has_permission(key: PermissionKey): boolean {
    return this.permissions().has(key);
  }

  /**
   * Loads the context again, e.g. after switching role or tenant.
   * @returns Nothing.
   */
  public reload(): void {
    this.resource.reload();
  }
}
