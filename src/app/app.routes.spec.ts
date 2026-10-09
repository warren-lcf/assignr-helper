import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { NAV_DEFINITIONS } from './core/constants/nav_definitions.constant';
import { auth_guard } from './core/guards/auth_guard';
import { FeaturePlaceholderComponent } from './core/components/feature_placeholder/feature_placeholder.component';
import { GamesPageComponent } from './features/games/components/games_page/games_page.component';
import { ConnectionsPageComponent } from './features/connections/components/connections_page/connections_page.component';
import { QuickLinksPageComponent } from './features/quick_links/components/quick_links_page/quick_links_page.component';
import { PublicQuickLinkPageComponent } from './features/public_quick_link/components/public_quick_link_page/public_quick_link_page.component';
import { EmailDraftsPageComponent } from './features/email_drafts/components/email_drafts_page/email_drafts_page.component';
import { MatchReportsPageComponent } from './features/match_reports/components/match_reports_page/match_reports_page.component';
import { MatchReportEntryPageComponent } from './features/match_reports/components/match_report_entry_page/match_report_entry_page.component';
import { PublicUnsubscribePageComponent } from './features/public_unsubscribe/components/public_unsubscribe_page/public_unsubscribe_page.component';
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

  it('lazy loads the Email drafts page in place of its placeholder, behind the guard', async () => {
    const email_drafts = routes.find((route) => route.path === 'email-drafts');

    expect(email_drafts?.canActivate).toEqual([auth_guard]);
    expect(await (email_drafts?.loadComponent as () => Promise<unknown>)()).toBe(
      EmailDraftsPageComponent,
    );
  });

  it('lazy loads the Match reports list in place of its placeholder, behind the guard', async () => {
    const match_reports = routes.find((route) => route.path === 'match-reports');

    expect(match_reports?.canActivate).toEqual([auth_guard]);
    expect(await (match_reports?.loadComponent as () => Promise<unknown>)()).toBe(
      MatchReportsPageComponent,
    );
  });

  describe('the match report entry route', () => {
    const find_entry = (): Route | undefined =>
      routes.find((route) => route.path === 'match-reports/:game_id');

    it('exists behind the guard', () => {
      expect(find_entry()).toBeDefined();
      expect(find_entry()?.canActivate).toEqual([auth_guard]);
    });

    it('lazy loads the entry screen', async () => {
      expect(await (find_entry()?.loadComponent as () => Promise<unknown>)()).toBe(
        MatchReportEntryPageComponent,
      );
    });

    it('shares the navigation entry’s title, icon and breadcrumb', () => {
      const definition = NAV_DEFINITIONS.find((candidate) => candidate.path === 'match-reports');

      expect(find_entry()?.data).toEqual({
        title: definition?.label,
        icon: definition?.icon,
        breadcrumb: definition?.label,
      });
    });

    it('sits before the catch-all so it is reachable', () => {
      const entry_index = routes.findIndex((route) => route.path === 'match-reports/:game_id');
      const catch_all_index = routes.findIndex((route) => route.path === '**');

      expect(entry_index).toBeGreaterThanOrEqual(0);
      expect(entry_index).toBeLessThan(catch_all_index);
    });
  });

  describe('the public unsubscribe route', () => {
    const find_public = (): Route | undefined =>
      routes.find((route) => route.path === 'unsubscribe/:token');

    it('exists outside the guard, so a signed-out visitor can open it', () => {
      expect(find_public()).toBeDefined();
      expect(find_public()?.canActivate).toBeUndefined();
      expect(find_public()?.canMatch).toBeUndefined();
    });

    it('lazy loads the public page', async () => {
      expect(await (find_public()?.loadComponent as () => Promise<unknown>)()).toBe(
        PublicUnsubscribePageComponent,
      );
    });

    it('sits before the catch-all so it is reachable', () => {
      const public_index = routes.findIndex((route) => route.path === 'unsubscribe/:token');
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

      expect(TestBed.runInInjectionContext(title)).toBe('T(Unsubscribe)');
    });
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
