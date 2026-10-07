import { interpolate_translation_params } from '@hch-shared-libraries/ui-kit/core/translation';

/**
 * A stand-in for `AppTranslationService` that returns the English key with its
 * `{{param}}` placeholders filled in, so specs read the rendered English text.
 * @returns The double.
 */
export function make_translation_service_double() {
  return {
    translate: (key: string, params?: Record<string, string | number>) =>
      params ? interpolate_translation_params(key, params) : key,
  };
}
