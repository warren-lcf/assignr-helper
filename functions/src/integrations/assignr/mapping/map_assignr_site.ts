import { INormalizedOrganization } from '../../models/normalized_organization.model.js';
import { assignr_site_schema } from '../schemas/assignr_site.schema.js';

/**
 * Maps an Assignr site to a normalized organization. Boolean fields on the site
 * (the `show_*` visibility flags) are carried through as flags.
 * @param payload Raw site object.
 * @returns The normalized organization.
 * @throws ZodError when the payload lacks an id or name.
 */
export function map_assignr_site(payload: unknown): INormalizedOrganization {
  const site = assignr_site_schema.parse(payload);
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(site)) {
    if (typeof value === 'boolean') flags[key] = value;
  }
  return { external_id: site.id, name: site.name.trim(), flags };
}
