import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  BundledTranslationProvider,
  interpolate_translation_params,
  load_bundled_translation_dictionary,
  resolve_default_translation_locale,
} from '@hch-shared-libraries/ui-kit/core/translation';
import { firstValueFrom } from 'rxjs';

/** Locale used when a dictionary for the requested locale does not exist. */
export const FALLBACK_LOCALE = 'en';

/**
 * Signal-driven translation provider for the app. Layers the app's own
 * dictionary (`assets/i18n/<locale>.json`, English text as the key) over the
 * ui-kit's bundled strings, so shared components and app screens translate
 * through the one `TRANSLATION_PROVIDER`.
 */
@Injectable({ providedIn: 'root' })
export class AppTranslationService implements BundledTranslationProvider {
  private readonly http = inject(HttpClient);
  private readonly dictionary = signal<Readonly<Record<string, string>>>({});

  public readonly active_locale = signal(resolve_default_translation_locale());
  public readonly is_ready = signal(false);

  /**
   * Translates an English key, interpolating `{{param}}` placeholders. An
   * unknown key renders as written.
   * @param key English text used as the key.
   * @param params Values for placeholders.
   * @returns The translated text.
   */
  public translate(key: string, params?: Record<string, string | number>): string {
    const text = this.dictionary()[key] ?? key;
    return params ? interpolate_translation_params(text, params) : text;
  }

  /**
   * Switches locale: loads the bundled and app dictionaries, then publishes them.
   * @param locale BCP-47 locale code, e.g. `en` or `es`.
   * @returns Resolves when the new dictionary is active.
   */
  public async load_locale(locale: string): Promise<void> {
    const primary = locale.split('-')[0].toLowerCase();
    const bundled = (await load_bundled_translation_dictionary(primary)) ?? {};
    const app = await this.load_app_dictionary(primary);
    this.dictionary.set({ ...bundled, ...app });
    this.active_locale.set(primary);
    this.is_ready.set(true);
  }

  /** @inheritdoc */
  public set_active_locale(locale: string): void {
    void this.load_locale(locale).catch((error: unknown) =>
      console.error('Failed to load translations', locale, error),
    );
  }

  private async load_app_dictionary(locale: string): Promise<Record<string, string>> {
    try {
      return await firstValueFrom(
        this.http.get<Record<string, string>>(`assets/i18n/${locale}.json`),
      );
    } catch (error) {
      if (locale === FALLBACK_LOCALE) {
        console.error('Failed to load the app dictionary', locale, error);
        return {};
      }
      return this.load_app_dictionary(FALLBACK_LOCALE);
    }
  }
}
