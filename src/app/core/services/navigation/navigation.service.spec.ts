import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NAV_DEFINITIONS } from '../../constants/nav_definitions.constant';
import { AppTranslationService } from '../translation/app_translation.service';
import { NavigationService } from './navigation.service';

describe('NavigationService', () => {
  it('builds one sidebar item per definition, in order, with absolute paths and icons', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AppTranslationService, useValue: { translate: (key: string) => key } },
      ],
    });

    const items = TestBed.inject(NavigationService).nav_items();

    expect(items.map((item) => item.path)).toEqual(
      NAV_DEFINITIONS.map((entry) => `/${entry.path}`),
    );
    expect(items[0]).toEqual({ label: 'Games', path: '/games', icon: 'sports_soccer' });
    expect(items).toHaveLength(9);
  });

  it('re-translates the labels when the dictionary changes', () => {
    const dictionary = signal<Record<string, string>>({});
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AppTranslationService,
          useValue: { translate: (key: string) => dictionary()[key] ?? key },
        },
      ],
    });
    const service = TestBed.inject(NavigationService);
    expect(service.nav_items()[0].label).toBe('Games');

    dictionary.set({ Games: 'Matches' });

    expect(service.nav_items()[0].label).toBe('Matches');
  });
});
