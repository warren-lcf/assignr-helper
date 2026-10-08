import { Type, inject } from '@angular/core';
import { Route, Routes } from '@angular/router';
import { NAV_DEFINITIONS } from './core/constants/nav_definitions.constant';
import { auth_guard } from './core/guards/auth_guard';
import { AppTranslationService } from './core/services/translation/app_translation.service';

const landing_path = NAV_DEFINITIONS[0].path;

const load_placeholder = (): Promise<Type<unknown>> =>
  import('./core/components/feature_placeholder/feature_placeholder.component').then(
    (module) => module.FeaturePlaceholderComponent,
  );

/** Features that are built; every other nav entry still shows the placeholder. */
const feature_loaders: Readonly<Record<string, () => Promise<Type<unknown>>>> = {
  games: () =>
    import('./features/games/components/games_page/games_page.component').then(
      (module) => module.GamesPageComponent,
    ),
  connections: () =>
    import('./features/connections/components/connections_page/connections_page.component').then(
      (module) => module.ConnectionsPageComponent,
    ),
  'email-drafts': () =>
    import('./features/email_drafts/components/email_drafts_page/email_drafts_page.component').then(
      (module) => module.EmailDraftsPageComponent,
    ),
  'quick-links': () =>
    import('./features/quick_links/components/quick_links_page/quick_links_page.component').then(
      (module) => module.QuickLinksPageComponent,
    ),
};

/** Each nav entry gets a guarded route; the placeholder is swapped for the real feature as it is built. */
const feature_routes: Route[] = NAV_DEFINITIONS.map((definition) => ({
  path: definition.path,
  canActivate: [auth_guard],
  loadComponent: feature_loaders[definition.path] ?? load_placeholder,
  data: { title: definition.label, icon: definition.icon, breadcrumb: definition.label },
}));

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./core/components/login/login.component').then((module) => module.LoginComponent),
    data: { breadcrumb: 'Sign in' },
  },
  {
    // Public and chromeless like the sign-in page: opened by anyone holding a quick link, no auth_guard.
    path: 'q/:token',
    loadComponent: () =>
      import('./features/public_quick_link/components/public_quick_link_page/public_quick_link_page.component').then(
        (module) => module.PublicQuickLinkPageComponent,
      ),
    title: () => inject(AppTranslationService).translate('Games available'),
  },
  {
    // Public and chromeless like the quick link page: opened by anyone holding the link in an email, no auth_guard.
    path: 'unsubscribe/:token',
    loadComponent: () =>
      import('./features/public_unsubscribe/components/public_unsubscribe_page/public_unsubscribe_page.component').then(
        (module) => module.PublicUnsubscribePageComponent,
      ),
    title: () => inject(AppTranslationService).translate('Unsubscribe'),
  },
  { path: '', pathMatch: 'full', redirectTo: landing_path },
  ...feature_routes,
  { path: '**', redirectTo: landing_path },
];
