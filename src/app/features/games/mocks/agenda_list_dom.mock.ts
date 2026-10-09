/** What a spec reads off one group header of the rendered `hch-grouped-agenda-list`. */
export interface IAgendaGroupSnapshot {
  /** 0 for the outermost level. */
  level: number;
  /** The header text, as the app wrote it. */
  label: string;
  /** The count chip text ("3 games"). */
  count: string;
  /** True while the group is open. */
  expanded: boolean;
  /** The group key the list tracks it by. */
  key: string;
  /** How many rows the group holds directly (only the deepest level has any). */
  row_count: number;
}

/**
 * Reads every group header of the rendered grouped agenda list, in document order.
 * @param root The element that holds the list.
 * @returns One snapshot per group.
 */
export function read_agenda_groups(root: HTMLElement): IAgendaGroupSnapshot[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('section[data-testid="grouped-agenda-group"]'),
  ).map((group) => {
    const header = group.querySelector<HTMLElement>(
      ':scope > :is(h1, h2, h3, h4, h5, h6) > [data-testid="grouped-agenda-header"]',
    );
    return {
      level: Number(group.dataset['agendaLevel']),
      label: header?.querySelector('.agenda_label')?.textContent?.trim() ?? '',
      count: header?.querySelector('.agenda_count_column')?.textContent?.trim() ?? '',
      expanded: header?.getAttribute('aria-expanded') === 'true',
      key: group.dataset['agendaKey'] ?? '',
      row_count: group.querySelectorAll(':scope > .agenda_group_body > ul > li').length,
    };
  });
}

/**
 * The labels of the groups at one level, in document order.
 * @param root The element that holds the list.
 * @param level 0 for the outermost level.
 * @returns The header texts.
 */
export function read_agenda_labels(root: HTMLElement, level: number): string[] {
  return read_agenda_groups(root)
    .filter((group) => group.level === level)
    .map((group) => group.label);
}

/**
 * The header buttons of the rendered list, in document order.
 * @param root The element that holds the list.
 * @returns The buttons.
 */
export function agenda_header_buttons(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-testid="grouped-agenda-header"]'),
  );
}
