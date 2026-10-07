import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { NAV_DEFINITIONS } from './core/constants/nav_definitions.constant';
import { auth_guard } from './core/guards/auth_guard';
import { FeaturePlaceholderComponent } from './core/components/feature_placeholder/feature_placeholder.component';
import { GamesPageComponent } from './features/games/components/games_page/games_page.component';
import { ConnectionsPageComponent } from './features/connections/components/connections_page/connections_page.component';
import { QuickLinksPageComponent } from './features/quick_links/components/quick_links_page/quick_links_page.component';
import { PublicQuickLinkPageComponent } from './features/public_quick_link/components/public_quick_link_page/public_quick_link_page.component';
import { AppTranslationService } from './core/services/translation/app_translation.service';
import { routes } from './app.routes';

describe('routes', () => {
  it('guards every navigation entry and gives it a title, icon and breadcrumb', () => {
    for (const definition of NAV_DEFINITIONS) {
      const route = routes.find((candidate) => candidate.path === definition.path);

      expect(route?.canActivate).toEqual([auth_guard]);
      expect(route?.data).toEqual({
        title: definition.label,
        icon: definition.icon,
        breadcrumb: definition.label,
      });
    }
  });

  it('leaves the sign-in page public', () => {
    const login = routes.find((route) => route.path === 'login');

    expect(login?.canActivate).toBeUndefined();
  });

  it('lands on the first navigation entry for the root and unknown paths', () => {
    const landing = NAV_DEFINITIONS[0].path;

    expect(routes.find((route) => route.path === '')?.redirectTo).toBe(landing);
    expect(routes.find((route) => route.path === '**')?.redirectTo).toBe(landing);
  });

  it('lazy loads the login page and the placeholders', async () => {
    const login = routes.find((route) => route.path === 'login');
    const schedule = routes.find((route) => route.path === 'my-schedule');

    expect(await (login?.loadComponent as () => Promise<unknown>)()).toBeTruthy();
    expect(await (schedule?.loadComponent as () => Promise<unknown>)()).toBe(
      FeaturePlaceholderComponent,
    );
  });

  it('lazy loads the Games page in place of its placeholder', async () => {
    const games = routes.find((route) => route.path === 'games');

    expect(await (games?.loadComponent as () => Promise<unknown>)()).toBe(GamesPageComponent);
  });

  it('lazy loads the Connections page in place of its placeholder', async () => {
    const connections = routes.find((route) => route.path === 'connections');

    expect(await (connections?.loadComponent as () => Promise<unknown>)()).toBe(
      ConnectionsPageComponent,
    );
  });

  it('lazy loads the Quick links page in place of its placeholder, behind the guard', async () => {
    const quick_links = routes.find((route) => route.path === 'quick-links');

    expect(quick_links?.canActivate).toEqual([auth_guard]);
    expect(await (quick_links?.loadComponent as () => Promise<unknown>)()).toBe(
      QuickLinksPageComponent,
    );
  });

  describe('the public quick link route', () => {
    const find_public = (): Route | undefined => routes.find((route) => route.path === 'q/:token');

    it('exists outside the guard, so a signed-out visitor can open it', () => {
      expect(find_public()).toBeDefined();
      expect(find_public()?.canActivate).toBeUndefined();
      expect(find_public()?.canMatch).toBeUndefined();
    });

    it('lazy loads the public page', async () => {
      expect(await (find_public()?.loadComponent as () => Promise<unknown>)()).toBe(
        PublicQuickLinkPageComponent,
      );
    });

    it('sits before the catch-all so it is reachable', () => {
      const public_index = routes.findIndex((route) => route.path === 'q/:token');
      const catch_all_index = routes.findIndex((route) => route.path === '**');

      expect(public_index).toBeGreaterThanOrEqual(0);
      expect(public_index).toBeLessThan(catch_all_index);
    });

    it('sets a translated title', () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: AppTranslationService,
            useValue: { translate: (key: string) => `T(${key})` },
          },
        ],
      });
      const title = find_public()?.title as () => string;

      expect(TestBed.runInInjectionContext(title)).toBe('T(Games available)');
    });
  });
});
