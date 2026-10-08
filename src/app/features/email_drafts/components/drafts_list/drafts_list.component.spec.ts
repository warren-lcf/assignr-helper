import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { DraftStatus } from '../../enums/draft_status.enum';
import {
  DRAFT_FIXTURES,
  OPEN_DRAFT,
  PARTIAL_DRAFT,
  SELECTED_DRAFT,
  SENDING_DRAFT,
  SENT_DRAFT,
} from '../../mocks/email_draft.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IEmailDraft } from '../../models/email_draft.model';
import { DraftsListComponent } from './drafts_list.component';

function render(
  drafts: readonly IEmailDraft[] = DRAFT_FIXTURES,
  busy_draft_id: string | null = null,
) {
  TestBed.configureTestingModule({
    imports: [DraftsListComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(DraftsListComponent);
  fixture.componentRef.setInput('drafts', [...drafts]);
  fixture.componentRef.setInput('busy_draft_id', busy_draft_id);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const opened: IEmailDraft[] = [];
  const deleted: IEmailDraft[] = [];
  fixture.componentInstance.open_requested.subscribe((draft) => opened.push(draft));
  fixture.componentInstance.delete_requested.subscribe((draft) => deleted.push(draft));
  return { fixture, component: fixture.componentInstance, element, by_testid, opened, deleted };
}

describe('DraftsListComponent', () => {
  it('draws a card per draft with its subject', () => {
    const { element } = render();

    expect(element.querySelectorAll('mat-card')).toHaveLength(4);
    expect(element.textContent).toContain('Games available this weekend');
    expect(element.textContent).toContain('Last weekend');
  });

  it('marks every status with words and an icon, never colour alone', () => {
    const { by_testid } = render();

    for (const [draft, label, icon] of [
      [OPEN_DRAFT, 'Draft', 'edit_note'],
      [SENT_DRAFT, 'Sent', 'check_circle'],
      [PARTIAL_DRAFT, 'Partly sent', 'warning'],
      [SENDING_DRAFT, 'Sending', 'schedule_send'],
    ] as const) {
      const chip = by_testid(`draft-status-${draft.draft_id}`);
      expect(chip?.textContent).toContain(label);
      expect(chip?.textContent).toContain(icon);
    }
  });

  it('shows the number it reached once sent, and who it will go to before that', () => {
    const { by_testid } = render([OPEN_DRAFT, SENT_DRAFT, SELECTED_DRAFT]);

    expect(by_testid('draft-recipients-draft-1')?.textContent?.trim()).toBe('Everyone who agreed');
    expect(by_testid('draft-recipients-draft-2')?.textContent?.trim()).toBe('42');
    expect(by_testid('draft-recipients-draft-5')?.textContent?.trim()).toBe('2 chosen people');
  });

  it('shows a sent time only for a draft that was sent', () => {
    const { by_testid } = render([OPEN_DRAFT, SENT_DRAFT]);

    expect(by_testid('draft-sent-draft-1')).toBeNull();
    expect(by_testid('draft-sent-draft-2')?.textContent).toContain('2026');
    expect(by_testid('draft-created-draft-1')?.textContent).toContain('2026');
  });

  it('offers Edit and Delete only for a draft that has not been sent', () => {
    const { by_testid } = render();

    expect(by_testid('draft-open-draft-1')?.textContent?.trim()).toBe('Edit');
    expect(by_testid('draft-delete-draft-1')).not.toBeNull();
    for (const draft of [SENT_DRAFT, PARTIAL_DRAFT, SENDING_DRAFT]) {
      expect(by_testid(`draft-open-${draft.draft_id}`)?.textContent?.trim()).toBe('View');
      expect(by_testid(`draft-delete-${draft.draft_id}`)).toBeNull();
    }
  });

  it('names the draft in each button for a screen reader', () => {
    const { by_testid } = render();

    expect(by_testid('draft-open-draft-1')?.getAttribute('aria-label')).toBe(
      'Edit draft Games available this weekend',
    );
    expect(by_testid('draft-open-draft-2')?.getAttribute('aria-label')).toBe(
      'View draft Last weekend',
    );
    expect(by_testid('draft-delete-draft-1')?.getAttribute('aria-label')).toBe(
      'Delete draft Games available this weekend',
    );
  });

  it('emits the draft when Edit, View or Delete is pressed', () => {
    const { by_testid, opened, deleted } = render();

    by_testid('draft-open-draft-1')?.click();
    by_testid('draft-open-draft-2')?.click();
    by_testid('draft-delete-draft-1')?.click();

    expect(opened).toEqual([OPEN_DRAFT, SENT_DRAFT]);
    expect(deleted).toEqual([OPEN_DRAFT]);
  });

  it('shows a spinner on the draft being deleted and disables every delete meanwhile', () => {
    const { by_testid } = render([OPEN_DRAFT, { ...OPEN_DRAFT, draft_id: 'draft-9' }], 'draft-1');

    const busy = by_testid('draft-delete-draft-1') as HTMLButtonElement;
    const other = by_testid('draft-delete-draft-9') as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.querySelector('mat-progress-spinner')).not.toBeNull();
    expect(other.disabled).toBe(true);
    expect(other.querySelector('mat-progress-spinner')).toBeNull();
  });

  it('knows which statuses can still be edited', () => {
    const { component } = render();

    expect(component.is_editable(OPEN_DRAFT)).toBe(true);
    expect(component.is_editable({ ...OPEN_DRAFT, status: DraftStatus.SENT })).toBe(false);
  });
});
