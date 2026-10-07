import { Type } from '@angular/core';
import { Route, Routes } from '@angular/router';
import { NAV_DEFINITIONS } from './core/constants/nav_definitions.constant';
import { auth_guard } from './core/guards/auth_guard';

const landing_path = NAV_DEFINITIONS[0].path;

const load_placeholder = (): Promise<Type<unknown>> =>
  import('./core/components/feature_placeholder/feature_placeholder.component').then(
    (module) => module.FeaturePlaceholderComponent,
  );

/** Features that are built; every other nav entry still shows the placeholder. */
const feature_loaders: Readonly<Record<string, () => Promise<Type<unknown>>>> = {
  connections: () =>
    import('./features/connections/components/connections_page/connections_page.component').then(
      (module) => module.ConnectionsPageComponent,
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
  { path: '', pathMatch: 'full', redirectTo: landing_path },
  ...feature_routes,
  { path: '**', redirectTo: landing_path },
];
