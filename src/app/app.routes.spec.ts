import { NAV_DEFINITIONS } from './core/constants/nav_definitions.constant';
import { auth_guard } from './core/guards/auth_guard';
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
    const games = routes.find((route) => route.path === 'games');

    expect(await (login?.loadComponent as () => Promise<unknown>)()).toBeTruthy();
    expect(await (games?.loadComponent as () => Promise<unknown>)()).toBeTruthy();
  });
});
