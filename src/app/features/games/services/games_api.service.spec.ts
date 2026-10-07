import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GamesScope } from '../enums/games_scope.enum';
import { GAMES_RESULT } from '../mocks/game_view.mock';
import { GamesApiService } from './games_api.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(GamesApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('GamesApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists games, sending the scope and both toggles and unwrapping the data envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api
      .list_games({ scope: GamesScope.OPEN, only_with_open_slots: false, include_cancelled: false })
      .subscribe((games) => (result = games));
    const request = http.expectOne((candidate) => candidate.url === '/api/games');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual([
      'include_cancelled',
      'only_with_open_slots',
      'scope',
    ]);
    expect(request.request.params.get('scope')).toBe('OPEN');
    expect(request.request.params.get('only_with_open_slots')).toBe('false');
    request.flush({ data: GAMES_RESULT });

    expect(result).toEqual(GAMES_RESULT);
  });

  it('sends every filter that is set and nothing else', () => {
    const { api, http } = setup();

    api
      .list_games({
        scope: GamesScope.ALL,
        search: 'lions',
        connection_id: 'conn-1',
        organization_id: 'org-1',
        league: 'Fall League',
        level: 'Premier',
        age_group: 'U12',
        location_group: 'Riverside Park',
        only_with_open_slots: true,
        include_cancelled: true,
        from: 1_000,
        to: 2_000,
      })
      .subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/games');
    const params = request.request.params;
    expect(Object.fromEntries(params.keys().map((key) => [key, params.get(key)]))).toEqual({
      scope: 'ALL',
      search: 'lions',
      connection_id: 'conn-1',
      organization_id: 'org-1',
      league: 'Fall League',
      level: 'Premier',
      age_group: 'U12',
      location_group: 'Riverside Park',
      only_with_open_slots: 'true',
      include_cancelled: 'true',
      from: '1000',
      to: '2000',
    });
    request.flush({ data: GAMES_RESULT });
  });

  it('encodes values that need it, such as a location with an ampersand', () => {
    const { api, http } = setup();

    api
      .list_games({
        scope: GamesScope.OPEN,
        location_group: 'Smith & Sons Field',
        only_with_open_slots: false,
        include_cancelled: false,
      })
      .subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/games');
    expect(request.request.urlWithParams).toContain('location_group=Smith%20%26%20Sons%20Field');
    request.flush({ data: GAMES_RESULT });
  });
});
