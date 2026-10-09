import { signal } from '@angular/core';
import { interpolate_translation_params } from '@hch-shared-libraries/ui-kit/core/translation';

/**
 * A stand-in for the ui-kit `TRANSLATION_PROVIDER` that shared components read: English only,
 * returning the key with its `{{param}}` placeholders filled in.
 * @returns The double, with an English active locale.
 */
export function make_translation_provider_double() {
  return {
    active_locale: signal('en'),
    set_active_locale: () => undefined,
    translate: (key: string, params?: Record<string, string | number>) =>
      params ? interpolate_translation_params(key, params) : key,
  };
}
