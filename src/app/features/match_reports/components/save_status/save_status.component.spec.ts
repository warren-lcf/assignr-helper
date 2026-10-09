import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { SaveState } from '../../enums/save_state.enum';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { SaveStatusComponent } from './save_status.component';

function render(state: SaveState, waiting_count: number) {
  TestBed.configureTestingModule({
    imports: [SaveStatusComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(SaveStatusComponent);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('waiting_count', waiting_count);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    element,
    root: element.querySelector<HTMLElement>('[data-testid="match-report-save-status"]'),
    label: () =>
      element.querySelector('[data-testid="match-report-save-label"]')?.textContent?.trim(),
    icon: () => element.querySelector('mat-icon')?.textContent?.trim(),
  };
}

describe('SaveStatusComponent', () => {
  it('says Saved with a tick-cloud icon when nothing is waiting', () => {
    const { label, icon, root } = render(SaveState.SAVED, 0);

    expect(label()).toBe('Saved');
    expect(icon()).toBe('cloud_done');
    expect(root?.classList).not.toContain('save-status--waiting');
  });

  it('says Saving… while edits are on their way', () => {
    const { label, icon } = render(SaveState.SAVING, 2);

    expect(label()).toBe('Saving…');
    expect(icon()).toBe('cloud_sync');
  });

  it('says how many changes wait while offline, and marks the state as one to notice', () => {
    const { label, icon, root } = render(SaveState.OFFLINE, 3);

    expect(label()).toBe('Offline — 3 changes waiting');
    expect(icon()).toBe('cloud_off');
    expect(root?.classList).toContain('save-status--waiting');
  });

  it('uses the singular for one waiting change', () => {
    expect(render(SaveState.OFFLINE, 1).label()).toBe('Offline — 1 change waiting');
  });

  it('says the server cannot be reached when the device looks online but sending keeps failing', () => {
    const { label, root } = render(SaveState.RETRYING, 2);

    expect(label()).toBe('Cannot reach the server — 2 changes waiting');
    expect(root?.classList).toContain('save-status--waiting');
  });

  it('is a polite live region that names its state', () => {
    const { root } = render(SaveState.SAVING, 1);

    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
    expect(root?.getAttribute('data-state')).toBe('SAVING');
  });

  it('updates in place as the state changes', () => {
    const { fixture, label } = render(SaveState.OFFLINE, 2);

    fixture.componentRef.setInput('state', SaveState.SAVED);
    fixture.componentRef.setInput('waiting_count', 0);
    fixture.detectChanges();

    expect(label()).toBe('Saved');
  });
});
