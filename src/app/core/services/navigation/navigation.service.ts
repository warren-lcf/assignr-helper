import { Injectable, computed, inject } from '@angular/core';
import type { NavItem } from '@hch-shared-libraries/ui-kit/app';
import { NAV_DEFINITIONS } from '../../constants/nav_definitions.constant';
import { AppTranslationService } from '../translation/app_translation.service';

/** Builds the sidebar items, translated for the active locale. */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly translation = inject(AppTranslationService);

  public readonly nav_items = computed<NavItem[]>(() =>
    NAV_DEFINITIONS.map((definition) => ({
      label: this.translation.translate(definition.label),
      path: `/${definition.path}`,
      icon: definition.icon,
    })),
  );
}
