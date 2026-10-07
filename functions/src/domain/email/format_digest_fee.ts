/**
 * Formats a fee given in minor currency units.
 * @param fee_minor Fee in minor units (for example cents), or null.
 * @param currency ISO 4217 currency code, or null.
 * @param locale BCP 47 locale used for formatting.
 * @returns Localised currency text, `<amount> <code>` when the code is not a
 *   valid currency, or null when there is no fee or currency to show.
 */
export function format_digest_fee(
  fee_minor: number | null,
  currency: string | null,
  locale: string,
): string | null {
  if (fee_minor === null || currency === null) {
    return null;
  }
  try {
    const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const fraction_digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(fee_minor / 10 ** fraction_digits);
  } catch {
    return `${(fee_minor / 100).toFixed(2)} ${currency}`;
  }
}
