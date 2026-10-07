import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
  ToastService,
} from '@hch-shared-libraries/ui-kit/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { ACTIVE_LINK, QUICK_LINK_FIXTURES, REVOKED_LINK } from '../../mocks/quick_link_view.mock';
import {
  ISessionDoubleOptions,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IQuickLinkView } from '../../models/quick_link_view.model';
import { QuickLinksApiService } from '../../services/quick_links_api.service';
import { CreateQuickLinkDialogComponent } from '../create_quick_link_dialog/create_quick_link_dialog.component';
import { QuickLinksPageComponent } from './quick_links_page.component';

interface IRenderOptions {
  permissions?: readonly PermissionKey[];
  session?: ISessionDoubleOptions;
  links?: () => Observable<IQuickLinkView[]>;
  revoke?: () => Observable<IQuickLinkView>;
  dialog_results?: Map<unknown, unknown>;
}

function render(options: IRenderOptions = {}) {
  const api = {
    list_quick_links: vi.fn(options.links ?? (() => of([...QUICK_LINK_FIXTURES]))),
    revoke_quick_link: vi.fn(options.revoke ?? (() => of(REVOKED_LINK))),
  };
  const toast = { show_success: vi.fn(), show_error: vi.fn(), show_info: vi.fn() };
  const dialog_results = options.dialog_results ?? new Map<unknown, unknown>();
  const dialog = {
    open: vi.fn((component: unknown) => ({ afterClosed: () => of(dialog_results.get(component)) })),
  };
  const session = make_session_service_double(
    options.permissions ?? OWNER_PERMISSIONS,
    options.session,
  );
  TestBed.configureTestingModule({
    imports: [QuickLinksPageComponent],
    providers: [
      { provide: QuickLinksApiService, useValue: api },
      { provide: SessionService, useValue: session },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(QuickLinksPageComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    toast,
    dialog,
    session,
    settle,
    by_testid,
  };
}

function http_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations: [] } });
}

