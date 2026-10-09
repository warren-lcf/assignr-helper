import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { MinutePickerComponent } from './minute_picker.component';

function render(minute: number, disabled = false) {
  TestBed.configureTestingModule({
    imports: [MinutePickerComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(MinutePickerComponent);
  fixture.componentRef.setInput('minute', minute);
  fixture.componentRef.setInput('disabled', disabled);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const minutes: number[] = [];
  fixture.componentInstance.minute_changed.subscribe((value) => minutes.push(value));
  const button = (name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.getAttribute('aria-label') === name,
    );
  const quick = (value: number) =>
    element.querySelector<HTMLButtonElement>(`[data-testid="minute-quick-${value}"]`);
  return { fixture, element, minutes, button, quick };
}

describe('MinutePickerComponent', () => {
  it('shows the minute big, with the stepper named Minute', () => {
    const { element } = render(34);

    expect(element.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Minute');
    expect(element.querySelector('[data-testid="score-stepper-value"]')?.textContent?.trim()).toBe(
      '34',
    );
  });

  it('moves a minute at a time with the big minus and plus', () => {
    const { fixture, button, minutes } = render(34);

    button('One minute later')?.click();
    // The host feeds the new minute back in, as the card panel does.
    fixture.componentRef.setInput('minute', 35);
    fixture.detectChanges();
    button('One minute earlier')?.click();

    expect(minutes).toEqual([35, 34]);
  });

  it('stops at minute 1 and minute 130', () => {
    const first = render(1);
    expect(first.button('One minute earlier')?.disabled).toBe(true);

    TestBed.resetTestingModule();
    const last = render(130);
    expect(last.button('One minute later')?.disabled).toBe(true);
  });

  it('offers 15, 30, 45, 60, 75 and 90 as one-tap shortcuts', () => {
    const { element } = render(10);

    const texts = Array.from(element.querySelectorAll('.minute-picker__chip'), (chip) =>
      chip.textContent?.trim(),
    );

    expect(texts).toEqual(['15', '30', '45', '60', '75', '90']);
  });

  it('reports a shortcut when it is tapped', () => {
    const { quick, minutes } = render(10);

    quick(45)?.click();

    expect(minutes).toEqual([45]);
  });

  it('marks the shortcut that matches the minute with more than colour: pressed, ticked', () => {
    const { quick } = render(60);

    expect(quick(60)?.getAttribute('aria-pressed')).toBe('true');
    expect(quick(60)?.querySelector('mat-icon')?.textContent?.trim()).toBe('check');
    expect(quick(45)?.getAttribute('aria-pressed')).toBe('false');
    expect(quick(45)?.querySelector('mat-icon')).toBeNull();
  });

  it('cannot be changed when disabled', () => {
    const { button, quick } = render(30, true);

    expect(button('One minute later')?.disabled).toBe(true);
    expect(button('One minute earlier')?.disabled).toBe(true);
    expect(quick(15)?.disabled).toBe(true);
  });
});
