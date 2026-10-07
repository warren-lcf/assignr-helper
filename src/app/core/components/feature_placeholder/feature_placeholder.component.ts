import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { PageContainerComponent } from '@hch-shared-libraries/ui-kit/app';
import { EmptyStateComponent } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../services/translation/app_translation.service';

/**
 * Stand-in page for a navigation entry whose feature is not built yet, so the
 * shell, routing and sign-in guard can be exercised end to end. Title and icon
 * come from the route's `data`.
 */
@Component({
  selector: 'app-feature-placeholder',
  standalone: true,
  imports: [PageContainerComponent, EmptyStateComponent],
  templateUrl: './feature_placeholder.component.html',
  styleUrl: './feature_placeholder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturePlaceholderComponent {
  private readonly translation = inject(AppTranslationService);

  public readonly title = input.required<string>();
  public readonly icon = input<string>('construction');

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @returns The translated text.
   */
  public t(key: string): string {
    return this.translation.translate(key);
  }
}