describe('QuickLinksPageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('states', () => {
    it('shows skeleton cards while the links load', () => {
      const pending = new Subject<IQuickLinkView[]>();
      const { element, by_testid } = render({ links: () => pending });

      expect(by_testid('quick-links-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('hch-skeleton-card')).toHaveLength(3);
      expect(element.querySelector('app-quick-link-card')).toBeNull();
    });

    it('shows skeletons while the session loads, and asks for no links yet', async () => {
      const { by_testid, api, settle } = render({ session: { is_loading: true } });
      await settle();

      expect(by_testid('quick-links-loading')).not.toBeNull();
      expect(api.list_quick_links).not.toHaveBeenCalled();
    });

    it('lists a card per link under the page title, with a polite count', async () => {
      const { element, by_testid, settle } = render();
      await settle();

      expect(element.querySelector('hch-page-container')).not.toBeNull();
      expect(element.textContent).toContain('Quick links');
      expect(element.querySelectorAll('app-quick-link-card')).toHaveLength(3);
      const count = by_testid('quick-links-count');
      expect(count?.textContent?.trim()).toBe('3 quick links');
      expect(count?.getAttribute('aria-live')).toBe('polite');
    });

    it('names a single link in the singular', async () => {
      const { by_testid, settle } = render({ links: () => of([ACTIVE_LINK]) });
      await settle();

      expect(by_testid('quick-links-count')?.textContent?.trim()).toBe('1 quick link');
    });

    it('invites the first link when there are none, and the invitation opens the dialog', async () => {
      const { by_testid, dialog, element, settle } = render({ links: () => of([]) });
      await settle();

      expect(element.textContent).toContain('No quick links yet');
      by_testid('quick-links-empty-create')?.click();
      expect(dialog.open).toHaveBeenCalledWith(CreateQuickLinkDialogComponent, expect.anything());
    });

    it('shows a no-access state, and asks for no links, without quick_links.manage', async () => {
      const { by_testid, api, element, settle } = render({ permissions: MEMBER_PERMISSIONS });
      await settle();

      expect(by_testid('quick-links-no-access')?.textContent).toContain(
        'You do not have access to quick links',
      );
      expect(api.list_quick_links).not.toHaveBeenCalled();
      expect(element.querySelector('app-quick-link-card')).toBeNull();
      expect(by_testid('quick-links-create')).toBeNull();
    });

    it('shows an error with a retry when the links fail, and loads again on retry', async () => {
      let calls = 0;
      const { api, by_testid, element, settle } = render({
        links: () =>
          ++calls === 1 ? throwError(() => http_error(500, 'INTERNAL')) : of([ACTIVE_LINK]),
      });
      await settle();

      expect(element.textContent).toContain('Quick links could not be loaded');
      expect(logged).toHaveBeenCalledWith('Could not load the quick links', expect.anything());
      by_testid('quick-links-retry')?.click();
      await settle();

      expect(api.list_quick_links).toHaveBeenCalledTimes(2);
      expect(element.querySelectorAll('app-quick-link-card')).toHaveLength(1);
    });

    it('tells a platform administrator to choose a tenant first', async () => {
      const { element, settle } = render({
        links: () => throwError(() => http_error(400, 'TENANT_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('Choose a tenant first');
    });

    it('reloads the session, not the links, when the session is what failed', async () => {
      const { by_testid, session, api, settle } = render({
        permissions: [],
        session: { has_failed: true },
      });
      await settle();

      by_testid('quick-links-retry')?.click();

      expect(session.reload_count()).toBe(1);
      expect(api.list_quick_links).not.toHaveBeenCalled();
    });
  });

  describe('creating a link', () => {
    it('offers Create link in the header to someone who may manage', async () => {
      const { by_testid, settle } = render();
      await settle();

      expect(by_testid('quick-links-create')?.textContent).toContain('Create link');
    });

    it('opens the create dialog, then reads the list again and announces the new link', async () => {
      const created = ACTIVE_LINK;
      const { by_testid, api, dialog, toast, settle } = render({
        dialog_results: new Map([[CreateQuickLinkDialogComponent, created]]),
      });
      await settle();

      by_testid('quick-links-create')?.click();
      await settle();

      expect(dialog.open).toHaveBeenCalledWith(
        CreateQuickLinkDialogComponent,
        expect.objectContaining({ maxWidth: expect.stringContaining('100vw') }),
      );
      expect(api.list_quick_links).toHaveBeenCalledTimes(2);
      expect(toast.show_success).toHaveBeenCalledWith('Quick link created.');
    });

    it('still reads the list again when the dialog was dismissed, without a toast', async () => {
      const { by_testid, api, toast, settle } = render();
      await settle();

      by_testid('quick-links-create')?.click();
      await settle();

      expect(api.list_quick_links).toHaveBeenCalledTimes(2);
      expect(toast.show_success).not.toHaveBeenCalled();
    });
  });

  describe('revoking a link', () => {
    function confirm_dialog(confirmed: boolean | undefined) {
      return new Map<unknown, unknown>([[ConfirmationDialogComponent, confirmed]]);
    }

    it('asks first, with a destructive confirmation that names the link and what it shows', async () => {
      const { by_testid, dialog, settle } = render({ dialog_results: confirm_dialog(false) });
      await settle();

      by_testid('quick-link-revoke-link-1')?.click();
      await settle();

      const [component, config] = dialog.open.mock.calls[0] as unknown as [
        unknown,
        { data: ConfirmationDialogData },
      ];
      expect(component).toBe(ConfirmationDialogComponent);
      expect(config.data.is_destructive).toBe(true);
      expect(config.data.confirm_button_label).toBe('Revoke');
      expect(config.data.message).toContain('Quick link created');
      expect(config.data.message).toContain('Levels: Premier, Select');
      expect(config.data.message).toContain('stops working at once');
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const { by_testid, api, toast, settle } = render({ dialog_results: confirm_dialog(false) });
      await settle();

      by_testid('quick-link-revoke-link-1')?.click();
      await settle();

      expect(api.revoke_quick_link).not.toHaveBeenCalled();
      expect(toast.show_success).not.toHaveBeenCalled();
    });

    it('revokes the confirmed link, announces it and reads the list again', async () => {
      const { by_testid, api, toast, settle } = render({ dialog_results: confirm_dialog(true) });
      await settle();

      by_testid('quick-link-revoke-link-1')?.click();
      await settle();

      expect(api.revoke_quick_link).toHaveBeenCalledWith('link-1');
      expect(toast.show_success).toHaveBeenCalledWith(
        expect.stringContaining('Revoked "Quick link created'),
      );
      expect(api.list_quick_links).toHaveBeenCalledTimes(2);
    });

    it('reports a failed revoke with the real error logged, and reads the list again', async () => {
      const { by_testid, api, toast, settle } = render({
        dialog_results: confirm_dialog(true),
        revoke: () => throwError(() => http_error(500, 'INTERNAL')),
      });
      await settle();

      by_testid('quick-link-revoke-link-1')?.click();
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(
        expect.stringContaining('Could not revoke "Quick link created'),
      );
      expect(logged).toHaveBeenCalledWith('Could not revoke the quick link', expect.anything());
      expect(api.list_quick_links).toHaveBeenCalledTimes(2);
    });

    it('disables the other cards Revoke buttons while one revoke is running', async () => {
      const pending = new Subject<IQuickLinkView>();
      const second_active = { ...ACTIVE_LINK, link_id: 'link-9' };
      const { by_testid, component, settle } = render({
        links: () => of([ACTIVE_LINK, second_active]),
        dialog_results: confirm_dialog(true),
        revoke: () => pending,
      });
      await settle();

      by_testid('quick-link-revoke-link-1')?.click();
      await settle();

      expect(component.busy_link_id()).toBe('link-1');
      expect((by_testid('quick-link-revoke-link-9') as HTMLButtonElement).disabled).toBe(true);
      expect((by_testid('quick-link-revoke-link-1') as HTMLButtonElement).disabled).toBe(true);
      pending.next(REVOKED_LINK);
      pending.complete();
      await settle();
      expect(component.busy_link_id()).toBeNull();
    });
  });
});
