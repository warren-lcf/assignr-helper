import type { AssumableRole, Role, RoleStore } from '@hch-shared-libraries/core-server';
import { ROLE_DEFINITIONS } from './constants/role_definitions.constant.js';
import { IRoleDefinition } from './models/role_definition.model.js';

const SYSTEM_ACTOR = 'system:roles';
const SYSTEM_STAMP_MS = 0;

const READ_ONLY_MESSAGE = 'System roles are fixed in code and cannot be changed at runtime';

/**
 * A read-only {@link RoleStore} over the roles fixed in code. It lets this app
 * reuse core-server's permission service and role switcher without a roles
 * table; switch to a table-backed store if roles ever need to be editable.
 * The role id is the slug.
 */
export class StaticRoleStore implements RoleStore {
  private readonly by_slug = new Map<string, IRoleDefinition>(
    ROLE_DEFINITIONS.map((definition) => [definition.role, definition]),
  );

  /** @inheritdoc */
  public async get_role_by_slug(slug: string): Promise<Role | null> {
    const definition = this.by_slug.get(slug);
    return definition ? this.to_role(definition) : null;
  }

  /** @inheritdoc */
  public async get_role_by_id(role_id: string): Promise<Role | null> {
    return this.get_role_by_slug(role_id);
  }

  /** @inheritdoc */
  public async list_roles(): Promise<Role[]> {
    return ROLE_DEFINITIONS.map((definition) => this.to_role(definition));
  }

  /** @inheritdoc */
  public async get_permission_keys(role_id: string): Promise<ReadonlySet<string>> {
    return new Set(this.by_slug.get(role_id)?.permissions ?? []);
  }

  /** @inheritdoc */
  public async get_assumable_roles(role_id: string): Promise<AssumableRole[]> {
    const definition = this.by_slug.get(role_id);
    if (!definition) return [];
    return [definition.role, ...definition.assumable].map((slug) => ({
      role_id: slug,
      slug,
      name: this.by_slug.get(slug)?.name ?? slug,
    }));
  }

  /** @inheritdoc */
  public async create_role(): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }

  /** @inheritdoc */
  public async update_role_name(): Promise<Role | null> {
    throw new Error(READ_ONLY_MESSAGE);
  }

  /** @inheritdoc */
  public async delete_role(): Promise<boolean> {
    throw new Error(READ_ONLY_MESSAGE);
  }

  /** @inheritdoc */
  public async replace_permission_keys(): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }

  /** @inheritdoc */
  public async replace_assumable_role_ids(): Promise<void> {
    throw new Error(READ_ONLY_MESSAGE);
  }

  private to_role(definition: IRoleDefinition): Role {
    return {
      role_id: definition.role,
      slug: definition.role,
      name: definition.name,
      is_system_role: true,
      created_at: SYSTEM_STAMP_MS,
      created_by: SYSTEM_ACTOR,
      updated_at: SYSTEM_STAMP_MS,
      updated_by: SYSTEM_ACTOR,
    };
  }
}
